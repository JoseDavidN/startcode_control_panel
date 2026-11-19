import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import QtQuick.Templates as T
import StartCode

/* Terminal SSH global. Se instancia una sola vez sobre toda la app
   (`anchors.fill` del área bajo la barra de título) y pinta lo que diga
   `TerminalSessions`: la ventana de la terminal, con hasta cinco pestañas y
   una conexión SSH cada una, o la barra de la terminal minimizada, abajo a
   la derecha. Cerrar la ventana solo la minimiza: las conexiones siguen al
   cambiar de vista hasta terminarlas. */
Item {
    id: root

    /* Fondo de la app, si se quiere que el cristal lo desenfoque. */
    property Item backdrop: null

    readonly property var session: TerminalSessions.session
    readonly property bool expanded: session !== null && TerminalSessions.expanded
    /* En su propio detalle no hace falta la barra: ahí está «Volver a la terminal». */
    readonly property bool docked: session !== null && !TerminalSessions.expanded
                                   && TerminalSessions.viewing !== session.serverId

    readonly property int maxTabs: 5
    property int activeId: 0
    property int nextId: 1
    property string currentServerId: ""
    property string activeStatus: "connecting"
    property string activeMessage: "Conectando por SSH…"

    /* Siempre apaisada (16:9); en una ventana estrecha ocupa lo que haya. */
    readonly property real aspect: 16 / 9
    readonly property bool compact: width < 760
    readonly property int margin: compact ? 10 : 24

    function toneOf(status) {
        return status === "ready" ? Theme.ok
             : status === "connecting" ? Theme.warn
             : status === "error" ? Theme.danger : Theme.ink(0.3)
    }
    /* El color del punto resume las pestañas: con una conectada, verde. */
    function summaryTone(statuses) {
        return statuses.includes("ready") ? Theme.ok
             : statuses.includes("connecting") ? Theme.warn
             : statuses.includes("error") ? Theme.danger : Theme.ink(0.3)
    }

    function indexOf(tabId) {
        for (let i = 0; i < tabs.count; i++) {
            if (tabs.get(i).tabId === tabId)
                return i
        }
        return -1
    }
    /* El asistente lee y escribe en la pestaña activa mientras la terminal
       está a la vista; minimizada no se le ofrece: no está en pantalla. */
    readonly property string assistantKey: expanded && session ? "terminal:" + session.serverId : ""
    property string assistantRegistered: ""
    onAssistantKeyChanged: syncAssistant()
    function syncAssistant() {
        if (assistantRegistered !== "") {
            AssistantBridge.unregisterSource(assistantRegistered)
            AssistantBridge.unregisterTarget(assistantRegistered)
        }
        assistantRegistered = assistantKey
        if (assistantKey === "") return
        AssistantBridge.registerSource({
            id: assistantKey, type: "terminal", title: "Terminal · " + (session.serverName || ""),
            read: () => { const pane = root.activePane(); return pane ? pane.read() : "" },
            database: () => null
        })
        AssistantBridge.registerTarget({
            id: assistantKey, kind: "terminal", label: "la terminal",
            /* Se escribe como si se tecleara, sin Enter: ejecutar lo decide el usuario. */
            paste: text => {
                const pane = root.activePane()
                /* Una sola línea, sin comentarios ni caracteres de control: un ^C
                   o un ESC pegados actuarían en la shell. */
                const joined = String(text).replace(/\\\r?\n\s*/g, " ").split(/\r?\n/).map(l => l.trim())
                    .filter(l => l !== "" && !l.startsWith("#")).join(" && ")
                const line = Array.from(joined).filter(ch => ch >= " " && ch !== "\x7f").join("")
                if (pane && pane.ready && line !== "") pane.type(line)
            }
        })
    }

    function activePane() {
        const i = indexOf(activeId)
        return i >= 0 ? panes.itemAt(i) : null
    }
    /* «Terminal #»: el número libre más bajo, así al cerrar una se reutiliza. */
    function freeNumber() {
        let n = 1
        for (;;) {
            let used = false
            for (let i = 0; i < tabs.count; i++) {
                if (tabs.get(i).n === n)
                    used = true
            }
            if (!used)
                return n
            n++
        }
    }

    function addTab() {
        if (tabs.count >= maxTabs)
            return
        const id = nextId++
        tabs.append({ tabId: id, n: freeNumber(), status: "connecting", message: "Conectando por SSH…" })
        activeId = id
        refresh()
    }

    /* Cerrar una pestaña termina su conexión; la última cierra la terminal. */
    function closeTab(tabId) {
        if (tabs.count <= 1) {
            TerminalSessions.closeAll()
            return
        }
        const i = indexOf(tabId)
        if (i < 0)
            return
        tabs.remove(i)
        if (tabId === activeId)
            activeId = tabs.get(Math.min(i, tabs.count - 1)).tabId
        refresh()
    }

    function setTabStatus(tabId, status, message) {
        const i = indexOf(tabId)
        if (i < 0)
            return
        tabs.setProperty(i, "status", status)
        tabs.setProperty(i, "message", message)
        refresh()
    }

    /* Cabecera de la pestaña activa y resumen para la barra minimizada. */
    function refresh() {
        const i = indexOf(activeId)
        activeStatus = i >= 0 ? tabs.get(i).status : "connecting"
        activeMessage = i >= 0 ? tabs.get(i).message : "Conectando por SSH…"
        const list = []
        for (let k = 0; k < tabs.count; k++)
            list.push(tabs.get(k).status)
        if (TerminalSessions.session !== null && list.join() !== TerminalSessions.statuses.join())
            TerminalSessions.statuses = list
    }

    /* Otra terminal (u otro servidor): pestañas nuevas; las anteriores cierran su conexión. */
    function reset() {
        tabs.clear()
        nextId = 1
        currentServerId = session !== null ? session.serverId : ""
        if (session !== null) {
            const id = nextId++
            tabs.append({ tabId: id, n: 1, status: "connecting", message: "Conectando por SSH…" })
            activeId = id
        }
        refresh()
    }

    Component.onCompleted: reset()
    onActiveIdChanged: refresh()
    onExpandedChanged: { if (expanded) enter.restart() }

    ListModel { id: tabs }

    Connections {
        target: TerminalSessions
        function onSessionChanged() { root.reset() }
    }
    /* Al cerrar la sesión de la app no queda ninguna shell abierta. */
    Connections {
        target: Auth
        function onUserChanged() {
            if (!Auth.authenticated)
                TerminalSessions.closeAll()
        }
    }

    /* Botón de la cabecera: cristal suave, o rojo para terminar. No toma el
       foco: el teclado sigue en la shell. */
    component HeadButton: T.Button {
        id: headButton

        property bool danger: false
        property string hint: ""

        implicitHeight: 36
        implicitWidth: headLabel.implicitWidth + 24
        hoverEnabled: true
        focusPolicy: Qt.NoFocus
        scale: down ? 0.98 : 1
        Behavior on scale { NumberAnimation { duration: Theme.moFast } }

        background: Item {
            Glass {
                anchors.fill: parent
                visible: !headButton.danger
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                highlighted: headButton.hovered
            }
            Rectangle {
                anchors.fill: parent
                visible: headButton.danger
                radius: Theme.radiusXl
                color: Qt.alpha(Theme.danger, headButton.hovered ? 0.2 : 0.1)
                border.width: 1
                border.color: Qt.alpha(Theme.danger, 0.2)
                Behavior on color { ColorAnimation { duration: Theme.moFast } }
            }
        }
        contentItem: Item {
            Label {
                id: headLabel
                anchors.centerIn: parent
                text: headButton.text
                color: headButton.danger ? Theme.tone("rose").text : Theme.ink(headButton.hovered ? 1 : 0.7)
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        HoverTip { text: headButton.hint }
    }

    /* Punto de estado; el de «conectando» late. */
    component StatusDot: Rectangle {
        id: dot
        property string status: "connecting"
        property color tone: root.toneOf(status)
        property bool pulsing: status === "connecting"
        property int size: 8
        width: size
        height: size
        radius: size / 2
        color: tone
        SequentialAnimation on opacity {
            running: dot.pulsing && dot.visible && !Theme.reducedMotion
            loops: Animation.Infinite
            alwaysRunToEnd: true
            NumberAnimation { from: 1; to: 0.4; duration: 1000; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 0.4; to: 1; duration: 1000; easing.type: Easing.InOutQuad }
        }
    }

    /* Pie de la pestaña activa: curva inversa que la une a la consola. */
    component TabFoot: Shape {
        id: foot
        property bool leftSide: true
        width: 12
        height: 12
        ShapePath {
            fillColor: TerminalSessions.consoleBackground
            strokeColor: "transparent"
            strokeWidth: 0
            PathSvg { path: foot.leftSide ? "M0 12 A12 12 0 0 0 12 0 L12 12 Z" : "M0 0 A12 12 0 0 0 12 12 L0 12 Z" }
        }
    }

    /* ── Ventana de la terminal ─────────────────────────────────────── */
    Item {
        id: overlay
        anchors.fill: parent
        visible: root.expanded

        Rectangle {
            id: scrim
            anchors.fill: parent
            color: Qt.rgba(0, 0, 0, 0.6)
            /* Clic fuera: minimizar. También se queda con la rueda y el paso del ratón. */
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.AllButtons
                hoverEnabled: true
                onClicked: TerminalSessions.minimize()
                onWheel: wheel => wheel.accepted = true
            }
        }

        Glass {
            id: panel

            property real rise: 0
/* Con el asistente abierto la terminal le deja sitio a la derecha. */
            readonly property real assistantSpace: AssistantBridge.open && !root.compact ? 460 : 0
            readonly property real availableWidth: Math.max(0, root.width - root.margin * 2 - assistantSpace)
            readonly property real availableHeight: Math.max(0, root.height - root.margin * 2)

            anchors.centerIn: parent
            anchors.horizontalCenterOffset: -assistantSpace / 2
            width: root.compact ? availableWidth
                                : Math.min(1280, availableWidth, availableHeight * root.aspect)
            height: root.compact ? availableHeight : width / root.aspect
            variant: "float"
            elevation: "modal"
            radius: Theme.radius2xl
            backdrop: root.expanded ? root.backdrop : null
            transform: Translate { y: panel.rise }
            Accessible.role: Accessible.Dialog
            Accessible.name: "Terminal · " + (root.session ? root.session.serverName : "")

            /* Los clics en la ventana no llegan al fondo (que minimiza). */
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.AllButtons
                onWheel: wheel => wheel.accepted = true
            }

            RowLayout {
                id: head
                x: 20
                y: 12
                width: parent.width - 40
                height: 36
                spacing: 12

                StatusDot { status: root.activeStatus }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0
                    Label {
                        Layout.fillWidth: true
                        text: "Terminal · " + (root.session ? root.session.serverName : "")
                        font.weight: Font.DemiBold
                    }
                    Label {
                        Layout.fillWidth: true
                        text: root.activeMessage
                        mono: true
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                }
                AssistantLauncher { compact: true; visible: panel.width >= 520 }
                HeadButton {
                    visible: panel.width >= 420
                    text: "Limpiar"
                    onClicked: {
                        const pane = root.activePane()
                        if (pane)
                            pane.clear()
                    }
                }
                HeadButton {
                    danger: true
                    text: tabs.count > 1 ? "Terminar todas" : "Terminar sesión"
                    hint: "Cierra todas las conexiones SSH"
                    onClicked: TerminalSessions.closeAll()
                }
                IconButton {
                    iconName: "minimize"
                    hint: "Minimizar: las sesiones siguen abiertas y puedes ir a otras vistas"
                    focusPolicy: Qt.NoFocus
                    Accessible.name: "Minimizar terminal"
                    onClicked: TerminalSessions.minimize()
                }
            }

            /* Pestañas: una conexión SSH cada una. La activa tiene el fondo de
               la consola y se une a ella sin borde, como una lengüeta. */
            Item {
                id: strip
                anchors.top: head.bottom
                anchors.topMargin: 12
                x: 12
                width: parent.width - 24
                height: 36
                Accessible.role: Accessible.PageTabList
                Accessible.name: "Terminales"

                Row {
                    id: tabRow
                    anchors.bottom: parent.bottom
                    spacing: 2

                    Repeater {
                        model: tabs
                        Item {
                            id: tab
                            required property int tabId
                            required property int n
                            required property string status
                            required property string message
                            readonly property bool selected: tabId === root.activeId
                            readonly property string name: "Terminal " + n

                            width: tabContent.implicitWidth
                            height: 36

                            Rectangle {
                                anchors.bottom: parent.bottom
                                anchors.bottomMargin: tab.selected ? 0 : 2
                                width: parent.width
                                height: tab.selected ? 36 : 32
                                radius: Theme.radiusXl
                                bottomLeftRadius: tab.selected ? 0 : Theme.radiusXl
                                bottomRightRadius: tab.selected ? 0 : Theme.radiusXl
                                color: tab.selected ? TerminalSessions.consoleBackground
                                     : tabHover.hovered ? Theme.tintHover : "transparent"
                            }
                            TabFoot { visible: tab.selected; leftSide: true; x: -12; anchors.bottom: parent.bottom }
                            TabFoot { visible: tab.selected; leftSide: false; x: tab.width; anchors.bottom: parent.bottom }

                            HoverHandler { id: tabHover }

                            Row {
                                id: tabContent
                                anchors.bottom: parent.bottom
                                height: 36
                                leftPadding: 14
                                rightPadding: 8
                                spacing: 6

                                /* La activa va sobre el fondo fijo de la consola: su texto
                                   usa la paleta de la terminal, no la tinta del tema. */
                                Item {
                                    id: tabButton
                                    width: tabLabelRow.implicitWidth
                                    height: parent.height
                                    Accessible.role: Accessible.PageTab
                                    Accessible.name: tab.name
                                    Accessible.selected: tab.selected

                                    Row {
                                        id: tabLabelRow
                                        anchors.verticalCenter: parent.verticalCenter
                                        spacing: 8
                                        StatusDot {
                                            anchors.verticalCenter: parent.verticalCenter
                                            size: 6
                                            status: tab.status
                                        }
                                        Label {
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: panel.width < 620 ? String(tab.n) : tab.name
                                            mono: true
                                            color: tab.selected ? TerminalSessions.consoleForeground
                                                          : Theme.ink(tabHover.hovered ? 0.85 : 0.5)
                                            font.pixelSize: Theme.textXs
                                            font.weight: Font.Medium
                                        }
                                    }
                                    HoverHandler { cursorShape: Qt.PointingHandCursor }
                                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.activeId = tab.tabId }
                                    HoverTip { text: tab.message }
                                }

                                Rectangle {
                                    id: closeTabButton
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: 20
                                    height: 20
                                    radius: Theme.radiusMd
                                    opacity: tab.selected || tabHover.hovered ? 1 : 0
                                    color: !closeHover.hovered ? "transparent"
                                         : tab.selected ? Qt.alpha(TerminalSessions.consoleForeground, 0.1) : Theme.tintHover
                                    Accessible.role: Accessible.Button
                                    Accessible.name: "Cerrar " + tab.name

                                    Icon {
                                        anchors.centerIn: parent
                                        name: "close"
                                        size: 12
                                        strokeWidth: 2
                                        color: tab.selected ? (closeHover.hovered ? TerminalSessions.consoleForeground
                                                                            : TerminalSessions.consoleMuted)
                                                      : Theme.ink(closeHover.hovered ? 1 : 0.4)
                                    }
                                    HoverHandler { id: closeHover; cursorShape: Qt.PointingHandCursor }
                                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.closeTab(tab.tabId) }
                                    HoverTip { text: "Cerrar pestaña (termina su conexión SSH)" }
                                }
                            }
                        }
                    }

                    Item {
                        visible: tabs.count < root.maxTabs
                        width: 32
                        height: 36
                        Rectangle {
                            x: 4
                            y: 2
                            width: 28
                            height: 28
                            radius: Theme.radiusLg
                            color: addHover.hovered ? Theme.tintHover : "transparent"
                            Accessible.role: Accessible.Button
                            Accessible.name: "Nueva terminal"

                            Icon {
                                anchors.centerIn: parent
                                name: "plus"
                                size: 14
                                strokeWidth: 2
                                color: Theme.ink(addHover.hovered ? 1 : 0.5)
                            }
                            HoverHandler { id: addHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.addTab() }
                            HoverTip { text: "Nueva terminal (abre otra conexión SSH)" }
                        }
                    }
                }
            }

            /* Consola: fondo propio, redondeado abajo como la ventana. */
            Rectangle {
                id: console_
                anchors.top: strip.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.leftMargin: 1
                anchors.rightMargin: 1
                anchors.bottomMargin: 1
                color: TerminalSessions.consoleBackground
                bottomLeftRadius: Theme.radius2xl - 1
                bottomRightRadius: Theme.radius2xl - 1

                Repeater {
                    id: panes
                    model: tabs
                    TerminalSession {
                        id: pane
                        required property int tabId

                        anchors.fill: parent
                        serverId: root.currentServerId
                        visible: root.expanded && pane.tabId === root.activeId
                        shown: visible
                        onStatusReported: (status, message) => root.setTabStatus(pane.tabId, status, message)
                    }
                }
            }
        }

        /* Entrada de la ventana: opacidad y 8 px de subida, como los modales. */
        ParallelAnimation {
            id: enter
            NumberAnimation { target: scrim; property: "opacity"; from: 0; to: 1; duration: Theme.moFast }
            NumberAnimation { target: panel; property: "opacity"; from: 0; to: 1; duration: Theme.moSlow }
            NumberAnimation {
                target: panel; property: "rise"; from: Theme.moRise; to: 0; duration: Theme.moSlow
                easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
            }
        }
    }

    /* ── Terminal minimizada ────────────────────────────────────────── */
    Glass {
        id: bar

        readonly property int count: TerminalSessions.statuses.length
        property real rise: 0

        visible: root.docked
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: root.compact ? 12 : 28
        anchors.bottomMargin: root.compact ? 12 : 28
        width: barRow.implicitWidth + 8
        height: 44
        variant: "float"
        elevation: "float"
        radius: Theme.radiusXl
        backdrop: root.docked ? root.backdrop : null
        transform: Translate { y: bar.rise }
        Accessible.role: Accessible.Grouping
        Accessible.name: "Terminal minimizada"

        onVisibleChanged: { if (visible) barEnter.restart() }

        ParallelAnimation {
            id: barEnter
            NumberAnimation { target: bar; property: "opacity"; from: 0; to: 1; duration: Theme.moBase }
            NumberAnimation {
                target: bar; property: "rise"; from: Theme.moRise; to: 0; duration: Theme.moBase
                easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
            }
        }

        Row {
            id: barRow
            x: 4
            y: 4
            spacing: 4

            Rectangle {
                width: restoreRow.implicitWidth
                height: 36
                radius: Theme.radiusLg
                color: restoreHover.hovered ? Theme.tintHover : "transparent"
                Accessible.role: Accessible.Button
                Accessible.name: "Abrir la terminal"

                Row {
                    id: restoreRow
                    height: parent.height
                    leftPadding: 12
                    rightPadding: 14
                    spacing: 10

                    StatusDot {
                        anchors.verticalCenter: parent.verticalCenter
                        size: 6
                        tone: root.summaryTone(TerminalSessions.statuses)
                        pulsing: !TerminalSessions.statuses.includes("ready")
                                 && TerminalSessions.statuses.includes("connecting")
                    }
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        name: "terminal"
                        size: 16
                        color: Theme.brandLight1
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(implicitWidth, Math.max(60, Math.min(256, root.width - 220)))
                        text: root.session ? root.session.serverName : ""
                        tone: restoreHover.hovered ? 1 : 0.85
                        font.weight: Font.Medium
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: bar.count > 1 && !root.compact
                        text: bar.count + " terminales"
                        mono: true
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        name: "chevronUp"
                        size: 14
                        color: Theme.ink(0.45)
                    }
                }
                HoverHandler { id: restoreHover; cursorShape: Qt.PointingHandCursor }
                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: TerminalSessions.restore() }
                HoverTip { text: "Abrir la terminal" }
            }

            Rectangle {
                width: 36
                height: 36
                radius: Theme.radiusLg
                color: endHover.hovered ? Qt.alpha(Theme.danger, 0.1) : "transparent"
                Accessible.role: Accessible.Button
                Accessible.name: "Terminar sesiones"

                Icon {
                    anchors.centerIn: parent
                    name: "close"
                    size: 16
                    color: endHover.hovered ? Theme.tone("rose").text : Theme.ink(0.45)
                }
                HoverHandler { id: endHover; cursorShape: Qt.PointingHandCursor }
                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: TerminalSessions.closeAll() }
                HoverTip { text: bar.count > 1 ? "Terminar todas las sesiones SSH" : "Terminar la sesión SSH" }
            }
        }
    }
}
