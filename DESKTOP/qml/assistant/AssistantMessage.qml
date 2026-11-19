import QtQuick
import StartCode

/* Un mensaje de la conversación. La pregunta va a la derecha en una burbuja;
   la respuesta, a la izquierda: prosa en Markdown, bloques de código con sus
   acciones y tarjetas de alta cuando el bloque es una propuesta. */
Item {
    id: root

    /* `ChatMessage` del backend: `{ id, role, content, provider, model, createdAt }`. */
    property var message: null
    /* Destinos registrados (`AssistantBridge.targets`). */
    property var targets: []
    signal review(var action)
    /* Clic derecho: el panel abre su menú («Copiar mensaje») en ese punto. */
    signal menuRequested(var item, real px, real py)

    readonly property bool isUser: !!message && message.role === "user"
    readonly property string content: message && message.content !== undefined && message.content !== null ? String(message.content) : ""
    /* Partes de la respuesta, con el alta ya leída si el bloque es una propuesta. */
    readonly property var parts: isUser ? [] : logic.parseReply(content).map(p => {
        if (p.kind === "code") return { kind: "code", lang: p.lang, code: p.code, action: logic.parseAction(p.lang, p.code) }
        return { kind: "text", text: root.prose(p.text) }
    }).filter(p => p.kind === "code" || p.text !== "")

    implicitHeight: isUser ? bubble.height : Math.max(28, replyColumn.implicitHeight)
    implicitWidth: 320

    AssistantActions { id: logic }

    /* Sin saltos sobrantes en los extremos. Un salto simple se conserva como
       salto de línea (en Markdown sería un espacio y la respuesta se apelmaza). */
    function prose(text) {
        return String(text).replace(/^\n+|\n+$/g, "").replace(/([^\n])\n(?=[^\n])/g, "$1  \n")
    }

    function openMenu(item, x, y) { root.menuRequested(item, x, y) }

    /* ── Pregunta ─────────────────────────────────────────────────── */
    Item {
        id: bubble
        visible: root.isUser
        anchors.right: parent.right
        width: Math.min(Math.ceil(measure.implicitWidth) + 30, Math.floor(root.width * 0.85))
        height: userText.implicitHeight + 20

        /* Ancho natural del texto: la burbuja se ajusta a él hasta el 85 %. */
        Text {
            id: measure
            visible: false
            text: root.isUser ? root.content : ""
            textFormat: Text.PlainText
            font: userText.font
        }
        BrandFill {
            anchors.fill: parent
            radius: Theme.radius2xl
            strength: 0.28
        }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radius2xl
            color: "transparent"
            border.width: 1
            border.color: Theme.hairline
        }
        TextEdit {
            id: userText
            x: 14; y: 10
            width: bubble.width - 28
            text: root.isUser ? root.content : ""
            textFormat: TextEdit.PlainText
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.Wrap
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontUi
            font.pixelSize: Theme.textSm

            /* Dentro del texto: si no, el propio campo se quedaría el clic derecho. */
            TapHandler {
                acceptedButtons: Qt.RightButton
                gesturePolicy: TapHandler.ReleaseWithinBounds
                onTapped: eventPoint => root.openMenu(userText, eventPoint.position.x, eventPoint.position.y)
            }
        }
    }

    /* ── Respuesta ────────────────────────────────────────────────── */
    Item {
        id: avatar
        visible: !root.isUser
        width: 28; height: 28

        Elevation { anchors.fill: parent; level: "brandSm"; radius: Theme.radiusLg }
        BrandFill { anchors.fill: parent; radius: Theme.radiusLg }
        Icon { anchors.centerIn: parent; name: "spark"; size: 14; color: Theme.onBrand }
    }

    Column {
        id: replyColumn
        visible: !root.isUser
        x: 38
        width: root.width - 38
        spacing: 8

        Repeater {
            model: root.parts.length
            delegate: Column {
                id: partItem
                required property int index
                readonly property var part: root.parts[index] || ({ kind: "none" })
                width: replyColumn.width

                Loader {
                    width: parent.width
                    active: partItem.part.kind === "text"
                    visible: active
                    sourceComponent: Text {
                        id: proseText
                        text: partItem.part.text || ""
                        textFormat: Text.MarkdownText
                        wrapMode: Text.Wrap
                        color: Theme.ink(0.8)
                        linkColor: Theme.brandLight1
                        font.family: Theme.fontUi
                        font.pixelSize: Theme.textSm
                        lineHeight: 1.35
                        renderType: Text.QtRendering
                        onLinkActivated: link => App.openExternal(link)

                        HoverHandler { cursorShape: proseText.hoveredLink ? Qt.PointingHandCursor : Qt.ArrowCursor }
                        TapHandler {
                            acceptedButtons: Qt.RightButton
                            gesturePolicy: TapHandler.ReleaseWithinBounds
                            onTapped: eventPoint => root.openMenu(partItem, eventPoint.position.x, eventPoint.position.y)
                        }
                    }
                }
                Loader {
                    width: parent.width
                    active: partItem.part.kind === "code" && !partItem.part.action
                    visible: active
                    sourceComponent: AssistantCodeBlock {
                        lang: partItem.part.lang || ""
                        code: partItem.part.code || ""
                        targets: root.targets
                    }
                }
                Loader {
                    width: parent.width
                    active: partItem.part.kind === "code" && !!partItem.part.action
                    visible: active
                    sourceComponent: AssistantAction {
                        action: partItem.part.action
                        onReview: action => root.review(action)
                    }
                }
            }
        }

        /* Quién respondió: la memoria es la misma aunque cambie el proveedor. */
        Label {
            width: parent.width
            visible: !root.isUser && !!root.message && !!root.message.model
            text: visible ? logic.vendorOf(root.message.provider) + " · " + root.message.model : ""
            textFormat: Text.PlainText
            mono: true
            tone: 0.3
            font.pixelSize: Theme.textCaption
        }
    }
}
