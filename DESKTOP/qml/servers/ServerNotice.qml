import QtQuick
import StartCode

/* Aviso en caja dentro de un modal: cristal suave con el borde teñido del
   color del aviso y, opcionalmente, un icono a la izquierda. El contenido se
   declara dentro y se apila en columna:

       ServerNotice { accent: Theme.danger; iconName: "alert"; width: …
           Label { width: parent.width; text: "…" } }
*/
Glass {
    id: root

    /* Color del borde y, por defecto, del icono. */
    property color accent: Theme.danger
    property real edge: 0.2
    property string iconName: ""
    /* Trazo propio (rejilla de 24) si el icono no está en el juego. */
    property string iconPath: ""
    property color iconColor: accent
    property int iconSize: 20
    property int pad: 16
    property alias spacing: column.spacing
    default property alias items: column.data

    readonly property bool hasIcon: iconName !== "" || iconPath !== ""

    variant: "soft"
    elevation: "flat"
    radius: Theme.radiusXl
    borderColor: Qt.alpha(accent, edge)
    implicitHeight: column.implicitHeight + pad * 2

    Icon {
        id: icon
        visible: root.hasIcon
        x: root.pad
        y: root.pad + 2
        size: root.iconSize
        path: root.iconPath !== "" ? root.iconPath : (icon.paths[root.iconName] || "")
        color: root.iconColor
    }
    Column {
        id: column
        x: root.pad + (root.hasIcon ? root.iconSize + 12 : 0)
        y: root.pad
        width: root.width - x - root.pad
        spacing: 6
    }
}
