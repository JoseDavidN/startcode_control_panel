import QtQuick

/* Editores SQL guardados en el equipo, por conexión: las pestañas (número,
   nombre y texto) y la activa. Sin resultados ni historial de deshacer.
   No es singleton: se instancia donde se use.

       SqlEditorStore { id: editorStore }
       const saved = editorStore.loadEditors(connectionId, 6)   // { editors, active } o null
       editorStore.saveEditors(connectionId, { editors: [{ n, sql, name?, savedId? }], active: 0 })
       editorStore.removeEditors(connectionId) */
QtObject {
    id: root

    function keyOf(connectionId) { return "sql_editors:" + connectionId }

    /* Lo leído viene de disco: se valida antes de usarlo. */
    function isEditor(e) {
        if (!e || typeof e !== "object") return false
        return Number.isInteger(e.n) && e.n > 0 && typeof e.sql === "string"
            && (e.name === undefined || typeof e.name === "string")
            && (e.savedId === undefined || typeof e.savedId === "string")
    }

    function loadEditors(connectionId, max) {
        try {
            const data = App.storeGet(keyOf(connectionId))
            if (!data || typeof data !== "object") return null
            const list = data.editors ? Array.from(data.editors) : []
            const editors = list.filter(isEditor).slice(0, max).map(e => {
                const editor = { n: e.n, sql: e.sql }
                if (e.name !== undefined) editor.name = e.name
                if (e.savedId !== undefined) editor.savedId = e.savedId
                return editor
            })
            if (!editors.length) return null
            const active = typeof data.active === "number" && data.active >= 0 && data.active < editors.length ? data.active : 0
            return { editors: editors, active: active }
        } catch (e) {
            return null
        }
    }

    function saveEditors(connectionId, data) {
        try {
            /* Una sola pestaña vacía y sin nombre es el estado inicial: no hace falta guardarla. */
            const first = data.editors[0]
            if (data.editors.length === 1 && !first.sql && !first.name) App.storeRemove(keyOf(connectionId))
            else App.storeSet(keyOf(connectionId), data)
        } catch (e) { /* almacenamiento bloqueado: se sigue sin guardar */ }
    }

    function removeEditors(connectionId) {
        try { App.storeRemove(keyOf(connectionId)) } catch (e) { /* bloqueado */ }
    }
}
