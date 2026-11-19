import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón pequeño del explorador de Redis (32 px): cristal suave con icono
   opcional. `danger` lo tiñe de rojo (borrar); `hint` es el texto de ayuda. */
T.Button {
    id: root

    property string iconName: ""
    property bool danger: false
    property string hint: ""

    implicitHeight: 32
    implicitWidth: row.implicitWidth + 24
    hoverEnabled: true
    opacity: enabled ? 1 : 0.4
    Accessible.name: text !== "" ? text : hint

    background: Item {
        Glass {
            anchors.fill: parent
            visible: !root.danger
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusLg
            highlighted: root.hovered
            borderColor: root.visualFocus ? Theme.focusRing : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        Rectangle {
            anchors.fill: parent
            visible: root.danger
            radius: Theme.radiusLg
            color: Qt.alpha(Theme.danger, root.hovered ? 0.2 : 0.1)
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing : Qt.alpha(Theme.danger, 0.2)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
    }

    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 6
            Icon {
                visible: root.iconName !== ""
                anchors.verticalCenter: parent.verticalCenter
                name: root.iconName
                size: 14
                color: root.danger ? Theme.danger : Theme.ink(root.hovered ? 1 : 0.7)
            }
            Label {
                visible: root.text !== ""
                anchors.verticalCenter: parent.verticalCenter
                text: root.text
                color: root.danger ? Theme.danger : Theme.ink(root.hovered ? 1 : 0.7)
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
    HoverTip { text: root.hint }
}
