import QtQuick
import StartCode

/* Bloque de código de una respuesta: se puede copiar o pegar en los destinos
   que la pantalla ofrece para ese lenguaje. Pegar nunca ejecuta. */
Item {
    id: root

    property string lang: ""
    property string code: ""
    /* Destinos registrados (`AssistantBridge.targets`). */
    property var targets: []

    readonly property var usable: logic.targetsFor(lang, targets)

    implicitHeight: header.height + body.height
    implicitWidth: 320

    AssistantActions { id: logic }

    function paste(target) {
        target.paste(root.code)
        Toasts.success("Pegado en " + target.label, "Revísalo antes de ejecutarlo: el asistente no ejecuta nada.")
    }

    /* Botón de la cabecera: icono y texto en pequeño. */
    component HeadButton: Item {
        id: headButton

        property string label: ""
        property string iconName: ""
        property string hint: ""
        property bool accent: false
        signal clicked()

        width: headRow.implicitWidth + 16
        height: 24
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: hint
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
        Keys.onSpacePressed: clicked()

        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusMd
            color: headHover.hovered ? Theme.tintHover : "transparent"
            border.width: headButton.activeFocus ? 1 : 0
            border.color: Theme.focusRing
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Row {
            id: headRow
            anchors.centerIn: parent
            spacing: 4
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: headButton.iconName
                size: 14
                color: headHover.hovered ? Theme.ink(1) : headButton.accent ? Theme.brandLight1 : Theme.ink(0.6)
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: headButton.label
                color: headHover.hovered ? Theme.ink(1) : headButton.accent ? Theme.brandLight1 : Theme.ink(0.6)
                font.pixelSize: 11
            }
        }
        HoverHandler { id: headHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: headButton.clicked() }
        HoverTip { text: headButton.hint }
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radiusXl
        color: Theme.tintSunken
        border.width: 1
        border.color: Theme.hairlineSoft
    }

    /* Cabecera: lenguaje a la izquierda y acciones a la derecha; si no caben, bajan de línea. */
    Item {
        id: header
        width: parent.width
        height: Math.max(32, actions.height + 8)

        Label {
            id: langLabel
            x: 10
            y: 16 - height / 2
            text: (root.lang || "código").toUpperCase()
            mono: true
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.letterSpacing: 0.5
        }
        Flow {
            id: actions
            anchors.right: parent.right
            anchors.rightMargin: 10
            y: 4
            width: Math.max(60, header.width - langLabel.width - 30)
            spacing: 4
            /* De derecha a izquierda para alinear a la derecha: se declaran al revés. */
            layoutDirection: Qt.RightToLeft

            Repeater {
                model: root.usable.length
                delegate: HeadButton {
                    required property int index
                    /* Por índice: al pasar por un modelo, el objeto perdería su función `paste`. */
                    readonly property var target: root.usable[root.usable.length - 1 - index]
                    label: target ? target.label : ""
                    iconName: "paste"
                    accent: true
                    hint: target ? "Pegar en " + target.label + " sin ejecutar" : ""
                    onClicked: if (target) root.paste(target)
                }
            }
            HeadButton {
                label: "Copiar"
                iconName: "copy"
                hint: "Copiar"
                onClicked: {
                    App.copy(root.code)
                    Toasts.success("Copiado", "")
                }
            }
        }
        Rectangle {
            anchors.bottom: parent.bottom
            x: 1
            width: parent.width - 2
            height: 1
            color: Theme.line
        }
    }

    ScrollArea {
        id: body
        y: header.height
        width: parent.width
        height: Math.min(288, codeEdit.implicitHeight + 24)
        contentHeight: codeEdit.implicitHeight + 24
        /* Sin desbordar no captura la rueda: sigue desplazando la conversación. */
        interactive: contentHeight > height

        TextEdit {
            id: codeEdit
            x: 12; y: 12
            width: body.width - 24
            text: root.code
            textFormat: TextEdit.PlainText
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.WrapAnywhere
            color: Theme.ink(0.85)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: Theme.textXs
        }
    }
}
