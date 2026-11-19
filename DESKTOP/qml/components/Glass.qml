import QtQuick
import QtQuick.Effects
import StartCode

/* Superficie de cristal. `variant` elige la receta de DESIGN.md:
   glass (paneles), soft (tarjetas anidadas), input (campos, hundidos) y
   float (lo que flota sobre contenido). Solo la superficie exterior
   desenfoca: pasarle `backdrop` únicamente en ese caso. */
Item {
    id: root

    property string variant: "glass"
    property real radius: variant === "input" ? Theme.radiusXl : Theme.radius2xl
    /* Elemento que queda detrás y se desenfoca; null en superficies anidadas. */
    property Item backdrop: null
    /* Nivel de elevación; por defecto el de la receta. */
    property string elevation: variant === "glass" ? "panel"
                             : variant === "soft" ? "raised"
                             : variant === "float" ? "float" : "none"
    /* Realce al pasar por encima (`.row-hit`): suma el tinte, no sustituye el cristal. */
    property bool highlighted: false
    /* Foco del campo: borde de marca y anillo exterior. */
    property bool focused: false
    property color borderColor: focused ? Theme.brand1(0.5)
                              : highlighted ? Theme.hairlineHover
                              : variant === "soft" ? Theme.hairlineSoft : Theme.hairline

    default property alias content: body.data

    readonly property real surfaceAlpha: Theme.glassAlpha[variant] ?? Theme.glassAlpha.glass
    readonly property var sheenStops: Theme.sheen[variant] ?? Theme.sheen.glass
    readonly property real blurRadius: variant === "soft" ? 18 : 28

    Elevation {
        anchors.fill: parent
        level: root.elevation
        radius: root.radius
    }

    /* Anillo de foco de los campos: 4 px de marca al 12 %. */
    Rectangle {
        visible: root.focused
        anchors.fill: parent
        anchors.margins: -4
        radius: root.radius + 4
        color: "transparent"
        border.width: 4
        border.color: Theme.brand1(0.12)
    }

    /* ── Desenfoque de lo que hay detrás ───────────────────────────── */
    Loader {
        anchors.fill: parent
        active: root.backdrop !== null
        sourceComponent: Item {
            ShaderEffectSource {
                id: capture
                anchors.fill: parent
                visible: false
                sourceItem: root.backdrop
                sourceRect: {
                    /* Dependencias: la posición cambia con la ventana y con el propio panel. */
                    root.width; root.height; root.backdrop.width; root.backdrop.height
                    const origin = root.mapToItem(root.backdrop, 0, 0)
                    return Qt.rect(origin.x, origin.y, root.width, root.height)
                }
            }
            Rectangle {
                id: mask
                anchors.fill: parent
                radius: root.radius
                visible: false
                layer.enabled: true
            }
            MultiEffect {
                anchors.fill: parent
                source: capture
                autoPaddingEnabled: false
                blurEnabled: true
                blurMax: 64
                blur: root.blurRadius / 32
                saturation: root.variant === "soft" ? 0.8 : 1.0
                maskEnabled: true
                maskSource: mask
            }
        }
    }

    /* ── Color del cristal, brillo superior y borde ────────────────── */
    Rectangle {
        anchors.fill: parent
        radius: root.radius
        color: Theme.surface(root.surfaceAlpha)
    }
    Rectangle {
        anchors.fill: parent
        radius: root.radius
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.rgba(1, 1, 1, root.sheenStops[0]) }
            GradientStop { position: 1; color: Qt.rgba(1, 1, 1, root.sheenStops[1]) }
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: root.radius
        color: root.highlighted ? Theme.tintHover : "transparent"
        border.width: 1
        border.color: root.borderColor
        Behavior on color { ColorAnimation { duration: Theme.moFast } }
        Behavior on border.color { ColorAnimation { duration: Theme.moFast } }
    }
    /* Los campos van hundidos: sombra interior arriba en vez de elevación. */
    Rectangle {
        visible: root.variant === "input"
        x: root.radius; y: 1
        width: parent.width - root.radius * 2
        height: 2
        gradient: Gradient {
            GradientStop { position: 0; color: Theme.insetField }
            GradientStop { position: 1; color: "transparent" }
        }
    }

    Item {
        id: body
        anchors.fill: parent
    }
}
