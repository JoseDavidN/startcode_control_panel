import QtQuick

/* Predicción de tablas y columnas del editor SQL (utils/sqlComplete.ts).
   Todo es local y barato: el índice se arma una vez con las tablas que ya
   trajo el árbol y en cada tecla solo se mira la sentencia del cursor.

       SqlCompletion { id: sqlComplete }
       editor.completion = sqlComplete.buildCompletionIndex(tablas.concat(vistas))

   Una sugerencia es `{ label, insert, kind: "table" | "view" | "column" | "alias", detail }`. */
QtObject {
    id: root

    readonly property int maxItems: 50
    /* Palabras que, justo antes, piden una tabla. */
    readonly property var tableContext: ["from", "join", "into", "update", "table", "describe", "desc", "truncate"]
    /* Lo que puede seguir a una tabla y no es su alias. */
    readonly property var notAlias: [
        "where", "on", "using", "join", "inner", "left", "right", "full", "outer", "cross", "natural", "set", "values",
        "group", "order", "limit", "having", "union", "as", "select", "returning", "offset", "for", "window", "lateral"
    ]

    /** Identificador citado: `nombre` en MySQL, "nombre" en PostgreSQL. */
    function quoteIdent(dialect, name) {
        return dialect === "postgresql"
            ? "\"" + String(name).replace(/"/g, "\"\"") + "\""
            : "`" + String(name).replace(/`/g, "``") + "`"
    }

    /** Índice `{ tables, byName, namespaces }` a partir de las tablas y vistas del esquema. */
    function buildCompletionIndex(tables) {
        const list = Array.from(tables || [])
        /* Nombre en minúsculas → tablas con ese nombre (en PostgreSQL puede repetirse entre esquemas). */
        const byName = new Map()
        /* Esquemas de PostgreSQL (`public`…), para `x.` */
        const namespaces = new Set()
        for (let i = 0; i < list.length; i++) {
            const t = list[i]
            const key = String(t.name).toLowerCase()
            byName.set(key, (byName.get(key) || []).concat([t]))
            if (t.namespace) namespaces.add(String(t.namespace).toLowerCase())
        }
        return { tables: list, byName: byName, namespaces: namespaces }
    }

    function unquote(s) { return s.replace(/^[`"[]|[`"\]]$/g, "") }

    function ident(dialect, name) {
        return /^[a-z_][a-z0-9_$]*$/.test(name) || (dialect === "mysql" && /^[a-z_][\w$]*$/i.test(name))
            ? name : quoteIdent(dialect, name)
    }

    /** Sentencia donde está el cursor: entre el `;` anterior y el siguiente. */
    function statementAround(text, caret) {
        const start = text.lastIndexOf(";", caret - 1) + 1
        const endAt = text.indexOf(";", caret)
        return { start: start, text: text.slice(start, endAt === -1 ? text.length : endAt) }
    }

    /* ¿El cursor cae dentro de una cadena o un comentario? Escaneo lineal solo de la sentencia. */
    function insideStringOrComment(s) {
        let quote = null
        let line = false
        let block = false
        for (let i = 0; i < s.length; i++) {
            const ch = s[i]
            const next = s[i + 1]
            if (line) { if (ch === "\n") line = false; continue }
            if (block) { if (ch === "*" && next === "/") { block = false; i++ } continue }
            if (quote) {
                if (ch === "\\" && quote !== "\"") { i++; continue }
                if (ch === quote) quote = null
                continue
            }
            if (ch === "'") quote = ch
            else if ((ch === "-" && next === "-") || ch === "#") line = true
            else if (ch === "/" && next === "*") { block = true; i++ }
        }
        return quote !== null || line || block
    }

    /** Tablas que usa la sentencia (FROM, JOIN, UPDATE, INTO) con su alias. */
    function referencedTables(stmt, index) {
        const refs = []
        const re = /\b(?:from|join|update|into)\s+((?:[`"]?[\w$]+[`"]?\.)?[`"]?[\w$]+[`"]?)(?:\s+(?:as\s+)?([`"]?[\w$]+[`"]?))?/gi
        let m
        while ((m = re.exec(stmt)) !== null) {
            /* Sin avance no hay más coincidencias que buscar. */
            if (m[0].length === 0) { re.lastIndex++; continue }
            const parts = m[1].split(".").map(unquote)
            const name = parts[parts.length - 1].toLowerCase()
            const ns = parts.length > 1 ? parts[0].toLowerCase() : null
            const found = (index.byName.get(name) || [])
                .filter(t => !ns || !t.namespace || String(t.namespace).toLowerCase() === ns)
            const alias = m[2] ? unquote(m[2]) : null
            const kept = alias && root.notAlias.indexOf(alias.toLowerCase()) < 0 ? alias : null
            for (let i = 0; i < found.length; i++) refs.push({ table: found[i], alias: kept })
        }
        return refs
    }

    /* Fuera de `public`, PostgreSQL necesita el esquema delante (salvo que ya se escribió `esquema.`). */
    function tableItem(dialect, t, qualify) {
        const outside = t.namespace && t.namespace !== "public"
        return {
            label: t.name,
            insert: qualify !== false && outside ? ident(dialect, t.namespace) + "." + ident(dialect, t.name) : ident(dialect, t.name),
            kind: t.type === "view" ? "view" : "table",
            detail: outside ? t.namespace : t.type === "view" ? "vista" : "tabla"
        }
    }

    function columnItems(dialect, tables) {
        const seen = new Set()
        const out = []
        for (let i = 0; i < tables.length; i++) {
            const t = tables[i]
            const columns = Array.from(t.columns || [])
            for (let k = 0; k < columns.length; k++) {
                const c = columns[k]
                if (seen.has(c.name)) continue
                seen.add(c.name)
                out.push({
                    label: c.name, insert: ident(dialect, c.name), kind: "column",
                    detail: tables.length > 1 ? t.name + " · " + c.type : c.type
                })
            }
        }
        return out
    }

    /* Primero los que empiezan por lo escrito, luego los que lo contienen. */
    function rank(items, prefix) {
        if (!prefix) return items.slice(0, root.maxItems)
        const p = prefix.toLowerCase()
        const starts = []
        const contains = []
        for (let i = 0; i < items.length; i++) {
            const it = items[i]
            const l = String(it.label).toLowerCase()
            if (l === p) continue
            if (l.startsWith(p)) starts.push(it)
            else if (l.includes(p)) contains.push(it)
            if (starts.length >= root.maxItems) break
        }
        return starts.concat(contains).slice(0, root.maxItems)
    }

    /**
     * Sugerencias para el cursor en `caret`: `{ items, from, prefix }` o null.
     * `from` es desde dónde se reemplaza al aceptar. `force` (Ctrl + Espacio)
     * las muestra aunque no haya nada escrito todavía.
     */
    function completeSql(text, caret, index, dialect, force) {
        const identChar = /[\w$]/
        let from = caret
        while (from > 0 && identChar.test(text[from - 1])) from--
        const prefix = text.slice(from, caret)
        /* Justo después de un número (`LIMIT 10`) no se sugiere nada. */
        if (/^\d/.test(prefix)) return null

        const stmt = statementAround(text, caret)
        const before = text.slice(stmt.start, from)
        if (insideStringOrComment(before)) return null

        /* `x.` → columnas de la tabla o alias x, o tablas del esquema x. */
        const dot = /([`"]?[\w$]+[`"]?)\.$/.exec(before)
        if (dot) {
            const q = unquote(dot[1]).toLowerCase()
            const dotRefs = referencedTables(stmt.text, index)
            const byAlias = dotRefs.filter(r => r.alias && r.alias.toLowerCase() === q).map(r => r.table)
            const owners = byAlias.length ? byAlias : (index.byName.get(q) || [])
            if (owners.length) return { items: rank(columnItems(dialect, owners), prefix), from: from, prefix: prefix }
            if (index.namespaces.has(q)) {
                const inSchema = index.tables
                    .filter(t => t.namespace && String(t.namespace).toLowerCase() === q)
                    .map(t => tableItem(dialect, t, false))
                return { items: rank(inSchema, prefix), from: from, prefix: prefix }
            }
            return null
        }

        if (!prefix && !force) return null

        const prev = /([a-z_]+)\s*$/i.exec(before)
        const prevWord = prev ? prev[1].toLowerCase() : ""
        const tables = index.tables.map(t => tableItem(dialect, t, true))
        if (prevWord && root.tableContext.indexOf(prevWord) >= 0)
            return { items: rank(tables, prefix), from: from, prefix: prefix }

        /* En el resto: columnas de las tablas que usa la sentencia y después las tablas. */
        const refs = referencedTables(stmt.text, index)
        const aliases = refs.filter(r => r.alias).map(r => ({
            label: r.alias, insert: r.alias, kind: "alias", detail: "alias de " + r.table.name
        }))
        const items = columnItems(dialect, refs.map(r => r.table)).concat(aliases, tables)
        const result = rank(items, prefix)
        return result.length ? { items: result, from: from, prefix: prefix } : null
    }
}
