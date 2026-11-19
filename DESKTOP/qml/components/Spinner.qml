import QtQuick
import QtQuick.Shapes
import StartCode

/* Indicador de carga: arco que gira. */
Item {
    id: root

    property real size: 16
    property color color: Theme.ink(0.85)
    property bool running: visible

    implicitWidth: size
    implicitHeight: size

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: root.color
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            PathAngleArc {
                centerX: root.size / 2; centerY: root.size / 2
                radiusX: root.size / 2 - 1; radiusY: root.size / 2 - 1
                startAngle: 0; sweepAngle: 270
            }
        }
        RotationAnimator on rotation {
            running: root.running
            from: 0; to: 360
            duration: 800
            loops: Animation.Infinite
        }
    }
}
