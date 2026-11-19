import QtQuick
import QtQuick.Templates as T
import StartCode

/* Zona con desplazamiento vertical. La barra no ocupa espacio: aparece al
   pasar el ratón o al desplazar, fina y en tinta; al tocarla engrosa y toma
   el gradiente de marca. */
Flickable {
    id: root

    clip: true
    boundsBehavior: Flickable.StopAtBounds
    contentWidth: width

    HoverHandler { id: areaHover }

    T.ScrollBar.vertical: T.ScrollBar {
        id: bar
        parent: root
        anchors.top: root.top
        anchors.bottom: root.bottom
        anchors.right: root.right
        implicitWidth: 12
        minimumSize: 0.08
        visible: root.contentHeight > root.height
        opacity: areaHover.hovered || root.moving || bar.pressed || bar.hovered ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 180 } }
        hoverEnabled: true

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
}
