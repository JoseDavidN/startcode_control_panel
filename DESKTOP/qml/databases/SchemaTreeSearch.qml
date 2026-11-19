import QtQuick
import StartCode

/* Buscador compacto del árbol de bases (bases y tablas): campo hundido de
   32 px. `edited` solo salta con lo que escribe el usuario. */
Glass {
    id: root

    property alias text: input.text
    property string placeholder: ""

    signal edited(string text)

    variant: "input"
    radius: Theme.radiusLg
    implicitHeight: 32
    implicitWidth: 200
    focused: input.activeFocus

    Icon {
        id: lens
        x: 10
        anchors.verticalCenter: parent.verticalCenter
        name: "search"
        size: 14
        color: Theme.ink(0.35)
    }
    Item {
        anchors.left: lens.right
        anchors.leftMargin: 8
        anchors.right: parent.right
        anchors.rightMargin: 10
        height: parent.height
        clip: true

        Label {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            visible: input.text.length === 0 && input.preeditText.length === 0
            text: root.placeholder
            tone: 0.3
            font.pixelSize: Theme.textXs
        }
        TextInput {
            id: input
            anchors.fill: parent
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontUi
            font.pixelSize: Theme.textXs
            selectByMouse: true
            activeFocusOnTab: true
            Accessible.name: root.placeholder
            onTextEdited: root.edited(text)
        }
    }

    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        onTapped: input.forceActiveFocus()
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }
}
