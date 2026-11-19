import QtQuick
import StartCode

/* Una terminal con su propia conexión SSH (un socket por pestaña). Existe
   mientras exista la pestaña: oculta conserva la sesión y el búfer.

       TerminalSession { serverId: "…"; shown: true; onStatusReported: (status, message) => … }

   `clear()`, `read()` (últimas líneas) y `type(texto)` (escribe sin Enter). */
Item {
    id: root

    required property string serverId
    /* Pestaña activa y muelle abierto: es la que se ve. */
    property bool shown: false

    /* connecting | ready | closed | error */
    property string status: "connecting"
    property string message: "Conectando por SSH…"
    readonly property bool ready: status === "ready"

    property var socket: null
    /* Último tamaño que conoce la shell remota. */
    property var sent: ({ cols: 0, rows: 0 })

    signal statusReported(string status, string message)

    function clear() { view.clear() }

    /** Texto visible: las últimas líneas del búfer, sin las vacías del final. */
    function read() { return view.bufferText(300) }

    /** Escribe en la shell como si se tecleara; false si no está conectada. */
    function type(text) {
        if (!socket || !socket.connected)
            return false
        socket.emitEvent("terminal:input", [text])
        view.forceActiveFocus()
        return true
    }

    function focusTerminal() { view.forceActiveFocus() }

    function report(newStatus, newMessage) {
        status = newStatus
        message = newMessage
        statusReported(newStatus, newMessage)
    }

    function start() {
        report("connecting", "Conectando por SSH…")
        sent = { cols: view.columns, rows: view.rows }
        socket = App.openSocket("/terminal", { serverId: root.serverId, cols: view.columns, rows: view.rows })
        if (shown)
            view.forceActiveFocus()
    }

    function dispose() {
        if (!socket)
            return
        const old = socket
        socket = null
        old.close()
        old.destroy()
    }

    /* El tamaño de la shell remota debe seguir al de la vista, o el redibujado
       de programas a pantalla completa (htop, vim) sale partido. Oculta no se
       ajusta, y solo se avisa al servidor si el tamaño cambió de verdad. */
    function syncSize() {
        if (!shown || !ready || !socket || !socket.connected)
            return
        if (view.columns === sent.cols && view.rows === sent.rows)
            return
        sent = { cols: view.columns, rows: view.rows }
        socket.emitEvent("terminal:resize", [sent])
    }

    function openMenu(x, y) {
        const items = []
        if (view.hasSelection)
            items.push({ label: "Copiar", icon: "copy", action: () => { view.copySelection(); view.forceActiveFocus() } })
        if (root.ready)
            items.push({ label: "Pegar", icon: "paste", action: () => { view.paste(); view.forceActiveFocus() } })
        if (items.length > 0)
            menu.openAt(view, x, y, items)
    }

    /* Tras colocarse: así el saludo lleva las columnas y filas reales. */
    Component.onCompleted: Qt.callLater(root.start)
    Component.onDestruction: dispose()

    /* Al volver a mostrarla (o cambiar a su pestaña): tamaño al día y el foco en la shell. */
    onShownChanged: {
        if (shown)
            Qt.callLater(() => { root.syncSize(); view.forceActiveFocus() })
    }

    Connections {
        target: root.socket

        function onEvent(name, args) {
            const payload = args.length > 0 ? args[0] : undefined
            if (name === "terminal:output") {
                if (typeof payload === "string")
                    view.write(payload)
            } else if (name === "terminal:ready") {
                root.report("ready", (payload?.user ?? "") + "@" + (payload?.host ?? ""))
                root.syncSize()
                if (root.shown)
                    view.forceActiveFocus()
            } else if (name === "terminal:error") {
                /* Clave de host cambiada: el aviso global enseña las dos huellas. */
                TerminalSessions.reportHostKey(payload)
                root.report("error", payload?.message ?? "No se pudo abrir la terminal")
                view.write("\r\n\x1b[31m" + (payload?.message ?? "Error de conexión") + "\x1b[0m\r\n")
            } else if (name === "terminal:closed") {
                root.report("closed", payload?.reason ?? "Sesión terminada")
                view.write("\r\n\x1b[90m— sesión terminada —\x1b[0m\r\n")
            } else if (name === "auth:revoked") {
                const reason = payload?.reason ?? ""
                const text = payload?.message ?? ""
                TerminalSessions.revoked(payload)
                /* Quien cierra la sesión de la app es `Auth`, si lo expone a QML. */
                if (typeof Auth.sessionRevoked === "function")
                    Auth.sessionRevoked(reason, text)
            }
        }

        function onConnectError(message) {
            root.report("error", message || "No se pudo abrir la terminal")
            view.write("\r\n\x1b[31m" + (message || "Error de conexión") + "\x1b[0m\r\n")
        }

        function onDisconnected(reason) {
            /* Solo una sesión en marcha pasa a cerrada; un error se queda con su mensaje. */
            if (root.status === "ready") {
                root.report("closed", "Conexión cerrada")
            } else if (root.status === "connecting") {
                /* Este socket no reintenta: sin esto quedaría conectando para siempre. */
                root.report("error", "No se pudo abrir la terminal")
                view.write("\r\n\x1b[31mError de conexión\x1b[0m\r\n")
            }
        }
    }

    TerminalView {
        id: view

        anchors.fill: parent
        anchors.margins: 12

        fontFamily: Theme.fontTerminal[0]
        fontPixelSize: 13
        lineHeight: 1.25
        scrollbackLimit: 5000
        backgroundColor: TerminalSessions.consoleBackground
        foregroundColor: TerminalSessions.consoleForeground
        focus: true
        Accessible.name: "Terminal"

        onInput: data => {
            if (root.socket && root.socket.connected)
                root.socket.emitEvent("terminal:input", [data])
        }
        onGridChanged: root.syncSize()
        onContextMenuRequested: (x, y) => root.openMenu(x, y)
    }

    /* Barra del historial: fina, sobre el borde derecho; aparece al pasar el
       ratón o al subir por el historial. Va en la paleta de la consola. */
    Item {
        id: track

        readonly property int history: view.scrollbackSize
        readonly property real thumbHeight: Math.max(24, height * view.rows / Math.max(1, view.rows + history))
        readonly property bool strong: trackArea.containsMouse || trackArea.pressed

        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: parent.right
        anchors.topMargin: 12
        anchors.bottomMargin: 12
        anchors.rightMargin: 1
        width: 10
        visible: history > 0 && !view.altScreen
        opacity: strong || rootHover.hovered || view.scrollOffset > 0 ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Theme.moBase } }

        Rectangle {
            anchors.right: parent.right
            anchors.rightMargin: 2
            y: track.history > 0 ? (track.height - track.thumbHeight) * (1 - view.scrollOffset / track.history) : 0
            width: track.strong ? 8 : 6
            height: track.thumbHeight
            radius: width / 2
            color: Qt.alpha(TerminalSessions.consoleForeground, track.strong ? 0.55 : 0.3)
            Behavior on width { NumberAnimation { duration: Theme.moFast } }
        }

        MouseArea {
            id: trackArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor

            function moveTo(mouseY) {
                const range = track.height - track.thumbHeight
                if (range <= 0)
                    return
                const ratio = Math.max(0, Math.min(1, (mouseY - track.thumbHeight / 2) / range))
                view.scrollOffset = Math.round((1 - ratio) * track.history)
            }
            onPressed: mouse => moveTo(mouse.y)
            onPositionChanged: mouse => { if (pressed) moveTo(mouse.y) }
            onReleased: view.forceActiveFocus()
        }
    }

    HoverHandler { id: rootHover }

    /* Clic derecho: la selección de la terminal es suya, así que da su propio menú. */
    FloatMenu {
        id: menu
        onClosed: { if (root.shown) view.forceActiveFocus() }
    }
}
