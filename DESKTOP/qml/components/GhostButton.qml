import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón fantasma: solo texto, con tinte al pasar por encima. */
T.Button {
    id: root

    property string iconName: ""

    implicitHeight: Theme.controlHeight
    implicitWidth: row.implicitWidth + 32
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5

    background: Rectangle {
        radius: Theme.radiusXl
        color: root.hovered ? Theme.tintHover : "transparent"
        border.width: root.visualFocus ? 2 : 0
        border.color: Theme.focusRing
        Behavior on color { ColorAnimation { duration: Theme.moFast } }
    }

    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 8
            Icon {
                visible: root.iconName !== ""
                anchors.verticalCenter: parent.verticalCenter
                name: root.iconName
                color: Theme.ink(root.hovered ? 1 : 0.7)
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: root.text
                tone: root.hovered ? 1 : 0.7
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
