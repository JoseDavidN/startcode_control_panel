import QtQuick
import QtQuick.Templates as T
import StartCode

/* Barra de desplazamiento de las listas del explorador (las de `ListView`,
   que no pueden ir dentro de `ScrollArea`): mismo aspecto, fina y en tinta,
   con el gradiente de marca al tocarla.

       ListView { id: view; T.ScrollBar.vertical: SftpScrollBar { flick: view } } */
T.ScrollBar {
    id: bar

    required property Flickable flick

    parent: flick
    anchors.top: flick.top
    anchors.bottom: flick.bottom
    anchors.right: flick.right
    implicitWidth: 12
    minimumSize: 0.08
    visible: flick.contentHeight > flick.height
    opacity: areaHover.hovered || flick.moving || bar.pressed || bar.hovered ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: 180 } }
    hoverEnabled: true

    HoverHandler { id: areaHover; parent: bar.flick }

    contentItem: Item {
        implicitWidth: 12
        Rectangle {
            id: thumb
            readonly property bool strong: bar.hovered || bar.pressed
            anchors.right: parent.right
            anchors.rightMargin: strong ? 1 : 2
            width: strong ? 10 : 6
            height: parent.height
            radius: width / 2
            color: strong ? "transparent" : Theme.ink(0.3)
            border.width: strong ? 1 : 0
            border.color: Theme.hairlineStrong
            Behavior on width { NumberAnimation { duration: Theme.moFast } }
            BrandFill {
                anchors.fill: parent
                visible: thumb.strong
                radius: thumb.radius
                strength: 0.85
            }
        }
        HoverHandler { cursorShape: bar.pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor }
    }
}
