import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón que abre y cierra el asistente; lo usan la barra superior y la
   cabecera de la terminal (`compact`, a la altura de sus controles). */
T.Button {
    id: root

    property bool compact: false
    readonly property bool on: AssistantBridge.open

    implicitHeight: compact ? 36 : 28
    implicitWidth: row.implicitWidth + (compact ? 24 : 20)
    hoverEnabled: true
    Accessible.name: "Asistente IA"
    Accessible.checkable: true
    Accessible.checked: on

    onClicked: AssistantBridge.open = !AssistantBridge.open

    background: Item {
        Glass {
            anchors.fill: parent
            visible: !root.on
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            highlighted: root.hovered
            borderColor: root.visualFocus ? Theme.focusRing : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        BrandFill {
            anchors.fill: parent
            visible: root.on
            radius: Theme.radiusXl
            strength: 0.28
        }
        Rectangle {
            anchors.fill: parent
            visible: root.on
            radius: Theme.radiusXl
            color: "transparent"
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing : Theme.hairline
        }
    }

    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 6
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "spark"
                size: 14
                color: Theme.ink(root.on || root.hovered ? 1 : 0.7)
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: "Asistente"
                tone: root.on || root.hovered ? 1 : 0.7
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
    HoverTip { text: "Asistente IA" }
}
