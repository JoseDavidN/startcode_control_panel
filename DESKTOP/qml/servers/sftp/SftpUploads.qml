import QtQuick
import StartCode

/* Cola de subidas con progreso y error por archivo (objeto no visual).

   Cada archivo lleva su destino congelado desde que se encola: se puede seguir
   navegando mientras algo sube sin que acabe en otro sitio. Los archivos van
   en partes de 8 MB (`Transfers.uploadChunk`), cada una con sus reintentos:
   una petición por archivo entero chocaba con el tiempo máximo del servidor
   HTTP y cualquier corte tiraba todo lo subido. */
Item {
    id: root

    visible: false

    /* La `SftpSession`: da la sesión de ahora (puede cambiar al reconectar),
       la carpeta actual, `mkdirp`, `discard` y `refresh`. */
    required property var session

    /* Filas para la vista: uid, relPath, fileName, bytes, loaded, phase
       (queued · uploading · done · error · canceled · conflict), errorText, destDir. */
    readonly property ListModel model: ListModel {}
    property var totals: ({ files: 0, done: 0, failed: 0, conflicts: 0, bytes: 0, loaded: 0 })
    /* Hay algo terminado que se puede limpiar. */
    property int finished: 0
    property bool busy: false

    /* Archivos subiendo a la vez. Más no acelera: satura la conexión SSH. */
    readonly property int concurrency: 3
    /* Al aterrizar archivos se refresca el listado, pero no 300 veces seguidas. */
    readonly property int refreshDebounceMs: 500
    readonly property int partBytes: 8 * 1024 * 1024
    /* Intentos por parte ante cortes de red o errores del servidor. */
    readonly property int partAttempts: 4

    /* ── Interno ───────────────────────────────────────────────────── */
    /* uid → { uid, path, relPath, name, size, destDir, status, loaded, overwrite,
       sent, offset, attempt, aborted, transferId, timer, refreshed, painted } */
    property var queue: ({})
    property var order: []
    /* uid → fila del modelo */
    property var rows: ({})
    /* id de la parte en vuelo → uid */
    property var flights: ({})
    property int running: 0
    property int serial: 0
    /* Cambia al vaciar la cola: descarta respuestas de antes. */
    property int epoch: 0

    /* Se reintenta lo que puede ser pasajero: sin respuesta (red, 0), 5xx o la
       parte cortada (400). Un 404 es la sesión perdida; 409 y 413 no cambian, y
       un 502 es el servidor SFTP diciendo que no (permiso, disco lleno). */
    function retryable(status) {
        if (!status) return true
        return status === 400 || status === 408 || status === 429 || (status >= 500 && status !== 502)
    }

    function patch(entry, changes) {
        Object.assign(entry, changes)
        const row = rows[entry.uid]
        if (row === undefined) return
        if (changes.status !== undefined) model.setProperty(row, "phase", changes.status)
        if (changes.loaded !== undefined) model.setProperty(row, "loaded", changes.loaded)
        if (changes.error !== undefined) model.setProperty(row, "errorText", changes.error)
        recount.start()
    }

    function count() {
        const next = { files: 0, done: 0, failed: 0, conflicts: 0, bytes: 0, loaded: 0 }
        let ended = 0, active = false
        for (const uid of order) {
            const entry = queue[uid]
            next.files++
            next.bytes += entry.size
            next.loaded += entry.status === "done" ? entry.size : entry.loaded
            if (entry.status === "done") next.done++
            else if (entry.status === "error") next.failed++
            else if (entry.status === "conflict") next.conflicts++
            if (entry.status === "done" || entry.status === "canceled" || entry.status === "error") ended++
            if (entry.status === "queued" || entry.status === "uploading") active = true
        }
        totals = next
        finished = ended
        busy = active
    }
    /* Con varias partes subiendo llegan decenas de avisos por segundo. */
    Timer { id: recount; interval: 100; onTriggered: root.count() }
    Timer { id: refreshTimer; interval: root.refreshDebounceMs; onTriggered: root.session.refresh() }

    Component {
        id: delay
        Timer {
            property var elapsed: null
            onTriggered: if (elapsed) elapsed()
        }
    }

    /* ── Envío ─────────────────────────────────────────────────────── */
    /** Sube la parte que toca; al confirmarla el servidor, `partDone` sigue con la siguiente. */
    function sendPart(entry) {
        const sessionId = session.sessionId
        if (sessionId === "") {
            /* En diferido: si falla toda la cola seguida, no se apila una llamada dentro de otra. */
            const timer = delay.createObject(root, { interval: 0 })
            timer.elapsed = () => {
                entry.timer = null
                timer.destroy()
                root.fail(entry, 0, "La sesión SFTP no está abierta")
            }
            entry.timer = timer
            timer.start()
            return
        }

        const length = Math.min(entry.size, entry.offset + partBytes) - entry.offset
        let query = "destDir=" + encodeURIComponent(entry.destDir)
                  + "&relPath=" + encodeURIComponent(entry.relPath)
                  + "&size=" + length + "&offset=" + entry.offset + "&total=" + entry.size
        if (entry.offset === 0 && entry.overwrite) query += "&overwrite=true"

        /* Registrada antes de pedirla: la respuesta puede llegar dentro de la llamada. */
        entry.transferId = "sftp-up-" + entry.uid + "-" + (++serial)
        entry.length = length
        flights[entry.transferId] = entry.uid
        Transfers.uploadChunk(entry.transferId, "/sftp/sessions/" + sessionId + "/file?" + query,
                              entry.path, entry.offset, length)
    }

    function partDone(entry) {
        entry.attempt = 1
        entry.refreshed = false
        entry.offset += entry.length
        entry.sent = entry.offset
        patch(entry, { loaded: entry.offset })
        if (entry.offset < entry.size) return sendPart(entry)

        patch(entry, { status: "done", loaded: entry.size })
        if (entry.destDir === session.cwd) refreshTimer.restart()
        settle()
    }

    function partFailed(entry, status, message) {
        if (entry.aborted) return fail(entry, status, message)

        /* El token caducó a media subida: una petición normal lo renueva y la parte se repite. */
        if (status === 401 && !entry.refreshed) {
            entry.refreshed = true
            const run = epoch
            Api.request("GET", "/auth/me", null, ok => {
                if (run !== root.epoch) return
                if (entry.aborted || !ok) return root.fail(entry, status, message)
                root.sendPart(entry)
            })
            return
        }

        if (entry.attempt >= partAttempts || !retryable(status)) return fail(entry, status, message)

        patch(entry, { loaded: entry.offset })
        const timer = delay.createObject(root, { interval: 1500 * Math.pow(2, entry.attempt - 1) })
        timer.elapsed = () => {
            entry.timer = null
            timer.destroy()
            entry.attempt++
            root.sendPart(entry)
        }
        entry.timer = timer
        timer.start()
    }

    function fail(entry, status, message) {
        const conflict = status === 409 && entry.sent === 0
        /* Lo que quedó a medias se borra: en el listado parecería completo. Si
           falló la primera parte, el servidor ya lo borró. */
        if (entry.sent > 0) session.discard(entry.destDir, entry.relPath)

        patch(entry, {
            status: entry.aborted ? "canceled" : conflict ? "conflict" : "error",
            error: entry.aborted ? "Cancelado"
                 : conflict ? "Ya existe en el destino"
                 : status === 413 ? "Supera el tamaño máximo permitido"
                 : status === 404 ? "La sesión SFTP se cerró; vuelve a abrir el explorador"
                 : message || "No se pudo subir"
        })
        settle()
    }

    function settle() {
        running--
        pump()
    }

    function pump() {
        while (running < concurrency) {
            const uid = order.find(id => queue[id].status === "queued")
            if (uid === undefined) return
            const entry = queue[uid]
            running++
            entry.offset = 0
            entry.sent = 0
            entry.attempt = 1
            entry.refreshed = false
            entry.painted = 0
            patch(entry, { status: "uploading" })
            sendPart(entry)
        }
    }

    Connections {
        target: Transfers

        function onUploadProgress(id, sent, total) {
            const entry = root.queue[root.flights[id]]
            if (!entry) return
            entry.loaded = entry.offset + sent
            /* La fila se repinta como mucho diez veces por segundo. */
            const now = Date.now()
            if (now - entry.painted < 100) return
            entry.painted = now
            root.patch(entry, { loaded: entry.loaded })
        }

        function onUploadFinished(id, ok, status, body, message) {
            const entry = root.queue[root.flights[id]]
            delete root.flights[id]
            if (!entry) return
            entry.transferId = ""
            if (ok && !entry.aborted) root.partDone(entry)
            else root.partFailed(entry, status, message)
        }
    }

    /* ── Acciones ──────────────────────────────────────────────────── */
    /** `files`: `{ path, relPath, name, size }` (lo que da `Transfers.scan`). `done(fallo)`, opcional. */
    function enqueue(files, done) {
        const list = Array.from(files || [])
        if (list.length === 0 || session.sessionId === "") return

        /* El destino es el de ahora, aunque se navegue mientras se crean las carpetas. */
        const destDir = session.cwd
        /* Los directorios se crean de una vez antes de encolar: así varias
           subidas en paralelo no compiten por crear la misma carpeta. */
        const dirs = {}
        for (const file of list) {
            const slash = file.relPath.lastIndexOf("/")
            if (slash > 0) dirs[file.relPath.slice(0, slash)] = true
        }

        const run = epoch
        session.mkdirp(destDir, Object.keys(dirs), failure => {
            if (run !== root.epoch) return
            if (failure) {
                if (done) done(failure)
                return
            }
            for (const file of list) {
                const uid = Date.now() + "-" + Math.random().toString(36).slice(2, 9)
                root.queue[uid] = {
                    uid: uid, path: file.path, relPath: file.relPath, name: file.name, size: file.size,
                    destDir: destDir, status: "queued", loaded: 0, error: "", overwrite: false,
                    sent: 0, offset: 0, length: 0, attempt: 1, aborted: false, transferId: "",
                    timer: null, refreshed: false, painted: 0
                }
                root.order.push(uid)
                root.rows[uid] = root.model.count
                root.model.append({
                    uid: uid, relPath: file.relPath, fileName: file.name, bytes: file.size,
                    loaded: 0, phase: "queued", errorText: "", destDir: destDir
                })
            }
            root.count()
            root.pump()
            if (done) done(null)
        })
    }

    function cancel(uid) {
        const entry = queue[uid]
        if (!entry) return
        entry.aborted = true
        if (entry.status === "queued") {
            /* Uno en cola no llega a arrancar: se marca aquí. */
            patch(entry, { status: "canceled", error: "Cancelado" })
        } else if (entry.status === "uploading") {
            if (entry.timer) {
                /* Esperando para reintentar: no hay petición que cortar. */
                entry.timer.stop()
                entry.timer.destroy()
                entry.timer = null
                fail(entry, 0, "")
            } else if (entry.transferId !== "") {
                Transfers.cancel(entry.transferId)
            }
        }
    }

    function retry(uid, overwrite) {
        const entry = queue[uid]
        if (!entry || (entry.status !== "error" && entry.status !== "conflict")) return
        entry.aborted = false
        entry.overwrite = overwrite === true
        patch(entry, { status: "queued", loaded: 0, error: "" })
        pump()
    }

    /** Sobrescribe todos los que chocaron, para no pulsar 200 veces. */
    function retryAllConflicts() {
        order.filter(uid => queue[uid].status === "conflict").forEach(uid => retry(uid, true))
    }

    /** Reintenta todos los que fallaron (p. ej. tras un corte de red largo). */
    function retryAllFailed() {
        order.filter(uid => queue[uid].status === "error").forEach(uid => retry(uid, false))
    }

    function clearFinished() {
        const ended = uid => ["done", "canceled", "error"].includes(queue[uid].status)
        for (let row = model.count - 1; row >= 0; row--) {
            if (ended(model.get(row).uid)) model.remove(row)
        }
        const kept = order.filter(uid => !ended(uid))
        order.filter(ended).forEach(uid => delete queue[uid])
        order = kept
        const index = {}
        for (let row = 0; row < model.count; row++) index[model.get(row).uid] = row
        rows = index
        count()
    }

    /** Al cerrar el modal: corta lo que esté subiendo y vacía la cola. */
    function reset() {
        epoch++
        refreshTimer.stop()
        recount.stop()
        const pending = order.map(uid => queue[uid])
        queue = ({})
        order = []
        rows = ({})
        flights = ({})
        running = 0
        model.clear()
        for (const entry of pending) {
            if (entry.timer) {
                entry.timer.stop()
                entry.timer.destroy()
            }
            if (entry.transferId !== "") Transfers.cancel(entry.transferId)
        }
        count()
    }

    Component.onDestruction: reset()
}
