import QtQuick
import QtQuick.Templates as T
import StartCode

/* Interruptor. Encendido toma el gradiente de marca. */
T.Switch {
    id: root

    implicitWidth: 44
    implicitHeight: 24
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5

    indicator: Item {
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: height / 2
            visible: !root.checked
            color: Theme.track
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing : Theme.hairline
        }
        Elevation { anchors.fill: parent; visible: root.checked; level: "brandSm"; radius: height / 2 }
        BrandFill { anchors.fill: parent; visible: root.checked; radius: height / 2 }
        Rectangle {
            y: 3
            x: root.checked ? parent.width - width - 3 : 3
            width: 18; height: 18; radius: 9
            color: Theme.knob
            Behavior on x { NumberAnimation { duration: Theme.moBase; easing.type: Easing.InOutQuad } }
        }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
