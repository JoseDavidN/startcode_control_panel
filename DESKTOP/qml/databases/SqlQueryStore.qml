import QtQuick

/* Consultas guardadas en el equipo, por conexión y con nombre (equivale a
   `lib/sqlQueries.ts`). A diferencia de las pestañas del editor, que son el
   estado de la sesión, estas las guarda el usuario y siguen ahí aunque cierre
   el editor. No es un singleton: se instancia donde se use.

   Cada consulta: `{ id, name, sql, schema (texto o null), updatedAt (ms) }`. */
QtObject {
    /* MAX_SAVED_QUERIES y MAX_QUERY_NAME del original. */
    readonly property int maxSavedQueries: 500
    readonly property int maxQueryName: 80

    function keyOf(connectionId) { return "sql_queries:" + connectionId }

    /* Lo leído viene de disco: se valida antes de usarlo. */
    function isQuery(q) {
        if (!q || typeof q !== "object") return false
        return typeof q.id === "string" && typeof q.name === "string" && typeof q.sql === "string"
            && (q.schema === null || q.schema === undefined || typeof q.schema === "string")
            && typeof q.updatedAt === "number"
    }

    function loadQueries(connectionId) {
        try {
            let data = App.storeGet(keyOf(connectionId))
            if (data === undefined || data === null) return []
            /* Un valor escrito como texto por otra versión se analiza igual. */
            if (typeof data === "string") data = JSON.parse(data)
            if (!data || typeof data !== "object" || data.length === undefined) return []
            const out = []
            for (let i = 0; i < data.length; i++) {
                const q = data[i]
                if (!isQuery(q)) continue
                out.push({
                    id: q.id, name: q.name, sql: q.sql,
                    schema: typeof q.schema === "string" ? q.schema : null,
                    updatedAt: q.updatedAt
                })
            }
            return out
        } catch (e) {
            return []
        }
    }

    /** False si no se pudo escribir: aquí sí hay que avisar, es trabajo del usuario. */
    function writeQueries(connectionId, queries) {
        try {
            if (!queries || queries.length === 0) App.storeRemove(keyOf(connectionId))
            else App.storeSet(keyOf(connectionId), queries)
            return true
        } catch (e) {
            return false
        }
    }

    function removeQueries(connectionId) {
        try { App.storeRemove(keyOf(connectionId)) } catch (e) { /* bloqueado */ }
    }

    /** Misma consulta para el usuario: sin distinguir mayúsculas ni espacios de los lados. */
    function sameName(a, b) {
        return String(a).trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase()
    }
}
