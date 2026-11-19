import QtQuick

/* Corte del texto del editor en sentencias, para ejecutar solo la del cursor.
   Los `;` dentro de cadenas, comentarios, identificadores citados o bloques
   `$$` de PostgreSQL no cuentan. `dialect`: "mysql" (también MariaDB) o
   "postgresql". */
QtObject {
    id: root

    function engineDialect(engine) { return engine === "postgresql" ? "postgresql" : "mysql" }

    /* Fin de un tramo entre comillas que empieza en `from`: la comilla doble
       (`''`) y, en cadenas, la barra invertida escapan. Sin cierre, hasta el final. */
    function quotedEnd(text, from, quote, backslash) {
        let i = from + 1
        const n = text.length
        while (i < n) {
            const c = text[i]
            if (backslash && c === "\\") { i += 2; continue }
            if (c === quote) {
                if (text[i + 1] === quote) { i += 2; continue }
                return i + 1
            }
            i++
        }
        return n
    }

    /* Tramos separados por `;`, con si traen SQL o solo espacio y comentarios. */
    function segmentsOf(text, dialect) {
        const pg = dialect === "postgresql"
        const segments = []
        const n = text.length
        let start = 0, i = 0, hasSql = false
        while (i < n) {
            const c = text[i], d = text[i + 1]
            if ((c === "-" && d === "-") || (!pg && c === "#")) {
                const eol = text.indexOf("\n", i)
                i = eol < 0 ? n : eol
                continue
            }
            if (c === "/" && d === "*") {
                const close = text.indexOf("*/", i + 2)
                i = close < 0 ? n : close + 2
                continue
            }
            if (c === "'" || (!pg && c === "\"")) { i = quotedEnd(text, i, c, true); hasSql = true; continue }
            if ((pg && c === "\"") || (!pg && c === "`")) { i = quotedEnd(text, i, c, false); hasSql = true; continue }
            if (pg && c === "$") {
                /* `$$…$$` o `$etiqueta$…$etiqueta$` */
                let j = i + 1
                while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++
                if (text[j] === "$" && (j === i + 1 || /[A-Za-z_]/.test(text[i + 1]))) {
                    const tag = text.slice(i, j + 1)
                    const close = text.indexOf(tag, j + 1)
                    i = close < 0 ? n : close + tag.length
                    hasSql = true
                    continue
                }
            }
            if (c === ";") {
                segments.push({ start: start, end: i + 1, hasSql: hasSql })
                start = i + 1
                hasSql = false
                i++
                continue
            }
            if (/[A-Za-z_]/.test(c)) {
                /* Palabra entera: un `$` dentro de un nombre no abre un bloque. */
                i++
                while (i < n && /[\w$]/.test(text[i])) i++
                hasSql = true
                continue
            }
            if (!/\s/.test(c)) hasSql = true
            i++
        }
        segments.push({ start: start, end: n, hasSql: hasSql })
        return segments
    }

    /* La sentencia en la que está el cursor: `{ start, end, sql }` o null si no
       hay ninguna. Justo tras un `;` en la misma línea, la que acaba ahí; en un
       tramo sin SQL (línea en blanco, comentario), la anterior, o la siguiente
       si no hay anterior. */
    function statementAt(text, caret, dialect) {
        const segments = segmentsOf(text, dialect)
        let i = segments.findIndex(seg => caret >= seg.start && caret < seg.end)
        if (i < 0) i = segments.length - 1
        const before = text.slice(segments[i].start, caret)
        if (i > 0 && before.indexOf("\n") < 0 && !before.trim()) i -= 1
        let pick = segments[i].hasSql ? i : -1
        for (let k = i - 1; pick < 0 && k >= 0; k--) if (segments[k].hasSql) pick = k
        for (let k = i + 1; pick < 0 && k < segments.length; k++) if (segments[k].hasSql) pick = k
        if (pick < 0) return null

        const seg = segments[pick]
        const raw = text.slice(seg.start, seg.end)
        /* Sin el `;` final ni el espacio de alrededor. */
        const sql = raw.replace(/;\s*$/, "").trim()
        const lead = raw.length - raw.replace(/^\s+/, "").length
        return { start: seg.start + lead, end: seg.start + lead + sql.length, sql: sql }
    }
}
