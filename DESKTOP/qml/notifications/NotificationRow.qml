import QtQuick
import StartCode

/* Fila del historial de notificaciones: icono según el tipo, color según la
   severidad, y las acciones de marcar como leída y borrar. `item` es el
   objeto del backend tal cual (`AppNotification`). */
Glass {
    id: root

    property var item: ({})
    /* Hay una petición en curso sobre esta fila: no se admite otra. */
    property bool busy: false

    signal read(string id)
    signal remove(string id)

    readonly property bool unread: item.read === false
    readonly property var meta: item.metadata || ({})
    readonly property bool hasValue: typeof meta.value === "number" && typeof meta.threshold === "number"
    readonly property string serverName: meta.serverName || ""
    readonly property string severityTone: item.severity === "error" ? "rose"
                                         : item.severity === "warning" ? "amber" : "sky"

    readonly property var typeLabels: ({
        server_offline: "Servidor caído", server_online: "Reconexión", cpu_high: "CPU alta",
        memory_high: "Memoria alta", disk_high: "Disco alto", security: "Seguridad", system: "Sistema"
    })
    /* Iconos con nombre en `Icon.qml`; el enchufe aún no lo tiene y va por trazo. */
    readonly property var typeIcons: ({
        server_offline: "alert", cpu_high: "cpu", memory_high: "ram",
        disk_high: "diskDrive", security: "shieldPlain", system: "bell"
    })
    readonly property string plugPath: "M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0V8zM12 18v4"

    function fullDateTime(iso) {
        const ms = Date.parse(iso)
        if (!iso || isNaN(ms)) return "—"
        return new Date(ms).toLocaleString(Qt.locale("es_ES"), "dd MMM yyyy, HH:mm")
    }

    variant: "soft"
    radius: Theme.radiusXl
    borderColor: unread ? Theme.hairlineStrong : Theme.line
    implicitHeight: Math.max(40, main.implicitHeight) + 32

    /* Las no leídas van sobre fondo rehundido. */
    Rectangle {
        anchors.fill: parent
        anchors.margins: 1
        radius: root.radius - 1
        visible: root.unread
        color: Theme.tintSunken
    }

    Rectangle {
        id: iconBox
        x: 16; y: 16
        width: 40; height: 40
        radius: Theme.radiusXl
        color: Theme.tintSunken
        border.width: 1
        border.color: Theme.hairlineSoft
        Icon {
            id: typeIcon
            anchors.centerIn: parent
            size: 18
            color: Theme.tone(root.severityTone).text
            path: root.item.type === "server_online" ? root.plugPath
                : (typeIcon.paths[root.typeIcons[root.item.type] || ""] ?? "")
        }
    }

    Row {
        id: actions
        anchors.right: parent.right
        anchors.rightMargin: 16
        y: 16
        spacing: 4
        IconButton {
            visible: root.unread
            enabled: !root.busy
            iconName: "check"
            hint: "Marcar como leída"
            onClicked: root.read(root.item.id)
        }
        IconButton {
            enabled: !root.busy
            iconName: "trash"
            danger: true
            hint: "Borrar"
            onClicked: root.remove(root.item.id)
        }
    }

    Column {
        id: main
        x: 72; y: 16
        width: Math.max(0, root.width - 72 - 16 - actions.width - 16)

        Flow {
            width: parent.width
            spacing: 8
            Item {
                visible: root.unread
                width: 8; height: 20
                Accessible.name: "Sin leer"
                BrandFill { anchors.verticalCenter: parent.verticalCenter; width: 8; height: 8; radius: 4 }
            }
            Label {
                width: Math.min(Math.ceil(implicitWidth), Math.max(0, main.width - (root.unread ? 16 : 0)))
                text: root.item.title || ""
                tone: root.unread ? 1 : 0.75
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Item {
                width: typeBadge.implicitWidth; height: 20
                Badge {
                    id: typeBadge
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.typeLabels[root.item.type] || root.item.type || ""
                    tone: root.severityTone
                }
            }
        }

        Item { width: 1; height: 6 }
        Label {
            width: parent.width
            text: root.item.body || ""
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }

        Item { width: 1; height: 8 }
        Flow {
            width: parent.width
            spacing: 8
            Label {
                text: Format.timeAgo(root.item.createdAt)
                tone: 0.35
                font.pixelSize: Theme.textXs
                HoverTip { text: root.fullDateTime(root.item.createdAt) }
            }
            Label { visible: root.serverName !== ""; text: "·"; tone: 0.2; font.pixelSize: Theme.textXs }
            /* El nombre lleva al servidor del aviso. */
            Item {
                id: serverLink
                readonly property bool linked: !!root.item.serverId
                visible: root.serverName !== ""
                width: Math.min(Math.ceil(serverLabel.implicitWidth), main.width)
                height: serverLabel.implicitHeight
                Label {
                    id: serverLabel
                    width: parent.width
                    text: root.serverName
                    mono: true
                    tone: serverHover.hovered && serverLink.linked ? 0.9 : 0.45
                    font.pixelSize: Theme.textXs
                    font.underline: serverHover.hovered && serverLink.linked
                }
                HoverHandler { id: serverHover; enabled: serverLink.linked; cursorShape: Qt.PointingHandCursor }
                TapHandler {
                    enabled: serverLink.linked
                    gesturePolicy: TapHandler.ReleaseWithinBounds
                    onTapped: AppNav.open("servers", root.item.serverId)
                }
            }
            Label { visible: root.hasValue; text: "·"; tone: 0.2; font.pixelSize: Theme.textXs }
            Label {
                visible: root.hasValue
                text: root.hasValue ? root.meta.value + "% / umbral " + root.meta.threshold + "%" : ""
                mono: true
                tone: 0.45
                font.pixelSize: Theme.textXs
                font.features: { "tnum": 1 }
            }
        }
    }
}
