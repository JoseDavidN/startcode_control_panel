import QtQuick
import QtQuick.Layouts
import StartCode

/* Configuración: lista de pestañas a la izquierda y la pestaña elegida a la
   derecha, que es lo único que se desplaza. */
Item {
    id: root

    /* Volver al panel principal. */
    signal back()

    property string activeTab: "profile"

    readonly property var tabs: [
        { id: "profile", label: "Perfil", icon: "user" },
        { id: "appearance", label: "Aspecto", icon: "layout" },
        { id: "notifications", label: "Notificaciones", icon: "bell" },
        { id: "security", label: "Seguridad", icon: "shield" },
        { id: "monitoring", label: "Monitoreo", icon: "monitor" },
        { id: "assistant", label: "Asistente IA", icon: "spark" },
        { id: "system", label: "Sistema", icon: "database" }
    ]
    /* Con poco ancho las pestañas pasan a una tira horizontal sobre el contenido. */
    readonly property bool stacked: width < 860

    Component.onCompleted: {
        /* En depuración, `STARTCODE_PAGE=settings/<pestaña>` abre esa pestaña para las capturas. */
        const wanted = StartPage.split("/")[1]
        if (wanted && tabs.some(t => t.id === wanted)) activeTab = wanted
    }

    Component { id: profilePane; SettingsProfilePane {} }
    Component { id: appearancePane; SettingsAppearancePane {} }
    Component { id: notificationsPane; SettingsNotificationsPane {} }
    Component { id: securityPane; SettingsSecurityPane {} }
    Component { id: monitoringPane; SettingsMonitoringPane {} }
    Component { id: assistantPane; SettingsAssistantPane {} }
    Component { id: systemPane; SettingsSystemPane {} }

    component TabButton: Item {
        id: tab
        property var entry
        readonly property bool on: root.activeTab === entry.id
        implicitHeight: 44
        implicitWidth: tabRow.implicitWidth + 28
        Accessible.role: Accessible.PageTab
        Accessible.name: entry.label

        Elevation { anchors.fill: parent; visible: tab.on; level: "brand"; radius: Theme.radiusXl }
        BrandFill { anchors.fill: parent; visible: tab.on; strength: 0.28 }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusXl
            color: !tab.on && tabHover.hovered ? Theme.tintHover : "transparent"
            border.width: 1
            border.color: tab.on ? Theme.hairlineStrong : "transparent"
        }
        Row {
            id: tabRow
            x: 14
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12
            Icon { anchors.verticalCenter: parent.verticalCenter; name: tab.entry.icon; color: Theme.ink(tab.on || tabHover.hovered ? 1 : 0.65) }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: tab.entry.label
                tone: tab.on || tabHover.hovered ? 1 : 0.65
                font.weight: Font.Medium
            }
        }
        HoverHandler { id: tabHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.activeTab = tab.entry.id }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 24

        /* Cabecera */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 96
            elevation: "raised"

            IconButton {
                id: backButton
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                size: 44
                iconName: "arrowLeft"
                hint: "Volver"
                onClicked: root.back()
            }
            Item {
                id: headIcon
                anchors.left: backButton.right
                anchors.leftMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                width: 56; height: 56
                Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
                BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
                Icon { anchors.centerIn: parent; name: "gear"; size: 28; color: Theme.onBrand }
            }
            Column {
                anchors.left: headIcon.right
                anchors.leftMargin: 16
                anchors.right: parent.right
                anchors.rightMargin: 24
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                Label { width: parent.width; text: "Configuración"; font.pixelSize: 24; font.weight: Font.Bold; font.letterSpacing: -0.4 }
                Label { width: parent.width; text: "Administra las preferencias del sistema"; tone: 0.55 }
            }
        }

        GridLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: root.stacked ? 1 : 2
            columnSpacing: 20
            rowSpacing: 16

            /* Pestañas */
            Glass {
                Layout.alignment: Qt.AlignTop
                Layout.fillWidth: root.stacked
                Layout.preferredWidth: root.stacked ? -1 : 260
                implicitHeight: root.stacked ? tabFlow.implicitHeight + 24 : tabColumn.implicitHeight + 24
                elevation: "raised"

                Column {
                    id: tabColumn
                    visible: !root.stacked
                    x: 12; y: 12
                    width: parent.width - 24
                    spacing: 4
                    Repeater {
                        model: root.stacked ? [] : root.tabs
                        TabButton { required property var modelData; entry: modelData; width: tabColumn.width }
                    }
                }
                Flow {
                    id: tabFlow
                    visible: root.stacked
                    x: 12; y: 12
                    width: parent.width - 24
                    spacing: 4
                    Repeater {
                        model: root.stacked ? root.tabs : []
                        TabButton { required property var modelData; entry: modelData; width: implicitWidth }
                    }
                }
            }

            /* Contenido: único contenedor con desplazamiento */
            Glass {
                Layout.fillWidth: true
                Layout.fillHeight: true
                elevation: "raised"

                ScrollArea {
                    id: scroll
                    anchors.fill: parent
                    anchors.margins: 1
                    contentHeight: pane.item ? pane.item.implicitHeight + 56 : 0

                    Loader {
                        id: pane
                        x: 28
                        width: scroll.width - 56
                        property real rise: 0
                        y: 28 + rise
                        sourceComponent: root.activeTab === "profile" ? profilePane
                                       : root.activeTab === "appearance" ? appearancePane
                                       : root.activeTab === "notifications" ? notificationsPane
                                       : root.activeTab === "security" ? securityPane
                                       : root.activeTab === "monitoring" ? monitoringPane
                                       : root.activeTab === "assistant" ? assistantPane : systemPane
                        onLoaded: { scroll.contentY = 0; enter.restart() }

                        /* Entrada de pestaña: opacidad y 6 px de subida. */
                        ParallelAnimation {
                            id: enter
                            NumberAnimation { target: pane; property: "opacity"; from: 0; to: 1; duration: Theme.moBase }
                            NumberAnimation { target: pane; property: "rise"; from: 6; to: 0; duration: Theme.moBase; easing.type: Easing.OutCubic }
                        }
                    }
                }
            }
        }
    }
}
