import QtQuick
import QtQuick.Layouts
import StartCode

/* Asistente de IA flotante. Conversa: lee los datos del panel de la cuenta
   (en el backend) y lo que la pantalla ofrece (terminal, línea de comandos,
   editor y resultados SQL), y propone comandos o consultas que el usuario
   puede pegar donde corresponda. También prepara altas de servidores y
   conexiones que el usuario revisa y guarda en el formulario de siempre.
   Nunca ejecuta ni crea nada por su cuenta.

   Se instancia una vez sobre el área de la app, anclado a la derecha; se
   muestra según `AssistantBridge.open`. La conversación es la memoria del
   backend: sigue ahí al reiniciar, en otro equipo o con otro proveedor. */
Item {
    id: root

    /* El usuario quiere ir a Configuración → Asistente IA. */
    signal settingsRequested()

    /* Lo que queda detrás y se desenfoca (el fondo de la app); opcional. */
    property Item backdrop: null

    /* Tope de lo que se adjunta por fuente (~3000 tokens): lo más reciente es lo que importa. */
    readonly property int maxSourceChars: 12000
    /* El modelo puede tardar bastante más que el resto de la API. */
    readonly property int chatTimeout: 150000

    readonly property var suggestions: [
        "¿Qué servidores tienen problemas ahora mismo?",
        "Explícame la salida de la terminal",
        "Escribe una consulta para ver las tablas más pesadas",
        "Agrega una conexión PostgreSQL a 10.0.0.5"
    ]
    /* Comandos del chat: se escriben solos en la entrada y no se envían al modelo. */
    readonly property var commands: [
        { name: "/clear", hint: "Limpia la vista del chat; el asistente conserva la conversación y la memoria" },
        { name: "/resume", hint: "Guarda la conversación en la memoria del asistente y limpia el chat" }
    ]

    readonly property string userId: Auth.user && Auth.user.id !== undefined && Auth.user.id !== null ? String(Auth.user.id) : ""
    readonly property string clearedKey: "assistant_cleared:" + userId

    /* Configuración del asistente (null si no hay ninguno conectado). */
    property var config: null
    property bool configLoading: true
    property var messages: []
    /* `/clear` solo oculta: se guarda en el equipo la fecha del último mensaje
       visto (la del servidor, no la del reloj local) y se muestran los posteriores. */
    property string clearedAt: ""
    property bool chatPending: false
    property string chatError: ""
    property bool summarizePending: false
    property bool clearPending: false
    property bool confirmClear: false
    /* Fuentes que el usuario quitó de la pregunta: `{ id: true }`. */
    property var excluded: ({})
    /* Invalida las respuestas del historial pedidas antes de un envío o un borrado. */
    property int historySeq: 0
    /* Hasta que el panel está creado, el cambio inicial de usuario no cuenta. */
    property bool started: false

    readonly property var provider: config ? (logic.providers.find(p => p.id === config.provider) || null) : null
    readonly property bool ready: !!config && !!config.enabled
    readonly property bool busy: chatPending || summarizePending
    /* Lo que se ve: lo posterior al último `/clear`. El backend sigue usándolo todo como contexto. */
    readonly property var shownMessages: {
        if (!clearedAt) return messages
        const cut = Date.parse(clearedAt)
        /* La pregunta en vuelo lleva la hora local: se muestra siempre. */
        return messages.filter(m => String(m.id).startsWith("pending-") || Date.parse(m.createdAt) > cut)
    }
    readonly property var sources: AssistantBridge.sources || []
    readonly property var activeSources: sources.filter(s => !excluded[s.id])

    /* Mientras se escribe `/…` sin espacios, la lista de comandos que coinciden. */
    readonly property string typed: inputEdit.text.replace(/^\s+/, "")
    readonly property var commandHints: /^\/\S*$/.test(typed) ? commands.filter(c => c.name.startsWith(typed.toLowerCase())) : []

    implicitWidth: 440
    implicitHeight: 640
    visible: AssistantBridge.open

    AssistantActions { id: logic }
    FloatMenu { id: menu }

    function toList(value) {
        if (Array.isArray(value)) return value
        return value && value.length !== undefined ? Array.from(value) : []
    }

    function errorText(error) {
        return error && typeof error.message === "string" && error.message.trim() ? error.message : "No se pudo contactar con el asistente"
    }

    function readCleared() {
        const value = userId ? App.storeGet(clearedKey) : undefined
        clearedAt = typeof value === "string" ? value : ""
    }

    function loadConfig() {
        if (!userId) return
        const uid = userId
        Api.request("GET", "/assistant/config", null, (ok, data, error) => {
            if (uid !== root.userId) return
            root.configLoading = false
            if (!ok) return
            root.config = data && typeof data === "object" && data.provider !== undefined ? data : null
        })
    }

    function loadMessages() {
        if (!userId || busy || clearPending) return
        const uid = userId
        const seq = ++historySeq
        Api.request("GET", "/assistant/messages?limit=100", null, (ok, data, error) => {
            if (uid !== root.userId || seq !== root.historySeq) return
            if (ok) root.messages = root.toList(data)
        })
    }

    /* Cada cuenta tiene su propio asistente: al cambiar de usuario no queda nada del anterior. */
    function resetForUser() {
        historySeq++
        config = null
        configLoading = true
        messages = []
        chatPending = false
        chatError = ""
        summarizePending = false
        clearPending = false
        confirmClear = false
        excluded = ({})
        setInput("")
        readCleared()
        loadConfig()
        if (AssistantBridge.open) loadMessages()
    }

    function setInput(text) {
        inputEdit.text = text
        inputEdit.cursorPosition = inputEdit.length
    }

    function runCommand(name) {
        setInput("")
        if (name === "/clear") {
            const last = messages[messages.length - 1]
            if (!last || !shownMessages.length) { Toasts.info("El chat ya está limpio", ""); return }
            chatError = ""
            App.storeSet(clearedKey, last.createdAt)
            clearedAt = last.createdAt
            return
        }
        if (name === "/resume") {
            if (!messages.length) { Toasts.info("No hay conversación que resumir", ""); return }
            chatError = ""
            summarize()
        }
    }

    /* `/resume`: lo pendiente pasa al resumen de la memoria y la conversación se vacía. */
    function summarize() {
        const uid = userId
        historySeq++
        summarizePending = true
        Api.request("POST", "/assistant/memory/summarize", null, (ok, data, error) => {
            if (uid !== root.userId) return
            root.summarizePending = false
            if (!ok) { Toasts.error("No se pudo resumir", root.errorText(error)); return }
            root.messages = []
            const count = data && data.summarized ? data.summarized : 0
            Toasts.success("Memoria actualizada",
                           count ? count + " mensajes resumidos; el chat quedó limpio." : "Ya estaba todo resumido; el chat quedó limpio.")
        }, chatTimeout)
    }

    function send(text) {
        const question = String(text).trim()
        if (!question || busy || !ready) return
        const command = commands.find(c => c.name === question.toLowerCase())
        if (command) { runCommand(command.name); return }
        /* Se lee justo al enviar: es lo que se ve ahora en la terminal o el editor. */
        const context = []
        activeSources.forEach(s => {
            const content = String(s.read() || "").slice(-maxSourceChars)
            if (!content.trim()) return
            const item = { type: s.type, title: s.title, content: content }
            const database = s.database ? s.database() : null
            if (database) item.database = database
            context.push(item)
        })
        setInput("")

        /* Se muestra al instante y, con la respuesta, se sustituye por lo que guardó el backend (ya sin secretos). */
        const uid = userId
        const pendingId = "pending-" + Date.now()
        historySeq++
        chatError = ""
        chatPending = true
        messages = messages.concat([{
            id: pendingId, role: "user", content: question,
            provider: null, model: null, createdAt: new Date().toISOString()
        }])
        Api.request("POST", "/assistant/chat", { message: question, context: context }, (ok, data, error) => {
            if (uid !== root.userId) return
            const rest = root.messages.filter(m => m.id !== pendingId)
            if (ok && data && data.question && data.answer) {
                root.messages = rest.concat([data.question, data.answer])
            } else {
                /* El backend no guarda una pregunta sin respuesta: tampoco se queda aquí. */
                root.messages = rest
                root.chatError = root.errorText(ok ? null : error)
            }
            root.chatPending = false
        }, chatTimeout)
    }

    function clearMemory() {
        if (clearPending) return
        const uid = userId
        historySeq++
        clearPending = true
        Api.request("DELETE", "/assistant/memory", null, (ok, data, error) => {
            if (uid !== root.userId) return
            root.clearPending = false
            root.confirmClear = false
            root.chatError = ""
            if (ok) root.messages = []
        })
    }

    /* El formulario se abre en la pantalla: se cierra el panel para verlo entero. */
    function review(action) {
        AssistantBridge.open = false
        if (action.kind === "server") AssistantBridge.serverFormRequested(action.data)
        else AssistantBridge.connectionFormRequested(action.data)
    }

    function toggleSource(id) {
        const next = Object.assign({}, excluded)
        if (next[id]) delete next[id]; else next[id] = true
        excluded = next
    }

    /* Al final de la conversación. Mientras dura `pin`, sigue al contenido que aún se está midiendo. */
    function scrollToEnd(animated) {
        pin.restart()
        Qt.callLater(() => {
            const end = Math.max(0, list.contentHeight - list.height)
            scrollAnim.stop()
            if (!animated || Math.abs(end - list.contentY) < 2) { list.contentY = end; return }
            scrollAnim.from = list.contentY
            scrollAnim.to = end
            scrollAnim.start()
        })
    }

    onUserIdChanged: if (started) resetForUser()
    onReadyChanged: if (ready && AssistantBridge.open) inputEdit.forceActiveFocus()
    Component.onCompleted: {
        started = true
        readCleared()
        loadConfig()
        if (AssistantBridge.open) loadMessages()
    }
    onMessagesChanged: scrollToEnd(true)
    onBusyChanged: scrollToEnd(true)

    Connections {
        target: AssistantBridge
        function onOpenChanged() {
            if (!AssistantBridge.open) return
            /* La configuración pudo cambiar en Configuración → Asistente IA mientras estaba cerrado. */
            root.loadConfig()
            root.loadMessages()
            enter.restart()
            /* Al abrir, directo al final sin animación. */
            root.scrollToEnd(false)
            /* Diferido: en este instante el panel aún no es visible y el foco
               no prendería (lo escrito iría a lo que tuviera el foco antes). */
            Qt.callLater(() => { if (root.ready && AssistantBridge.open) inputEdit.forceActiveFocus() })
        }
    }

    Timer { id: pin; interval: 400 }
    NumberAnimation {
        id: scrollAnim
        target: list
        property: "contentY"
        duration: Theme.moSlow
        easing.type: Easing.OutCubic
    }

    /* Entrada: aparece subiendo unos píxeles. La salida es inmediata. */
    ParallelAnimation {
        id: enter
        NumberAnimation { target: card; property: "opacity"; from: 0; to: 1; duration: Theme.moSlow }
        NumberAnimation {
            target: rise; property: "y"; from: Theme.moRise; to: 0; duration: Theme.moSlow
            easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
        }
    }

    /* ── Piezas ───────────────────────────────────────────────────── */

    /* Botón de texto pequeño de la cabecera. */
    component TextButton: Item {
        id: textButton

        property string label: ""
        property bool danger: false
        signal clicked()

        implicitWidth: textLabel.implicitWidth + 20
        implicitHeight: 32
        opacity: enabled ? 1 : 0.5
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: label
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
        Keys.onSpacePressed: clicked()

        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            color: textButton.danger ? Qt.alpha(Theme.tone("rose").base, textHover.hovered ? 0.2 : 0.1)
                                     : textHover.hovered ? Theme.tintHover : "transparent"
            border.width: textButton.danger || textButton.activeFocus ? 1 : 0
            border.color: textButton.activeFocus ? Theme.focusRing : Qt.alpha(Theme.tone("rose").base, 0.2)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Label {
            id: textLabel
            anchors.centerIn: parent
            text: textButton.label
            color: textButton.danger ? Theme.tone("rose").text : Theme.ink(textHover.hovered ? 1 : 0.6)
            font.pixelSize: 11
            font.weight: textButton.danger ? Font.Medium : Font.Normal
        }
        HoverHandler { id: textHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: textButton.clicked() }
    }

    /* Etiqueta de «Puede leer»: fija (datos de la cuenta) o conmutables (fuentes de la pantalla). */
    component SourceChip: Item {
        id: chip

        property string label: ""
        property string hint: ""
        property bool on: true
        property bool toggles: false
        /* Ancho disponible: un título largo se recorta en vez de desbordar. */
        property real maxWidth: 400
        signal clicked()

        width: Math.min(chipRow.implicitWidth + 16, maxWidth)
        height: 22
        activeFocusOnTab: toggles
        Accessible.role: toggles ? Accessible.Button : Accessible.StaticText
        Accessible.name: label
        Accessible.checkable: toggles
        Accessible.checked: on
        Keys.onReturnPressed: if (toggles) clicked()
        Keys.onEnterPressed: if (toggles) clicked()
        Keys.onSpacePressed: if (toggles) clicked()

        Rectangle {
            anchors.fill: parent
            visible: !chip.toggles
            radius: Theme.radiusMd
            color: Theme.tintActive
        }
        BrandFill {
            anchors.fill: parent
            visible: chip.toggles && chip.on
            radius: Theme.radiusMd
            strength: 0.28
        }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusMd
            color: "transparent"
            border.width: 1
            border.color: chip.activeFocus ? Theme.focusRing : Theme.hairline
        }
        Row {
            id: chipRow
            x: 8
            anchors.verticalCenter: parent.verticalCenter
            spacing: 4
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "eye"
                size: 12
                color: Theme.ink(!chip.toggles ? 0.6 : chip.on ? 0.85 : 0.35)
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, Math.max(40, chip.maxWidth - 32))
                text: chip.label
                textFormat: Text.PlainText
                tone: !chip.toggles ? 0.6 : chip.on ? 0.85 : 0.35
                font.pixelSize: 11
                font.strikeout: chip.toggles && !chip.on
            }
        }
        HoverHandler { cursorShape: chip.toggles ? Qt.PointingHandCursor : Qt.ArrowCursor }
        TapHandler { enabled: chip.toggles; gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: chip.clicked() }
        HoverTip { text: chip.hint }
    }

    /* ── Panel ────────────────────────────────────────────────────── */
    Item {
        id: card
        anchors.fill: parent
        transform: Translate { id: rise }

        Glass {
            anchors.fill: parent
            variant: "float"
            elevation: "modal"
            radius: Theme.radius2xl
            backdrop: root.visible ? root.backdrop : null
        }
        /* Nada de lo que hay debajo recibe clics, rueda ni paso del ratón. */
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.AllButtons
            hoverEnabled: true
            onWheel: wheel => wheel.accepted = true
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 0

            /* Cabecera */
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: 60

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 16
                    anchors.rightMargin: 16
                    spacing: 12

                    Item {
                        Layout.preferredWidth: 36
                        Layout.preferredHeight: 36
                        Elevation { anchors.fill: parent; level: "brandSm"; radius: Theme.radiusXl }
                        BrandFill { anchors.fill: parent; radius: Theme.radiusXl }
                        Icon { anchors.centerIn: parent; name: "spark"; size: 16; color: Theme.onBrand }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 1
                        Label {
                            Layout.fillWidth: true
                            text: "Asistente IA"
                            font.weight: Font.DemiBold
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 0
                            Label {
                                text: root.provider ? root.provider.vendor + " · " : "Sin conectar"
                                tone: 0.45
                                font.pixelSize: 11
                            }
                            Label {
                                Layout.fillWidth: true
                                text: root.provider && root.config.model ? root.config.model : ""
                                textFormat: Text.PlainText
                                mono: true
                                tone: 0.45
                                font.pixelSize: 11
                            }
                        }
                    }
                    /* Borrar la conversación y la memoria, con confirmación en el sitio. */
                    RowLayout {
                        visible: root.messages.length > 0
                        spacing: 4
                        TextButton {
                            visible: root.confirmClear
                            label: "Cancelar"
                            onClicked: root.confirmClear = false
                        }
                        TextButton {
                            visible: root.confirmClear
                            label: "Borrar memoria"
                            danger: true
                            enabled: !root.clearPending
                            onClicked: root.clearMemory()
                        }
                        IconButton {
                            visible: !root.confirmClear
                            iconName: "trash"
                            size: 32
                            plain: true
                            hint: "Borrar la conversación y lo que recuerda el asistente"
                            onClicked: root.confirmClear = true
                        }
                    }
                    IconButton {
                        iconName: "close"
                        size: 32
                        plain: true
                        hint: "Cerrar asistente"
                        onClicked: AssistantBridge.open = false
                    }
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: 1
                    color: Theme.line
                }
            }

            /* Conversación */
            ScrollArea {
                id: list
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentHeight: conversation.implicitHeight + 32
                onContentHeightChanged: {
                    if (!pin.running) return
                    scrollAnim.stop()
                    contentY = Math.max(0, contentHeight - height)
                }
                onMovementStarted: pin.stop()

                Column {
                    id: conversation
                    x: 16; y: 16
                    width: list.width - 32
                    spacing: 16

                    /* Sin asistente conectado o desactivado */
                    Glass {
                        visible: !root.configLoading && !root.ready
                        width: parent.width
                        height: setupColumn.implicitHeight + 32
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl

                        Column {
                            id: setupColumn
                            x: 16; y: 16
                            width: parent.width - 32
                            spacing: 12

                            Label {
                                width: parent.width
                                text: root.config ? "El asistente está desactivado" : "Conecta un asistente de IA"
                                font.weight: Font.Medium
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                            Label {
                                width: parent.width
                                text: "Usa tu propia clave de Anthropic, OpenAI o Google Gemini. Cada cuenta tiene su propio asistente."
                                tone: 0.55
                                font.pixelSize: Theme.textXs
                                lineHeight: 1.35
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                            PrimaryButton {
                                implicitHeight: 36
                                text: "Ir a Configuración"
                                onClicked: {
                                    AssistantBridge.open = false
                                    root.settingsRequested()
                                }
                            }
                        }
                    }

                    /* Conversación vacía: qué se le puede pedir */
                    Column {
                        visible: root.ready && root.shownMessages.length === 0
                        width: parent.width
                        spacing: 12

                        Label {
                            width: parent.width
                            text: "Pregunta sobre tus servidores, bases de datos, la terminal o una consulta. Te propongo comandos y SQL para que los pegues y decidas si ejecutarlos, y puedo preparar el alta de un servidor o de una conexión a base de datos."
                            tone: 0.7
                            lineHeight: 1.35
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Column {
                            width: parent.width
                            spacing: 6

                            Repeater {
                                model: root.suggestions
                                delegate: Glass {
                                    id: suggestion
                                    required property string modelData
                                    width: parent.width
                                    height: suggestionLabel.implicitHeight + 16
                                    variant: "soft"
                                    elevation: "flat"
                                    radius: Theme.radiusXl
                                    highlighted: suggestionHover.hovered || suggestion.activeFocus
                                    activeFocusOnTab: true
                                    Accessible.role: Accessible.Button
                                    Accessible.name: modelData
                                    Keys.onReturnPressed: root.send(modelData)
                                    Keys.onEnterPressed: root.send(modelData)
                                    Keys.onSpacePressed: root.send(modelData)

                                    Label {
                                        id: suggestionLabel
                                        x: 12; y: 8
                                        width: parent.width - 24
                                        text: suggestion.modelData
                                        tone: 0.75
                                        font.pixelSize: Theme.textXs
                                        wrapMode: Text.WordWrap
                                        elide: Text.ElideNone
                                    }
                                    HoverHandler { id: suggestionHover; cursorShape: Qt.PointingHandCursor }
                                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.send(suggestion.modelData) }
                                }
                            }
                        }
                    }

                    Repeater {
                        model: root.shownMessages.length
                        delegate: AssistantMessage {
                            id: bubble
                            required property int index
                            width: conversation.width
                            /* Por índice: al reasignar la lista solo cambia el contenido de cada fila. */
                            message: root.shownMessages[index] || null
                            targets: AssistantBridge.targets || []
                            onReview: action => root.review(action)
                            onMenuRequested: (item, px, py) => menu.openAt(item, px, py, [{
                                label: "Copiar mensaje", icon: "copy",
                                action: () => { App.copy(bubble.content); Toasts.success("Copiado", "") }
                            }])
                        }
                    }

                    /* Esperando al modelo */
                    Row {
                        visible: root.busy
                        width: parent.width
                        spacing: 10

                        Item {
                            width: 28; height: 28
                            BrandFill { anchors.fill: parent; radius: Theme.radiusLg; strength: 0.28 }
                            Rectangle {
                                anchors.fill: parent
                                radius: Theme.radiusLg
                                color: "transparent"
                                border.width: 1
                                border.color: Theme.hairline
                            }
                            Icon {
                                id: pulse
                                anchors.centerIn: parent
                                name: "spark"
                                size: 14
                                color: Theme.ink(0.85)
                                SequentialAnimation on opacity {
                                    running: root.busy && root.visible && !Theme.reducedMotion
                                    loops: Animation.Infinite
                                    NumberAnimation { from: 1; to: 0.4; duration: 1000; easing.type: Easing.InOutQuad }
                                    NumberAnimation { from: 0.4; to: 1; duration: 1000; easing.type: Easing.InOutQuad }
                                }
                            }
                        }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - 38
                            text: root.summarizePending ? "Resumiendo la conversación en la memoria…" : "Pensando…"
                            tone: 0.45
                            font.pixelSize: Theme.textXs
                        }
                    }

                    /* La última pregunta no obtuvo respuesta */
                    Glass {
                        visible: root.chatError !== ""
                        width: parent.width
                        height: errorLabel.implicitHeight + 24
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        borderColor: Qt.alpha(Theme.tone("rose").base, 0.2)

                        Label {
                            id: errorLabel
                            x: 12; y: 12
                            width: parent.width - 24
                            text: root.chatError
                            textFormat: Text.PlainText
                            color: Theme.tone("rose").text
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.Wrap
                            elide: Text.ElideNone
                        }
                    }
                }
            }

            /* Contexto adjunto + entrada */
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: footer.implicitHeight + 24

                Rectangle {
                    width: parent.width
                    height: 1
                    color: Theme.line
                }
                Column {
                    id: footer
                    x: 12; y: 12
                    width: parent.width - 24
                    spacing: 8

                    Flow {
                        id: chipFlow
                        width: parent.width
                        spacing: 6

                        Item {
                            width: readsLabel.implicitWidth + 4
                            height: 22
                            Label {
                                id: readsLabel
                                anchors.verticalCenter: parent.verticalCenter
                                text: "PUEDE LEER"
                                tone: 0.35
                                font.pixelSize: Theme.textCaption
                                font.weight: Font.DemiBold
                                font.letterSpacing: 0.5
                            }
                        }
                        SourceChip {
                            label: "Datos de tu cuenta"
                            maxWidth: chipFlow.width
                            hint: "Servidores, métricas, conexiones, auditorías y notificaciones de tu cuenta"
                        }
                        Repeater {
                            model: root.sources.length
                            delegate: SourceChip {
                                required property int index
                                /* Por índice: al pasar por un modelo, el objeto perdería su función `read`. */
                                readonly property var source: root.sources[index] || ({ id: "", title: "" })
                                toggles: true
                                maxWidth: chipFlow.width
                                on: !root.excluded[source.id]
                                label: source.title || ""
                                hint: on ? "Se adjunta a la pregunta (clic para quitar)" : "No se adjunta (clic para incluir)"
                                onClicked: root.toggleSource(source.id)
                            }
                        }
                    }

                    /* Comandos que coinciden con lo escrito */
                    Glass {
                        visible: root.commandHints.length > 0
                        width: parent.width
                        height: hintColumn.implicitHeight + 8
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        Accessible.role: Accessible.List
                        Accessible.name: "Comandos"

                        Column {
                            id: hintColumn
                            x: 4; y: 4
                            width: parent.width - 8

                            Repeater {
                                model: root.commandHints
                                delegate: Item {
                                    id: hintRow
                                    required property var modelData
                                    width: hintColumn.width
                                    height: 28
                                    Accessible.role: Accessible.ListItem
                                    Accessible.name: modelData.name

                                    Rectangle {
                                        anchors.fill: parent
                                        radius: Theme.radiusLg
                                        color: hintHover.hovered ? Theme.tintHover : "transparent"
                                    }
                                    RowLayout {
                                        anchors.fill: parent
                                        anchors.leftMargin: 10
                                        anchors.rightMargin: 10
                                        spacing: 8
                                        Label {
                                            text: hintRow.modelData.name
                                            mono: true
                                            tone: 0.9
                                            font.pixelSize: Theme.textXs
                                        }
                                        Label {
                                            Layout.fillWidth: true
                                            text: hintRow.modelData.hint
                                            tone: 0.45
                                            font.pixelSize: 11
                                        }
                                    }
                                    HoverHandler { id: hintHover; cursorShape: Qt.PointingHandCursor }
                                    TapHandler {
                                        gesturePolicy: TapHandler.ReleaseWithinBounds
                                        onTapped: {
                                            root.setInput(hintRow.modelData.name)
                                            inputEdit.forceActiveFocus()
                                        }
                                    }
                                }
                            }
                        }
                    }

                    /* Entrada: dos líneas como mínimo; crece hasta 160 px y luego desplaza. */
                    Glass {
                        id: inputBox
                        width: parent.width
                        height: Math.min(160, Math.max(Math.ceil(inputMetrics.lineSpacing * 2), inputEdit.implicitHeight)) + 16
                        variant: "input"
                        radius: Theme.radiusXl
                        focused: inputEdit.activeFocus

                        FontMetrics { id: inputMetrics; font: inputEdit.font }

                        Flickable {
                            id: inputFlick
                            x: 12; y: 8
                            width: parent.width - 12 - 8 - 36 - 12
                            height: parent.height - 16
                            contentWidth: width
                            contentHeight: inputEdit.height
                            clip: true
                            boundsBehavior: Flickable.StopAtBounds
                            interactive: contentHeight > height

                            /* El cursor siempre a la vista al escribir más de lo que cabe. */
                            function follow(rect) {
                                if (rect.y < contentY) contentY = rect.y
                                else if (rect.y + rect.height > contentY + height) contentY = rect.y + rect.height - height
                            }

                            Label {
                                width: inputFlick.width
                                visible: inputEdit.length === 0 && inputEdit.preeditText === ""
                                text: root.ready ? "Escribe tu pregunta… (Shift+Enter, nueva línea · /clear · /resume)" : "Conecta un asistente en Configuración"
                                tone: 0.3
                                opacity: root.ready ? 1 : 0.5
                                wrapMode: Text.WordWrap
                                elide: Text.ElideRight
                                maximumLineCount: 2
                            }
                            TextEdit {
                                id: inputEdit
                                width: inputFlick.width
                                height: Math.max(inputFlick.height, implicitHeight)
                                enabled: root.ready
                                opacity: enabled ? 1 : 0.5
                                textFormat: TextEdit.PlainText
                                wrapMode: TextEdit.Wrap
                                selectByMouse: true
                                activeFocusOnTab: true
                                color: Theme.ink(0.9)
                                selectionColor: Theme.brand1(0.45)
                                selectedTextColor: Theme.ink(1)
                                font.family: Theme.fontUi
                                font.pixelSize: Theme.textSm
                                Accessible.name: "Pregunta para el asistente"
                                onCursorRectangleChanged: inputFlick.follow(cursorRectangle)

                                Keys.onPressed: event => {
                                    if (event.key === Qt.Key_Tab) {
                                        event.accepted = true
                                        /* Tab completa el comando que se está escribiendo; si no, pasa al siguiente control. */
                                        if (root.commandHints.length === 1 && root.typed !== root.commandHints[0].name)
                                            root.setInput(root.commandHints[0].name)
                                        else
                                            inputEdit.nextItemInFocusChain(true).forceActiveFocus()
                                        return
                                    }
                                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                                        event.accepted = true
                                        if (event.modifiers & Qt.ShiftModifier) {
                                            /* Salto de línea real (por defecto se insertaría un separador U+2028). */
                                            inputEdit.remove(inputEdit.selectionStart, inputEdit.selectionEnd)
                                            inputEdit.insert(inputEdit.cursorPosition, "\n")
                                        } else {
                                            root.send(inputEdit.text)
                                        }
                                        return
                                    }
                                    if (event.key === Qt.Key_Escape) {
                                        event.accepted = true
                                        AssistantBridge.open = false
                                    }
                                }
                            }
                        }
                        HoverHandler { cursorShape: Qt.IBeamCursor }

                        Item {
                            id: sendButton
                            readonly property bool usable: root.ready && inputEdit.text.trim() !== "" && !root.busy
                            anchors.right: parent.right
                            anchors.rightMargin: 8
                            anchors.bottom: parent.bottom
                            anchors.bottomMargin: 8
                            width: 36; height: 36
                            opacity: usable ? 1 : 0.4
                            activeFocusOnTab: usable
                            Accessible.role: Accessible.Button
                            Accessible.name: "Enviar"
                            Keys.onReturnPressed: if (usable) root.send(inputEdit.text)
                            Keys.onEnterPressed: if (usable) root.send(inputEdit.text)
                            Keys.onSpacePressed: if (usable) root.send(inputEdit.text)

                            Elevation { anchors.fill: parent; level: "brandSm"; radius: Theme.radiusLg }
                            BrandFill { anchors.fill: parent; radius: Theme.radiusLg }
                            Rectangle {
                                visible: sendButton.activeFocus
                                anchors.fill: parent
                                anchors.margins: -3
                                radius: Theme.radiusLg + 3
                                color: "transparent"
                                border.width: 2
                                border.color: Theme.focusRing
                            }
                            Icon {
                                anchors.centerIn: parent
                                path: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                                size: 16
                                color: Theme.onBrand
                            }
                            HoverHandler { cursorShape: sendButton.usable ? Qt.PointingHandCursor : Qt.ArrowCursor }
                            TapHandler {
                                enabled: sendButton.usable
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: root.send(inputEdit.text)
                            }
                        }
                    }

                    RowLayout {
                        width: parent.width
                        spacing: 4
                        Icon {
                            Layout.alignment: Qt.AlignTop
                            Layout.topMargin: 1
                            name: "lock"
                            size: 12
                            color: Theme.ink(0.35)
                        }
                        Label {
                            Layout.fillWidth: true
                            text: "No ejecuta comandos ni consultas y no ve llaves SSH ni contraseñas. Las altas que proponga las confirmas tú."
                            tone: 0.35
                            font.pixelSize: Theme.textCaption
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                }
            }
        }
    }
}
