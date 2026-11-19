import QtQuick
import StartCode

/* Campo de una línea del explorador de Redis: más bajo que el de los
   formularios (32 px) y en monoespaciada. `iconName` pone un icono delante y
   `clearable` un botón que vacía el texto. Enter emite `accepted()` y Escape
   `escaped()`. */
Glass {
    id: root

    property alias text: input.text
    property string placeholder: ""
    property string iconName: ""
    property bool clearable: false
    property string clearHint: "Limpiar"
    property alias inputMethodHints: input.inputMethodHints
    property alias maximumLength: input.maximumLength
    property alias input: input

    signal accepted()
    signal escaped()

    function forceFocus() { input.forceActiveFocus() }

    variant: "input"
    radius: Theme.radiusLg
    implicitHeight: 32
    implicitWidth: 160
    focused: input.activeFocus

    Icon {
        id: lead
        visible: root.iconName !== ""
        x: 10
        anchors.verticalCenter: parent.verticalCenter
        name: root.iconName
        size: 14
        color: Theme.ink(input.activeFocus ? 0.6 : 0.35)
    }

    Item {
        anchors.left: parent.left
        anchors.leftMargin: lead.visible ? 32 : 10
        anchors.right: parent.right
        anchors.rightMargin: clear.visible ? 30 : 10
        height: parent.height
        clip: true

        Label {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            visible: input.text.length === 0 && input.preeditText.length === 0
            text: root.placeholder
            tone: 0.3
            mono: true
            font.pixelSize: Theme.textXs
        }
        TextInput {
            id: input
            anchors.fill: parent
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: Theme.textXs
            selectByMouse: true
            activeFocusOnTab: true
            onAccepted: root.accepted()
            Keys.onEscapePressed: root.escaped()
        }
    }

    /* Un clic en cualquier punto del campo lo enfoca. */
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        onTapped: input.forceActiveFocus()
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }

    IconButton {
        id: clear
        visible: root.clearable && input.text.length > 0
        anchors.right: parent.right
        anchors.rightMargin: 3
        anchors.verticalCenter: parent.verticalCenter
        size: 26
        iconSize: 12
        plain: true
        iconName: "close"
        hint: root.clearHint
        onClicked: { input.text = ""; input.forceActiveFocus() }
    }
}
