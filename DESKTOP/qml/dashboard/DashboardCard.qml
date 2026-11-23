import QtQuick
import StartCode

/* Bloque del panel: tarjeta de cristal con título, nota opcional y un enlace
   de acción a la derecha. Los hijos se apilan en columna debajo de la
   cabecera y usan `width: parent.width`.

       DashboardCard { title: "Últimos avisos"; actionText: "Ver todos"; onAction: …
           Label { width: parent.width; text: "…" } } */
Item {
    id: root

    property string title: ""
    /* Nota apagada junto al título («ordenado por prioridad»). */
    property string hint: ""
    property string actionText: ""
    property int padding: 20
    property int spacing: 0
    signal action()

    default property alias body: bodyColumn.data

    /* Orden de entrada dentro del panel (ver `Entrance`); también al mostrarse. */
    property int enterIndex: 0
    onVisibleChanged: if (visible) enter.play()

    implicitHeight: bodyColumn.y + bodyColumn.implicitHeight + padding

    Glass {
        anchors.fill: parent
        elevation: "raised"
    }
    Entrance { id: enter; target: root; index: root.enterIndex; from: 0.98 }

    Item {
        id: head
        x: root.padding
        y: root.padding - 2
        width: root.width - root.padding * 2
        height: 24

        Label {
            id: titleLabel
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, parent.width - (link.visible ? link.width + 12 : 0))
            text: root.title
            tone: 0.9
            font.pixelSize: Theme.textBase
            font.weight: Font.DemiBold
            font.letterSpacing: -0.3
        }
        Label {
            visible: root.hint !== "" && width > 40
            anchors.left: titleLabel.right
            anchors.leftMargin: 10
            anchors.right: link.visible ? link.left : parent.right
            anchors.rightMargin: link.visible ? 12 : 0
            anchors.baseline: titleLabel.baseline
            text: root.hint
            tone: 0.4
            font.pixelSize: Theme.textXs
        }
        Item {
            id: link
            visible: root.actionText !== ""
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: linkRow.implicitWidth
            height: 24
            activeFocusOnTab: true
            Accessible.role: Accessible.Link
            Accessible.name: root.actionText
            Keys.onReturnPressed: root.action()
            Keys.onSpacePressed: root.action()
            Row {
                id: linkRow
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.actionText
                    color: linkHover.hovered || link.activeFocus ? Theme.ink(1) : Theme.brandLight1
                    font.pixelSize: Theme.textXs
                    font.weight: Font.Medium
                }
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: "chevronRight"
                    size: 12
                    color: linkHover.hovered || link.activeFocus ? Theme.ink(1) : Theme.brandLight1
                }
            }
            HoverHandler { id: linkHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.action() }
        }
    }

    Column {
        id: bodyColumn
        x: root.padding
        y: head.y + head.height + 14
        width: root.width - root.padding * 2
        spacing: root.spacing
    }
}
