import QtQuick
import StartCode

/* Requisito de contraseña: marca verde cuando se cumple. */
Row {
    id: root

    property bool ok: false
    property string text: ""

    spacing: 10

    Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: 20; height: 20; radius: 10
        color: root.ok ? Qt.alpha(Theme.tone("emerald").base, 0.15) : "transparent"
        border.width: 1
        border.color: root.ok ? Qt.alpha(Theme.tone("emerald").base, 0.25) : Theme.hairlineStrong
        Icon { anchors.centerIn: parent; visible: root.ok; name: "check"; size: 12; color: Theme.tone("emerald").text }
    }
    Label {
        anchors.verticalCenter: parent.verticalCenter
        text: root.text
        tone: root.ok ? 0.8 : 0.4
        font.pixelSize: Theme.textXs
    }
}
