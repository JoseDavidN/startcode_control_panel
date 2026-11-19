import QtQuick
import StartCode

/* Sesión SFTP viva mientras el modal está abierto (objeto no visual).

   El socket `/sftp` lleva la sesión y los metadatos (listar, crear carpetas);
   los bytes van por HTTP. `start()` abre la conexión y `stop()` la suelta: al
   cerrar el socket, el backend suelta la conexión SSH.

   Un corte no es el final: se reintenta pidiendo la misma sesión (`resume`),
   que el backend guarda un minuto, y las subidas en curso siguen con ella. */
Item {
    id: root

    visible: false

    property string serverId: ""

    /* idle · connecting · ready · reconnecting · error · closed */
    property string status: "idle"
    property string error: ""
    /* `{ user, host, home }` */
    property var info: null
    property string sessionId: ""

    property string cwd: ""
    property var entries: []
    property bool listing: false
    property string listError: ""

    /* Clave de host cambiada o sin confirmar: `{ serverId, host, port, expected, received }`. */
    signal hostKeyRejected(var mismatch)
    /* El backend terminó la sesión del panel (`auth:revoked`): `{ reason, message }`. */
    signal sessionRevoked(var payload)

    /* ── Interno ───────────────────────────────────────────────────── */
    property var socket: null
    /* Ya hubo un `sftp:ready`: lo que venga después es una reconexión. */
    property bool resolved: false
    /* El socket actual ya tiene la sesión enganchada y admite peticiones. */
    property bool attached: false
    /* Tras `sftp:error` o `auth:revoked` no se reintenta: el servidor dijo que no. */
    property bool gaveUp: false
    property int attempts: 0
    /* Cambia en cada `start()`/`stop()`: descarta respuestas de una sesión anterior. */
    property int epoch: 0
    /* Peticiones hechas durante un corte: salen al volver, si no vencen antes. */
    property var waiting: []
    property var timers: []

    readonly property int ackTimeoutMs: 20000
    /* Crear el árbol de una carpeta grande son miles de mkdir en el servidor. */
    readonly property int mkdirpTimeoutMs: 120000

    function start() {
        stop()
        status = "connecting"
        openSocket()
    }

    function stop() {
        epoch++
        reconnectTimer.stop()
        watchdog.stop()
        dropSocket()
        const pending = timers
        timers = []
        for (const timer of pending) timer.destroy()
        waiting = []
        resolved = false
        attached = false
        gaveUp = false
        attempts = 0
        status = "idle"
        error = ""
        info = null
        sessionId = ""
        cwd = ""
        entries = []
        listing = false
        listError = ""
    }

    function dropSocket() {
        const old = socket
        socket = null
        attached = false
        if (!old) return
        old.close()
        old.destroy()
    }

    function openSocket() {
        dropSocket()
        const auth = { serverId: serverId }
        if (sessionId !== "") auth.resume = sessionId
        socket = App.openSocket("/sftp", auth)
        watchdog.restart()
    }

    /* 1 s, 2 s, 4 s y luego cada 5 s, sin límite de intentos. */
    function scheduleReconnect() {
        if (gaveUp || status === "idle") return
        reconnectTimer.interval = Math.min(5000, 1000 * Math.pow(2, Math.min(attempts, 3)))
        attempts++
        reconnectTimer.restart()
    }

    /* El detalle si `payload` es un rechazo de clave de host bien formado. */
    function hostKeyMismatch(payload) {
        const isKey = value => !!value && typeof value.fingerprint === "string"
        if (!payload || (payload.code !== "HOST_KEY_MISMATCH" && payload.code !== "HOST_KEY_UNVERIFIED") || !payload.hostKey)
            return null
        const key = payload.hostKey
        if (typeof key.serverId !== "string" || key.serverId === "" || !isKey(key.received)) return null
        if (payload.code === "HOST_KEY_MISMATCH" ? !isKey(key.expected)
                                                 : key.expected !== null && key.expected !== undefined) return null
        return Object.assign({}, key, { expected: key.expected || null })
    }

    Timer { id: reconnectTimer; onTriggered: root.openSocket() }
    /* El socket no avisa si ni siquiera llega al servidor: pasado el plazo sin
       conectar, se suelta y se vuelve a intentar. */
    Timer {
        id: watchdog
        interval: 10000
        onTriggered: {
            if (root.socket && !root.attached && !root.gaveUp && root.status !== "error") {
                root.dropSocket()
                root.scheduleReconnect()
            }
        }
    }

    Connections {
        target: root.socket

        function onEvent(name, args) {
            const payload = args && args.length > 0 ? args[0] : null
            if (name === "sftp:ready") {
                const ready = payload || {}
                watchdog.stop()
                root.attempts = 0
                root.attached = true
                root.sessionId = ready.sessionId || ""
                if (root.resolved) {
                    /* Volvió. Si el backend ya no tenía la sesión, `sessionId` es otra. */
                    root.status = "ready"
                    root.flushWaiting()
                    return
                }
                root.resolved = true
                root.info = { user: ready.user || "", host: ready.host || "", home: ready.home || "" }
                root.status = "ready"
                const run = root.epoch
                root.request("sftp:list", { path: ready.home }, root.ackTimeoutMs, (failure, result) => {
                    if (run !== root.epoch) return
                    if (failure) {
                        root.status = "error"
                        root.error = failure
                        return
                    }
                    root.cwd = result.path
                    root.entries = Array.from(result.entries || [])
                })
            } else if (name === "sftp:error") {
                /* Clave de host cambiada: el aviso global enseña las dos huellas. */
                const mismatch = root.hostKeyMismatch(payload)
                if (mismatch) root.hostKeyRejected(mismatch)
                watchdog.stop()
                root.gaveUp = true
                if (!root.resolved) {
                    root.status = "error"
                    root.error = (payload && payload.message) || "No se pudo abrir la sesión SFTP"
                } else {
                    root.status = "reconnecting"
                }
            } else if (name === "auth:revoked") {
                /* Sesión del panel terminada: el corte que viene no se reintenta. */
                watchdog.stop()
                root.gaveUp = true
                root.sessionRevoked(payload || {})
            }
        }

        function onConnectError(message) {
            watchdog.stop()
            root.gaveUp = true
            if (!root.resolved) {
                root.status = "error"
                root.error = message || "No se pudo abrir la sesión SFTP"
            } else {
                root.status = "reconnecting"
            }
        }

        function onDisconnected(reason) {
            root.attached = false
            watchdog.stop()
            if (root.status === "error" || root.status === "idle") return
            if (root.resolved) root.status = "reconnecting"
            /* «io server disconnect» es el servidor echando al cliente: como
               socket.io, ese no se reintenta. */
            if (reason !== "io server disconnect") root.scheduleReconnect()
        }
    }

    /* ── Peticiones con confirmación ───────────────────────────────── */
    Component {
        id: deadline
        Timer {
            property var expired: null
            onTriggered: if (expired) expired()
        }
    }

    /* `done(fallo, respuesta)`: `fallo` es el mensaje, o null si fue bien. El
       gateway nunca lanza al socket: siempre responde `{ ok, … }`. */
    function request(event, payload, timeoutMs, done) {
        const run = epoch
        let finished = false
        const timer = deadline.createObject(root, { interval: timeoutMs })
        timers = timers.concat([timer])
        const finish = (failure, ack) => {
            if (finished) return
            finished = true
            if (run !== root.epoch) return
            root.timers = root.timers.filter(t => t !== timer)
            timer.stop()
            timer.destroy()
            done(failure, ack)
        }
        timer.expired = () => finish("El servidor no respondió a tiempo", null)
        timer.start()

        const send = () => {
            if (finished || run !== root.epoch) return
            root.socket.emitWithAck(event, [payload], ack => {
                if (!ack) return finish("Respuesta vacía del servidor", null)
                if (!ack.ok) return finish(ack.message || "Error desconocido", null)
                finish(null, ack)
            })
        }
        if (socket && attached) send()
        else waiting = waiting.concat([send])
    }

    function flushWaiting() {
        const queued = waiting
        waiting = []
        for (const send of queued) send()
    }

    /* ── Navegación ────────────────────────────────────────────────── */
    readonly property bool usable: resolved && status !== "idle" && status !== "error"

    /* `done()` se llama al terminar, haya ido bien o no. */
    function navigate(path, done) {
        if (!usable) return
        listing = true
        listError = ""
        request("sftp:list", { path: path }, ackTimeoutMs, (failure, result) => {
            if (failure) {
                root.listError = failure || "No se pudo leer el directorio"
            } else {
                root.cwd = result.path
                root.entries = Array.from(result.entries || [])
            }
            root.listing = false
            if (done) done()
        })
    }

    function refresh() {
        if (cwd !== "") navigate(cwd)
    }

    function up() {
        if (cwd === "" || cwd === "/") return
        navigate(cwd.slice(0, cwd.lastIndexOf("/")) || "/")
    }

    /* `done(fallo)` */
    function createFolder(name, done) {
        if (!usable || cwd === "") return
        const here = cwd
        request("sftp:mkdir", { path: here, name: name }, ackTimeoutMs, failure => {
            if (failure) return done(failure)
            root.navigate(here, () => done(null))
        })
    }

    /* Lista una carpeta sin entrar en ella: vista previa y autocompletado.
       `done(fallo, { path, entries })` */
    function peek(path, done) {
        if (!usable) return done("La sesión SFTP no está abierta", null)
        request("sftp:list", { path: path }, ackTimeoutMs, (failure, result) => {
            if (failure) return done(failure, null)
            done(null, { path: result.path, entries: Array.from(result.entries || []) })
        })
    }

    /* Borra en el servidor el archivo a medias de una subida que no terminó. */
    function discard(destDir, relPath) {
        if (!usable) return
        request("sftp:discard", { destDir: destDir, relPath: relPath }, ackTimeoutMs, () => {})
    }

    /* `done(fallo)` */
    function mkdirp(base, dirs, done) {
        if (!usable || dirs.length === 0) return done(null)
        request("sftp:mkdirp", { base: base, dirs: dirs }, mkdirpTimeoutMs, failure => done(failure))
    }

    function realpath(path, done) {
        if (!usable) return done("La sesión SFTP no está abierta", null)
        request("sftp:realpath", { path: path }, ackTimeoutMs, (failure, result) => done(failure, failure ? null : result.path))
    }

    Component.onDestruction: stop()
}
