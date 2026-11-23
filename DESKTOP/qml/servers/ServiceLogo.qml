import QtQuick
import QtQuick.Shapes
import StartCode

/* Logo de marca de un servicio instalable (`type`: clave de `ServiceLogos`).
   A diferencia de `Icon`, va relleno y con el color oficial de la marca: es
   contenido, no color de la interfaz. Un color de marca casi negro (MariaDB,
   Tailscale) toma la tinta del tema para que se vea en los tres. */
Item {
    id: root

    property string type: ""
    property real size: 32

    readonly property var logo: ServiceLogos.get(type)
    readonly property bool isImage: logo !== null && logo.image !== undefined
    readonly property bool isVector: logo !== null && logo.path !== undefined

    implicitWidth: size
    implicitHeight: size

    /* Sin logo vectorial: el PNG oficial del proyecto. */
    Image {
        anchors.fill: parent
        visible: root.isImage
        source: root.isImage ? root.logo.image : ""
        sourceSize: Qt.size(96, 96)
        fillMode: Image.PreserveAspectFit
        smooth: true
        mipmap: true
    }

    Shape {
        visible: root.isVector
        width: 24; height: 24
        scale: root.size / 24
        transformOrigin: Item.TopLeft
        preferredRendererType: Shape.CurveRenderer

        ShapePath {
            strokeColor: "transparent"
            strokeWidth: 0
            /* Como en SVG: relleno «nonzero». */
            fillRule: ShapePath.WindingFill
            fillColor: !root.isVector ? "transparent"
                     : ServiceLogos.isDark(root.type) ? Theme.ink(0.9) : root.logo.color
            PathSvg { path: root.isVector ? Format.svgPath(ServiceLogos.path(root.type)) : "" }
        }
    }
}
