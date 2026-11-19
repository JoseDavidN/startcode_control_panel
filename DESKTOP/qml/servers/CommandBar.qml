import QtQuick
import QtQuick.Layouts
import StartCode

/* Línea de comandos flotante del detalle de un servidor: queda pegada al
   borde inferior en cualquier pestaña y la salida se abre encima. Cada
   comando va por SSH en su propia conexión, sin TTY y con 60 s como máximo,
   siempre en el home del usuario SSH. Es para comandos puntuales, no una
   terminal: el backend rechaza moverse de directorio, ver la ruta o abrir un
   shell (`BLOCKED_COMMAND`). Todo intento que llega al servidor se audita.

   Uso: anclarla abajo (`anchors.bottom`) con el ancho del detalle; su alto es
   `implicitHeight` y los paneles (aviso, sudo, salida) crecen hacia arriba. */
Item {
    id: root

    /* Servidor del detalle: `{ id, name, host, os, status }`. */
    property var server: ({})
    /* Elemento que queda detrás, para desenfocarlo (opcional; nunca uno que contenga a la barra). */
    property Item backdrop: null

    /* Un comando terminó, bien o mal: la auditoría del servidor pudo cambiar. */
    signal executed()

    readonly property string serverId: server && server.id ? String(server.id) : ""
    readonly property string serverName: server && server.name ? String(server.name) : ""

    property bool busy: false
    /* Todo corre en el home del usuario SSH; la ruta real la trae el primer comando. */
    property string home: ""
    property bool useSudo: false
    /* Resultados de esta sesión, del más antiguo al más reciente. */
    property var entries: []
    property bool outputOpen: false
    /* Comando a la espera: `{ command, kind: "danger" | "sudo" | "blocked", message, hint }`. */
    property var pending: null
    /* Auditoría del servidor: alimenta ↑/↓ junto con lo ejecutado en la sesión. */
    property var audit: []
    property int recallIndex: -1
    property string draft: ""

    readonly property string pendingKind: pending ? pending.kind : ""
    readonly property bool showOutput: outputOpen && entries.length > 0
    /* Igual que el backend: `sudo ` escrito a mano (sin opciones) cuenta como sudo y no se duplica. */
    readonly property var leadingSudo: /^\s*sudo\s+(?!-)/
    readonly property bool typedSudo: leadingSudo.test(field.text)
    readonly property bool asRoot: useSudo || typedSudo
    /* La salida ocupa como mucho el 45 % del alto de la ventana. */
    readonly property real outputMax: Math.max(140, (Window.window ? Window.window.height : 720) * 0.45)

    /* ↑/↓ recorren lo ejecutado en esta sesión y luego la auditoría, sin repetidos. */
    readonly property var recall: {
        const seen = {}, list = []
        const add = c => { if (!seen["=" + c]) { seen["=" + c] = true; list.push(c) } }
        for (let i = entries.length - 1; i >= 0; i--) add(withSudo(entries[i].command, entries[i].sudo))
        for (const row of audit) add(withSudo(row.command, row.sudo))
        return list
    }

    implicitHeight: stack.implicitHeight

    /* ── Utilidades ────────────────────────────────────────────────── */
    /* Comando tal como se reejecutaría: con `sudo ` delante si fue con sudo. */
    function withSudo(command, sudo) { return sudo ? "sudo " + command : command }
    /* Ruta como la escribe un prompt de bash: el home y lo que cuelga de él, con `~`. */
    function prettyPath(path, homeDir) {
        if (!homeDir || homeDir === "/") return path
        if (path === homeDir) return "~"
        return String(path).startsWith(homeDir + "/") ? "~" + String(path).slice(homeDir.length) : path
    }
    function statusLabel(status, exitCode) {
        if (status === "timeout") return "tiempo agotado"
        if (status === "failed") return "no ejecutado"
        return "exit " + (exitCode === null || exitCode === undefined ? "?" : exitCode)
    }
    function statusTone(status) {
        return status === "ok" ? "emerald" : status === "timeout" ? "amber" : "rose"
    }
    function fmtMs(ms) {
        const n = Number(ms) || 0
        return n < 1000 ? n + " ms" : (n / 1000).toFixed(1) + " s"
    }
    /* Texto pegado desde fuera: una sola línea y sin salto final, para que nunca
       se ejecute sin Enter. Las líneas se encadenan con `&&`. */
    function toSingleLine(text) {
        const line = String(text || "")
            .replace(/\\\r?\n\s*/g, " ")
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith("#"))
            .join(" && ")
        return Array.from(line).filter(ch => ch >= " " && ch !== "\x7f").join("")
    }

    /* ── Interfaz hacia fuera ──────────────────────────────────────── */
    /* Carga un comando en la línea (p. ej. desde el historial) y le da el foco. No lo ejecuta. */
    function load(command) {
        field.text = toSingleLine(command)
        field.cursorPosition = field.text.length
        pending = null
        recallIndex = -1
        field.forceActiveFocus()
    }
    function fill(command) { load(command) }
    function focusInput() { field.forceActiveFocus() }
    /* Últimos resultados en texto, como los lee un asistente. */
    function transcript() {
        return entries.slice(-10).map(e =>
            (e.sudo ? "#" : "$") + " " + withSudo(e.command, e.sudo) + "\n" + (e.output || "") + "\n["
            + statusLabel(e.status, e.exitCode) + " · " + fmtMs(e.durationMs)
            + (e.truncated ? " · salida recortada" : "") + "]").join("\n\n")
    }
    function clearOutput() { entries = []; outputOpen = false }

    /* ── Datos ─────────────────────────────────────────────────────── */
    function loadAudit() {
        const id = serverId
        if (id === "") return
        Api.request("GET", "/agent-data/servers/" + encodeURIComponent(id) + "/commands?limit=50", null, (ok, data) => {
            if (!root || root.serverId !== id) return
            if (ok && data) root.audit = Array.from(data)
        })
    }

    /* Ejecuta `command`. `opts`: `{ confirm: bool, password: string }`. */
    function run(command, opts) {
        opts = opts || {}
        const trimmed = String(command || "").trim()
        const id = serverId
        if (trimmed === "" || busy || id === "") return

        /* Con el botón marcado o con `sudo ` escrito: el backend quita el prefijo,
           así que nunca llega duplicado. */
        const sudo = useSudo || leadingSudo.test(trimmed)
        const password = opts.password || Sudo.get(id)
        const body = { command: trimmed, sudo: sudo }
        if (sudo && password) body.sudoPassword = password
        if (opts.confirm) body.confirm = true

        busy = true
        Api.request("POST", "/agent-data/servers/" + encodeURIComponent(id) + "/commands", body, (ok, data, error) => {
            if (!root || root.serverId !== id) return
            root.busy = false

            if (ok && data) {
                if (sudo && opts.password) Sudo.set(id, opts.password)
                root.entries = root.entries.concat([data])
                root.outputOpen = true
                if (data.home) root.home = data.home
                root.pending = null
                sudoField.text = ""
                field.text = ""
                root.recallIndex = -1
            } else {
                const err = error || {}
                if (err.code === "BLOCKED_COMMAND") {
                    root.pending = { command: trimmed, kind: "blocked", message: err.message || "", hint: err.hint || "" }
                } else if (err.code === "DANGEROUS_COMMAND") {
                    root.pending = { command: trimmed, kind: "danger", message: err.message || "", hint: "" }
                } else if (err.code === "SUDO_REQUIRED" || err.code === "SUDO_PASSWORD") {
                    /* La contraseña en memoria ya no vale (o nunca la hubo): se vuelve a pedir. */
                    Sudo.clear(id)
                    root.pending = {
                        command: trimmed, kind: "sudo", hint: "",
                        message: err.code === "SUDO_PASSWORD" ? (err.message || "") : (err.hint || err.message || "")
                    }
                } else {
                    root.pending = null
                    Toasts.error("No se pudo ejecutar el comando", err.message || "Error de conexión con el servidor")
                }
            }

            /* Los intentos fallidos también se auditan. */
            root.loadAudit()
            root.executed()
            if (root.pendingKind === "sudo") sudoField.forceFocus()
            else field.forceActiveFocus()
        }, 90000)
    }

    function submitSudo() {
        if (pending && sudoField.text !== "") run(pending.command, { password: sudoField.text })
    }

    function resetSession() {
        busy = false
        home = ""
        entries = []
        outputOpen = false
        pending = null
        audit = []
        recallIndex = -1
        draft = ""
        field.text = ""
        sudoField.text = ""
    }
    onServerIdChanged: { resetSession(); loadAudit() }
    /* El asistente lee los últimos resultados y puede dejar un comando en la
       línea; nunca lo ejecuta (eso solo pasa con Enter o el botón). */
    readonly property string assistantKey: "commands:" + serverId
    onAssistantKeyChanged: registerAssistant()
    property string assistantRegistered: ""
    function registerAssistant() {
        if (assistantRegistered !== "") {
            AssistantBridge.unregisterSource(assistantRegistered)
            AssistantBridge.unregisterTarget(assistantRegistered)
        }
        assistantRegistered = assistantKey
        AssistantBridge.registerSource({
            id: assistantKey, type: "command_output",
            title: "Línea de comandos · " + (server && server.name ? server.name : ""),
            read: () => root.transcript(), database: () => null
        })
        AssistantBridge.registerTarget({
            id: assistantKey, kind: "command", label: "la línea de comandos",
            paste: text => root.load(text)
        })
    }
    Component.onDestruction: {
        AssistantBridge.unregisterSource(assistantRegistered)
        AssistantBridge.unregisterTarget(assistantRegistered)
    }
    Component.onCompleted: { registerAssistant(); loadAudit() }

    onPendingKindChanged: if (pendingKind === "sudo") Qt.callLater(() => sudoField.forceFocus())
    onEntriesChanged: Qt.callLater(scrollToEnd)
    onShowOutputChanged: Qt.callLater(scrollToEnd)
    function scrollToEnd() {
        if (!root) return
        outputArea.contentY = Math.max(0, outputArea.contentHeight - outputArea.height)
    }

    /* ── Piezas ────────────────────────────────────────────────────── */
    /* Botón de la barra con estado marcado (salida visible, sudo activo). */
    component BarToggle: Item {
        id: toggle
        property bool on: false
        property string hint: ""
        property string label: ""
        property string iconPath: ""
        property int iconSize: 16
        signal clicked()

        implicitHeight: 44
        implicitWidth: label === "" ? 44 : toggleRow.implicitWidth + 28
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: hint
        Accessible.checkable: true
        Accessible.checked: on
        Keys.onSpacePressed: clicked()
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()

        Glass {
            anchors.fill: parent
            visible: !toggle.on
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            highlighted: toggleHover.hovered
            borderColor: toggle.activeFocus ? Theme.focusRing
                       : toggleHover.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        BrandFill {
            anchors.fill: parent
            visible: toggle.on
            strength: 0.28
        }
        Rectangle {
            anchors.fill: parent
            visible: toggle.on
            radius: Theme.radiusXl
            color: "transparent"
            border.width: 1
            border.color: toggle.activeFocus ? Theme.focusRing : Theme.hairline
        }
        Row {
            id: toggleRow
            anchors.centerIn: parent
            spacing: 8
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                path: toggle.iconPath
                size: toggle.iconSize
                color: Theme.ink(toggle.on || toggleHover.hovered ? 1 : 0.6)
            }
            Label {
                visible: toggle.label !== ""
                anchors.verticalCenter: parent.verticalCenter
                text: toggle.label
                tone: toggle.on || toggleHover.hovered ? 1 : 0.6
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
        HoverHandler { id: toggleHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: toggle.clicked() }
        HoverTip { text: toggle.hint }
    }

    ColumnLayout {
        id: stack
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        spacing: 8

        /* ── Comando no permitido: se queda en la línea para corregirlo ── */
        Glass {
            visible: root.pendingKind === "blocked"
            Layout.fillWidth: true
            implicitHeight: blockedRow.implicitHeight + 32
            variant: "float"
            backdrop: visible ? root.backdrop : null
            borderColor: Qt.alpha(Theme.warn, 0.25)

            RowLayout {
                id: blockedRow
                x: 16; y: 16
                width: parent.width - 32
                spacing: 12

                Icon { Layout.alignment: Qt.AlignTop; Layout.topMargin: 2; name: "alert"; size: 20; color: Theme.warn }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Label {
                        Layout.fillWidth: true
                        text: (root.pending && root.pending.message) || "Comando no permitido"
                        textFormat: Text.PlainText
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                    Label {
                        Layout.fillWidth: true
                        visible: text !== ""
                        text: (root.pending && root.pending.hint) || ""
                        textFormat: Text.PlainText
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                }
                IconButton {
                    Layout.alignment: Qt.AlignTop
                    iconName: "close"
                    size: 28
                    iconSize: 14
                    plain: true
                    hint: "Cerrar (Esc)"
                    onClicked: { root.pending = null; field.forceActiveFocus() }
                }
            }
        }

        /* ── Comando peligroso: pide confirmación explícita ──────────── */
        Glass {
            visible: root.pendingKind === "danger"
            Layout.fillWidth: true
            implicitHeight: dangerRow.implicitHeight + 32
            variant: "float"
            backdrop: visible ? root.backdrop : null
            borderColor: Qt.alpha(Theme.danger, 0.25)

            RowLayout {
                id: dangerRow
                x: 16; y: 16
                width: parent.width - 32
                spacing: 12

                Icon { Layout.alignment: Qt.AlignTop; Layout.topMargin: 2; name: "alert"; size: 20; color: Theme.danger }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Label {
                        Layout.fillWidth: true
                        text: (root.pending && root.pending.message) || "Comando peligroso"
                        textFormat: Text.PlainText
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                    Label {
                        Layout.fillWidth: true
                        text: root.pending ? root.pending.command : ""
                        textFormat: Text.PlainText
                        mono: true
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WrapAnywhere
                        elide: Text.ElideNone
                    }
                    Flow {
                        Layout.fillWidth: true
                        Layout.topMargin: 8
                        spacing: 8
                        SecondaryButton {
                            implicitHeight: 36
                            text: "Cancelar"
                            enabled: !root.busy
                            onClicked: { root.pending = null; field.forceActiveFocus() }
                        }
                        DangerButton {
                            implicitHeight: 36
                            text: root.busy ? "Ejecutando…" : "Ejecutar igualmente"
                            enabled: !root.busy
                            loading: root.busy
                            onClicked: if (root.pending) root.run(root.pending.command, { confirm: true })
                        }
                    }
                }
            }
        }

        /* ── Hace falta la contraseña de sudo ────────────────────────── */
        Glass {
            visible: root.pendingKind === "sudo"
            Layout.fillWidth: true
            implicitHeight: sudoColumn.implicitHeight + 32
            variant: "float"
            backdrop: visible ? root.backdrop : null

            ColumnLayout {
                id: sudoColumn
                x: 16; y: 16
                width: parent.width - 32
                spacing: 0

                Label {
                    Layout.fillWidth: true
                    text: "Hace falta sudo"
                    font.weight: Font.DemiBold
                }
                Label {
                    Layout.fillWidth: true
                    Layout.topMargin: 4
                    text: (root.pending && root.pending.message) || "El usuario SSH no es root y sudo pide contraseña."
                    textFormat: Text.PlainText
                    tone: 0.6
                    font.pixelSize: Theme.textXs
                    lineHeight: 1.35
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }
                GridLayout {
                    id: sudoGrid
                    /* En estrecho, el campo ocupa su propia fila y los botones van debajo. */
                    readonly property bool narrow: root.width < 460
                    Layout.fillWidth: true
                    Layout.topMargin: 12
                    columns: narrow ? 2 : 3
                    columnSpacing: 8
                    rowSpacing: 8

                    GlassField {
                        id: sudoField
                        Layout.fillWidth: true
                        Layout.columnSpan: sudoGrid.narrow ? 2 : 1
                        implicitHeight: 40
                        password: true
                        maximumLength: 256
                        placeholder: "Contraseña del usuario SSH"
                        onAccepted: root.submitSudo()
                        Keys.onEscapePressed: { root.pending = null; field.forceActiveFocus() }
                    }
                    SecondaryButton {
                        Layout.fillWidth: sudoGrid.narrow
                        text: "Cancelar"
                        onClicked: { root.pending = null; field.forceActiveFocus() }
                    }
                    PrimaryButton {
                        Layout.fillWidth: sudoGrid.narrow
                        text: root.busy ? "Ejecutando…" : "Ejecutar"
                        enabled: sudoField.text !== "" && !root.busy
                        loading: root.busy
                        onClicked: root.submitSudo()
                    }
                }
                Label {
                    Layout.fillWidth: true
                    Layout.topMargin: 6
                    text: "Se usa mientras el detalle esté abierto y no se guarda."
                    tone: 0.4
                    font.pixelSize: 11
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }
            }
        }

        /* ── Salida de la sesión ─────────────────────────────────────── */
        Glass {
            visible: root.showOutput && !root.pending
            Layout.fillWidth: true
            implicitHeight: outputHeader.height + 1 + outputArea.height
            variant: "float"
            backdrop: visible ? root.backdrop : null

            Item {
                id: outputHeader
                width: parent.width
                height: 44

                Label {
                    anchors.left: parent.left
                    anchors.leftMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Salida"
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                    font.capitalization: Font.AllUppercase
                    font.letterSpacing: 0.6
                }
                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 4

                    Item {
                        id: clearButton
                        width: clearLabel.implicitWidth + 20
                        height: 28
                        activeFocusOnTab: true
                        Accessible.role: Accessible.Button
                        Accessible.name: "Limpiar la salida"
                        Keys.onReturnPressed: root.clearOutput()
                        Keys.onSpacePressed: root.clearOutput()
                        Rectangle {
                            anchors.fill: parent
                            radius: Theme.radiusLg
                            color: clearHover.hovered ? Theme.tintHover : "transparent"
                            border.width: clearButton.activeFocus ? 1 : 0
                            border.color: Theme.focusRing
                        }
                        Label {
                            id: clearLabel
                            anchors.centerIn: parent
                            text: "Limpiar"
                            tone: clearHover.hovered ? 1 : 0.6
                            font.pixelSize: Theme.textXs
                            font.weight: Font.Medium
                        }
                        HoverHandler { id: clearHover; cursorShape: Qt.PointingHandCursor }
                        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.clearOutput() }
                        HoverTip { text: "Limpiar la salida (Ctrl+L)" }
                    }
                    IconButton {
                        iconName: "close"
                        size: 28
                        iconSize: 14
                        plain: true
                        hint: "Ocultar la salida (Esc)"
                        onClicked: root.outputOpen = false
                    }
                }
            }
            Rectangle {
                id: outputRule
                y: outputHeader.height
                width: parent.width
                height: 1
                color: Theme.line
            }
            ScrollArea {
                id: outputArea
                y: outputHeader.height + 1
                width: parent.width
                height: Math.min(contentHeight, root.outputMax)
                contentHeight: outputColumn.implicitHeight + 32

                ColumnLayout {
                    id: outputColumn
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 16

                    Repeater {
                        model: root.entries

                        ColumnLayout {
                            id: entry
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 4

                            /* Línea de prompt: servidor, ruta, símbolo y comando. */
                            Flow {
                                Layout.fillWidth: true
                                spacing: 8
                                Label {
                                    width: Math.min(implicitWidth, parent.width)
                                    text: root.serverName
                                    textFormat: Text.PlainText
                                    mono: true
                                    color: Theme.brandLight1
                                    font.pixelSize: Theme.textXs
                                }
                                Label {
                                    width: Math.min(implicitWidth, parent.width)
                                    text: root.prettyPath(entry.modelData.cwd || "~", entry.modelData.home)
                                    textFormat: Text.PlainText
                                    mono: true
                                    tone: 0.4
                                    font.pixelSize: Theme.textXs
                                }
                                Label {
                                    text: entry.modelData.sudo ? "#" : "$"
                                    mono: true
                                    color: entry.modelData.sudo ? Theme.tone("amber").text : Theme.ink(0.55)
                                    font.pixelSize: Theme.textXs
                                }
                                Label {
                                    visible: entry.modelData.sudo === true
                                    text: "sudo"
                                    mono: true
                                    color: Theme.tone("amber").text
                                    font.pixelSize: Theme.textXs
                                }
                                Label {
                                    width: Math.min(implicitWidth, parent.width)
                                    text: entry.modelData.command
                                    textFormat: Text.PlainText
                                    mono: true
                                    tone: 0.9
                                    font.pixelSize: Theme.textXs
                                    wrapMode: Text.WrapAnywhere
                                    elide: Text.ElideNone
                                }
                            }
                            /* Salida seleccionable, para poder copiarla. */
                            TextEdit {
                                Layout.fillWidth: true
                                visible: text !== ""
                                text: entry.modelData.output || ""
                                textFormat: TextEdit.PlainText
                                readOnly: true
                                selectByMouse: true
                                wrapMode: TextEdit.WrapAnywhere
                                color: Theme.ink(0.7)
                                selectionColor: Theme.brand1(0.45)
                                selectedTextColor: Theme.ink(1)
                                font.family: Theme.fontMono
                                font.pixelSize: Theme.textXs
                            }
                            Flow {
                                Layout.fillWidth: true
                                Layout.topMargin: 2
                                spacing: 8
                                Badge {
                                    text: root.statusLabel(entry.modelData.status, entry.modelData.exitCode)
                                    tone: root.statusTone(entry.modelData.status)
                                }
                                Label {
                                    height: 18
                                    verticalAlignment: Text.AlignVCenter
                                    text: root.fmtMs(entry.modelData.durationMs)
                                    mono: true
                                    tone: 0.35
                                    font.pixelSize: Theme.textCaption
                                }
                                Label {
                                    visible: entry.modelData.truncated === true
                                    height: 18
                                    verticalAlignment: Text.AlignVCenter
                                    text: "salida recortada a 1 MB"
                                    mono: true
                                    color: Qt.alpha(Theme.tone("amber").text, 0.8)
                                    font.pixelSize: Theme.textCaption
                                }
                            }
                        }
                    }
                }
            }
        }

        /* ── Barra ───────────────────────────────────────────────────── */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 60
            variant: "float"
            backdrop: root.backdrop

            RowLayout {
                x: 8; y: 8
                width: parent.width - 16
                height: 44
                spacing: 8

                Glass {
                    Layout.fillWidth: true
                    Layout.minimumWidth: 120
                    implicitHeight: 44
                    variant: "input"
                    focused: field.activeFocus

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 14
                        anchors.rightMargin: 14
                        spacing: 8

                        Label {
                            text: "~"
                            mono: true
                            tone: 0.4
                            HoverTip { text: root.home || "Home del usuario SSH" }
                        }
                        Label {
                            text: root.asRoot ? "#" : "$"
                            mono: true
                            color: root.asRoot ? Theme.tone("amber").text : Theme.brandLight1
                        }
                        Label {
                            visible: root.useSudo && !root.typedSudo
                            text: "sudo"
                            mono: true
                            color: Theme.tone("amber").text
                        }
                        Item {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true

                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width
                                visible: field.text.length === 0 && field.preeditText.length === 0
                                text: root.busy ? "Ejecutando…" : "Ejecutar un comando en el servidor… (↑/↓ historial)"
                                mono: true
                                tone: 0.25
                            }
                            TextInput {
                                id: field
                                anchors.fill: parent
                                verticalAlignment: TextInput.AlignVCenter
                                color: Theme.ink(0.9)
                                opacity: root.busy ? 0.6 : 1
                                selectionColor: Theme.brand1(0.45)
                                selectedTextColor: Theme.ink(1)
                                font.family: Theme.fontMono
                                font.pixelSize: Theme.textSm
                                /* Mismo tope que el backend (`MAX_COMMAND_LENGTH`). */
                                maximumLength: 4000
                                inputMethodHints: Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase
                                selectByMouse: true
                                activeFocusOnTab: true
                                /* Mientras corre un comando no se edita, pero el foco no se pierde. */
                                readOnly: root.busy
                                Accessible.name: "Línea de comandos"

                                onTextEdited: {
                                    root.recallIndex = -1
                                    if (root.pendingKind === "blocked") root.pending = null
                                }
                                Keys.onPressed: event => {
                                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                                        event.accepted = true
                                        root.run(field.text)
                                        return
                                    }
                                    if (event.key === Qt.Key_Escape) {
                                        event.accepted = true
                                        if (root.pending) root.pending = null
                                        else root.outputOpen = false
                                        return
                                    }
                                    if (root.busy) return
                                    if (event.key === Qt.Key_Up && root.recall.length > 0) {
                                        event.accepted = true
                                        const next = Math.min(root.recallIndex + 1, root.recall.length - 1)
                                        if (root.recallIndex === -1) root.draft = field.text
                                        root.recallIndex = next
                                        field.text = root.recall[next]
                                        field.cursorPosition = field.text.length
                                        return
                                    }
                                    if (event.key === Qt.Key_Down && root.recallIndex >= 0) {
                                        event.accepted = true
                                        const next = root.recallIndex - 1
                                        root.recallIndex = next
                                        field.text = next === -1 ? root.draft : root.recall[next]
                                        field.cursorPosition = field.text.length
                                        return
                                    }
                                    if (event.key === Qt.Key_L && (event.modifiers & Qt.ControlModifier)) {
                                        event.accepted = true
                                        root.clearOutput()
                                    }
                                }
                            }
                        }
                        Spinner {
                            visible: root.busy
                            size: 16
                            color: Theme.ink(0.55)
                        }
                    }

                    /* Un clic en cualquier punto del campo lo enfoca. */
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: field.forceActiveFocus()
                    }
                    HoverHandler { cursorShape: Qt.IBeamCursor }
                }

                BarToggle {
                    visible: root.entries.length > 0
                    on: root.outputOpen
                    hint: root.outputOpen ? "Ocultar la salida" : "Mostrar la salida"
                    iconPath: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM7 9l3 3-3 3M13 15h4"
                    onClicked: root.outputOpen = !root.outputOpen
                }
                BarToggle {
                    on: root.useSudo
                    hint: "Ejecutar los comandos con sudo"
                    label: "sudo"
                    iconSize: 14
                    iconPath: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"
                    onClicked: { root.useSudo = !root.useSudo; field.forceActiveFocus() }
                }
            }
        }
    }
}
