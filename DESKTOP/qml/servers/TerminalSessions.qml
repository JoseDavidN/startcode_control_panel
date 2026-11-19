pragma Singleton

import QtQuick

/* Estado global de la terminal SSH. Vive fuera de las páginas: las sesiones
   siguen abiertas al cambiar de sección y la ventana se puede minimizar en
   una barra. Una sola terminal a la vez (con sus pestañas): abrir la de otro
   servidor, o entrar a su detalle, cierra la anterior. La pinta `TerminalDock`. */
QtObject {
    id: root

    /* Servidor con terminal abierta: `{ serverId, serverName }`, o null. */
    property var session: null
    /* Ventana de la terminal a la vista; si no, queda minimizada abajo. */
    property bool expanded: false
    /* Detalle de servidor que está en pantalla ("" si ninguno). */
    property string viewing: ""
    /* Estado de cada pestaña: connecting | ready | closed | error. */
    property var statuses: []

    /* La consola se pinta con su propia paleta y no con los tokens del tema:
       un fondo claro no es legible para salida con códigos ANSI. Son los
       mismos colores que `TerminalView` trae por defecto. */
    readonly property color consoleBackground: "#07050d"
    readonly property color consoleForeground: "#e6e1f5"
    readonly property color consoleMuted: "#6b6480"

    /* Clave de host cambiada o sin confirmar al abrir la terminal: el cuerpo
       completo del error (`{ message, code, hostKey }`), para el aviso global. */
    signal hostKeyMismatch(var payload)
    /* El backend terminó la sesión de la app (`auth:revoked`) por un socket de terminal. */
    signal sessionRevoked(var payload)

    /** Abre (o vuelve a mostrar) la terminal de un servidor. */
    function open(serverId, serverName) {
        if (!serverId)
            return
        if (session === null || session.serverId !== serverId) {
            statuses = []
            session = { serverId: serverId, serverName: serverName || "" }
        }
        expanded = true
    }

    /** Enlazable: cambia con `session`. */
    function hasSession(serverId) {
        return session !== null && session.serverId === serverId
    }

    /** Minimiza sin cerrar las sesiones SSH. */
    function minimize() { expanded = false }

    function restore() {
        if (session !== null)
            expanded = true
    }

    function close(serverId) {
        if (hasSession(serverId))
            closeAll()
    }

    /** Cierra todas las sesiones SSH. */
    function closeAll() {
        expanded = false
        session = null
        statuses = []
    }

    /** El detalle de `serverId` entra en pantalla: la terminal de otro servidor se cierra. */
    function setViewing(serverId) {
        viewing = serverId || ""
        if (viewing !== "" && session !== null && session.serverId !== viewing)
            closeAll()
    }

    /** El detalle de `serverId` sale de pantalla (no pisa al que ya entró después). */
    function clearViewing(serverId) {
        if (viewing === serverId)
            viewing = ""
    }

    /** Avisa si `payload` es un rechazo de clave de host bien formado. Devuelve si lo era. */
    function reportHostKey(payload) {
        if (!payload || (payload.code !== "HOST_KEY_MISMATCH" && payload.code !== "HOST_KEY_UNVERIFIED"))
            return false
        const key = payload.hostKey
        const isKey = value => value !== null && value !== undefined && typeof value.fingerprint === "string"
        if (!key || typeof key.serverId !== "string" || key.serverId === "" || !isKey(key.received))
            return false
        if (payload.code === "HOST_KEY_MISMATCH" ? !isKey(key.expected)
                                                 : (key.expected !== null && key.expected !== undefined))
            return false
        hostKeyMismatch(payload)
        return true
    }

    /** Sesión terminada en el backend: fuera la terminal, también la minimizada. */
    function revoked(payload) {
        closeAll()
        sessionRevoked(payload || {})
    }
}
