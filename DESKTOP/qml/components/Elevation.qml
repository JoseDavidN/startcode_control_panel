import QtQuick
import QtQuick.Effects
import StartCode

/* Sombra de un nivel de la escala de elevación. Va detrás de la superficie. */
Item {
    id: root

    /* flat | raised | panel | float | modal | brand | brandSm | brandHi | none */
    property string level: "panel"
    property real radius: Theme.radius2xl

    readonly property var layers: {
        switch (level) {
        case "none": return []
        case "brandSm": return [[4, 14, -4, Theme.brand1(0.55)]]
        case "brand": return [[8, 24, -8, Theme.brand1(0.55)]]
        case "brandHi": return [[12, 30, -8, Theme.brand2(0.55)]]
        default:
            return (Theme.elevation[level] || []).map(l => [l[0], l[1], l[2], Theme.shadow(l[3])])
        }
    }

    Repeater {
        model: root.layers
        RectangularShadow {
            required property var modelData
            anchors.fill: parent
            offset.y: modelData[0]
            blur: modelData[1]
            spread: modelData[2]
            color: modelData[3]
            radius: root.radius
        }
    }
}
