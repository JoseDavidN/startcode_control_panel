import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón secundario: cristal suave con realce al pasar por encima. */
T.Button {
    id: root

    implicitHeight: Theme.controlHeight
    implicitWidth: Math.max(88, label.implicitWidth + 32)
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    scale: down ? 0.98 : 1
    Behavior on scale { NumberAnimation { duration: Theme.moFast } }

    background: Glass {
        variant: "soft"
        radius: Theme.radiusXl
        highlighted: root.hovered
        borderColor: root.visualFocus ? Theme.focusRing
                   : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
    }

    contentItem: Item {
        Label {
            id: label
            anchors.centerIn: parent
            text: root.text
            tone: 0.85
            font.weight: Font.Medium
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
