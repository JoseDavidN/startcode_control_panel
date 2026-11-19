import QtQuick

/* Consultas guardadas de una conexión, en el equipo (`sql_queries:<id>`).
   A diferencia de las pestañas del editor, estas las guarda el usuario con
   nombre y siguen ahí aunque cierre el editor. Cada consulta es
   `{ id, name, sql, schema, updatedAt }` (`schema` null si no había base). */
QtObject {
    id: root

    property string connectionId: ""
    property var queries: []

    readonly property int maxSavedQueries: 500
    readonly property int maxQueryName: 80

    function keyOf(id) { return "sql_queries:" + id }

    /* Lo leído viene de disco: se valida antes de usarlo. */
    function isQuery(q) {
        if (!q || typeof q !== "object") return false
        return typeof q.id === "string" && typeof q.name === "string" && typeof q.sql === "string"
            && (q.schema === null || typeof q.schema === "string") && typeof q.updatedAt === "number"
    }

    /* Misma consulta para el usuario: sin distinguir mayúsculas ni espacios de los lados. */
    function sameName(a, b) { return String(a).trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase() }

    function reload() {
        let list = []
        try {
            const data = App.storeGet(keyOf(connectionId))
            if (data && typeof data === "object") {
                list = Array.from(data).filter(isQuery).map(q => ({
                    id: q.id, name: q.name, sql: q.sql, schema: q.schema, updatedAt: q.updatedAt
                }))
            }
        } catch (e) { list = [] }
        queries = list
    }

    function commit(next) {
        try {
            if (next.length === 0) App.storeRemove(keyOf(connectionId))
            else App.storeSet(keyOf(connectionId), next)
        } catch (e) {
            Toasts.error("No se pudo guardar", "El almacenamiento de la app está lleno. Elimina consultas que ya no uses.")
            return false
        }
        queries = next
        return true
    }

    /* Guarda con ese nombre; si ya hay una que se llama igual, la reemplaza. Devuelve la consulta o null. */
    function saveAs(rawName, sql, schema) {
        const name = String(rawName).trim().slice(0, maxQueryName)
        const existing = queries.find(q => sameName(q.name, name))
        if (!existing && queries.length >= maxSavedQueries) {
            Toasts.error("No se pudo guardar", "Se admiten hasta " + maxSavedQueries + " consultas por conexión.")
            return null
        }
        const saved = {
            id: existing ? existing.id : Date.now() + "-" + Math.random().toString(36).slice(2, 9),
            name: name,
            sql: sql,
            schema: schema || null,
            updatedAt: Date.now()
        }
        return commit([saved].concat(queries.filter(q => q.id !== saved.id))) ? saved : null
    }

    function update(id, sql, schema) {
        return commit(queries.map(q => q.id === id
            ? { id: q.id, name: q.name, sql: sql, schema: schema || null, updatedAt: Date.now() } : q))
    }

    /* False si ya hay otra con ese nombre. */
    function rename(id, rawName) {
        const name = String(rawName).trim().slice(0, maxQueryName)
        if (queries.some(q => q.id !== id && sameName(q.name, name))) return false
        return commit(queries.map(q => q.id === id
            ? { id: q.id, name: name, sql: q.sql, schema: q.schema, updatedAt: q.updatedAt } : q))
    }

    function remove(id) { return commit(queries.filter(q => q.id !== id)) }

    function byId(id) {
        if (!id) return null
        return queries.find(q => q.id === id) || null
    }

    onConnectionIdChanged: reload()
    Component.onCompleted: reload()
}
