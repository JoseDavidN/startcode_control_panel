import QtQuick
import StartCode

/* Campo del login: cristal hundido de 48 px con icono de 20 px a la izquierda
   y, en la contraseña, el botón de mostrar. `centered` es la variante del
   código de respaldo: centrado, monoespaciado y en mayúsculas. */
Glass {
    id: root

    property alias text: input.text
    property string placeholder: ""
    /* Trazo SVG (rejilla de 24) del icono; vacío = sin icono. */
    property string iconPath: ""
    property bool password: false
    /* Botón de mostrar/ocultar (solo con `password`). */
    property bool revealable: false
    property bool centered: false
    /* Lo escrito se pasa a mayúsculas (códigos de respaldo). */
    property bool upperCase: false
    /* Opacidad de la tinta del texto. */
    property real inkTone: 0.9
    property string label: ""
    property alias maximumLength: input.maximumLength
    property alias inputMethodHints: input.inputMethodHints
    property alias input: input

    property bool revealed: false

    signal accepted()

    function forceFocus() { input.forceActiveFocus() }

    variant: "input"
    implicitHeight: 48
    implicitWidth: 320
    focused: input.activeFocus

    Icon {
        id: lead
        visible: root.iconPath !== ""
        x: 14
        anchors.verticalCenter: parent.verticalCenter
        path: root.iconPath
        size: 20
        strokeWidth: 1.6
        color: Theme.ink(0.45)
    }

    Item {
        id: reveal
        visible: root.password && root.revealable
        anchors.right: parent.right
        anchors.rightMargin: 14
        anchors.verticalCenter: parent.verticalCenter
        width: 20; height: 20
        Accessible.role: Accessible.Button
        Accessible.name: root.revealed ? "Ocultar contraseña" : "Mostrar contraseña"

        Icon {
            anchors.fill: parent
            path: root.revealed
                  ? "M17.94 17.94A10 10 0 0112 19c-7 0-10-7-10-7a18 18 0 014.06-5.06M9.9 5a10.5 10.5 0 012.1-.2c7 0 10 7 10 7a18 18 0 01-2.16 3.19M14.12 14.12A3 3 0 119.88 9.88M1 1l22 22"
                  : "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 106 0 3 3 0 00-6 0"
            size: 20
            strokeWidth: 1.6
            color: Theme.ink(revealHover.hovered ? 1 : 0.45)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        HoverHandler { id: revealHover; cursorShape: Qt.PointingHandCursor }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            onTapped: root.revealed = !root.revealed
        }
    }

    Item {
        id: box
        anchors.fill: parent
        anchors.leftMargin: lead.visible ? 44 : (root.centered ? 14 : 16)
        anchors.rightMargin: reveal.visible ? 44 : (root.centered ? 14 : 16)
        clip: true

        Label {
            anchors.fill: parent
            verticalAlignment: Text.AlignVCenter
            horizontalAlignment: input.horizontalAlignment
            visible: input.text.length === 0 && input.preeditText.length === 0
            text: root.placeholder
            tone: root.centered ? 0.5 : 0.3
            font: input.font
        }
        TextInput {
            id: input
            anchors.fill: parent
            verticalAlignment: TextInput.AlignVCenter
            horizontalAlignment: root.centered ? TextInput.AlignHCenter : TextInput.AlignLeft
            color: Theme.ink(root.inkTone)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: root.centered ? Theme.fontMono : Theme.fontUi
            font.pixelSize: root.centered ? 20 : Theme.textSm
            font.weight: root.centered ? Font.Bold : Font.Normal
            font.letterSpacing: root.centered ? 4 : 0
            echoMode: root.password && !root.revealed ? TextInput.Password : TextInput.Normal
            selectByMouse: true
            activeFocusOnTab: true
            Accessible.name: root.label !== "" ? root.label : root.placeholder
            onTextEdited: {
                if (!root.upperCase)
                    return
                const upper = text.toUpperCase()
                if (upper !== text) {
                    const at = cursorPosition
                    text = upper
                    cursorPosition = at
                }
            }
            onAccepted: root.accepted()
        }
    }

    /* Un clic en cualquier punto del campo lo enfoca. */
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        onTapped: input.forceActiveFocus()
    }
    HoverHandler { cursorShape: Qt.IBeamCursor }
}
