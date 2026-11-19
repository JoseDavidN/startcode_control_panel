import QtQuick
import StartCode

/* Pestaña Asistente IA: proveedor, modelo y clave de API del asistente de la
   cuenta, prueba de conexión y memoria. Solo la configuración: el chat es
   otra pieza. */
Column {
    id: root

    /* Sin lista fija de modelos: se piden al proveedor. `preferred` solo decide
       cuál queda elegido si está entre los disponibles. */
    readonly property var providers: [
        { id: "anthropic", name: "Claude", vendor: "Anthropic", keyHint: "sk-ant-…",
          keyUrl: "https://console.anthropic.com/settings/keys", preferred: "claude-opus-5-5" },
        { id: "openai", name: "ChatGPT", vendor: "OpenAI", keyHint: "sk-…",
          keyUrl: "https://platform.openai.com/api-keys", preferred: "gpt-5" },
        { id: "gemini", name: "Gemini", vendor: "Google", keyHint: "AIza…",
          keyUrl: "https://aistudio.google.com/apikey", preferred: "gemini-flash-latest" }
    ]

    /* `{ provider, model, apiKeyHint, enabled, updatedAt }`; null sin asistente conectado. */
    property var config: null
    property bool configLoading: true
    /* `{ summary, messageCount, updatedAt }` */
    property var memory: null

    property string provider: "anthropic"
    property string model: ""
    readonly property string apiKey: keyField.text
    /* `{ ok, text }` */
    property var msg: null
    property bool confirmClear: false

    property bool saving: false
    property bool removing: false
    property bool testing: false
    property bool clearing: false

    readonly property var info: providers.find(p => p.id === provider) || providers[0]
    /* Una clave es de un proveedor: al cambiarlo, la guardada ya no sirve. */
    readonly property bool keepsKey: !!config && config.provider === provider
    readonly property bool dirty: !config || config.provider !== provider || config.model !== model.trim() || apiKey.trim() !== ""
    readonly property bool canSave: model.trim() !== "" && (keepsKey || apiKey.trim().length >= 8) && !saving

    /* ── Modelos en vivo del proveedor, con la clave escrita o la guardada ── */
    /* La clave se toma cuando deja de cambiar 600 ms: no se pide por cada tecla. */
    property string debouncedKey: ""
    readonly property bool canListModels: debouncedKey.length >= 8 || (debouncedKey === "" && keepsKey)
    /* La clave no va en la etiqueta de la caché: solo su largo y su final. */
    readonly property string modelsTag: provider + "|" + (debouncedKey !== ""
        ? "typed:" + debouncedKey.length + ":" + debouncedKey.slice(-4) : "saved")
    /* `{ models: [{ id, name }], fetchedAt }` */
    property var modelsData: null
    property string modelsError: ""
    property bool modelsFetching: false
    property bool refreshingModels: false
    /* Listas ya pedidas en esta visita: `{ etiqueta: { data, at } }`. */
    property var modelsCache: ({})
    property int modelsSeq: 0

    readonly property var models: modelsData ? modelsData.models : null
    /* El modelo guardado ya no se ofrece: se enseña igual, para no cambiarlo sin avisar. */
    readonly property bool savedMissing: !!models && model !== "" && !models.some(m => m.id === model)
    readonly property var modelOptions: {
        const options = []
        if (savedMissing) options.push({ value: model, label: model + " (ya no disponible)" })
        if (!models && model !== "") options.push({ value: model, label: model })
        const list = models || []
        list.forEach(m => options.push(m.name !== m.id ? { value: m.id, label: m.name, hint: m.id } : { value: m.id, label: m.name }))
        return options
    }
    readonly property string modelsHint: !canListModels
        ? "Escribe la clave de API para ver los modelos disponibles"
        : modelsError !== "" ? modelsError
        : modelsData ? modelsData.models.length + " modelos de " + info.vendor + " · actualizado " + Format.timeAgo(modelsData.fetchedAt)
        : "Consultando los modelos disponibles…"

    readonly property bool wide: width >= 640

    function errorMsg(error, fallback) {
        const m = error ? error.message : null
        return typeof m === "string" && m.trim() !== "" ? m : fallback
    }
    function flash(ok, text) {
        msg = { ok: ok, text: text }
        msgTimer.restart()
    }

    /* ── Configuración ── */
    function loadConfig() {
        Api.request("GET", "/assistant/config", null, (ok, data, error) => {
            root.configLoading = false
            if (ok) root.config = data && typeof data === "object" && data.provider !== undefined ? data : null
        })
    }
    function loadMemory() {
        Api.request("GET", "/assistant/memory", null, (ok, data, error) => {
            if (ok && data && typeof data === "object") root.memory = data
        })
    }

    /* Al llegar la configuración guardada, el formulario la adopta. */
    onConfigChanged: {
        if (config) {
            provider = config.provider
            model = config.model
        }
        adoptModel()
    }
    onModelChanged: adoptModel()
    onModelsChanged: adoptModel()

    /* Con la lista nueva, si no hay modelo elegido (o el elegido no es el
       guardado y ya no existe), se toma el preferido o el primero. */
    function adoptModel() {
        const list = models
        if (!list || !list.length) return
        if (model !== "" && (list.some(m => m.id === model) || (config && model === config.model))) return
        model = (list.find(m => m.id === info.preferred) || list[0]).id
    }

    function pickProvider(id) {
        provider = id
        model = config && config.provider === id ? config.model : ""
    }

    /* ── Modelos ── */
    /* Proveedor y clave pueden cambiar a la vez: una sola petición. */
    onModelsTagChanged: Qt.callLater(syncModels)
    onCanListModelsChanged: Qt.callLater(syncModels)

    function syncModels() {
        modelsSeq++
        modelsFetching = false
        modelsError = ""
        if (!canListModels) { modelsData = null; return }
        const hit = modelsCache[modelsTag]
        /* Diez minutos de vigencia, como la caché del backend. */
        if (hit && Date.now() - hit.at < 600000) { modelsData = hit.data; return }
        modelsData = null
        fetchModels(false, null)
    }
    function fetchModels(refresh, done) {
        const seq = ++modelsSeq
        const tag = modelsTag
        const body = { provider: provider }
        if (debouncedKey !== "") body.apiKey = debouncedKey
        if (refresh) body.refresh = true
        modelsFetching = true
        Api.request("POST", "/assistant/models", body, (ok, data, error) => {
            /* Cambió el proveedor o la clave mientras tanto: esta respuesta ya no cuenta. */
            if (seq !== root.modelsSeq) return
            root.modelsFetching = false
            if (ok && data && Array.isArray(data.models)) {
                const cache = Object.assign({}, root.modelsCache)
                cache[tag] = { data: data, at: Date.now() }
                root.modelsCache = cache
                root.modelsError = ""
                root.modelsData = data
            } else {
                root.modelsError = root.errorMsg(error, "No se pudieron cargar los modelos")
            }
            if (done) done(ok, error)
        })
    }
    /* «Actualizar»: salta también la caché de 10 minutos del backend. */
    function handleRefreshModels() {
        if (!canListModels || refreshingModels || modelsFetching) return
        refreshingModels = true
        fetchModels(true, (ok, error) => {
            root.refreshingModels = false
            if (!ok) root.flash(false, root.errorMsg(error, "No se pudieron actualizar los modelos"))
        })
    }

    /* ── Acciones ── */
    function handleSave() {
        if (!canSave || !dirty) return
        const form = { provider: provider, model: model.trim() }
        if (apiKey.trim() !== "") form.apiKey = apiKey.trim()
        saving = true
        Api.request("PUT", "/assistant/config", form, (ok, data, error) => {
            root.saving = false
            if (!ok) { root.flash(false, root.errorMsg(error, "No se pudo guardar el asistente")); return }
            root.config = data
            keyField.text = ""
            root.flash(true, "Asistente guardado. La clave se guarda cifrada y no vuelve a mostrarse.")
        })
    }
    function handleTest() {
        if (testing || dirty) return
        testing = true
        /* El modelo puede tardar bastante más que el resto de la API. */
        Api.request("POST", "/assistant/config/test", null, (ok, data, error) => {
            root.testing = false
            if (!ok) { root.flash(false, root.errorMsg(error, "La prueba de conexión falló")); return }
            const answered = data ? data.model : undefined
            root.flash(true, root.config && answered !== root.config.model
                ? "Conexión correcta con " + root.info.vendor + ", pero " + root.config.model + " está saturado: respondió "
                  + answered + ". Puedes elegir un modelo más estable."
                : "Conexión correcta con " + root.info.vendor)
        }, 150000)
    }
    function handleToggle(enabled) {
        if (!config) return
        saving = true
        Api.request("PUT", "/assistant/config", { provider: config.provider, model: config.model, enabled: enabled }, (ok, data, error) => {
            root.saving = false
            if (!ok) { root.flash(false, root.errorMsg(error, "No se pudo cambiar el estado")); return }
            root.config = data
        })
    }
    function handleRemove() {
        if (removing) return
        removing = true
        Api.request("DELETE", "/assistant/config", null, (ok, data, error) => {
            root.removing = false
            if (!ok) { root.flash(false, root.errorMsg(error, "No se pudo desconectar el asistente")); return }
            root.config = null
            keyField.text = ""
            root.flash(true, "Asistente desconectado y clave eliminada. La memoria se conserva.")
        })
    }
    function handleClearMemory() {
        if (clearing) return
        clearing = true
        Api.request("DELETE", "/assistant/memory", null, (ok, data, error) => {
            root.clearing = false
            if (!ok) { root.flash(false, root.errorMsg(error, "No se pudo borrar la memoria")); return }
            root.loadMemory()
            root.confirmClear = false
            root.flash(true, "Memoria del asistente borrada")
        })
    }

    Component.onCompleted: { loadConfig(); loadMemory() }

    Timer { id: msgTimer; interval: 5000; onTriggered: root.msg = null }
    Timer { id: keyTimer; interval: 600; onTriggered: root.debouncedKey = root.apiKey.trim() }
    onApiKeyChanged: keyTimer.restart()
    /* La lista se renueva sola cada 10 minutos mientras la pestaña esté abierta. */
    Timer {
        interval: 600000
        running: root.canListModels
        repeat: true
        onTriggered: if (!root.modelsFetching) root.fetchModels(false, null)
    }

    spacing: 32

    /* ── Cargando ── */
    Glass {
        visible: root.configLoading
        width: root.width
        implicitHeight: 52
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        Row {
            x: 16
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12
            Spinner { anchors.verticalCenter: parent.verticalCenter; color: Theme.ink(0.45) }
            Label { anchors.verticalCenter: parent.verticalCenter; text: "Cargando asistente…"; tone: 0.45 }
        }
    }

    /* ── Qué hace y qué no ── */
    Glass {
        visible: !root.configLoading
        width: root.width
        implicitHeight: aboutBody.implicitHeight + 32
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl

        Icon { x: 16; y: 18; name: "spark"; color: Theme.brandLight1 }
        Column {
            id: aboutBody
            x: 44; y: 16
            width: parent.width - 60
            spacing: 12

            Label {
                width: parent.width
                textFormat: Text.StyledText
                text: "Un asistente de consulta propio de tu cuenta: responde dudas y propone comandos y consultas SQL. "
                    + "Ábrelo con el botón <b>Asistente</b> de la barra superior o desde la terminal."
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.35
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Grid {
                width: parent.width
                columns: root.wide ? 2 : 1
                columnSpacing: 12
                rowSpacing: 12

                Repeater {
                    model: [
                        { title: "Puede", ok: true, items: [
                            "Leer los datos del panel de tu cuenta: servidores, métricas, conexiones y auditorías",
                            "Leer la terminal, la línea de comandos, el editor y los resultados SQL",
                            "Pegar comandos y consultas para que tú decidas si ejecutarlos"
                        ] },
                        { title: "No puede", ok: false, items: [
                            "Ejecutar comandos en ningún servidor ni consultas en ninguna base",
                            "Leer llaves SSH ni contraseñas de bases de datos",
                            "Ver datos de otros usuarios"
                        ] }
                    ]
                    Column {
                        id: ability
                        required property var modelData
                        width: root.wide ? (aboutBody.width - 12) / 2 : aboutBody.width
                        spacing: 4
                        Label {
                            width: parent.width
                            text: ability.modelData.title
                            color: ability.modelData.ok ? Theme.tone("emerald").text : Theme.tone("rose").text
                            font.pixelSize: Theme.textXs
                            font.weight: Font.Medium
                        }
                        Repeater {
                            model: ability.modelData.items
                            Label {
                                required property string modelData
                                width: ability.width
                                text: modelData
                                tone: 0.6
                                font.pixelSize: Theme.textXs
                                lineHeight: 1.35
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Proveedor ── */
    SettingsGroup {
        visible: !root.configLoading
        width: root.width
        title: "Proveedor"

        Grid {
            id: providerGrid
            width: parent.width
            columns: root.wide ? 3 : 1
            columnSpacing: 12
            rowSpacing: 12
            Accessible.role: Accessible.Grouping
            Accessible.name: "Proveedor de IA"

            Repeater {
                model: root.providers
                Item {
                    id: card
                    required property var modelData
                    readonly property bool selected: root.provider === modelData.id
                    readonly property bool connected: !!root.config && root.config.provider === modelData.id

                    width: root.wide ? (providerGrid.width - 24) / 3 : providerGrid.width
                    height: 76
                    activeFocusOnTab: selected
                    Accessible.role: Accessible.RadioButton
                    Accessible.name: modelData.name
                    Accessible.checked: selected
                    Keys.onReturnPressed: root.pickProvider(modelData.id)
                    Keys.onSpacePressed: root.pickProvider(modelData.id)

                    Glass {
                        anchors.fill: parent
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        highlighted: cardHover.hovered && !card.selected
                    }
                    Rectangle {
                        anchors.fill: parent
                        visible: card.selected
                        radius: Theme.radiusXl
                        color: Theme.tintActive
                        border.width: 2
                        border.color: card.activeFocus ? Theme.focusRing : Theme.brand1(0.6)
                    }

                    Item {
                        id: radio
                        x: 16; y: 18
                        width: 16; height: 16
                        BrandFill { anchors.fill: parent; visible: card.selected; radius: 8 }
                        Rectangle {
                            anchors.fill: parent
                            visible: !card.selected
                            radius: 8
                            color: "transparent"
                            border.width: 1
                            border.color: Theme.hairlineStrong
                        }
                        Icon { visible: card.selected; anchors.centerIn: parent; name: "check"; size: 10; color: Theme.onBrand }
                    }
                    Label {
                        anchors.left: radio.right
                        anchors.leftMargin: 8
                        anchors.right: connectedBadge.visible ? connectedBadge.left : parent.right
                        anchors.rightMargin: connectedBadge.visible ? 8 : 16
                        anchors.verticalCenter: radio.verticalCenter
                        text: card.modelData.name
                        font.weight: Font.Medium
                    }
                    Badge {
                        id: connectedBadge
                        visible: card.connected
                        anchors.right: parent.right
                        anchors.rightMargin: 16
                        anchors.verticalCenter: radio.verticalCenter
                        text: "Conectado"
                        tone: "emerald"
                    }
                    Label {
                        x: 16; y: 44
                        width: parent.width - 32
                        text: card.modelData.vendor
                        tone: 0.5
                        font.pixelSize: Theme.textXs
                    }

                    HoverHandler { id: cardHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: { card.forceActiveFocus(); root.pickProvider(card.modelData.id) }
                    }
                }
            }
        }
    }

    /* ── Credenciales ── */
    Column {
        visible: !root.configLoading
        width: root.width
        spacing: 20

        SettingsSectionTitle { width: parent.width; text: "Modelo y clave de API" }

        Grid {
            id: credentials
            width: parent.width
            columns: root.wide ? 2 : 1
            columnSpacing: 16
            rowSpacing: 16
            readonly property real cell: root.wide ? (width - 16) / 2 : width

            SettingsField {
                width: credentials.cell
                label: "Modelo *"
                hint: root.modelsHint

                Glass {
                    width: parent.width - 52
                    implicitHeight: 44
                    height: 44
                    variant: "input"
                    Icon { id: modelIcon; x: 14; anchors.verticalCenter: parent.verticalCenter; name: "cpu"; color: Theme.ink(0.45) }
                    Select {
                        anchors.fill: parent
                        anchors.leftMargin: 38
                        anchors.rightMargin: 14
                        value: root.model
                        options: root.modelOptions
                        enabled: (!!root.models && root.models.length > 0) || root.model !== ""
                        placeholder: root.modelsFetching ? "Cargando modelos…" : "Sin modelos"
                        Accessible.name: "Modelo"
                        onPicked: value => root.model = value
                    }
                }
                Item {
                    x: parent.width - 44
                    width: 44; height: 44
                    readonly property bool busy: root.refreshingModels || root.modelsFetching
                    IconButton {
                        anchors.fill: parent
                        visible: !parent.busy
                        size: 44
                        iconName: "refresh"
                        hint: "Volver a pedir la lista al proveedor"
                        enabled: root.canListModels
                        onClicked: root.handleRefreshModels()
                    }
                    Glass {
                        anchors.fill: parent
                        visible: parent.busy
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        opacity: 0.4
                        Spinner { anchors.centerIn: parent; color: Theme.ink(0.7) }
                    }
                }
            }

            SettingsField {
                width: credentials.cell
                label: root.keepsKey ? "Clave de API" : "Clave de API *"
                hint: root.keepsKey
                    ? "Guardada: ••••" + (root.config ? root.config.apiKeyHint : "") + ". Déjala vacía para conservarla."
                    : "Créala en " + root.info.keyUrl.replace(/^https:\/\//, "")

                GlassField {
                    id: keyField
                    width: parent.width
                    iconName: "key"
                    password: true
                    maximumLength: 512
                    inputMethodHints: Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase | Qt.ImhSensitiveData
                    placeholder: root.keepsKey ? "••••••••" : root.info.keyHint
                }
            }
        }

        Label {
            width: parent.width
            text: "La clave se guarda cifrada en el servidor y solo se usa para hablar con " + root.info.vendor
                + ". El consumo se factura en tu cuenta del proveedor."
            tone: 0.4
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }

        SettingsNotifRow {
            visible: !!root.config
            width: parent.width
            iconName: "spark"
            iconColor: Theme.brandLight1
            title: "Asistente activo"
            desc: "Desactívalo para dejar de usarlo sin borrar la configuración"
            on: !!root.config && root.config.enabled
            onChange: value => root.handleToggle(value)
        }

        SettingsFeedback {
            visible: root.msg !== null
            width: parent.width
            ok: root.msg ? root.msg.ok : true
            msg: root.msg ? root.msg.text : ""
        }

        /* Desconectar a la izquierda; probar y guardar a la derecha. Si no caben, se apilan. */
        Flow {
            id: actions
            width: parent.width
            spacing: 12
            readonly property real used: (removeButton.visible ? removeButton.width + spacing : 0)
                                       + (testButton.visible ? testButton.width + spacing : 0)
                                       + saveButton.width

            SettingsSystemButton {
                id: removeButton
                visible: !!root.config
                kind: "danger"
                iconName: "trash"
                loading: root.removing
                text: "Desconectar"
                enabled: !root.removing
                onClicked: root.handleRemove()
            }
            Item {
                visible: actions.width - actions.used - actions.spacing > 0
                width: Math.max(0, actions.width - actions.used - actions.spacing)
                height: 1
            }
            SettingsSystemButton {
                id: testButton
                visible: !!root.config
                iconName: "refresh"
                loading: root.testing
                text: root.testing ? "Probando…" : "Probar conexión"
                hint: root.dirty ? "Guarda los cambios antes de probar" : "Envía una petición mínima al proveedor"
                enabled: !root.testing && !root.dirty
                onClicked: root.handleTest()
            }
            SettingsSystemButton {
                id: saveButton
                kind: "brand"
                iconName: "save"
                loading: root.saving
                text: root.saving ? "Guardando…" : root.config ? "Guardar cambios" : "Conectar asistente"
                enabled: root.canSave && root.dirty
                onClicked: root.handleSave()
            }
        }
    }

    Rectangle { visible: !root.configLoading; width: root.width; height: 1; color: Theme.line }

    /* ── Memoria: es del panel, no del proveedor ── */
    Column {
        visible: !root.configLoading
        width: root.width
        spacing: 16

        Column {
            width: parent.width
            spacing: 8
            SettingsSectionTitle { width: parent.width; text: "Memoria" }
            Label {
                width: parent.width
                text: "La conversación se guarda en tu cuenta, no en el proveedor: si cambias de Claude a ChatGPT o Gemini, o lo desconectas y vuelves a conectarlo, "
                    + "el asistente sigue recordando. Lo más antiguo se condensa en un resumen. No guarda lo adjuntado de la pantalla ni contraseñas."
                tone: 0.4
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Glass {
            width: parent.width
            implicitHeight: memoryBody.implicitHeight
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl

            Column {
                id: memoryBody
                width: parent.width

                Item {
                    width: parent.width
                    implicitHeight: 44
                    Label {
                        x: 16
                        width: parent.width - 48 - memoryCount.width
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Mensajes guardados"
                        tone: 0.55
                    }
                    Label {
                        id: memoryCount
                        anchors.right: parent.right
                        anchors.rightMargin: 16
                        anchors.verticalCenter: parent.verticalCenter
                        text: String(root.memory && root.memory.messageCount ? root.memory.messageCount : 0)
                        tone: 0.9
                        mono: true
                    }
                }
                Rectangle { width: parent.width; height: 1; color: Theme.line }
                Column {
                    x: 16
                    width: parent.width - 32
                    topPadding: 12
                    bottomPadding: 12
                    spacing: 8

                    Flow {
                        width: parent.width
                        spacing: 8
                        Label { text: "Lo que recuerda a largo plazo"; tone: 0.55 }
                        Label {
                            visible: !!root.memory && !!root.memory.updatedAt
                            height: 20
                            verticalAlignment: Text.AlignVCenter
                            text: root.memory && root.memory.updatedAt ? "actualizado " + Format.timeAgo(root.memory.updatedAt) : ""
                            tone: 0.35
                            font.pixelSize: Theme.textXs
                        }
                    }
                    /* El resumen largo se desplaza dentro de su caja, no estira la pestaña. */
                    ScrollArea {
                        visible: !!root.memory && !!root.memory.summary
                        width: parent.width
                        height: Math.min(224, summaryText.implicitHeight)
                        contentHeight: summaryText.implicitHeight
                        Label {
                            id: summaryText
                            width: parent.width
                            text: root.memory && root.memory.summary ? root.memory.summary : ""
                            tone: 0.7
                            font.pixelSize: Theme.textXs
                            lineHeight: 1.35
                            wrapMode: Text.Wrap
                            elide: Text.ElideNone
                            textFormat: Text.PlainText
                        }
                    }
                    Label {
                        visible: !root.memory || !root.memory.summary
                        width: parent.width
                        text: "Todavía nada: el resumen se crea cuando la conversación crece."
                        tone: 0.35
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }
        }

        Label {
            visible: root.confirmClear && !root.wide
            width: parent.width
            text: "Se borrará la conversación y el resumen. No se puede deshacer."
            tone: 0.55
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Item {
            width: parent.width
            implicitHeight: 40
            Label {
                visible: root.confirmClear && root.wide
                anchors.left: parent.left
                anchors.right: clearButtons.left
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                text: "Se borrará la conversación y el resumen. No se puede deshacer."
                tone: 0.55
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Row {
                id: clearButtons
                anchors.right: parent.right
                spacing: 8
                SettingsSystemButton {
                    visible: root.confirmClear
                    text: "Cancelar"
                    onClicked: root.confirmClear = false
                }
                SettingsSystemButton {
                    visible: root.confirmClear
                    kind: "dangerSolid"
                    iconName: "trash"
                    loading: root.clearing
                    text: "Borrar memoria"
                    enabled: !root.clearing
                    onClicked: root.handleClearMemory()
                }
                SettingsSystemButton {
                    visible: !root.confirmClear
                    kind: "danger"
                    iconName: "trash"
                    text: "Borrar memoria"
                    enabled: !!root.memory && (root.memory.messageCount > 0 || !!root.memory.summary)
                    onClicked: root.confirmClear = true
                }
            }
        }
    }
}
