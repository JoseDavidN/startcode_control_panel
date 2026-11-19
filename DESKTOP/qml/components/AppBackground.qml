import QtQuick
import QtQuick.Shapes
import StartCode

/* Fondo de la app: gradiente radial del tema y tres auroras que flotan.
   Se instancia una sola vez, en la ventana, por debajo de todo. */
Item {
    id: root

    /* Radio hasta la esquina más lejana desde el foco (20 % del ancho, arriba). */
    readonly property real reach: Math.hypot(width * 0.8, height)

    Shape {
        anchors.fill: parent
        ShapePath {
            strokeColor: "transparent"
            fillGradient: RadialGradient {
                centerX: root.width * 0.2; centerY: 0
                focalX: centerX; focalY: centerY
                centerRadius: root.reach
                GradientStop { position: 0.0; color: Theme.bgStops[0] }
                GradientStop { position: 0.35; color: Theme.bgStops[1] }
                GradientStop { position: 0.8; color: Theme.bgStops[2] }
            }
            startX: 0; startY: 0
            PathLine { x: root.width; y: 0 }
            PathLine { x: root.width; y: root.height }
            PathLine { x: 0; y: root.height }
        }
    }

    /* Una aurora es un disco con caída radial: se ve como el blob desenfocado
       del diseño sin pagar un desenfoque por fotograma. Solo se traslada. */
    component Aurora: Item {
        id: blob
        property color tint
        property real strength: 1
        property real size: 580
        property real driftX: 0
        property real driftY: 0
        property int period: 22000
        property real t: 0

        width: size * 1.5
        height: width
        transform: Translate { x: blob.driftX * blob.t; y: blob.driftY * blob.t }

        Shape {
            anchors.fill: parent
            ShapePath {
                strokeColor: "transparent"
                fillGradient: RadialGradient {
                    centerX: blob.width / 2; centerY: blob.height / 2
                    focalX: centerX; focalY: centerY
                    centerRadius: blob.width / 2
                    GradientStop { position: 0.0; color: Qt.alpha(blob.tint, blob.strength) }
                    GradientStop { position: 0.45; color: Qt.alpha(blob.tint, blob.strength * 0.55) }
                    GradientStop { position: 1.0; color: Qt.alpha(blob.tint, 0) }
                }
                PathAngleArc {
                    centerX: blob.width / 2; centerY: blob.height / 2
                    radiusX: blob.width / 2; radiusY: blob.height / 2
                    startAngle: 0; sweepAngle: 360
                }
            }
        }

        SequentialAnimation on t {
            running: !Theme.reducedMotion && root.visible
            loops: Animation.Infinite
            NumberAnimation { from: 0; to: 1; duration: blob.period / 2; easing.type: Easing.InOutSine }
            NumberAnimation { from: 1; to: 0; duration: blob.period / 2; easing.type: Easing.InOutSine }
        }
    }

    Aurora {
        tint: Theme.auroras[0]; strength: Theme.auroraOpacity[0]
        size: 580; period: 22000; driftX: 40; driftY: -30
        x: -100 - size * 0.25; y: -140 - size * 0.25
    }
    Aurora {
        tint: Theme.auroras[1]; strength: Theme.auroraOpacity[1]
        size: 520; period: 28000; driftX: -50; driftY: 40
        x: root.width + 120 - size * 1.25; y: root.height * 0.35 - size * 0.25
    }
    Aurora {
        tint: Theme.auroras[2]; strength: Theme.auroraOpacity[2]
        size: 600; period: 32000; driftX: 30; driftY: 30
        x: root.width * 0.25 - size * 0.25; y: root.height + 140 - size * 1.25
    }
}
