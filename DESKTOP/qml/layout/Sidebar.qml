import QtQuick
import QtQuick.Layouts
import StartCode

/* Barra lateral: marca, navegación y chip del usuario con cierre de sesión. */
Glass {
    id: root

    property string current: "dashboard"
    property int unread: 0
    signal navigate(string page)

    readonly property var workspace: [
        { page: "dashboard", label: "Panel", icon: "chart" },
        { page: "servers", label: "Servidores", icon: "server" },
        { page: "databases", label: "Bases de Datos", icon: "database" }
    ]
    readonly property var account: [
        { page: "notifications", label: "Notificaciones", icon: "bell" },
        { page: "settings", label: "Configuración", icon: "gear" }
    ]

    readonly property var user: Auth.user
    readonly property string displayName: user.name || "Admin System"
    readonly property string initials: {
        const first = (user.firstname || user.name || "A").charAt(0)
        const last = user.lastname ? user.lastname.charAt(0)
                   : ((user.name || "").split(" ")[1] || "").charAt(0)
        return (first + last).toUpperCase()
    }

    /* Riel de 70 px: lo elige el usuario (Aspecto) o lo fuerza una ventana estrecha. */
    property bool collapsed: false

    implicitWidth: collapsed ? 70 : 240
    Behavior on implicitWidth {
        NumberAnimation { duration: Theme.reducedMotion ? 1 : 220; easing.type: Easing.OutCubic }
    }

    component SectionHeading: Item {
        property alias text: heading.text
        Layout.fillWidth: true
        implicitHeight: 32
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: 40; height: 1
            color: Theme.hairline
            opacity: root.collapsed ? 1 : 0
        }
        Label {
            id: heading
            anchors.verticalCenter: parent.verticalCenter
            opacity: root.collapsed ? 0 : 1
            tone: 0.35
            font.pixelSize: Theme.textCaption
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        /* Mientras el ancho se anima, lo que no cabe en el riel queda recortado. */
        clip: true

        /* ── Marca ─────────────────────────────────────────────────── */
        Item {
            Layout.fillWidth: true
            implicitHeight: 16 + 40 + 12
            Image {
                x: 16; y: 18
                width: 36; height: 36
                source: "qrc:/qt/qml/StartCode/assets/img/icono-oscuro-180.png"
                sourceSize: Qt.size(72, 72)
                fillMode: Image.PreserveAspectFit
                smooth: true
            }
            Column {
                x: 14 + 44
                anchors.verticalCenter: parent.verticalCenter
                anchors.verticalCenterOffset: 2
                spacing: 2
                opacity: root.collapsed ? 0 : 1
                Behavior on opacity { NumberAnimation { duration: Theme.moFast } }
                Label {
                    text: "StartCode"
                    font.weight: Font.Bold
                    font.letterSpacing: -0.3
                }
                Label {
                    text: "Cloud Console"
                    tone: 0.45
                    font.pixelSize: Theme.textCaption
                    font.weight: Font.Medium
                    font.capitalization: Font.AllUppercase
                    font.letterSpacing: 0.5
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        /* ── Navegación ────────────────────────────────────────────── */
        ScrollArea {
            id: navScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.topMargin: 8
            contentHeight: nav.implicitHeight

          ColumnLayout {
            id: nav
            x: 14
            width: navScroll.width - 28
            spacing: 2

            SectionHeading { text: "Workspace" }
            Repeater {
                model: root.workspace
                NavRow {
                    required property var modelData
                    Layout.fillWidth: true
                    text: modelData.label
                    iconName: modelData.icon
                    active: root.current === modelData.page
                    collapsed: root.collapsed
                    onClicked: root.navigate(modelData.page)
                }
            }

            SectionHeading { text: "Cuenta" }
            Repeater {
                model: root.account
                NavRow {
                    required property var modelData
                    Layout.fillWidth: true
                    text: modelData.label
                    iconName: modelData.icon
                    active: root.current === modelData.page
                    badge: modelData.page === "notifications" && root.unread > 0 ? String(root.unread) : ""
                    collapsed: root.collapsed
                    onClicked: root.navigate(modelData.page)
                }
            }
          }
        }

        /* ── Chip del usuario ──────────────────────────────────────── */
        Item {
            Layout.fillWidth: true
            implicitHeight: 12 + 40 + 12
            Rectangle { width: parent.width; height: 1; color: Theme.line }

            Rectangle {
                x: 14; y: 12
                width: parent.width - 28
                height: 40
                radius: Theme.radiusXl
                color: Theme.tintSunken

                BrandFill {
                    id: avatar
                    x: 4
                    anchors.verticalCenter: parent.verticalCenter
                    width: 32; height: 32
                    radius: Theme.radiusLg
                    Label {
                        anchors.centerIn: parent
                        text: root.initials
                        color: Theme.onBrand
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Bold
                    }
                }
                Column {
                    anchors.left: avatar.right
                    anchors.leftMargin: 8
                    anchors.right: logout.left
                    anchors.rightMargin: 4
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !root.collapsed
                    Label {
                        width: parent.width
                        text: root.displayName
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Medium
                    }
                    Label {
                        width: parent.width
                        text: root.user.email || ""
                        mono: true
                        tone: 0.45
                        font.pixelSize: Theme.textCaption
                    }
                }
                Item {
                    id: logout
                    anchors.right: parent.right
                    anchors.rightMargin: 4
                    anchors.verticalCenter: parent.verticalCenter
                    width: 28; height: 28
                    visible: !root.collapsed
                    Accessible.role: Accessible.Button
                    Accessible.name: "Cerrar sesión"
                    Icon {
                        anchors.centerIn: parent
                        name: "logout"
                        color: Theme.ink(logoutHover.hovered ? 1 : 0.4)
                    }
                    HoverHandler { id: logoutHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: Auth.logout() }
                }
            }
        }
    }
}
