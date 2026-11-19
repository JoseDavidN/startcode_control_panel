import QtQuick
import StartCode

/* Insignia: fondo del color al 15 %, texto claro y anillo al 20 %.
   `pill` es la variante redonda de las etiquetas; sin ella, la de estado. */
Rectangle {
    id: root

    property string text: ""
    /* Familia de color (`emerald`, `amber`, `rose`…); vacío = neutra. */
    property string tone: ""
    property bool pill: false

    readonly property var colors: Theme.tone(tone)

    implicitWidth: label.implicitWidth + (pill ? 16 : 12)
    implicitHeight: pill ? 20 : 18
    radius: pill ? height / 2 : Theme.radiusMd
    color: tone === "" ? Theme.tintActive : Qt.alpha(colors.base, 0.15)
    border.width: 1
    border.color: tone === "" ? Theme.hairline : Qt.alpha(colors.base, 0.2)

    Label {
        id: label
        anchors.centerIn: parent
        text: root.text
        color: root.tone === "" ? Theme.ink(root.pill ? 0.6 : 0.55) : root.colors.text
        font.pixelSize: root.pill ? 11 : Theme.textCaption
        font.weight: Font.Medium
        font.capitalization: root.pill ? Font.MixedCase : Font.AllUppercase
        font.letterSpacing: root.pill ? 0 : 0.5
    }
}
