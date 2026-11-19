import QtQuick
import StartCode

/* Campo de texto de varias líneas (claves privadas, descripciones, salida
   editable). Cristal hundido con desplazamiento propio. */
Glass {
    id: root

    property alias text: edit.text
    property string placeholder: ""
    property bool mono: false
    property bool readOnly: false
    property alias edit: edit

    function forceFocus() { edit.forceActiveFocus() }

    variant: "input"
    implicitHeight: 120
    implicitWidth: 320
    focused: edit.activeFocus

    ScrollArea {
        id: scroll
        anchors.fill: parent
        anchors.margins: 1
        contentHeight: Math.max(height, edit.implicitHeight + 24)

        Label {
            x: 14; y: 12
            width: parent.width - 28
            visible: edit.text.length === 0
            text: root.placeholder
            tone: 0.3
            mono: root.mono
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        TextEdit {
            id: edit
            x: 14; y: 12
            width: scroll.width - 28
            height: Math.max(scroll.height - 24, implicitHeight)
            color: Theme.ink(1)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: root.mono ? Theme.fontMono : Theme.fontUi
            font.pixelSize: root.mono ? 13 : Theme.textSm
            wrapMode: TextEdit.Wrap
            readOnly: root.readOnly
            selectByMouse: true
            activeFocusOnTab: true
        }
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }
}
