import QtQuick
import QtQuick.Shapes
import StartCode

/* Halo de color con caída radial: sustituye a los `blur-2xl` decorativos del
   login sin pagar un desenfoque por fotograma. Va detrás de lo que ilumina. */
Shape {
    id: root

    property color tint: Theme.brandStart
    /* Opacidad en el centro. */
    property real strength: 0.3

    ShapePath {
        strokeColor: "transparent"
        fillGradient: RadialGradient {
            centerX: root.width / 2; centerY: root.height / 2
            focalX: centerX; focalY: centerY
            centerRadius: Math.max(root.width, root.height) / 2
            GradientStop { position: 0.0; color: Qt.alpha(root.tint, root.strength) }
            GradientStop { position: 0.45; color: Qt.alpha(root.tint, root.strength * 0.55) }
            GradientStop { position: 1.0; color: Qt.alpha(root.tint, 0) }
        }
        PathAngleArc {
            centerX: root.width / 2; centerY: root.height / 2
            radiusX: root.width / 2; radiusY: root.height / 2
            startAngle: 0; sweepAngle: 360
        }
    }
}
