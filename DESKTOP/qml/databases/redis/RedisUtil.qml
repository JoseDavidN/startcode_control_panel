import QtQuick

/* Utilidades comunes del explorador de Redis (formato de caducidad, patrón de
   SCAN, respuesta de la consola…). No es un singleton: cada pieza crea la suya
   con `RedisUtil { id: util }`. */
QtObject {
    readonly property var keyTypes: ["string", "hash", "list", "set", "zset", "stream"]
    readonly property var typeLabels: ({
        string: "Texto", hash: "Hash", list: "Lista", set: "Conjunto", zset: "Conjunto ordenado", stream: "Stream"
    })

    /* Comandos que solo leen: tras ellos no hace falta refrescar la lista ni el valor abierto. */
    readonly property var readCommands: [
        "GET", "MGET", "GETRANGE", "STRLEN", "EXISTS", "TYPE", "TTL", "PTTL", "EXPIRETIME", "PEXPIRETIME",
        "HGET", "HMGET", "HGETALL", "HKEYS", "HVALS", "HLEN", "HEXISTS", "HSCAN", "HSTRLEN", "HRANDFIELD",
        "LRANGE", "LINDEX", "LLEN", "LPOS", "SMEMBERS", "SISMEMBER", "SMISMEMBER", "SCARD", "SSCAN", "SRANDMEMBER",
        "SINTER", "SUNION", "SDIFF", "SINTERCARD", "ZRANGE", "ZREVRANGE", "ZRANGEBYSCORE", "ZREVRANGEBYSCORE",
        "ZRANGEBYLEX", "ZSCORE", "ZMSCORE", "ZRANK", "ZREVRANK", "ZCARD", "ZCOUNT", "ZLEXCOUNT", "ZSCAN",
        "XRANGE", "XREVRANGE", "XLEN", "XINFO", "XPENDING", "XREAD", "SCAN", "DBSIZE", "RANDOMKEY", "INFO", "PING",
        "ECHO", "TIME", "OBJECT", "MEMORY", "DUMP", "LASTSAVE", "ROLE", "COMMAND", "SLOWLOG", "LATENCY",
        "BITCOUNT", "BITPOS", "GETBIT", "PFCOUNT", "GEOPOS", "GEODIST", "GEOHASH", "GEOSEARCH", "JSON.GET"
    ]

    function typeLabel(type) { return typeLabels[type] || String(type || "") }

    /* Mensaje de un error de la API. */
    function messageOf(error) { return error && error.message ? String(error.message) : "Error desconocido" }
    function isSessionClosed(error) { return !!error && error.code === "DB_SESSION_CLOSED" }

    /* Cifra con separador de miles en español. */
    function num(n) { return Number(n || 0).toLocaleString(Qt.locale("es_ES"), "f", 0) }

    /* Caducidad en ms como texto corto: «sin caducidad», «45 s», «3 h 20 min», «12 d». */
    function formatTtl(ms) {
        if (ms < 0) return "sin caducidad"
        const s = Math.ceil(ms / 1000)
        if (s < 60) return s + " s"
        const m = Math.floor(s / 60)
        if (m < 60) return m + " min" + (s % 60 ? " " + (s % 60) + " s" : "")
        const h = Math.floor(m / 60)
        if (h < 24) return h + " h" + (m % 60 ? " " + (m % 60) + " min" : "")
        const d = Math.floor(h / 24)
        return d + " d" + (h % 24 ? " " + (h % 24) + " h" : "")
    }

    /* Texto del buscador como patrón de SCAN: con comodines (`*`, `?`, `[`) se usa
       tal cual; sin ellos, «contiene» (los caracteres especiales se escapan). */
    function toScanPattern(text) {
        const t = String(text || "").trim()
        if (!t) return "*"
        if (/[*?[]/.test(t)) return t
        return "*" + t.replace(/[\\\]]/g, m => "\\" + m) + "*"
    }

    /* Respuesta de la consola como la pinta redis-cli: (nil), (integer), "texto" y listas numeradas. */
    function formatReply(reply, indent) {
        indent = indent || ""
        if (reply === null || reply === undefined) return "(nil)"
        if (typeof reply === "number") return "(integer) " + reply
        if (typeof reply === "string") return JSON.stringify(reply)
        const items = Array.from(reply)
        if (!items.length) return "(empty array)"
        const width = String(items.length).length
        return items.map((item, i) => {
            let n = String(i + 1)
            while (n.length < width) n = " " + n
            const label = n + ") "
            const inner = formatReply(item, indent + " ".repeat(label.length))
            return (i === 0 ? "" : indent) + label + inner
        }).join("\n")
    }

    function isReadCommand(line) {
        const name = (String(line || "").trim().split(/\s+/)[0] || "").toUpperCase()
        return readCommands.indexOf(name) >= 0
    }

    /* «campo=valor» por línea a los campos de una entrada de stream; null si no vale. */
    function parseStreamFields(text) {
        const out = {}
        const lines = String(text || "").split("\n")
        for (let n = 0; n < lines.length; n++) {
            const line = lines[n]
            if (!line.trim()) continue
            const i = line.indexOf("=")
            if (i <= 0) return null
            out[line.slice(0, i).trim()] = line.slice(i + 1)
        }
        return Object.keys(out).length ? out : null
    }

    /* Texto pegado desde fuera: una sola línea y sin salto final, para que nunca se ejecute sin Enter. */
    function toSingleLine(text) {
        const line = String(text || "")
            .replace(/\\\r?\n\s*/g, " ")
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith("#"))
            .join(" && ")
        return Array.from(line).filter(ch => ch >= " " && ch !== "\x7f").join("")
    }
}
