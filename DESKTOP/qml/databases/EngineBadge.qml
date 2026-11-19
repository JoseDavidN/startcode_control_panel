import QtQuick
import StartCode

/* Logo de un motor dentro de su recuadro, con el tono del motor en degradado.
   `size`: "md" (48 px, tarjetas) o "sm" (40 px, selector del formulario). */
Item {
    id: root

    property string engine: ""
    property string size: "md"

    readonly property int side: size === "md" ? 48 : 40
    readonly property var colors: Theme.tone(logo.tone)

    implicitWidth: side
    implicitHeight: side
    width: side
    height: side

    BrandFill {
        anchors.fill: parent
        radius: Theme.radiusXl
        from: Qt.alpha(root.colors.base, 0.25)
        to: Qt.alpha(root.colors.base, 0.05)
    }
    Rectangle {
        anchors.fill: parent
        radius: Theme.radiusXl
        color: "transparent"
        border.width: 1
        border.color: Qt.alpha(root.colors.base, 0.2)
    }
    EngineIcon {
        id: logo
        anchors.centerIn: parent
        engine: root.engine
        size: root.size === "md" ? 24 : 20
    }
}
