import QtQuick
import QtQuick.Templates as T
import StartCode

/* Menú flotante propio (clic derecho y desplegables): cristal casi opaco,
   por encima de todo. Cada opción: `{ label, icon, enabled, danger,
   separator, action }`. */
T.Popup {
    id: root

    property var items: []

    /** Abre el menú en un punto de `anchorItem`, sin salirse de la ventana. */
    function openAt(anchorItem, px, py, entries) {
        items = entries
        const overlay = T.Overlay.overlay
        const point = anchorItem.mapToItem(overlay, px, py)
        x = Math.max(8, Math.min(point.x, overlay.width - width - 8))
        y = Math.max(8, Math.min(point.y, overlay.height - height - 8))
        open()
    }

    parent: T.Overlay.overlay
    width: 232
    height: column.implicitHeight + 12
    padding: 6
    modal: false
    focus: true
    closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside

    enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
    exit: Transition { NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Theme.moFast } }

    background: Glass {
        variant: "float"
        radius: Theme.radiusXl
    }

    contentItem: Column {
        id: column
        Repeater {
            model: root.items
            Item {
                id: row
                required property var modelData
                readonly property bool usable: modelData.enabled !== false
                width: column.width
                height: (modelData.separator ? 9 : 0) + 34

                Rectangle {
                    visible: row.modelData.separator === true
                    y: 4
                    width: parent.width
                    height: 1
                    color: Theme.line
                }
                Rectangle {
                    y: row.modelData.separator ? 9 : 0
                    width: parent.width
                    height: 34
                    radius: Theme.radiusLg
                    color: hover.hovered && row.usable ? Theme.tintHover : "transparent"

                    Icon {
                        id: glyph
                        x: 10
                        anchors.verticalCenter: parent.verticalCenter
                        name: row.modelData.icon || ""
                        visible: name !== ""
                        color: !row.usable ? Theme.ink(0.3)
                             : row.modelData.danger ? Theme.danger : Theme.ink(0.7)
                    }
                    Label {
                        x: glyph.visible ? 36 : 10
                        width: parent.width - x - 10
                        anchors.verticalCenter: parent.verticalCenter
                        text: row.modelData.label
                        color: !row.usable ? Theme.ink(0.3)
                             : row.modelData.danger ? Theme.danger : Theme.ink(0.9)
                        font.pixelSize: 13
                    }
                    HoverHandler { id: hover; cursorShape: row.usable ? Qt.PointingHandCursor : Qt.ArrowCursor }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        enabled: row.usable
                        onTapped: {
                            root.close()
                            if (row.modelData.action) row.modelData.action()
                        }
                    }
                }
            }
        }
    }
}
