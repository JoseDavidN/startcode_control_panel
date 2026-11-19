import QtQuick
import StartCode

/* Etiqueta, control y ayuda opcional. El control se declara dentro y toma
   el ancho del campo: `SettingsField { label: "…"; GlassField { width: parent.width } }`. */
Column {
    id: root

    property string label: ""
    property string hint: ""
    default property alias control: slot.data

    spacing: 6

    Label {
        width: root.width
        text: root.label
        tone: 0.55
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
    }
    Item {
        id: slot
        width: root.width
        implicitHeight: childrenRect.height
        height: implicitHeight
    }
    Label {
        visible: root.hint !== ""
        width: root.width
        text: root.hint
        tone: 0.4
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }
}
