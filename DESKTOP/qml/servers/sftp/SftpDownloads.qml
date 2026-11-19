import QtQuick
import StartCode

/* Cola de descargas (objeto no visual). Viven con el modal: al cerrarlo se
   cancelan, como las subidas.

   Cada una va directa a disco con `Transfers.download`, que no renueva el
   token: antes se pregunta por la ruta con `Api` (que sí lo renueva y trae el
   error con su mensaje). Un archivo llega tal cual; una carpeta, como .zip. */
Item {
    id: root

    visible: false

    /* La `SftpSession`: la sesión puede cambiar al reconectar y se lee la de
       ahora al arrancar cada descarga. */
    required property var session

    /* Filas para la vista: uid, remotePath, fileName, folder, dest, loaded,
       total (-1 mientras no se conoce: un .zip se comprime mientras se envía),
       phase (queued · downloading · done · error · canceled), errorText. */
    readonly property ListModel model: ListModel {}
    property bool finished: false

    /* Descargas a la vez: comparten la conexión SSH con la navegación y las subidas. */
    readonly property int concurrency: 3

    /* ── Interno ───────────────────────────────────────────────────── */
    /* uid → { uid, path, dest, status, aborted, transferId } */
    property var queue: ({})
    property var order: []
    property var rows: ({})
    property var flights: ({})
    property int running: 0
    property int serial: 0
    property int epoch: 0

    function patch(entry, changes) {
        if (changes.status !== undefined) entry.status = changes.status
        const row = rows[entry.uid]
        if (row === undefined) return
        if (changes.status !== undefined) model.setProperty(row, "phase", changes.status)
        if (changes.loaded !== undefined) model.setProperty(row, "loaded", changes.loaded)
        if (changes.total !== undefined) model.setProperty(row, "total", changes.total)
        if (changes.error !== undefined) model.setProperty(row, "errorText", changes.error)
        if (changes.status !== undefined) recount()
    }

    function recount() {
        finished = order.some(uid => ["done", "canceled", "error"].includes(queue[uid].status))
    }

    function settle(entry, changes) {
        patch(entry, changes)
        running--
        pump()
    }

    function pump() {
        while (running < concurrency) {
            const uid = order.find(id => queue[id].status === "queued")
            if (uid === undefined) return
            start(queue[uid])
        }
    }

    function start(entry) {
        running++
        patch(entry, { status: "downloading", loaded: 0, error: "" })

        const run = epoch
        const sessionId = session.sessionId
        const base = "/sftp/sessions/" + sessionId + "/download"
        const query = "path=" + encodeURIComponent(entry.path)
        /* Con sesión o sin ella, la respuesta llega después: `pump` no se llama dentro de sí misma. */
        const check = sessionId === ""
            ? done => Qt.callLater(() => done(false, null, { status: 0, message: "La sesión SFTP no está abierta" }))
            : done => Api.request("GET", base + "/info?" + query, null, done)
        check((ok, data, failure) => {
            if (run !== root.epoch) return
            if (entry.aborted) return root.settle(entry, { status: "canceled", error: "Cancelado" })
            if (!ok) {
                return root.settle(entry, {
                    status: "error",
                    error: failure && failure.status === 404
                        ? "La sesión SFTP se cerró; vuelve a abrir el explorador"
                        : (failure && failure.message) || "No se pudo descargar"
                })
            }
            entry.transferId = "sftp-down-" + entry.uid + "-" + (++root.serial)
            root.flights[entry.transferId] = entry.uid
            Transfers.download(entry.transferId, base + "?" + query, entry.dest)
        })
    }

    Connections {
        target: Transfers

        function onDownloadProgress(id, received, total) {
            const entry = root.queue[root.flights[id]]
            if (entry) root.patch(entry, { loaded: received, total: total })
        }

        function onDownloadFinished(id, ok, code, message) {
            const entry = root.queue[root.flights[id]]
            delete root.flights[id]
            if (!entry) return
            entry.transferId = ""
            if (entry.aborted || code === "CANCELLED") {
                root.settle(entry, { status: "canceled", error: "Cancelado" })
            } else if (ok) {
                root.settle(entry, { status: "done" })
            } else {
                root.settle(entry, {
                    status: "error",
                    error: code.startsWith("HTTP:404:")
                        ? "La sesión SFTP se cerró; vuelve a abrir el explorador"
                        : message || "No se pudo descargar"
                })
            }
        }
    }

    /* ── Acciones ──────────────────────────────────────────────────── */
    /** `jobs`: `{ path, name, folder, dest, size }` (`size` null en una carpeta). */
    function enqueue(jobs) {
        for (const job of jobs) {
            const uid = Date.now() + "-" + Math.random().toString(36).slice(2, 9)
            const total = job.size === null || job.size === undefined ? -1 : job.size
            queue[uid] = { uid: uid, path: job.path, dest: job.dest, status: "queued", aborted: false, transferId: "" }
            order.push(uid)
            rows[uid] = model.count
            model.append({
                uid: uid, remotePath: job.path, fileName: job.name, folder: job.folder === true, dest: job.dest,
                loaded: 0, total: total, phase: "queued", errorText: ""
            })
        }
        pump()
    }

    function cancel(uid) {
        const entry = queue[uid]
        if (!entry) return
        entry.aborted = true
        /* Una en cola no llega a arrancar: se marca aquí. */
        if (entry.status === "queued") patch(entry, { status: "canceled", error: "Cancelado" })
        else if (entry.transferId !== "") Transfers.cancel(entry.transferId)
    }

    function retry(uid) {
        const entry = queue[uid]
        if (!entry || entry.status !== "error") return
        entry.aborted = false
        patch(entry, { status: "queued", loaded: 0, error: "" })
        pump()
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
        recount()
    }

    /** Al cerrar el modal: corta lo que esté bajando (el parcial se borra) y vacía la cola. */
    function reset() {
        epoch++
        const pending = order.map(uid => queue[uid])
        queue = ({})
        order = []
        rows = ({})
        flights = ({})
        running = 0
        model.clear()
        finished = false
        for (const entry of pending) {
            if (entry.transferId !== "") Transfers.cancel(entry.transferId)
        }
    }

    Component.onDestruction: reset()
}
