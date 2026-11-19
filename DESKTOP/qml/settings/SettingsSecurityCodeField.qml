import QtQuick
import StartCode

/* Campo del código de 6 dígitos de la app autenticadora: centrado,
   monoespaciado y solo cifras. */
Glass {
    id: root

    property alias text: input.text
    /* El de activación es más alto y con cifras mayores. */
    property bool large: false

    signal accepted()

    function forceFocus() { input.forceActiveFocus() }

    variant: "input"
    implicitHeight: large ? 48 : Theme.fieldHeight
    implicitWidth: 160
    focused: input.activeFocus

    Label {
        anchors.centerIn: parent
        visible: input.text.length === 0 && input.preeditText.length === 0
        text: "000000"
        tone: 0.3
        mono: true
        font.pixelSize: input.font.pixelSize
        font.letterSpacing: input.font.letterSpacing
    }
    TextInput {
        id: input
        anchors.fill: parent
        anchors.leftMargin: 14
        anchors.rightMargin: 14
        horizontalAlignment: TextInput.AlignHCenter
        verticalAlignment: TextInput.AlignVCenter
        clip: true
        color: Theme.ink(1)
        selectionColor: Theme.brand1(0.45)
        selectedTextColor: Theme.ink(1)
        font.family: Theme.fontMono
        font.pixelSize: root.large ? 20 : 18
        font.letterSpacing: 2
        maximumLength: 6
        inputMethodHints: Qt.ImhDigitsOnly
        validator: RegularExpressionValidator { regularExpression: /\d{0,6}/ }
        selectByMouse: true
        activeFocusOnTab: true
        Accessible.name: "Código de 6 dígitos"
        onAccepted: root.accepted()
    }

    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        onTapped: input.forceActiveFocus()
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }
}
