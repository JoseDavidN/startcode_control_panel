import QtQuick
import StartCode

/* «Ver detalle» de un error del agente: la salida técnica queda plegada y se
   abre a petición, con desplazamiento propio para no estirar el modal. */
Column {
    id: root

    property string detail: ""
    property int maxHeight: 160
    property bool expanded: false

    visible: detail !== ""
    spacing: 8
    /* Un error nuevo vuelve a empezar plegado. */
    onDetailChanged: expanded = false

    Row {
        spacing: 4
        Icon {
            anchors.verticalCenter: parent.verticalCenter
            name: root.expanded ? "chevronDown" : "chevronRight"
            size: 12
            color: Theme.ink(toggleHover.hovered ? 0.75 : 0.5)
        }
        Label {
            anchors.verticalCenter: parent.verticalCenter
            text: "Ver detalle"
            tone: toggleHover.hovered ? 0.75 : 0.5
            font.pixelSize: Theme.textXs
        }
        HoverHandler { id: toggleHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.expanded = !root.expanded }
    }

    ScrollArea {
        visible: root.expanded
        width: root.width
        height: Math.min(root.maxHeight, pre.implicitHeight)
        contentHeight: pre.implicitHeight
        SelectableText {
            id: pre
            width: parent.width
            text: root.detail
            mono: true
            tone: 0.6
            font.pixelSize: 11
        }
    }
}
