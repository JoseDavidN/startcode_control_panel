import QtQuick
import QtQuick.Templates as T
import StartCode

/* Texto de ayuda al pasar el ratón. Se declara dentro del elemento al que
   acompaña: `HoverTip { text: "…" }`. */
Item {
    id: root

    property string text: ""
    property int delay: 500

    anchors.fill: parent

    HoverHandler { id: hover }
    Timer {
        interval: root.delay
        running: hover.hovered && root.text !== ""
        onTriggered: tip.open()
    }
    Connections {
        target: hover
        function onHoveredChanged() { if (!hover.hovered) tip.close() }
    }

    T.Popup {
        id: tip
        parent: T.Overlay.overlay
        closePolicy: T.Popup.NoAutoClose
        padding: 0
        width: Math.min(360, tipLabel.implicitWidth + 20)
        height: tipLabel.implicitHeight + 12
        onAboutToShow: {
            const overlay = T.Overlay.overlay
            const point = root.mapToItem(overlay, root.width / 2, root.height + 6)
            x = Math.max(8, Math.min(point.x - width / 2, overlay.width - width - 8))
            y = point.y + height > overlay.height - 8 ? root.mapToItem(overlay, 0, -height - 6).y : point.y
        }
        enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
        background: Glass { variant: "float"; radius: Theme.radiusLg }
        contentItem: Item {
            Label {
                id: tipLabel
                x: 10; y: 6
                width: tip.width - 20
                text: root.text
                tone: 0.9
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }
}
