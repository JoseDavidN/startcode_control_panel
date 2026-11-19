import QtQuick
import StartCode

/* Alta de un servidor, en tres pantallas dentro del mismo modal:

   1. Formulario (datos SSH, llave privada, etiqueta, descripción).
   2. Confirmación de la clave de host: se lee de host:puerto sin autenticarse
      y el usuario la compara con la del servidor. Solo entonces se envía la llave.
   3. Proceso: se crea el servidor y se instala el agente, paso a paso.

   `open()` lo abre; `prefill({ name, host, port, username, os, tag, description })`
   propone datos (la llave nunca: la pega el usuario). `saved(server)` se emite
   al cerrar tras la instalación (haya ido bien o no: el servidor queda creado);
   `listChanged()` cada vez que conviene recargar la lista. */
Modal {
    id: root

    signal saved(var server)
    signal listChanged()

    title: reviewingKey ? "Confirma la clave de host SSH" : "Agregar Nuevo Servidor"
    size: "lg"
    bodySpacing: 20
    /* Durante el proceso no se cierra por accidente: se sale con «Cerrar». */
    dismissable: !connecting
    footer: view === "connecting" ? null : footerRow

    /* ── Estado ────────────────────────────────────────────────────── */
    property string error: ""
    property bool connecting: false
    property string connStatus: "running"
    property string createdId: ""
    property var createdServer: null
    /* `{ code, message, detail? }` */
    property var installError: null
    /* Huella leída de host:puerto antes de crear: `{ target, key }`. */
    property var hostKey: null
    property bool reviewingKey: false
    property bool scanning: false
    property bool creating: false
    property bool installing: false
    /* Pasos finos que informa el backend durante la instalación. */
    property var steps: []

    property string os: "ubuntu"
    /* '' es «sin etiqueta». */
    property string tag: ""
    /* Solo se usa durante la instalación; no se guarda en ninguna parte. */
    property string sudoPassword: ""

    readonly property string view: reviewingKey && hostKey ? "review" : connecting ? "connecting" : "form"
    readonly property bool wide: bodyWidth >= 560
    readonly property int port: parseInt(portField.text) || 22
    readonly property string privateKey: logic.normalizeKey(keyArea.text)
    readonly property var keyState: privateKey !== "" ? logic.validateKey(privateKey) : null
    readonly property string target: hostField.text.trim() + ":" + port
    readonly property bool working: creating || connecting || scanning

    /* Actividades que ve el usuario: agrupan los pasos del backend. */
    readonly property var installActivities: [
        { id: "connect",  label: "Conectando con el servidor", covers: ["ssh"] },
        { id: "prepare",  label: "Comprobando el servidor",    covers: ["privileges", "systemd", "arch"] },
        { id: "download", label: "Descargando el agente",      covers: ["download", "checksum"] },
        { id: "install",  label: "Instalando el servicio",     covers: ["config", "service"] },
        { id: "verify",   label: "Comprobando que reporta",    covers: ["verify", "handshake"] }
    ]
    readonly property var activities: resolveActivities(installActivities, steps, connStatus)

    ServerForms { id: logic }

    /* ── Lógica ────────────────────────────────────────────────────── */

    /* Datos propuestos desde fuera (p. ej. un asistente). Solo se aplican los que vengan. */
    function prefill(data) {
        if (!data) return
        if (data.name !== undefined && data.name !== null) nameField.text = String(data.name)
        if (data.host !== undefined && data.host !== null) hostField.text = String(data.host)
        if (data.port !== undefined && data.port !== null) portField.text = String(data.port)
        if (data.username !== undefined && data.username !== null) userField.text = String(data.username)
        if (data.os) root.os = String(data.os)
        if (data.tag !== undefined) root.tag = data.tag ? String(data.tag) : ""
        if (data.description !== undefined && data.description !== null) descriptionArea.text = String(data.description)
    }

    function resetForm() {
        nameField.text = ""
        hostField.text = ""
        portField.text = "22"
        userField.text = "root"
        keyArea.text = ""
        descriptionArea.text = ""
        root.os = "ubuntu"
        root.tag = ""
        root.sudoPassword = ""
    }

    /* Una actividad se da por terminada cuando la siguiente ha empezado, o
       cuando el proceso entero acabó bien: así la pantalla avanza de una en una. */
    function resolveActivities(list, reportedSteps, overall) {
        const byId = {}
        for (const step of Array.from(reportedSteps || [])) byId[step.id] = step
        const reported = list.map(activity => activity.covers.map(id => byId[id]).filter(step => !!step))

        /* La última actividad de la que se sabe algo: todo lo anterior ya pasó. */
        let current = -1
        reported.forEach((covered, index) => { if (covered.length > 0) current = index })

        return list.map((activity, index) => {
            const covered = reported[index]
            const failed = covered.find(step => step.status === "failed")
            const last = covered.length > 0 ? covered[covered.length - 1] : null

            let status
            if (failed) status = "failed"
            else if (overall === "success") status = "done"
            else if (index < current) status = "done"
            else if (index === current) status = "running"
            else status = "pending"

            const detail = failed && failed.detail ? failed.detail : (last && last.detail ? last.detail : "")
            return { id: activity.id, label: activity.label, covers: activity.covers, status: status, detail: detail }
        })
    }

    /* El resultado HTTP trae los pasos completos: si el socket se perdió
       alguno —o estaba caído—, el final se pinta igualmente. */
    function applyResult(finalSteps) {
        const merged = root.steps.slice()
        for (const step of Array.from(finalSteps || [])) {
            const index = merged.findIndex(s => s.id === step.id)
            if (index >= 0) merged[index] = step
            else merged.push(step)
        }
        root.steps = merged
    }

    /* El error vive arriba del formulario: se trae a la vista al aparecer. */
    function fail(message) {
        root.error = message
        let item = errorBox.parent
        while (item) {
            if (item.contentY !== undefined && item.contentHeight !== undefined) { item.contentY = 0; return }
            item = item.parent
        }
    }

    function submit() {
        if (root.working || root.view !== "form") return
        root.error = ""

        if (nameField.text === "") { fail("El nombre del servidor es obligatorio."); return }
        if (hostField.text.trim() === "") { fail("El host o IP es obligatorio."); return }
        if (root.port < 1 || root.port > 65535) { fail("El puerto debe estar entre 1 y 65535."); return }
        if (userField.text === "") { fail("El usuario SSH es obligatorio."); return }
        const check = logic.validateKey(root.privateKey)
        if (!check.valid) { fail(check.error || "Clave privada inválida"); return }

        if (root.createdId !== "") { createAndInstall(); return }

        /* Primero la huella del host, para confirmarla antes de enviar la llave. */
        const scanned = root.target
        root.scanning = true
        Api.request("POST", "/servers/host-key/scan", { host: hostField.text.trim(), port: root.port }, (ok, data, failure) => {
            root.scanning = false
            if (!ok || !data || !data.fingerprint) {
                fail((failure && failure.message)
                     || "No se pudo leer la clave de host del servidor. Verifica el host y el puerto.")
                return
            }
            root.hostKey = { target: scanned, key: data }
            root.reviewingKey = true
        })
    }

    function confirmHostKey() {
        root.reviewingKey = false
        createAndInstall()
    }

    function createAndInstall() {
        root.connStatus = "running"
        root.installError = null
        root.steps = []
        root.connecting = true

        if (root.createdId !== "") { runInstall(root.createdId); return }

        const body = {
            name: nameField.text,
            host: hostField.text.trim(),
            port: root.port,
            username: userField.text,
            privateKey: root.privateKey,
            os: root.os,
            description: descriptionArea.text,
            tag: root.tag !== "" ? root.tag : null
        }
        /* La huella solo viaja si es la que se confirmó para este mismo host:puerto. */
        const confirmed = root.hostKey && root.hostKey.target === root.target ? root.hostKey.key : null
        if (confirmed) {
            body.hostKeyFingerprint = confirmed.fingerprint
            if (confirmed.algorithm) body.hostKeyAlgorithm = confirmed.algorithm
        }

        root.creating = true
        Api.request("POST", "/servers", body, (ok, data, failure) => {
            root.creating = false
            if (!ok || !data || !data.id) {
                root.connecting = false
                root.connStatus = "running"
                const message = (failure && failure.message) || "Error al agregar el servidor"
                if (message.includes("authentication methods failed") || message.includes("clave SSH"))
                    fail("Error de autenticación SSH. Verifica que la clave privada sea correcta.")
                else if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT"))
                    fail("No se puede conectar al servidor. Verifica el host y puerto.")
                else fail(message)
                return
            }
            root.createdId = data.id
            root.createdServer = data
            root.listChanged()
            runInstall(data.id)
        })
    }

    /* Instala el agente y traduce el resultado a lo que ve el usuario. */
    function runInstall(serverId) {
        root.installing = true
        const body = root.sudoPassword !== "" ? { sudoPassword: root.sudoPassword } : ({})
        Api.request("POST", "/servers/" + serverId + "/agent/install", body, (ok, result, failure) => {
            root.installing = false
            root.listChanged()
            /* El modal pudo cerrarse y empezar otra alta mientras tanto. */
            if (root.createdId !== serverId) return

            if (!ok || !result) {
                root.connStatus = "error"
                root.installError = {
                    code: "UNKNOWN",
                    message: (failure && failure.message) || "No se pudo instalar el agente"
                }
                return
            }

            applyResult(result.steps)
            if (result.ok) {
                root.connStatus = "success"
            } else {
                root.connStatus = "error"
                root.installError = result.error || { code: "UNKNOWN", message: "No se pudo instalar el agente" }
            }
        }, 180000)
    }

    /* El servidor ya está creado: reintentar no lo duplica. */
    function retryInstall() {
        if (root.createdId === "" || root.installing) return
        root.connStatus = "running"
        root.installError = null
        root.steps = []
        runInstall(root.createdId)
    }

    /* Cerrar tras un fallo NO borra el servidor: queda en pendiente. */
    function closeAfterInstall() {
        const server = root.createdServer
        resetForm()
        root.connecting = false
        root.connStatus = "running"
        root.createdId = ""
        root.createdServer = null
        root.installError = null
        root.hostKey = null
        root.reviewingKey = false
        root.steps = []
        root.error = ""
        root.saved(server)
        root.close()
    }

    /* La contraseña de sudo se pide en dos sitios (formulario y reintento): van a la par. */
    onSudoPasswordChanged: {
        if (sudoField.text !== sudoPassword) sudoField.text = sudoPassword
        if (retrySudoField.text !== sudoPassword) retrySudoField.text = sudoPassword
    }

    onOpened: if (view === "form") nameField.forceFocus()

    /* Progreso en vivo por el socket `/agent`. Se escucha siempre y se filtra
       por el servidor recién creado; si el socket está caído, el resultado
       HTTP trae los mismos pasos al final. */
    Connections {
        target: Realtime
        function onEvent(name, payload) {
            if (name !== "agent:install:progress" || root.createdId === "") return
            if (!payload || payload.serverId !== root.createdId || !payload.step) return
            const step = payload.step
            root.steps = root.steps.filter(s => s.id !== step.id).concat([step])
        }
    }

    /* ── Barra inferior (formulario y confirmación de huella) ──────── */
    property Item footerRow: Row {
        spacing: 12

        SecondaryButton {
            text: root.view === "review" ? "Volver" : "Cancelar"
            enabled: root.view === "review" || !root.creating
            onClicked: {
                if (root.view === "review") root.reviewingKey = false
                else root.close()
            }
        }
        PrimaryButton {
            text: root.view === "review" ? "Coincide: agregar e instalar"
                : root.scanning ? "Leyendo huella…"
                : root.connecting ? "Instalando…"
                : root.creating ? "Agregando…"
                : "Agregar e instalar agente"
            loading: root.view !== "review" && root.working
            enabled: root.view === "review" || !root.working
            onClicked: {
                if (root.view === "review") root.confirmHostKey()
                else root.submit()
            }
        }
    }

    /* ── 2. Confirmación de la clave de host ───────────────────────── */
    Column {
        visible: root.view === "review"
        width: root.bodyWidth
        spacing: 16

        ServerNotice {
            width: parent.width
            accent: Theme.warn
            iconColor: Theme.tone("amber").text
            iconPath: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3"
            spacing: 8

            Label {
                width: parent.width
                text: "¿Es este tu servidor?"
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                width: parent.width
                textFormat: Text.RichText
                text: logic.mono(root.hostKey ? root.hostKey.target : "", 0.8)
                      + " presentó la clave de abajo. Aún no se envió la llave privada: compárala con la del servidor ejecutando en él"
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.4
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            /* El comando se puede seleccionar para copiarlo. */
            TextEdit {
                width: parent.width
                text: logic.hostKeyCheckCommand
                readOnly: true
                selectByMouse: true
                wrapMode: TextEdit.WrapAnywhere
                color: Theme.ink(0.8)
                selectionColor: Theme.brand1(0.45)
                selectedTextColor: Theme.ink(1)
                font.family: Theme.fontMono
                font.pixelSize: Theme.textXs
            }
            Label {
                width: parent.width
                text: "Si no coincide, alguien podría estar interceptando la conexión: no continúes."
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.4
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        HostKeyBlock {
            width: parent.width
            label: "Presentada por el servidor"
            info: root.hostKey ? root.hostKey.key : null
            tone: "muted"
        }
    }

    /* ── 3. Proceso: reemplaza al formulario para verse completo ───── */
    Column {
        visible: root.view === "connecting"
        width: root.bodyWidth
        topPadding: 24
        bottomPadding: 24
        spacing: 16

        ConnectionLoading {
            width: parent.width
            status: root.connStatus
            activities: root.activities
            title: root.connStatus === "error" ? "No se pudo instalar el agente" : "Instalando el agente"
            subtitle: root.connStatus === "error" ? "El servidor quedó creado, pendiente de agente" : nameField.text
            successTitle: "Servidor listo"
            successSubtitle: "El agente quedó instalado y reportando"
            /* Se llama cuando el visto bueno ya se vio. */
            onComplete: root.closeAfterInstall()
        }

        ServerNotice {
            visible: root.installError !== null
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.min(384, parent.width)
            accent: Theme.danger
            spacing: 12

            Label {
                width: parent.width
                text: root.installError ? root.installError.message : ""
                color: Theme.tone("rose").text
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            ServerErrorDetail {
                width: parent.width
                detail: root.installError && root.installError.detail ? root.installError.detail : ""
                maxHeight: 160
            }

            /* Campo de contraseña solo cuando hace falta: el usuario remoto
               no es root ni tiene sudo sin contraseña. */
            ServerField {
                visible: root.installError !== null
                         && (root.installError.code === "NO_SUDO" || root.installError.code === "SUDO_PASSWORD")
                width: parent.width
                label: "Contraseña de sudo"
                GlassField {
                    id: retrySudoField
                    width: parent.width
                    password: true
                    maximumLength: 256
                    placeholder: "No se guarda en ninguna parte"
                    onTextChanged: root.sudoPassword = text
                    onAccepted: root.retryInstall()
                }
            }

            Item {
                width: parent.width
                height: 36
                Row {
                    anchors.right: parent.right
                    spacing: 8
                    SecondaryButton {
                        implicitHeight: 36
                        text: "Cerrar"
                        onClicked: root.closeAfterInstall()
                    }
                    PrimaryButton {
                        implicitHeight: 36
                        text: "Reintentar instalación"
                        enabled: !root.installing
                        onClicked: root.retryInstall()
                    }
                }
            }
        }
    }

    /* ── 1. Formulario ─────────────────────────────────────────────── */
    Column {
        visible: root.view === "form"
        width: root.bodyWidth
        spacing: 20

        /* Error */
        ServerNotice {
            id: errorBox
            visible: root.error !== ""
            width: parent.width
            accent: Theme.danger
            iconColor: Theme.tone("rose").text
            iconPath: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8v4M12 16h.01"

            Label {
                width: parent.width
                text: "Error al agregar servidor"
                color: Theme.tone("rose").text
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                width: parent.width
                text: root.error
                color: Qt.alpha(Theme.tone("rose").text, 0.85)
                font.pixelSize: Theme.textXs
                lineHeight: 1.4
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        /* Nombre + etiqueta en la misma fila. La etiqueta es opcional y
           clasifica el servidor para encontrarlo luego con los filtros. */
        Flow {
            id: nameRow
            width: parent.width
            spacing: 16
            readonly property real tagWidth: Math.max(150, Math.floor((width - 16) * 0.15))

            ServerField {
                width: root.wide ? nameRow.width - 16 - nameRow.tagWidth : nameRow.width
                label: "Nombre del Servidor *"
                GlassField {
                    id: nameField
                    width: parent.width
                    maximumLength: 100
                    placeholder: "Ej: Web Server 01"
                    onAccepted: root.submit()
                }
            }
            ServerField {
                width: root.wide ? nameRow.tagWidth : nameRow.width
                label: "Etiqueta"
                Glass {
                    variant: "input"
                    width: parent.width
                    height: Theme.fieldHeight
                    Select {
                        anchors.fill: parent
                        anchors.leftMargin: 14
                        anchors.rightMargin: 14
                        value: root.tag
                        options: logic.tagOptions
                        onPicked: value => root.tag = value
                        Accessible.name: "Etiqueta"
                    }
                    HoverTip { text: "Opcional: clasifica el servidor para encontrarlo luego con los filtros" }
                }
            }
        }

        /* Host + Puerto */
        Flow {
            id: hostRow
            width: parent.width
            spacing: 16
            readonly property real third: Math.floor((width - 16) / 3)

            ServerField {
                width: root.wide ? hostRow.width - 16 - hostRow.third : hostRow.width
                label: "Host / IP *"
                GlassField {
                    id: hostField
                    width: parent.width
                    maximumLength: 253
                    placeholder: "192.168.1.10 o example.com"
                    onAccepted: root.submit()
                }
            }
            ServerField {
                width: root.wide ? hostRow.third : hostRow.width
                label: "Puerto SSH *"
                GlassField {
                    id: portField
                    width: parent.width
                    text: "22"
                    maximumLength: 5
                    inputMethodHints: Qt.ImhDigitsOnly
                    /* Solo cifras: el puerto es un entero entre 1 y 65535. */
                    onTextChanged: {
                        const clean = text.replace(/[^0-9]/g, "")
                        if (clean !== text) text = clean
                    }
                    onAccepted: root.submit()
                }
            }
        }

        /* Usuario + OS */
        Flow {
            id: userRow
            width: parent.width
            spacing: 16
            readonly property real half: Math.floor((width - 16) / 2)

            ServerField {
                width: root.wide ? userRow.half : userRow.width
                label: "Usuario SSH *"
                GlassField {
                    id: userField
                    width: parent.width
                    text: "root"
                    maximumLength: 64
                    placeholder: "root"
                    onAccepted: root.submit()
                }
            }
            ServerField {
                width: root.wide ? userRow.half : userRow.width
                label: "Sistema Operativo *"
                Glass {
                    variant: "input"
                    width: parent.width
                    height: Theme.fieldHeight
                    Select {
                        anchors.fill: parent
                        anchors.leftMargin: 14
                        anchors.rightMargin: 14
                        value: root.os
                        options: logic.osOptions
                        onPicked: value => root.os = value
                        Accessible.name: "Sistema operativo"
                    }
                }
            }
        }

        /* Contraseña de sudo (opcional) */
        ServerField {
            width: parent.width
            label: "Contraseña de sudo (opcional)"
            GlassField {
                id: sudoField
                width: parent.width
                password: true
                maximumLength: 256
                placeholder: "Solo si el usuario no es root"
                onTextChanged: root.sudoPassword = text
                onAccepted: root.submit()
            }
            Label {
                width: parent.width
                text: "Se usa para instalar el agente y no se guarda. Si el usuario es root o tiene sudo sin contraseña, déjalo vacío."
                tone: 0.4
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        /* Clave Privada */
        Column {
            width: parent.width
            spacing: 6

            Item {
                width: parent.width
                height: 20
                Label {
                    anchors.left: parent.left
                    anchors.right: keyBadge.visible ? keyBadge.left : parent.right
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Clave Privada SSH *"
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                    font.weight: Font.Medium
                }
                Badge {
                    id: keyBadge
                    visible: root.keyState !== null
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    pill: true
                    tone: root.keyState && root.keyState.valid ? "emerald" : "rose"
                    text: root.keyState && root.keyState.valid ? "Clave válida" : "Clave inválida"
                }
            }

            GlassArea {
                id: keyArea
                width: parent.width
                height: 176
                mono: true
                placeholder: logic.keyPlaceholder
                /* El borde dice de un vistazo si la clave pegada sirve. */
                borderColor: root.keyState ? Qt.alpha(root.keyState.valid ? Theme.ok : Theme.danger, 0.4)
                           : focused ? Theme.brand1(0.5) : Theme.hairline

                Label {
                    visible: root.privateKey !== ""
                    anchors.right: parent.right
                    anchors.rightMargin: 14
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 6
                    text: root.privateKey.length + " caracteres"
                    tone: 0.3
                    font.pixelSize: Theme.textCaption
                }
            }

            Item { width: 1; height: 6 }

            Column {
                width: parent.width
                spacing: 10

                /* Info requisitos */
                ServerNotice {
                    width: parent.width
                    pad: 12
                    accent: Theme.info
                    edge: 0.15
                    spacing: 8

                    Row {
                        spacing: 8
                        Icon {
                            anchors.verticalCenter: parent.verticalCenter
                            name: "info"
                            size: 16
                            color: Theme.tone("sky").text
                        }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Requisitos de la clave SSH"
                            color: Theme.tone("sky").text
                            font.pixelSize: Theme.textXs
                            font.weight: Font.DemiBold
                        }
                    }
                    Column {
                        x: 24
                        width: parent.width - 24
                        spacing: 4
                        Repeater {
                            model: [
                                "Formatos: OpenSSH o PEM",
                                "OpenSSH: -----BEGIN OPENSSH PRIVATE KEY-----",
                                "PEM: -----BEGIN RSA/EC PRIVATE KEY-----",
                                "Sin passphrase (formato PEM antiguo)"
                            ]
                            Item {
                                id: requirement
                                required property string modelData
                                width: parent.width
                                height: requirementLabel.implicitHeight
                                Icon {
                                    y: 2
                                    name: "check"
                                    size: 12
                                    strokeWidth: 2
                                    color: Theme.ok
                                }
                                Label {
                                    id: requirementLabel
                                    x: 18
                                    width: parent.width - 18
                                    text: requirement.modelData
                                    tone: 0.6
                                    font.pixelSize: Theme.textXs
                                    wrapMode: Text.Wrap
                                    elide: Text.ElideNone
                                }
                            }
                        }
                    }
                }

                /* Generar clave */
                ServerNotice {
                    width: parent.width
                    pad: 12
                    accent: Theme.ok
                    edge: 0.15
                    spacing: 8

                    Item {
                        width: parent.width
                        height: Math.max(16, generateTitle.implicitHeight)
                        Icon {
                            anchors.verticalCenter: parent.verticalCenter
                            path: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3"
                            size: 16
                            color: Theme.tone("emerald").text
                        }
                        Label {
                            id: generateTitle
                            x: 24
                            width: parent.width - 24
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Generar nueva clave ed25519 (recomendado)"
                            color: Theme.tone("emerald").text
                            font.pixelSize: Theme.textXs
                            font.weight: Font.DemiBold
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                    Column {
                        x: 24
                        width: parent.width - 24
                        spacing: 8

                        Rectangle {
                            id: commandBox
                            readonly property string command: "ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/startcode_key"
                            width: parent.width
                            height: commandLabel.implicitHeight + 16
                            radius: Theme.radiusLg
                            color: Theme.tintSunken

                            Label {
                                id: commandLabel
                                x: 8; y: 8
                                width: parent.width - 16 - 28
                                text: commandBox.command
                                mono: true
                                color: Theme.tone("emerald").text
                                font.pixelSize: Theme.textCaption
                                lineHeight: 1.4
                                wrapMode: Text.WrapAnywhere
                                elide: Text.ElideNone
                            }
                            HoverHandler { id: commandHover }
                            /* El botón de copiar aparece al pasar por encima del comando. */
                            IconButton {
                                anchors.top: parent.top
                                anchors.right: parent.right
                                anchors.margins: 4
                                size: 24
                                iconSize: 12
                                hint: "Copiar"
                                opacity: commandHover.hovered || hovered || visualFocus ? 1 : 0
                                Behavior on opacity { NumberAnimation { duration: Theme.moFast } }
                                contentItem: Item {
                                    Icon {
                                        anchors.centerIn: parent
                                        size: 12
                                        path: "M11 9h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                                        color: Theme.ink(0.6)
                                    }
                                }
                                onClicked: App.copy(commandBox.command)
                            }
                        }
                        Label {
                            width: parent.width
                            textFormat: Text.RichText
                            text: "Copia la clave pública al servidor: "
                                  + logic.code("ssh-copy-id -i ~/.ssh/startcode_key.pub user@host",
                                               Qt.alpha(Theme.tone("emerald").text, 0.8))
                            tone: 0.45
                            font.pixelSize: Theme.textCaption
                            wrapMode: Text.Wrap
                            elide: Text.ElideNone
                        }
                    }
                }

                /* Advertencia authorized_keys */
                ServerNotice {
                    width: parent.width
                    pad: 12
                    accent: Theme.warn
                    edge: 0.15
                    iconName: "alert"
                    iconSize: 16
                    iconColor: Theme.tone("amber").text

                    Label {
                        width: parent.width
                        textFormat: Text.RichText
                        text: "La clave pública debe estar en "
                              + logic.code("~/.ssh/authorized_keys", Theme.tone("amber").text)
                              + " del servidor remoto."
                        color: Qt.alpha(Theme.tone("amber").text, 0.85)
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                }
            }
        }

        /* Descripción */
        ServerField {
            width: parent.width
            label: "Descripción (Opcional)"
            GlassArea {
                id: descriptionArea
                width: parent.width
                height: 92
                placeholder: "Descripción o notas sobre este servidor…"
            }
        }
    }
}
