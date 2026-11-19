import QtQuick
import StartCode

/* Barra de progreso de una métrica. El color lo decide el valor; con
   `label` vacío queda solo la pista (teselas compactas). */
Column {
    id: root

    property string label: ""
    property real value: 0
    property string suffix: "%"
    property bool compact: false
    /* Texto del valor; por defecto, el porcentaje redondeado. */
    property string valueText: Math.round(value) + suffix
    property int trackHeight: compact ? 4 : 6

    readonly property var tones: Format.barTones(value)

    spacing: compact ? 4 : 6

    Item {
        visible: root.label !== ""
        width: parent.width
        height: valueLabel.implicitHeight
        Label {
            anchors.left: parent.left
            anchors.right: valueLabel.left
            anchors.rightMargin: 8
            text: root.label
            tone: 0.55
            font.pixelSize: root.compact ? Theme.textXs : Theme.textSm
        }
        Label {
            id: valueLabel
            anchors.right: parent.right
            text: root.valueText
            mono: true
            font.weight: Font.DemiBold
            font.pixelSize: root.compact ? Theme.textXs : Theme.textSm
        }
    }
    Rectangle {
        width: parent.width
        height: root.trackHeight
        radius: height / 2
        color: Theme.track
        Rectangle {
            width: parent.width * Math.max(0, Math.min(100, root.value)) / 100
            height: parent.height
            radius: height / 2
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.tone(root.tones[0]).base }
                GradientStop { position: 1; color: Theme.tone(root.tones[1]).base }
            }
            Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 700; easing.type: Easing.OutCubic } }
        }
    }
}
