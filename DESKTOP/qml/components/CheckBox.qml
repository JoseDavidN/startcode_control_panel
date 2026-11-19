import QtQuick
import QtQuick.Templates as T
import StartCode

/* Casilla con etiqueta. Marcada toma el gradiente de marca. */
T.CheckBox {
    id: root

    implicitHeight: 20
    implicitWidth: 16 + 10 + label.implicitWidth
    hoverEnabled: true

    indicator: Item {
        width: 16; height: 16
        anchors.verticalCenter: parent.verticalCenter

        Rectangle {
            anchors.fill: parent
            radius: 5
            color: Theme.chkBg
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing
                        : root.hovered ? Theme.hairlineStrong : Theme.chkBorder
            visible: !root.checked
        }
        BrandFill {
            anchors.fill: parent
            radius: 5
            visible: root.checked
        }
        Icon {
            anchors.centerIn: parent
            visible: root.checked
            name: "check"
            size: 12
            strokeWidth: 2.5
            color: Theme.onBrand
        }
    }

    contentItem: Item {
        Label {
            id: label
            x: 26
            anchors.verticalCenter: parent.verticalCenter
            text: root.text
            tone: 0.65
            font.pixelSize: Theme.textXs
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
