import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import StartCode

/* Consola de comandos como redis-cli, sobre la base elegida en la vista.
   ↑/↓ recorren el historial. Lo peligroso pide confirmación y queda auditado;
   lo que bloquearía la conexión compartida lo rechaza el backend
   (`REDIS_COMMAND_BLOCKED`) y sale como un error más.

       RedisConsole { connectionId: …; connectionName: …; sessionId: …; db: …
           onSessionClosed: …; onAudit: …; onChanged: … } */
Item {
    id: root

    property string connectionId: ""
    property string connectionName: ""
    property string sessionId: ""

    /* El asistente lee las últimas respuestas y puede dejar un comando escrito, nunca ejecutarlo. */
    readonly property string assistantKey: sessionId !== "" ? "redis-console:" + connectionId : ""
    property string assistantRegistered: ""
    onAssistantKeyChanged: syncAssistant()
    function syncAssistant() {
        if (assistantRegistered !== "") {
            AssistantBridge.unregisterSource(assistantRegistered)
            AssistantBridge.unregisterTarget(assistantRegistered)
        }
        assistantRegistered = assistantKey
        if (assistantKey === "") return
        AssistantBridge.registerSource({ id: assistantKey, type: "command_output", title: "Consola Redis · " + connectionName,
                                         read: () => root.transcript(), database: () => null })
        AssistantBridge.registerTarget({ id: assistantKey, kind: "command", label: "la consola de Redis",
                                         paste: text => root.fill(text) })
    }
    Component.onDestruction: {
        if (assistantRegistered !== "") {
            AssistantBridge.unregisterSource(assistantRegistered)
            AssistantBridge.unregisterTarget(assistantRegistered)
        }
    }
    property int db: 0

    /* El backend dice que la sesión de la vista ya no existe. */
    signal sessionClosed()
    /* Se pulsó «Auditoría». */
    signal audit()
    /* Terminó un comando que puede escribir: la lista y el valor abierto deben refrescarse. */
    signal changed()

    /* Entradas que se conservan en pantalla (y lee el asistente las últimas). */
    readonly property int maxEntries: 200
    readonly property int assistantEntries: 30
    readonly property int maxHistory: 100

    property bool busy: false
    property var history: []
    /* Posición en el historial; -1 = fuera de él. */
    property int cursor: -1
    /* Comando peligroso a la espera: `{ command, db, message, hint }`. */
    property var pending: null
    property int seq: 0

    /* ── Interfaz hacia fuera (asistente) ──────────────────────────── */
    /* Últimas respuestas en texto. */
    function transcript() {
        const out = []
        for (let i = Math.max(0, entries.count - assistantEntries); i < entries.count; i++) {
            const en = entries.get(i)
            out.push("db" + en.entryDb + "> " + en.command + "\n" + en.output)
        }
        return out.join("\n\n")
    }
    /* Deja un comando escrito y enfocado; nunca lo ejecuta. */
    function fill(text) {
        const line = util.toSingleLine(text)
        if (!line) return
        input.text = line
        input.cursorPosition = line.length
        input.forceActiveFocus()
    }
    function focusInput() { input.forceActiveFocus() }
    function clearEntries() { entries.clear() }

    /* ── Lógica ────────────────────────────────────────────────────── */
    function push(entry) {
        seq += 1
        entries.append({
            entryId: seq, entryDb: entry.db, command: entry.command,
            output: entry.output, failed: entry.error, meta: entry.meta || ""
        })
        while (entries.count > maxEntries) entries.remove(0)
        Qt.callLater(scrollToEnd)
    }
    function scrollToEnd() {
        if (!root) return
        log.positionViewAtEnd()
    }

    function execute(line, onDb, confirm) {
        if (sessionId === "") {
            push({ db: onDb, command: line, error: true, output: "(error) La vista todavía no está conectada" })
            return
        }
        const body = { sessionId: sessionId, db: onDb, command: line }
        if (confirm) body.confirm = true
        busy = true
        Api.request("POST", "/databases/" + encodeURIComponent(connectionId) + "/redis/command", body, (ok, data, error) => {
            if (!root) return
            root.busy = false
            /* Tras uno que puede escribir, la lista y el valor abierto se refrescan. */
            if (!util.isReadCommand(line)) root.changed()
            if (ok && data) {
                root.push({
                    db: onDb, command: line, error: false, output: util.formatReply(data.reply),
                    meta: data.durationMs + " ms" + (data.truncated ? " · respuesta recortada" : "")
                })
                return
            }
            if (util.isSessionClosed(error)) root.sessionClosed()
            if (error && error.code === "DANGEROUS_QUERY") {
                root.pending = { command: line, db: onDb, message: error.message || "Comando peligroso", hint: error.hint || "" }
                confirmModal.open()
                return
            }
            root.push({ db: onDb, command: line, error: true, output: "(error) " + util.messageOf(error) })
        })
    }

    function submit() {
        const line = input.text.trim()
        if (!line || busy) return
        history = history.filter(h => h !== line).concat([line]).slice(-maxHistory)
        cursor = -1
        input.text = ""
        if (/^(clear|cls)$/i.test(line)) { entries.clear(); return }
        execute(line, db, false)
    }

    function recallPrevious() {
        if (!history.length) return
        cursor = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1)
        setLine(history[cursor])
    }
    function recallNext() {
        if (cursor < 0) return
        const next = cursor + 1
        if (next >= history.length) { cursor = -1; setLine("") }
        else { cursor = next; setLine(history[next]) }
    }
    /* Cambia la línea sin que cuente como edición (no saca del historial). */
    property bool recalling: false
    function setLine(text) {
        recalling = true
        input.text = text
        input.cursorPosition = text.length
        recalling = false
    }

    RedisUtil { id: util }
    ListModel { id: entries }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        /* ── Cabecera ── */
        Item {
            Layout.fillWidth: true
            implicitHeight: 44

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                spacing: 8

                Label {
                    text: "CONSOLA"
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                    font.letterSpacing: 0.6
                }
                Label {
                    Layout.fillWidth: true
                    /* Secundario: solo si sobra sitio. */
                    opacity: root.width >= 900 ? 1 : 0
                    text: "↑ ↓ historial · Ctrl + L limpia · los comandos peligrosos piden confirmación"
                    tone: 0.3
                    font.pixelSize: 11
                }
                RedisSmallButton {
                    text: "Auditoría"
                    iconName: "shieldPlain"
                    hint: "Comandos peligrosos confirmados y claves borradas en esta conexión"
                    onClicked: root.audit()
                }
                RedisSmallButton {
                    text: "Limpiar"
                    enabled: entries.count > 0
                    onClicked: entries.clear()
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        /* ── Registro ── */
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            /* Un clic en el registro lleva el foco a la línea de comandos. */
            TapHandler {
                gesturePolicy: TapHandler.ReleaseWithinBounds
                onTapped: input.forceActiveFocus()
            }

            Label {
                visible: entries.count === 0
                x: 16; y: 12
                width: parent.width - 32
                textFormat: Text.StyledText
                readonly property string hi: "<font color=\"" + Theme.ink(0.55) + "\">"
                text: "Escribe un comando de Redis, por ejemplo " + hi + "INFO memory</font>, "
                      + hi + "HGETALL user:1</font> o " + hi + "SCAN 0 MATCH sesion:* COUNT 100</font>."
                mono: true
                tone: 0.3
                font.pixelSize: Theme.textXs
                wrapMode: Text.Wrap
                elide: Text.ElideNone
            }

            ListView {
                id: log
                anchors.fill: parent
                anchors.topMargin: 12
                anchors.bottomMargin: 12
                visible: entries.count > 0
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                spacing: 12
                model: entries
                T.ScrollBar.vertical: SftpScrollBar { flick: log }

                delegate: Column {
                    id: entry
                    required property int entryDb
                    required property string command
                    required property string output
                    required property bool failed
                    required property string meta

                    x: 16
                    width: log.width - 32
                    spacing: 3

                    /* Solo lectura pero seleccionable, para poder copiar. */
                    TextEdit {
                        width: parent.width
                        readOnly: true
                        selectByMouse: true
                        textFormat: TextEdit.PlainText
                        wrapMode: TextEdit.WrapAnywhere
                        text: "db" + entry.entryDb + "> " + entry.command
                        color: Qt.alpha(Theme.brandLight1, 0.9)
                        selectionColor: Theme.brand1(0.45)
                        selectedTextColor: Theme.ink(1)
                        font.family: Theme.fontMono
                        font.pixelSize: Theme.textXs
                    }
                    TextEdit {
                        width: parent.width
                        readOnly: true
                        selectByMouse: true
                        textFormat: TextEdit.PlainText
                        wrapMode: TextEdit.WrapAnywhere
                        text: entry.output
                        color: entry.failed ? Theme.danger : Theme.ink(0.8)
                        selectionColor: Theme.brand1(0.45)
                        selectedTextColor: Theme.ink(1)
                        font.family: Theme.fontMono
                        font.pixelSize: Theme.textXs
                    }
                    Label {
                        visible: entry.meta !== ""
                        width: parent.width
                        text: entry.meta
                        mono: true
                        tone: 0.3
                        font.pixelSize: Theme.textCaption
                    }
                }
            }
        }

        /* ── Línea de comandos ── */
        Item {
            Layout.fillWidth: true
            implicitHeight: 56

            Rectangle { width: parent.width; height: 1; color: Theme.line }

            Glass {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                height: 36
                variant: "input"
                radius: Theme.radiusLg
                focused: input.activeFocus

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 12
                    anchors.rightMargin: 12
                    spacing: 8

                    Label {
                        text: "db" + root.db + ">"
                        mono: true
                        tone: 0.35
                        font.pixelSize: Theme.textXs
                    }
                    Item {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true

                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width
                            visible: input.text.length === 0 && input.preeditText.length === 0
                            text: root.sessionId !== "" ? "GET clave" : "Conectando…"
                            mono: true
                            tone: 0.25
                            font.pixelSize: Theme.textXs
                        }
                        TextInput {
                            id: input
                            anchors.fill: parent
                            verticalAlignment: TextInput.AlignVCenter
                            enabled: root.sessionId !== ""
                            color: Theme.ink(0.9)
                            selectionColor: Theme.brand1(0.45)
                            selectedTextColor: Theme.ink(1)
                            font.family: Theme.fontMono
                            font.pixelSize: Theme.textXs
                            selectByMouse: true
                            activeFocusOnTab: true
                            maximumLength: 90000
                            Accessible.name: "Comando de Redis"
                            onTextEdited: root.cursor = -1
                            Keys.onReturnPressed: root.submit()
                            Keys.onEnterPressed: root.submit()
                            Keys.onUpPressed: root.recallPrevious()
                            Keys.onDownPressed: root.recallNext()
                            Keys.onPressed: event => {
                                if (event.key === Qt.Key_L && (event.modifiers & Qt.ControlModifier)) {
                                    entries.clear()
                                    event.accepted = true
                                }
                            }
                        }
                    }
                    Spinner {
                        visible: root.busy
                        size: 14
                        color: Theme.brandLight1
                    }
                }
                HoverHandler { cursorShape: Qt.IBeamCursor }
                TapHandler {
                    gesturePolicy: TapHandler.ReleaseWithinBounds
                    onTapped: input.forceActiveFocus()
                }
            }
        }
    }

    /* ── Confirmación de un comando peligroso ── */
    Modal {
        id: confirmModal
        title: "Confirmar comando peligroso"
        size: "sm"
        onClosed: root.pending = null

        RowLayout {
            width: confirmModal.bodyWidth
            spacing: 12

            Icon { Layout.alignment: Qt.AlignTop; Layout.topMargin: 2; name: "alert"; size: 20; color: Theme.danger }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Label {
                    Layout.fillWidth: true
                    text: root.pending ? root.pending.message : ""
                    textFormat: Text.PlainText
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }
                Label {
                    Layout.fillWidth: true
                    visible: text !== ""
                    text: root.pending ? root.pending.hint : ""
                    textFormat: Text.PlainText
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }
            }
        }

        Rectangle {
            width: confirmModal.bodyWidth
            height: Math.min(192, commandText.implicitHeight + 24)
            radius: Theme.radiusLg
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairlineSoft

            ScrollArea {
                anchors.fill: parent
                anchors.margins: 1
                contentHeight: commandText.implicitHeight + 22
                Label {
                    id: commandText
                    x: 11; y: 11
                    width: parent.width - 22
                    text: root.pending ? root.pending.command : ""
                    textFormat: Text.PlainText
                    mono: true
                    tone: 0.8
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                }
            }
        }

        Label {
            width: confirmModal.bodyWidth
            textFormat: Text.StyledText
            text: "Base: <font color=\"" + Theme.ink(0.7) + "\">db" + (root.pending ? root.pending.db : 0) + "</font>"
            tone: 0.45
            font.pixelSize: Theme.textXs
        }

        footer: Row {
            spacing: 8
            SecondaryButton { text: "Cancelar"; onClicked: confirmModal.close() }
            DangerButton {
                text: "Ejecutar igualmente"
                onClicked: {
                    const p = root.pending
                    confirmModal.close()
                    if (p) root.execute(p.command, p.db, true)
                }
            }
        }
    }
}
