import QtQuick

/* Lógica pura del asistente (sin interfaz): cómo se trocea una respuesta,
   qué destinos sirven para cada bloque y las altas que el modelo puede
   proponer. Estas llegan como un bloque ```startcode-servidor``` o
   ```startcode-conexion``` con JSON; el panel lo muestra como tarjeta y, al
   confirmar, se abre el formulario de siempre ya rellenado. La llave SSH y la
   contraseña las escribe el usuario ahí: nunca pasan por el modelo. */
QtObject {
    id: root

    readonly property var actionLangs: ({ server: "startcode-servidor", database: "startcode-conexion" })

    /* Mismas listas cerradas que los formularios (y que el backend). */
    readonly property var osOptions: [
        { value: "ubuntu", label: "Ubuntu" },
        { value: "centos", label: "CentOS" },
        { value: "debian", label: "Debian" },
        { value: "fedora", label: "Fedora" },
        { value: "arch", label: "Arch Linux" },
        { value: "solaris", label: "Solaris" },
        { value: "openbsd", label: "OpenBSD" },
        { value: "netbsd", label: "NetBSD" },
        { value: "freebsd", label: "FreeBSD" },
        { value: "other", label: "Otro" }
    ]
    readonly property var tagOptions: [
        { value: "production", label: "Producción" },
        { value: "staging", label: "Preproducción" },
        { value: "testing", label: "Pruebas" },
        { value: "development", label: "Desarrollo" },
        { value: "backup", label: "Respaldo" }
    ]
    readonly property var engines: ["mysql", "mariadb", "postgresql", "redis"]
    readonly property var engineLabels: ({ mysql: "MySQL", mariadb: "MariaDB", postgresql: "PostgreSQL", redis: "Redis" })
    readonly property var defaultPorts: ({ mysql: 3306, mariadb: 3306, postgresql: 5432, redis: 6379 })

    /* Proveedores: solo hace falta el nombre de quien respondió. */
    readonly property var providers: [
        { id: "anthropic", name: "Claude", vendor: "Anthropic" },
        { id: "openai", name: "ChatGPT", vendor: "OpenAI" },
        { id: "gemini", name: "Gemini", vendor: "Google" }
    ]

    readonly property var shellLangs: ["", "bash", "sh", "shell", "zsh", "console", "terminal"]

    function osLabel(os) {
        const found = osOptions.find(o => o.value === os)
        return found ? found.label : os
    }
    function tagLabel(tag) {
        const found = tagOptions.find(t => t.value === tag)
        return found ? found.label : tag
    }
    function vendorOf(provider) {
        const found = providers.find(p => p.id === provider)
        return found ? found.vendor : (provider || "")
    }

    /* La consola de Redis se registra como destino `command`, pero solo recibe bloques de Redis. */
    function isRedisConsole(target) {
        return String(target.id).startsWith("redis-console:")
    }

    /** Destinos que tienen sentido para el lenguaje del bloque. */
    function targetsFor(lang, targets) {
        const list = targets || []
        const l = String(lang || "").toLowerCase()
        if (l === "redis") return list.filter(t => isRedisConsole(t))
        const kinds = (l === "sql" || l === "mysql" || l === "postgresql" || l === "pgsql") ? ["sql"]
                    : shellLangs.includes(l) ? ["terminal", "command"]
                    : ["terminal", "command", "sql"]
        return list.filter(t => kinds.includes(t.kind) && !isRedisConsole(t))
    }

    /** Separa los bloques ```lang … ``` del texto. Un bloque sin cerrar llega hasta el final. */
    function parseReply(text) {
        const source = String(text === undefined || text === null ? "" : text)
        const parts = []
        const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g
        let last = 0
        let m
        while ((m = re.exec(source))) {
            if (m.index > last) parts.push({ kind: "text", text: source.slice(last, m.index) })
            parts.push({ kind: "code", lang: m[1] || "", code: m[2].replace(/\n$/, "") })
            last = re.lastIndex
            /* Coincidencia vacía al final: sin esto el bucle no avanzaría. */
            if (m[0].length === 0) re.lastIndex++
        }
        if (last < source.length) parts.push({ kind: "text", text: source.slice(last) })
        return parts
    }

    function str(v, max) {
        return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined
    }
    function port(v) {
        const n = typeof v === "string" ? parseInt(v, 10) : v
        return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined
    }
    function validTag(v) {
        return tagOptions.some(t => t.value === v) ? v : undefined
    }
    /* Sin claves vacías: lo que no venga se queda con el valor por defecto del formulario. */
    function compact(o) {
        const out = {}
        Object.keys(o).forEach(k => { if (o[k] !== undefined) out[k] = o[k] })
        return out
    }

    /** Lee el bloque del modelo. Solo pasan campos conocidos y valores válidos; si no hay JSON, null. */
    function parseAction(lang, code) {
        const l = String(lang || "").toLowerCase()
        if (l !== actionLangs.server && l !== actionLangs.database) return null
        let raw
        try {
            const parsed = JSON.parse(code)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
            raw = parsed
        } catch (e) {
            return null
        }

        if (l === actionLangs.server) {
            const os = osOptions.some(o => o.value === raw.os) ? raw.os : undefined
            return {
                kind: "server",
                data: compact({
                    name: str(raw.name, 100), host: str(raw.host, 255), port: port(raw.port),
                    username: str(raw.username, 100), os: os, tag: validTag(raw.tag), description: str(raw.description, 255)
                })
            }
        }

        const engine = engines.includes(raw.engine) ? raw.engine : undefined
        const rawPort = port(raw.port)
        return {
            kind: "database",
            data: compact({
                engine: engine, name: str(raw.name, 100), host: str(raw.host, 255),
                port: rawPort !== undefined ? rawPort : (engine ? defaultPorts[engine] : undefined),
                username: str(raw.username, 128),
                database: typeof raw.database === "number" ? String(raw.database) : str(raw.database, 128),
                tag: validTag(raw.tag)
            })
        }
    }
}
