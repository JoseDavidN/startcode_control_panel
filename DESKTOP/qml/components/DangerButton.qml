import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón de acción destructiva (eliminar, desinstalar): rojo semántico. */
T.Button {
    id: root

    property bool loading: false

    implicitHeight: Theme.controlHeight
    implicitWidth: Math.max(88, row.implicitWidth + 32)
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    scale: !enabled ? 1 : down ? Theme.moPress : 1
    Behavior on scale { NumberAnimation { duration: Theme.moBase; easing.type: Easing.OutBack; easing.overshoot: 2 } }

    background: Rectangle {
        radius: Theme.radiusXl
        color: Qt.alpha(Theme.danger, root.hovered ? 0.28 : 0.18)
        border.width: 1
        border.color: root.visualFocus ? Theme.focusRing : Qt.alpha(Theme.danger, 0.4)
        Behavior on color { ColorAnimation { duration: Theme.moFast } }
    }
    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 8
            Spinner { visible: root.loading; anchors.verticalCenter: parent.verticalCenter; color: Theme.danger }
            Label { anchors.verticalCenter: parent.verticalCenter; text: root.text; color: Theme.danger; font.weight: Font.DemiBold }
        }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
