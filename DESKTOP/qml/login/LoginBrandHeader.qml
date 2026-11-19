import QtQuick
import StartCode

/* Cabecera de cada paso del login: pieza de marca con su halo, título con
   gradiente y subtítulo. */
Column {
    id: root

    /* Trazo SVG (rejilla de 24) del icono de la pieza. */
    property string iconPath: ""
    property real iconSize: 20
    property string title: ""
    property string subtitle: ""

    spacing: 0

    Item {
        anchors.horizontalCenter: parent.horizontalCenter
        width: 64; height: 64

        LoginGlow {
            anchors.centerIn: parent
            width: 152; height: 152
            tint: Theme.brandStart
            strength: 0.5
        }
        Elevation {
            anchors.fill: parent
            radius: Theme.radius2xl
            level: "brandHi"
        }
        BrandFill {
            anchors.fill: parent
            radius: Theme.radius2xl
        }
        Icon {
            anchors.centerIn: parent
            path: root.iconPath
            size: root.iconSize
            strokeWidth: 1.6
            color: Theme.onBrand
        }
    }

    Item { width: 1; height: 20 }

    LoginGradientText {
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(implicitWidth, root.width)
        text: root.title
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
        font.pixelSize: 30
        font.weight: Font.Bold
        font.letterSpacing: -0.75
    }

    Item { width: 1; height: 4 }

    Label {
        width: root.width
        text: root.subtitle
        tone: 0.55
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }
}
