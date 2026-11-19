pragma Singleton

import QtQuick

/* Formato de cifras y tiempos, igual en toda la app. */
QtObject {
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
