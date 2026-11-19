import QtQuick
import StartCode

/* Aviso en línea del resultado de una acción: verde si fue bien, rojo si no. */
Rectangle {
    id: root

    property bool ok: true
    property string msg: ""

    readonly property color tint: ok ? Theme.ok : Theme.danger

    implicitHeight: Math.max(40, text.implicitHeight + 24)
    radius: Theme.radiusXl
    color: Qt.alpha(tint, 0.1)
    border.width: 1
    border.color: Qt.alpha(tint, 0.2)

    Icon {
        x: 12
        anchors.verticalCenter: parent.verticalCenter
        name: root.ok ? "checkCircle" : "alertCircle"
        color: root.tint
    }
    Label {
        id: text
        x: 36
        width: parent.width - 48
        anchors.verticalCenter: parent.verticalCenter
        text: root.msg
        color: root.tint
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }
}
