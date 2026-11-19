import QtQuick
import QtQuick.Layouts
import StartCode

/* Fila compacta de un servidor en el panel: estado, nombre, motivo de la
   atención (o su dirección), mini barras de CPU/RAM/disco y tiempo activo.
   Lo secundario se oculta al estrecharse. */
Rectangle {
    id: root

    /* Servidor de `GET /servers`. */
    property var server: ({})
    /* Estado combinado (resumen del API + socket): `{ state, hasMetrics, stale, cpu, memory, disk, uptime… }`. */
    property var rt: ({})
    /* Motivos por los que requiere atención; vacío = en orden. */
    property var issues: []
    /* 0 en orden, 1 atención, 2 caído. */
    property int level: 0
    /* Última señal conocida (fecha ISO) de un servidor sin conexión. */
    property string lastSeen: ""
    property real cpuThreshold: 80
    property real memoryThreshold: 85
    property real diskThreshold: 90
    signal clicked()

    readonly property string serverState: rt.state || "unknown"
    readonly property bool hasMetrics: rt.hasMetrics === true
    readonly property color stateColor: serverState === "online" ? (level === 1 ? Theme.warn : Theme.ok)
                                      : serverState === "warning" ? Theme.warn
                                      : serverState === "offline" ? Theme.danger : Theme.ink(0.3)
    /* La métrica más cargada, para la vista estrecha. */
    readonly property var worst: {
        const all = [["CPU", rt.cpu], ["RAM", rt.memory], ["Disco", rt.disk]]
            .filter(m => m[1] !== null && m[1] !== undefined)
        if (all.length === 0) return null
        return all.reduce((a, b) => (b[1] > a[1] ? b : a))
    }

    function tonesFor(value, threshold) {
        if (value >= threshold) return ["rose", "orange"]
        if (value >= threshold * 0.85) return ["amber", "orange"]
        return ["emerald", "teal"]
    }

    implicitHeight: 60
    radius: Theme.radiusXl
    color: hover.hovered ? Theme.tintHover : "transparent"
    border.width: activeFocus ? 1 : 0
    border.color: Theme.focusRing
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: (server.name || "") + (issues.length > 0 ? ": " + issues.join(", ") : "")
    Keys.onReturnPressed: root.clicked()
    Keys.onSpacePressed: root.clicked()
    Behavior on color { ColorAnimation { duration: Theme.moFast } }

    HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.clicked() }

    component Mini: Column {
        id: mini
        property string label
        property var value: null
        property real threshold: 100
        readonly property bool known: value !== null && value !== undefined
        readonly property var tones: root.tonesFor(known ? value : 0, threshold)
        width: 84
        spacing: 5
        Item {
            width: parent.width; height: 14
            Label {
                text: mini.label
                tone: 0.45
                font.pixelSize: Theme.textCaption
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
            }
            Label {
                anchors.right: parent.right
                text: mini.known ? Math.round(mini.value) + "%" : "—"
                mono: true
                tone: mini.known ? 0.9 : 0.45
                font.pixelSize: Theme.textXs
            }
        }
        Rectangle {
            width: parent.width; height: 4; radius: 2
            color: Theme.track
            Rectangle {
                visible: mini.known
                width: parent.width * Math.max(0, Math.min(100, mini.known ? mini.value : 0)) / 100
                height: parent.height
                radius: 2
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Theme.tone(mini.tones[0]).base }
                    GradientStop { position: 1; color: Theme.tone(mini.tones[1]).base }
                }
                Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 700; easing.type: Easing.OutCubic } }
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 10
        spacing: 14

        Rectangle {
            implicitWidth: 8; implicitHeight: 8
            radius: 4
            color: root.stateColor
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.minimumWidth: 80
            spacing: 2
            Label {
                Layout.fillWidth: true
                text: root.server.name || ""
                font.weight: Font.DemiBold
            }
            Label {
                Layout.fillWidth: true
                text: root.issues.length > 0 ? root.issues.join(" · ")
                    : root.serverState === "offline" && root.lastSeen !== "" ? "Visto " + Format.timeAgo(root.lastSeen)
                    : (root.server.host || "")
                mono: root.issues.length === 0 && !(root.serverState === "offline" && root.lastSeen !== "")
                color: root.issues.length === 0 ? Theme.ink(0.5) : root.level === 2 ? Theme.danger : Theme.warn
                font.pixelSize: Theme.textXs
            }
        }

        /* Ancho: las tres barras. */
        Row {
            visible: root.width >= 540 && root.hasMetrics
            spacing: 16
            opacity: root.rt.stale ? 0.6 : 1
            Mini { label: "CPU"; value: root.rt.cpu; threshold: root.cpuThreshold }
            Mini { label: "RAM"; value: root.rt.memory; threshold: root.memoryThreshold }
            Mini { label: "Disco"; value: root.rt.disk; threshold: root.diskThreshold }
        }
        /* Estrecho: solo la métrica más cargada. */
        Label {
            visible: root.width < 540 && root.hasMetrics && root.worst !== null
            text: root.worst ? root.worst[0] + " " + Math.round(root.worst[1]) + "%" : ""
            mono: true
            tone: 0.75
            font.pixelSize: Theme.textXs
        }
        Label {
            visible: !root.hasMetrics
            text: "Sin agente"
            tone: 0.4
            font.pixelSize: Theme.textXs
        }

        Row {
            visible: root.width >= 700 && root.hasMetrics
            spacing: 6
            Icon { anchors.verticalCenter: parent.verticalCenter; name: "clock"; size: 14; color: Theme.ink(0.45) }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                width: 78
                text: Format.uptime(root.rt.uptime)
                mono: true
                tone: 0.65
                font.pixelSize: Theme.textXs
                Accessible.description: "Tiempo activo"
            }
        }

        Badge {
            visible: root.width >= 420
            text: root.serverState === "online" ? (root.level === 1 ? "Atención" : "Online")
                : root.serverState === "warning" ? "Atención"
                : root.serverState === "offline" ? "Offline" : "Sin datos"
            tone: root.serverState === "online" ? (root.level === 1 ? "amber" : "emerald")
                : root.serverState === "warning" ? "amber"
                : root.serverState === "offline" ? "rose" : ""
        }
        Icon { name: "chevronRight"; size: 14; color: Theme.ink(hover.hovered ? 0.9 : 0.3) }
    }
}
