import QtQuick
import StartCode

/* Etiqueta corta del tipo de una clave. El tipo se distingue por el texto, no por color. */
Rectangle {
    id: root

    property string type: ""

    readonly property var shortNames: ({ string: "STR", hash: "HASH", list: "LIST", set: "SET", zset: "ZSET", stream: "STREAM" })

    implicitWidth: 56
    implicitHeight: 18
    radius: Theme.radiusMd
    color: Theme.tintActive
    border.width: 1
    border.color: Theme.hairline

    Label {
        anchors.centerIn: parent
        width: parent.width - 6
        horizontalAlignment: Text.AlignHCenter
        textFormat: Text.PlainText
        text: root.shortNames[root.type] || String(root.type).slice(0, 6).toUpperCase()
        mono: true
        tone: 0.6
        font.pixelSize: Theme.textCaption
        font.weight: Font.DemiBold
        font.letterSpacing: 0.5
    }
}
