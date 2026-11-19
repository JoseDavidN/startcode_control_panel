import QtQuick
import StartCode

/* Código de 6 dígitos de la app autenticadora, una casilla por cifra: al
   escribir salta a la siguiente, Retroceso en una vacía vuelve a la anterior
   y pegar seis cifras las reparte. */
Item {
    id: root

    /* Las seis cifras juntas (menos si faltan). */
    readonly property string code: digits.join("")
    property var digits: ["", "", "", "", "", ""]
    /* Las casillas encogen si no caben las seis de 44 px. */
    readonly property real boxWidth: Math.max(28, Math.min(44, Math.floor((width - 40) / 6)))

    signal accepted()

    function clear() {
        for (let i = 0; i < boxes.count; i++)
            boxes.itemAt(i).input.text = ""
    }
    function focusFirst() {
        if (boxes.count > 0)
            boxes.itemAt(0).input.forceActiveFocus()
    }
    /* Pegado: solo si el texto trae exactamente seis cifras (o más: sobran). */
    function fill(text) {
        const found = String(text || "").replace(/\D/g, "").slice(0, 6)
        if (found.length !== 6)
            return false
        for (let i = 0; i < 6; i++)
            boxes.itemAt(i).input.text = found.charAt(i)
        boxes.itemAt(5).input.forceActiveFocus()
        return true
    }

    implicitWidth: 6 * 44 + 40
    implicitHeight: 56

    Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: 8

        Repeater {
            id: boxes
            model: 6

            Glass {
                id: cell

                required property int index
                property alias input: digit

                variant: "input"
                width: root.boxWidth
                height: 56
                focused: digit.activeFocus

                TextInput {
                    id: digit
                    anchors.fill: parent
                    horizontalAlignment: TextInput.AlignHCenter
                    verticalAlignment: TextInput.AlignVCenter
                    color: Theme.ink(1)
                    selectionColor: Theme.brand1(0.45)
                    selectedTextColor: Theme.ink(1)
                    font.family: Theme.fontMono
                    font.pixelSize: 20
                    font.weight: Font.Bold
                    maximumLength: 1
                    inputMethodHints: Qt.ImhDigitsOnly
                    validator: RegularExpressionValidator { regularExpression: /\d?/ }
                    selectByMouse: false
                    activeFocusOnTab: true
                    Accessible.name: "Dígito " + (cell.index + 1) + " de 6"

                    onTextChanged: root.digits = root.digits.map((d, k) => k === cell.index ? text : d)
                    onTextEdited: {
                        if (text !== "" && cell.index < 5)
                            boxes.itemAt(cell.index + 1).input.forceActiveFocus()
                    }
                    /* Con la cifra seleccionada, escribir otra la sustituye. */
                    onActiveFocusChanged: if (activeFocus) selectAll()
                    onAccepted: root.accepted()

                    Keys.onPressed: event => {
                        if (event.matches(StandardKey.Paste)) {
                            if (root.fill(App.clipboardText()))
                                event.accepted = true
                        } else if (event.key === Qt.Key_Backspace && text === "" && cell.index > 0) {
                            boxes.itemAt(cell.index - 1).input.forceActiveFocus()
                            event.accepted = true
                        } else if (event.key === Qt.Key_Left && cell.index > 0) {
                            boxes.itemAt(cell.index - 1).input.forceActiveFocus()
                            event.accepted = true
                        } else if (event.key === Qt.Key_Right && cell.index < 5) {
                            boxes.itemAt(cell.index + 1).input.forceActiveFocus()
                            event.accepted = true
                        }
                    }
                }

                TapHandler {
                    gesturePolicy: TapHandler.ReleaseWithinBounds
                    onTapped: digit.forceActiveFocus()
                }
                HoverHandler { cursorShape: Qt.IBeamCursor }
            }
        }
    }
}
