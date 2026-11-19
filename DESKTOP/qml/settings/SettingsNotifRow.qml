import QtQuick
import StartCode

/* Fila con título, descripción e interruptor (y un icono opcional). Lo que
   se declare dentro va entre el texto y el interruptor (insignias de canal). */
Glass {
    id: root

    property string title: ""
    property string desc: ""
    property bool on: false
    property string iconName: ""
    property color iconColor: Theme.ink(0.7)
    /* Sin interruptor: fila solo informativa. */
    property bool toggleVisible: true
    default property alias extras: extraRow.data
    signal change(bool value)

    variant: "soft"
    elevation: "flat"
    radius: Theme.radiusXl
    implicitHeight: Math.max(68, texts.implicitHeight + 32)

    Rectangle {
        id: iconBox
        visible: root.iconName !== ""
        x: 16
        anchors.verticalCenter: parent.verticalCenter
        width: 36; height: 36
        radius: Theme.radiusLg
        color: Theme.tintSunken
        border.width: 1
        border.color: Theme.hairlineSoft
        Icon { anchors.centerIn: parent; name: root.iconName; color: root.iconColor }
    }
    Column {
        id: texts
        anchors.left: iconBox.visible ? iconBox.right : parent.left
        anchors.leftMargin: 16
        anchors.right: extraRow.left
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        Label { width: parent.width; text: root.title; font.weight: Font.Medium }
        Label {
            width: parent.width
            text: root.desc
            tone: 0.5
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }
    Row {
        id: extraRow
        anchors.right: toggle.visible ? toggle.left : parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8
    }
    Toggle {
        id: toggle
        visible: root.toggleVisible
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        checked: root.on
        onToggled: root.change(checked)
    }
}
