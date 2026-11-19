import QtQuick
import QtQuick.Shapes
import StartCode

/* Estado vacío de un bloque del panel: borde discontinuo, icono, título,
   explicación y, si procede, una llamada a la acción. */
Item {
    id: root

    property string iconName: "chart"
    property string title: ""
    property string hint: ""
    property string actionText: ""
    /* Sin borde ni tanto aire: para listas cortas de la columna estrecha. */
    property bool compact: false
    signal action()

    implicitHeight: column.implicitHeight + (compact ? 24 : 64)

    HoverHandler { id: hover }

    /* Las esquinas redondas del trazo discontinuo necesitan suavizado propio. */
    Shape {
        visible: !root.compact
        anchors.fill: parent
        layer.enabled: true
        layer.samples: 4
        ShapePath {
            strokeColor: hover.hovered ? Theme.edgeDashedHover : Theme.edgeDashed
            strokeWidth: 1
            strokeStyle: ShapePath.DashLine
            dashPattern: [4, 4]
            fillColor: "transparent"
            PathRectangle {
                x: 0.5; y: 0.5
                width: Math.max(1, root.width - 1)
                height: Math.max(1, root.height - 1)
                radius: Theme.radiusXl
            }
        }
    }

    Column {
        id: column
        anchors.centerIn: parent
        width: Math.min(380, root.width - (root.compact ? 0 : 40))
        spacing: 8

        Icon {
            anchors.horizontalCenter: parent.horizontalCenter
            name: root.iconName
            size: root.compact ? 22 : 28
            color: Theme.ink(0.25)
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: root.title
            tone: 0.65
            font.weight: Font.Medium
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            visible: root.hint !== ""
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: root.hint
            tone: 0.4
            font.pixelSize: Theme.textXs
            lineHeight: 1.3
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Item { visible: root.actionText !== ""; width: 1; height: 4 }
        PrimaryButton {
            visible: root.actionText !== ""
            anchors.horizontalCenter: parent.horizontalCenter
            implicitHeight: 36
            text: root.actionText
            onClicked: root.action()
        }
    }
}
