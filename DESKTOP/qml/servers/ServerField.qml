import QtQuick
import StartCode

/* Campo de formulario: etiqueta pequeña arriba y el control debajo.

       ServerField { label: "Host / IP *"; width: …
           GlassField { width: parent.width } }

   `rich` permite una etiqueta con formato (un tramo en monoespaciada). */
Column {
    id: root

    property string label: ""
    property bool rich: false

    spacing: 6

    Label {
        width: root.width
        text: root.label
        tone: 0.55
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
        textFormat: root.rich ? Text.RichText : Text.PlainText
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }
}
