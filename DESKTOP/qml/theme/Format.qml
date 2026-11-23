pragma Singleton

import QtQuick

/* Formato de cifras y tiempos, igual en toda la app. */
QtObject {
    readonly property var svgPathCache: ({})
    /**
     * Trazo SVG reescrito para `PathSvg`: cada orden con su letra y los números
     * separados. Los trazos de iconos vienen compactados (`a2 2 0 01-2-2`,
     * indicadores de arco pegados) y Qt anterior a 6.11 no los lee bien.
     */
    function svgPath(d) {
        if (!d) return ""
        const cached = svgPathCache[d]
        if (cached !== undefined) return cached
        const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
        const number = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
        const out = []
        let i = 0, command = "", group = []
        const flush = () => {
            if (!command) return
            out.push(command + (group.length ? " " + group.join(" ") : ""))
            /* Los pares que siguen a un «M» son líneas. */
            if (command === "M") command = "L"
            else if (command === "m") command = "l"
            group = []
        }
        while (i < d.length) {
            const ch = d[i]
            if (/[\s,]/.test(ch)) { i++; continue }
            if (/[a-zA-Z]/.test(ch) && counts[ch.toLowerCase()] !== undefined) {
                command = ch
                group = []
                i++
                if (ch === "z" || ch === "Z") { out.push(ch); command = "" }
                continue
            }
            if (!command) break
            const lower = command.toLowerCase()
            /* Indicadores de arco (4.º y 5.º valor): un solo dígito, 0 o 1. */
            if (lower === "a" && (group.length === 3 || group.length === 4) && (ch === "0" || ch === "1")) {
                group.push(ch)
                i++
            } else {
                number.lastIndex = i
                const match = number.exec(d)
                if (!match) break
                group.push(match[0])
                i = number.lastIndex
            }
            if (group.length === counts[lower]) flush()
        }
        const result = out.join(" ")
        svgPathCache[d] = result
        return result
    }

    function bytes(b) {
        if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB"
        if (b >= 1048576) return (b / 1048576).toFixed(0) + " MB"
        if (b >= 1024) return (b / 1024).toFixed(0) + " KB"
        return b + " B"
    }
    function uptime(seconds) {
        if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "—"
        const s = Math.floor(seconds)
        const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60)
        return d > 0 ? d + "d " + h + "h " + m + "m" : h > 0 ? h + "h " + m + "m" : m + "m"
    }
    /** `at`: fecha ISO o milisegundos. */
    function timeAgo(at) {
        const ms = typeof at === "string" ? Date.parse(at) : at
        if (!ms || isNaN(ms)) return "—"
        const seconds = Math.floor((Date.now() - ms) / 1000)
        if (seconds < 60) return "hace un momento"
        if (seconds < 3600) return "hace " + Math.floor(seconds / 60) + " min"
        if (seconds < 86400) return "hace " + Math.floor(seconds / 3600) + " h"
        const days = Math.floor(seconds / 86400)
        if (days === 1) return "ayer"
        if (days < 30) return "hace " + days + " días"
        return new Date(ms).toLocaleDateString(Qt.locale("es_ES"), "dd MMM yyyy")
    }
    /** Familias de color de una barra según el porcentaje: `[desde, hasta]`. */
    function barTones(percent) {
        if (percent >= 90) return ["rose", "orange"]
        if (percent >= 70) return ["amber", "orange"]
        if (percent >= 50) return ["sky", "cyan"]
        return ["emerald", "teal"]
    }
}
