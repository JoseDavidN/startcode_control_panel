import QtQuick
import QtQuick.Shapes
import StartCode

/* Relleno con el gradiente de marca a 135° (`.grad-brand`). Con `strength`
   menor que 1 es la variante suave (`.grad-brand-soft`, `.nav-active`). */
Shape {
    id: root

    property real radius: Theme.radiusXl
    property real strength: 1
    property color from: Theme.brand1(strength)
    property color to: Theme.brand2(strength)

    preferredRendererType: Shape.CurveRenderer

    ShapePath {
        strokeColor: "transparent"
        fillGradient: LinearGradient {
            x1: 0; y1: 0
            x2: root.width; y2: root.height
            GradientStop { position: 0; color: root.from }
            GradientStop { position: 1; color: root.to }
        }
        PathRectangle {
            width: root.width
            height: root.height
            radius: root.radius
        }
    }
}
