import QtQuick
import StartCode

/* Campo de texto del sistema: cristal hundido, icono opcional y, en las
   contraseñas, botón para mostrar el texto. */
Glass {
    id: root

    property alias text: input.text
    property string placeholder: ""
    property string iconName: ""
    property bool password: false
    property bool mono: false
    property alias inputMethodHints: input.inputMethodHints
    property alias maximumLength: input.maximumLength
    property alias input: input

    signal accepted()

    function forceFocus() { input.forceActiveFocus() }

    variant: "input"
    implicitHeight: Theme.fieldHeight
    implicitWidth: 320
    focused: input.activeFocus

    property bool revealed: false

    Row {
        anchors.fill: parent
        anchors.leftMargin: 14
        anchors.rightMargin: 14
        spacing: 8

        Icon {
            id: lead
            visible: root.iconName !== ""
            anchors.verticalCenter: parent.verticalCenter
            name: root.iconName
            color: Theme.ink(input.activeFocus ? 0.7 : 0.4)
        }

        Item {
            anchors.verticalCenter: parent.verticalCenter
            height: parent.height
            width: parent.width
                   - (lead.visible ? lead.width + parent.spacing : 0)
                   - (reveal.visible ? reveal.width + parent.spacing : 0)
            clip: true

            Label {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                visible: input.text.length === 0 && input.preeditText.length === 0
                text: root.placeholder
                tone: 0.3
            }
            TextInput {
                id: input
                anchors.fill: parent
                verticalAlignment: TextInput.AlignVCenter
                color: Theme.ink(1)
                selectionColor: Theme.brand1(0.45)
                selectedTextColor: Theme.ink(1)
                font.family: root.mono ? Theme.fontMono : Theme.fontUi
                font.pixelSize: Theme.textSm
                echoMode: root.password && !root.revealed ? TextInput.Password : TextInput.Normal
                selectByMouse: true
                activeFocusOnTab: true
                onAccepted: root.accepted()
            }
        }

        Item {
            id: reveal
            visible: root.password
            anchors.verticalCenter: parent.verticalCenter
            width: 20; height: 20
            Icon {
                anchors.centerIn: parent
                name: root.revealed ? "eyeOff" : "eye"
                color: Theme.ink(revealHover.hovered ? 0.9 : 0.45)
            }
            HoverHandler { id: revealHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.revealed = !root.revealed }
        }
    }

    /* Un clic en cualquier punto del campo lo enfoca. */
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        onTapped: input.forceActiveFocus()
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }
}
