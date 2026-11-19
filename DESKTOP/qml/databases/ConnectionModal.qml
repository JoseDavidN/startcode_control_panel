import QtQuick
import QtQuick.Templates as T
import StartCode

/* Alta y edición de una conexión a base de datos, en tres pestañas:

   · Conexión: motor, nombre, etiqueta, host, puerto, usuario y contraseña.
   · Base de datos: todas las bases o una concreta (en Redis, el índice).
   · Túnel SSH: directo, por un servidor del panel o con credenciales propias.

   `connection` con datos edita; `null` crea. Al abrirse (`open()`) el
   formulario vuelve a su estado inicial para ese caso. `initial` o
   `prefill(datos)` proponen valores al crear (las contraseñas nunca: las
   escribe el usuario). `saved(connection)` trae la conexión guardada y
   `deleted(id)` avisa de que se eliminó: quien lo usa actualiza su lista. */
Modal {
    id: root

    /* Con conexión edita; sin ella crea una nueva. */
    property var connection: null
    /* Solo al crear: datos propuestos (mismos campos que el formulario, sin `password` ni `sshSecret`). */
    property var initial: null

    signal saved(var connection)
    signal deleted(string id)

    title: editing ? "Editar conexión" : "Nueva conexión"
    size: "lg"
    bodySpacing: 20
    /* Mientras guarda no se cierra por accidente. */
    dismissable: !saving
    footer: footerBar

    /* ── Valores fijos ─────────────────────────────────────────────── */
    /* Motores soportados, en el orden en que se ofrecen. */
    readonly property var engines: ["mysql", "mariadb", "postgresql", "redis"]
    readonly property var engineLabels: ({ mysql: "MySQL", mariadb: "MariaDB", postgresql: "PostgreSQL", redis: "Redis" })
    readonly property var defaultPorts: ({ mysql: 3306, mariadb: 3306, postgresql: 5432, redis: 6379 })
    /* Lo que cambia de un motor a otro en el formulario. */
    readonly property var engineHints: ({
        mysql:      { user: "root",     database: "db_startcode" },
        mariadb:    { user: "root",     database: "db_startcode" },
        postgresql: { user: "postgres", database: "db_startcode" },
        redis:      { user: "default",  database: "0" }
    })
    /* Con túnel, el motor se alcanza desde el servidor SSH: el host deja de editarse. */
    readonly property string tunnelHost: "127.0.0.1"

    /* ── Estado del formulario (lo que no vive en un campo de texto) ── */
    property string engine: "mysql"
    /* '' es «sin etiqueta». */
    property string tag: ""
    /* Base elegida; en Redis, el índice. */
    property string database: ""
    /* Base concreta o todas: por defecto todas (la conexión ve el servidor completo). */
    property bool singleDatabase: false
    /* none | server | custom */
    property string sshMode: "none"
    property string sshServerId: ""
    /* password | key */
    property string sshAuth: "password"
    property string sshHostKeyFingerprint: ""
    property string sshHostKeyAlgorithm: ""

    /* connection | database | ssh */
    property string tab: "connection"
    property string error: ""
    property bool showPassword: false
    /* En edición la contraseña no se carga hasta pulsar el ojo. Mientras no se
       cargue ni se escriba, se omite al guardar y el backend conserva la suya. */
    property bool passwordLoaded: true
    property bool passwordDirty: false
    property bool revealing: false
    property bool confirmDelete: false
    /* Origen del túnel elegido en la pestaña: server | custom. */
    property string tunnelKind: "server"
    /* El secreto SSH guardado no vuelve nunca: solo se manda si se escribe. */
    property bool sshSecretDirty: false
    /* Host que tenía el campo antes de activar el túnel, para devolverlo al quitarlo. */
    property string hostBeforeTunnel: ""
    /* Huella leída y pendiente de confirmar: `{ target, key }`. */
    property var scan: null
    property bool scanning: false
    property string scanError: ""
    property var servers: []
    property bool saving: false
    property bool deleting: false
    property bool testing: false
    /* `{ ok, version, error, latencyMs }` de la última prueba; null si no hay o ya no vale. */
    property var testResult: null
    property int testSeq: 0
    /* Cambia en cada apertura y cierre: las respuestas de una apertura anterior se descartan. */
    property int epoch: 0
    /* Los campos se están rellenando por código: no cuenta como edición del usuario. */
    property bool filling: false
    /* Datos de `prefill()` recibidos con el modal cerrado: se aplican al abrir. */
    property var pendingPrefill: null

    /* ── Derivados ─────────────────────────────────────────────────── */
    readonly property bool editing: !!connection
    readonly property bool wide: bodyWidth >= 560
    readonly property bool isRedis: engine === "redis"
    readonly property var hints: engineHints[engine] || engineHints.mysql
    readonly property bool sendPassword: passwordLoaded || passwordDirty
    readonly property bool tunnelOn: sshMode !== "none"
    readonly property int port: parseInt(portField.text) || 0
    readonly property int sshPort: parseInt(sshPortField.text) || 0
    readonly property string sshTarget: sshHostField.text.trim() + ":" + sshPort
    /* El secreto guardado sirve mientras no se cambie el tipo (una contraseña no es una llave). */
    readonly property bool storedSecretUsable: !!connection && !!connection.hasSshSecret
                                               && connection.sshMode === "custom" && connection.sshAuth === sshAuth
    readonly property string sshSecret: sshAuth === "key" ? logic.normalizeKey(keyArea.text) : sshPasswordField.text
    readonly property var keyState: sshAuth === "key" && sshSecret !== "" ? logic.validateKey(sshSecret) : null
    readonly property var selectedServer: servers.find(s => s.id === sshServerId) || null
    readonly property bool hostKeyConfirmed: sshHostKeyFingerprint !== ""
    readonly property var serverOptions: servers.map(s => ({
        value: s.id,
        label: s.name,
        hint: s.hostKeyFingerprint ? s.host : s.host + " · huella sin confirmar"
    }))
    /* El selector de bases vuelve a pedir la lista cuando cambian estos datos. */
    readonly property string credentialsKey: JSON.stringify([
        engine, hostField.text.trim(), port, userField.text.trim(),
        sendPassword ? passwordInput.text : "(guardada)", connection ? connection.id : "", tunnelPayload()
    ])
    readonly property string pickerBlocked: {
        const problem = connectionProblem()
        if (problem !== "") return problem
        const tunnel = tunnelProblem()
        return tunnel !== "" ? "Túnel SSH: " + tunnel : ""
    }

    ServerForms { id: logic }

    /* ── Piezas del formulario ─────────────────────────────────────── */

    /* Nota pequeña bajo un campo. */
    component Hint: Label {
        tone: 0.4
        font.pixelSize: 11
        lineHeight: 1.4
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }

    /* Elección entre dos o tres opciones excluyentes, con el aspecto de las
       pestañas. `options: [{ id, label, icon?, dot? }]` (`icon` = trazo en
       rejilla de 24; `dot` = punto verde de «activo»). */
    component Segmented: Rectangle {
        id: segmented

        property var options: []
        property string value: ""
        property bool showIcons: true
        signal picked(string id)

        implicitHeight: 44
        radius: Theme.radiusXl
        color: Theme.tintSunken

        Row {
            x: 4; y: 4
            spacing: 4

            Repeater {
                model: segmented.options

                Item {
                    id: option
                    required property var modelData
                    readonly property bool active: segmented.value === modelData.id
                    readonly property bool hasIcon: segmented.showIcons && !!modelData.icon
                    readonly property bool hasDot: !!modelData.dot

                    width: (segmented.width - 8 - 4 * (segmented.options.length - 1)) / Math.max(1, segmented.options.length)
                    height: 36
                    scale: optionTap.pressed ? 0.98 : 1
                    activeFocusOnTab: true
                    Accessible.role: Accessible.RadioButton
                    Accessible.name: modelData.label
                    Accessible.checked: active
                    Keys.onSpacePressed: segmented.picked(modelData.id)
                    Keys.onReturnPressed: segmented.picked(modelData.id)
                    Behavior on scale { NumberAnimation { duration: Theme.moFast } }

                    BrandFill {
                        anchors.fill: parent
                        visible: option.active
                        radius: Theme.radiusLg
                        strength: 0.28
                    }
                    Rectangle {
                        anchors.fill: parent
                        radius: Theme.radiusLg
                        color: !option.active && optionHover.hovered ? Theme.tintHover : "transparent"
                        border.width: 1
                        border.color: option.activeFocus ? Theme.focusRing
                                    : option.active ? Theme.hairlineStrong : "transparent"
                        Behavior on color { ColorAnimation { duration: Theme.moFast } }
                    }
                    Row {
                        anchors.centerIn: parent
                        spacing: 8
                        Icon {
                            visible: option.hasIcon
                            anchors.verticalCenter: parent.verticalCenter
                            path: option.modelData.icon || ""
                            size: 16
                            color: Theme.ink(option.active || optionHover.hovered ? 1 : 0.6)
                        }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.min(implicitWidth,
                                            option.width - 16 - (option.hasIcon ? 24 : 0) - (option.hasDot ? 14 : 0))
                            text: option.modelData.label
                            tone: option.active || optionHover.hovered ? 1 : 0.6
                            font.weight: Font.Medium
                        }
                        Rectangle {
                            visible: option.hasDot
                            anchors.verticalCenter: parent.verticalCenter
                            width: 6; height: 6; radius: 3
                            color: Theme.ok
                            Accessible.name: "activo"
                        }
                    }
                    HoverHandler { id: optionHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler {
                        id: optionTap
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: segmented.picked(option.modelData.id)
                    }
                }
            }
        }
    }

    /* Botón de cristal suave que puede mostrar que está trabajando (`loading`)
       o teñirse de rojo (`danger`): lo que no cubre `SecondaryButton`. */
    component SoftButton: T.Button {
        id: soft

        property bool loading: false
        property bool danger: false

        implicitHeight: Theme.controlHeight
        implicitWidth: Math.max(64, softRow.implicitWidth + 32)
        hoverEnabled: true
        opacity: enabled ? 1 : 0.4
        scale: down ? 0.98 : 1
        Behavior on scale { NumberAnimation { duration: Theme.moFast } }

        background: Glass {
            variant: "soft"
            radius: Theme.radiusXl
            highlighted: soft.hovered && !soft.danger
            borderColor: soft.visualFocus ? Theme.focusRing
                       : soft.danger ? Qt.alpha(Theme.danger, 0.25)
                       : soft.hovered ? Theme.hairlineHover : Theme.hairlineSoft
            Rectangle {
                anchors.fill: parent
                visible: soft.danger && soft.hovered
                radius: Theme.radiusXl
                color: Qt.alpha(Theme.danger, 0.1)
            }
        }
        contentItem: Item {
            Row {
                id: softRow
                anchors.centerIn: parent
                spacing: 8
                Spinner {
                    visible: soft.loading
                    anchors.verticalCenter: parent.verticalCenter
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: soft.text
                    color: soft.danger ? Theme.tone("rose").text : Theme.ink(soft.hovered ? 1 : 0.8)
                    font.weight: Font.Medium
                }
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
    }

    /* ── Lógica ────────────────────────────────────────────────────── */

    /* Mensaje del backend (los de validación llegan como lista). */
    function errorText(failure, fallback) {
        const raw = failure && failure.data ? failure.data.message : null
        if (raw && typeof raw !== "string" && raw.length !== undefined) return Array.from(raw).join(". ")
        return (failure && failure.message) || fallback
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

    /* Solo los campos con valor: lo demás se queda como estaba. */
    function defined(source) {
        const out = {}
        if (!source) return out
        for (const key of Object.keys(source)) {
            if (source[key] !== undefined && source[key] !== null) out[key] = source[key]
        }
        return out
    }

    /* Propone datos al crear (p. ej. desde un asistente): `engine`, `name`,
       `host`, `port`, `username`, `database`, `tag` y los `ssh…` del túnel.
       Con el modal cerrado se aplican en la siguiente apertura; en edición
       no hacen nada. Las contraseñas las escribe siempre el usuario. */
    function prefill(data) {
        if (!data) return
        root.pendingPrefill = data
        if (root.visible && !root.editing) resetForm()
    }

    /* Estado inicial: el de la conexión que se edita o el de una nueva. */
    function resetForm() {
        const c = root.connection
        let form
        if (c) {
            form = {
                engine: c.engine, name: c.name, host: c.host, port: c.port,
                username: c.username, database: c.database || "", tag: c.tag,
                sshMode: c.sshMode || "none",
                sshServerId: c.sshServerId || "",
                sshHost: c.sshHost || "",
                sshPort: c.sshPort || 22,
                sshUsername: c.sshUsername || "",
                sshAuth: c.sshAuth || "password",
                sshHostKeyFingerprint: c.sshHostKeyFingerprint || "",
                sshHostKeyAlgorithm: c.sshHostKeyAlgorithm || ""
            }
        } else {
            const proposed = Object.assign(defined(root.initial), defined(root.pendingPrefill))
            const engine = root.engines.includes(proposed.engine) ? proposed.engine : "mysql"
            form = Object.assign({
                name: "", host: "", port: root.defaultPorts[engine], username: "", database: "", tag: null,
                sshMode: "none", sshServerId: "", sshHost: "", sshPort: 22, sshUsername: "", sshAuth: "password",
                sshHostKeyFingerprint: "", sshHostKeyAlgorithm: ""
            }, proposed, { engine: engine })
        }
        root.pendingPrefill = null
        root.epoch++

        root.filling = true
        root.engine = root.engines.includes(form.engine) ? form.engine : "mysql"
        nameField.text = String(form.name || "")
        hostField.text = String(form.host || "")
        portField.text = form.port ? String(form.port) : ""
        userField.text = String(form.username || "")
        passwordInput.text = ""
        root.tag = form.tag ? String(form.tag) : ""
        setDatabase(String(form.database || ""))
        root.sshMode = form.sshMode === "server" || form.sshMode === "custom" ? form.sshMode : "none"
        root.sshServerId = String(form.sshServerId || "")
        sshHostField.text = String(form.sshHost || "")
        sshPortField.text = form.sshPort ? String(form.sshPort) : ""
        sshUserField.text = String(form.sshUsername || "")
        root.sshAuth = form.sshAuth === "key" ? "key" : "password"
        sshPasswordField.text = ""
        keyArea.text = ""
        root.sshHostKeyFingerprint = String(form.sshHostKeyFingerprint || "")
        root.sshHostKeyAlgorithm = String(form.sshHostKeyAlgorithm || "")
        root.filling = false

        root.tab = "connection"
        root.error = ""
        root.showPassword = false
        root.passwordLoaded = !c
        root.passwordDirty = false
        root.revealing = false
        root.confirmDelete = false
        root.singleDatabase = String(form.database || "") !== ""
        root.tunnelKind = root.sshMode === "custom" ? "custom" : "server"
        root.sshSecretDirty = false
        root.hostBeforeTunnel = c && c.sshMode && c.sshMode !== "none" ? "" : hostField.text
        root.scan = null
        root.scanning = false
        root.scanError = ""
        root.saving = false
        root.deleting = false
        resetProbe()
    }

    /* Los servidores del panel por los que puede pasar el túnel. */
    function loadServers() {
        Api.request("GET", "/servers", null, (ok, data) => {
            if (ok && data) root.servers = Array.from(data)
        })
    }

    /* Cualquier cambio en los datos deja sin valor la prueba anterior. */
    function resetProbe() {
        root.testSeq++
        root.testing = false
        root.testResult = null
    }

    /* Un campo de texto cambió por mano del usuario. */
    function edited(field) {
        if (root.filling) return
        resetProbe()
        if (field === "password") root.passwordDirty = true
        else if (field === "sshSecret") root.sshSecretDirty = true
        else if (field === "database") root.database = redisField.text
        else if (field === "sshHost" || field === "sshPort") {
            /* Otro host o puerto SSH: la huella confirmada era de otro servidor. */
            root.sshHostKeyFingerprint = ""
            root.sshHostKeyAlgorithm = ""
        }
    }

    function setDatabase(name) {
        const before = root.filling
        root.filling = true
        root.database = name
        redisField.text = /^[0-9]+$/.test(name) ? name : ""
        root.filling = before
    }

    function selectEngine(next) {
        resetProbe()
        const previous = root.engine
        if (next === previous) return
        root.filling = true
        /* El puerto solo sigue al motor mientras nadie lo haya cambiado a mano. */
        if (root.port === root.defaultPorts[previous]) portField.text = String(root.defaultPorts[next])
        root.filling = false
        /* El índice de Redis no vale como nombre de base SQL, ni al revés. */
        if ((next === "redis") !== (previous === "redis")) setDatabase("")
        root.engine = next
    }

    function setTunnel(on) {
        resetProbe()
        /* Sin servidores dados de alta solo cabe usar credenciales propias. */
        const kind = root.servers.length > 0 ? root.tunnelKind : "custom"
        if (on) root.tunnelKind = kind
        if (on === root.tunnelOn) return
        root.filling = true
        if (on) {
            root.hostBeforeTunnel = hostField.text
            root.sshMode = kind
            hostField.text = root.tunnelHost
        } else {
            root.sshMode = "none"
            hostField.text = root.hostBeforeTunnel
        }
        root.filling = false
    }

    function selectTunnelKind(kind) {
        resetProbe()
        root.tunnelKind = kind
        root.sshMode = kind
    }

    function selectSshAuth(auth) {
        resetProbe()
        root.sshSecretDirty = false
        root.filling = true
        root.sshAuth = auth
        sshPasswordField.text = ""
        keyArea.text = ""
        root.filling = false
    }

    /* La huella se lee sin autenticarse y el usuario la compara antes de enviar credenciales. */
    function readHostKey() {
        if (root.scanning) return
        const at = root.epoch
        const target = root.sshTarget
        root.scanning = true
        root.scanError = ""
        Api.request("POST", "/servers/host-key/scan",
                    { host: sshHostField.text.trim(), port: root.sshPort || 22 }, (ok, data, failure) => {
            if (at !== root.epoch) return
            root.scanning = false
            if (!ok || !data || !data.fingerprint) {
                root.scanError = errorText(failure, "No se pudo leer la clave del servidor SSH. Verifica el host y el puerto.")
                return
            }
            root.scan = { target: target, key: data }
        })
    }

    function confirmHostKey() {
        if (!root.scan) return
        resetProbe()
        root.sshHostKeyFingerprint = String(root.scan.key.fingerprint)
        root.sshHostKeyAlgorithm = root.scan.key.algorithm ? String(root.scan.key.algorithm) : ""
        root.scan = null
    }

    /* El ojo es el único sitio donde la app recibe la contraseña en claro. */
    function togglePassword() {
        if (root.revealing) return
        if (root.showPassword || root.passwordLoaded || root.passwordDirty
                || !root.connection || !root.connection.hasPassword) {
            root.showPassword = !root.showPassword
            return
        }
        const at = root.epoch
        root.revealing = true
        root.error = ""
        Api.request("GET", "/databases/" + root.connection.id + "/password", null, (ok, data, failure) => {
            if (at !== root.epoch) return
            root.revealing = false
            if (!ok) { fail(errorText(failure, "No se pudo obtener la contraseña")); return }
            /* Si el usuario escribió mientras llegaba, manda lo que escribió. */
            if (!root.passwordDirty) {
                root.filling = true
                passwordInput.text = data && data.password ? String(data.password) : ""
                root.filling = false
            }
            root.passwordLoaded = true
            root.showPassword = true
        })
    }

    /* Solo los campos del túnel elegido; el backend borra los del modo anterior. */
    function tunnelPayload() {
        if (root.sshMode === "server") return { sshMode: "server", sshServerId: root.sshServerId }
        if (root.sshMode !== "custom") return { sshMode: "none" }
        const body = {
            sshMode: "custom",
            sshHost: sshHostField.text.trim(),
            sshPort: root.sshPort,
            sshUsername: sshUserField.text.trim(),
            sshAuth: root.sshAuth
        }
        if (root.sshSecretDirty && root.sshSecret !== "") body.sshSecret = root.sshSecret
        if (root.sshHostKeyFingerprint !== "") body.sshHostKeyFingerprint = root.sshHostKeyFingerprint
        if (root.sshHostKeyAlgorithm !== "") body.sshHostKeyAlgorithm = root.sshHostKeyAlgorithm
        return body
    }

    function payload() {
        const body = {
            engine: root.engine,
            name: nameField.text.trim(),
            host: hostField.text.trim(),
            port: root.port,
            username: userField.text,
            tag: root.tag !== "" ? root.tag : null,
            database: root.singleDatabase || root.isRedis ? root.database.trim() : ""
        }
        /* Omitida, el backend conserva la guardada; vacía, la borra. */
        if (root.sendPassword) body.password = passwordInput.text
        return Object.assign(body, tunnelPayload())
    }

    /* Lo que viaja para probar o listar bases: sin `name` ni `tag` y, en
       edición, con `connectionId` para usar lo guardado. */
    function probePayload() {
        const body = payload()
        delete body.name
        delete body.tag
        if (root.connection) body.connectionId = root.connection.id
        return body
    }

    /* Lo que falta en el túnel para poder conectar; "" si está completo. */
    function tunnelProblem() {
        if (root.sshMode === "server") {
            if (root.sshServerId === "") return "Elige el servidor por el que pasa el túnel SSH."
            if (root.selectedServer && !root.selectedServer.hostKeyFingerprint)
                return root.selectedServer.name + " aún no tiene la huella SSH confirmada: confírmala desde su detalle."
            return ""
        }
        if (root.sshMode !== "custom") return ""
        if (sshHostField.text.trim() === "" || !root.sshPort || sshUserField.text.trim() === "")
            return "Completa el host, el puerto y el usuario del servidor SSH."
        if (!(root.sshSecretDirty && root.sshSecret !== "") && !root.storedSecretUsable)
            return root.sshAuth === "key" ? "Pega la llave privada SSH." : "Escribe la contraseña SSH."
        if (root.keyState && !root.keyState.valid) return root.keyState.error || "La llave privada no es válida."
        if (root.sshHostKeyFingerprint === "") return "Lee y confirma la huella del servidor SSH."
        return ""
    }

    function connectionProblem() {
        if (hostField.text.trim() === "" || !root.port) return "Completa el host y el puerto en la pestaña Conexión."
        if (!root.isRedis && userField.text.trim() === "") return "Completa el usuario en la pestaña Conexión."
        return ""
    }

    /* El campo numérico del original no deja pasar puertos fuera de rango. */
    function portProblem() {
        return root.port > 65535 ? "El puerto debe estar entre 1 y 65535." : ""
    }

    /* Bases que ve el usuario con los datos sin guardar (selector de base). */
    function loadDatabases(done) {
        Api.request("POST", "/databases/schemas", probePayload(), (ok, data, failure) => {
            done(ok, ok && data ? data : [], ok ? "" : errorText(failure, ""))
        })
    }

    function test() {
        if (root.testing) return
        root.error = ""
        const problem = connectionProblem() || portProblem() || tunnelProblem()
        if (problem !== "") { fail(problem); return }
        const seq = ++root.testSeq
        root.testResult = null
        root.testing = true
        Api.request("POST", "/databases/test", probePayload(), (ok, data, failure) => {
            if (seq !== root.testSeq) return
            root.testing = false
            /* Un rechazo de la petición (validación, límite de intentos) se muestra como prueba fallida. */
            root.testResult = ok && data ? data
                            : { ok: false, version: null, error: errorText(failure, "No se pudo conectar"), latencyMs: 0 }
        })
    }

    function submit() {
        if (root.saving) return
        root.error = ""
        /* Las pestañas ocultas no se ven: su validación se hace aquí y se salta a la que falla. */
        const problem = connectionProblem() || portProblem()
        if (nameField.text.trim() === "" || problem !== "") {
            root.tab = "connection"
            fail(problem !== "" ? problem : "Escribe el nombre de la conexión.")
            return
        }
        const tunnel = tunnelProblem()
        if (tunnel !== "") { root.tab = "ssh"; fail(tunnel); return }
        if (root.singleDatabase && !root.isRedis && root.database.trim() === "") {
            root.tab = "database"
            fail("Elige la base de datos de la lista.")
            return
        }

        const at = root.epoch
        const id = root.connection ? root.connection.id : ""
        root.saving = true
        Api.request(id !== "" ? "PATCH" : "POST", id !== "" ? "/databases/" + id : "/databases", payload(),
                    (ok, data, failure) => {
            const done = ok && data && data.id
            /* Guardada queda aunque el modal ya no esté: la lista debe enterarse. */
            if (done) root.saved(data)
            if (at !== root.epoch) return
            root.saving = false
            if (!done) { fail(errorText(failure, "No se pudo guardar la conexión")); return }
            root.close()
        })
    }

    /* Dos pulsaciones: la primera pide confirmación en el propio botón. */
    function remove() {
        if (!root.connection || root.deleting) return
        if (!root.confirmDelete) { root.confirmDelete = true; return }
        const at = root.epoch
        const id = root.connection.id
        root.deleting = true
        Api.request("DELETE", "/databases/" + id, null, (ok, data, failure) => {
            if (ok) {
                /* Con la conexión se van sus pestañas del editor y sus consultas guardadas en el equipo. */
                App.storeRemove("sql_editors:" + id)
                App.storeRemove("sql_queries:" + id)
                root.deleted(id)
            }
            if (at !== root.epoch) return
            root.deleting = false
            root.confirmDelete = false
            if (!ok) { fail(errorText(failure, "No se pudo eliminar la conexión")); return }
            root.close()
        })
    }

    onAboutToShow: {
        resetForm()
        loadServers()
    }
    onOpened: nameField.forceFocus()
    /* Al cerrar no queda en memoria ninguna contraseña revelada o escrita. */
    onClosed: {
        root.epoch++
        root.testSeq++
        root.filling = true
        passwordInput.text = ""
        sshPasswordField.text = ""
        keyArea.text = ""
        root.filling = false
        root.showPassword = false
        root.saving = false
        root.deleting = false
        root.testing = false
        root.revealing = false
        root.scanning = false
    }

    /* ── Barra inferior ────────────────────────────────────────────── */
    property Item footerBar: Item {
        width: root.width - 48
        implicitHeight: footerFlow.implicitHeight

        Flow {
            id: footerFlow
            width: parent.width
            spacing: 12

            /* Ancho de los botones y sus huecos: lo que sobra separa los dos grupos. */
            readonly property real fixed: testButton.width + cancelButton.width + saveButton.width + 36
                                          + (deleteButton.visible ? deleteButton.width + 12 : 0)

            SoftButton {
                id: testButton
                text: "Probar conexión"
                loading: root.testing
                enabled: !root.testing && hostField.text.trim() !== "" && root.port > 0
                onClicked: root.test()
            }
            SoftButton {
                id: deleteButton
                visible: root.editing
                danger: true
                text: root.confirmDelete ? "Confirmar eliminación" : "Eliminar"
                enabled: !root.deleting
                onClicked: root.remove()
                /* Al irse el foco se olvida la confirmación a medias. */
                onActiveFocusChanged: if (!activeFocus) root.confirmDelete = false
            }
            /* En una sola línea, empuja Cancelar y Guardar a la derecha; si no caben, desaparece. */
            Item {
                visible: footerFlow.width - footerFlow.fixed >= 1
                width: Math.max(0, footerFlow.width - footerFlow.fixed - 1)
                height: 1
            }
            SecondaryButton {
                id: cancelButton
                text: "Cancelar"
                enabled: !root.saving
                onClicked: root.close()
            }
            PrimaryButton {
                id: saveButton
                text: root.saving ? "Guardando…" : root.editing ? "Guardar cambios" : "Guardar conexión"
                loading: root.saving
                enabled: !root.saving
                onClicked: root.submit()
            }
        }
    }

    /* ── Pestañas ──────────────────────────────────────────────────── */
    Segmented {
        width: root.bodyWidth
        showIcons: root.wide
        value: root.tab
        options: [
            { id: "connection", label: "Conexión",
              icon: "M9 7H6a5 5 0 0 0 0 10h3M15 7h3a5 5 0 0 1 0 10h-3M8 12h8" },
            { id: "database", label: "Base de datos",
              icon: "M5 5.5a7 2.5 0 1 0 14 0a7 2.5 0 1 0 -14 0M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" },
            { id: "ssh", label: "Túnel SSH", dot: root.tunnelOn,
              icon: "M5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1 -2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4zM7 9l3 3-3 3M12 15h5" }
        ]
        onPicked: id => root.tab = id
        Accessible.name: "Secciones de la conexión"
    }

    /* ── Error ─────────────────────────────────────────────────────── */
    ServerNotice {
        id: errorBox
        visible: root.error !== ""
        width: root.bodyWidth
        accent: Theme.danger

        Label {
            width: parent.width
            text: root.error
            color: Theme.tone("rose").text
            lineHeight: 1.3
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── Contenido de la pestaña. Alto mínimo común: el modal no salta al cambiar. ── */
    Item {
        width: root.bodyWidth
        height: Math.max(400, root.tab === "connection" ? connectionPane.implicitHeight
                            : root.tab === "database" ? databasePane.implicitHeight
                            : sshPane.implicitHeight)

        /* ── Conexión ──────────────────────────────────────────────── */
        Column {
            id: connectionPane
            visible: root.tab === "connection"
            width: parent.width
            spacing: 20

            /* Motor */
            ServerField {
                width: parent.width
                label: "Motor *"

                Flow {
                    id: engineFlow
                    width: parent.width
                    spacing: 12
                    readonly property int columns: root.wide ? 4 : 2
                    Accessible.name: "Motor de base de datos"

                    Repeater {
                        model: root.engines

                        Item {
                            id: engineCell
                            required property string modelData
                            readonly property bool active: root.engine === modelData

                            width: Math.floor((engineFlow.width - 12 * (engineFlow.columns - 1)) / engineFlow.columns)
                            height: engineColumn.implicitHeight + 24
                            scale: engineTap.pressed ? 0.98 : 1
                            activeFocusOnTab: true
                            Accessible.role: Accessible.RadioButton
                            Accessible.name: root.engineLabels[modelData]
                            Accessible.checked: active
                            Keys.onSpacePressed: root.selectEngine(modelData)
                            Keys.onReturnPressed: root.selectEngine(modelData)
                            Behavior on scale { NumberAnimation { duration: Theme.moFast } }

                            Glass {
                                anchors.fill: parent
                                visible: !engineCell.active
                                variant: "soft"
                                elevation: "flat"
                                radius: Theme.radiusXl
                                highlighted: engineHover.hovered
                                borderColor: engineCell.activeFocus ? Theme.focusRing
                                           : engineHover.hovered ? Theme.hairlineHover : Theme.hairlineSoft
                            }
                            Elevation {
                                anchors.fill: parent
                                visible: engineCell.active
                                level: "flat"
                                radius: Theme.radiusXl
                            }
                            BrandFill {
                                anchors.fill: parent
                                visible: engineCell.active
                                radius: Theme.radiusXl
                                strength: 0.18
                            }
                            Rectangle {
                                anchors.fill: parent
                                visible: engineCell.active
                                radius: Theme.radiusXl
                                color: "transparent"
                                border.width: 1
                                border.color: engineCell.activeFocus ? Theme.focusRing : Theme.hairlineStrong
                            }
                            Column {
                                id: engineColumn
                                anchors.centerIn: parent
                                spacing: 8
                                EngineIcon {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    engine: engineCell.modelData
                                }
                                Label {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    width: Math.min(implicitWidth, engineCell.width - 16)
                                    text: root.engineLabels[engineCell.modelData]
                                    tone: engineCell.active || engineHover.hovered ? 1 : 0.6
                                    font.weight: Font.Medium
                                }
                            }
                            HoverHandler { id: engineHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler {
                                id: engineTap
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: root.selectEngine(engineCell.modelData)
                            }
                        }
                    }
                }
            }

            /* Nombre + etiqueta (opcional, una de la lista) en la misma fila. */
            Flow {
                id: nameRow
                width: parent.width
                spacing: 16
                readonly property real tagWidth: Math.max(150, Math.floor((width - 16) * 0.15))

                ServerField {
                    width: root.wide ? nameRow.width - 16 - nameRow.tagWidth : nameRow.width
                    label: "Nombre de la conexión *"
                    GlassField {
                        id: nameField
                        width: parent.width
                        maximumLength: 100
                        placeholder: "Ej: StartCode producción"
                        onTextChanged: root.edited("name")
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
                        HoverTip { text: "Opcional: clasifica la conexión para encontrarla luego con los filtros" }
                    }
                }
            }

            /* Host + Puerto */
            Column {
                width: parent.width
                spacing: 6

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
                            mono: true
                            maximumLength: 253
                            placeholder: "192.168.1.10 o db.example.com"
                            /* Con túnel el host lo fija el panel. */
                            enabled: !root.tunnelOn
                            onTextChanged: root.edited("host")
                            onAccepted: root.submit()

                            Binding {
                                target: hostField.input
                                property: "color"
                                value: Theme.ink(root.tunnelOn ? 0.45 : 1)
                            }
                        }
                    }
                    ServerField {
                        width: root.wide ? hostRow.third : hostRow.width
                        label: "Puerto *"
                        GlassField {
                            id: portField
                            width: parent.width
                            mono: true
                            maximumLength: 5
                            inputMethodHints: Qt.ImhDigitsOnly
                            /* Solo cifras: el puerto es un entero entre 1 y 65535. */
                            onTextChanged: {
                                const clean = text.replace(/[^0-9]/g, "")
                                if (clean !== text) { text = clean; return }
                                root.edited("port")
                            }
                            onAccepted: root.submit()
                        }
                    }
                }
                Hint {
                    visible: root.tunnelOn
                    width: parent.width
                    text: "Conectas por túnel SSH: el motor se alcanza desde el servidor SSH en " + root.tunnelHost
                          + ". El puerto es el del motor en ese servidor."
                }
            }

            /* Credenciales */
            Flow {
                id: credentialsRow
                width: parent.width
                spacing: 16
                readonly property real half: Math.floor((width - 16) / 2)

                ServerField {
                    width: root.wide ? credentialsRow.half : credentialsRow.width
                    label: "Usuario " + (root.isRedis ? "(opcional)" : "*")
                    GlassField {
                        id: userField
                        width: parent.width
                        maximumLength: 128
                        placeholder: root.hints.user
                        onTextChanged: root.edited("username")
                        onAccepted: root.submit()
                    }
                }
                ServerField {
                    width: root.wide ? credentialsRow.half : credentialsRow.width
                    label: "Contraseña"

                    /* Campo propio: el ojo no solo muestra el texto, también
                       pide al backend la contraseña guardada. */
                    Glass {
                        variant: "input"
                        width: parent.width
                        height: Theme.fieldHeight
                        focused: passwordInput.activeFocus

                        Item {
                            anchors.left: parent.left
                            anchors.leftMargin: 14
                            anchors.right: eyeButton.left
                            anchors.rightMargin: 8
                            height: parent.height
                            clip: true

                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width
                                visible: passwordInput.text.length === 0 && passwordInput.preeditText.length === 0
                                text: root.editing && !root.sendPassword
                                      ? (root.connection && root.connection.hasPassword ? "•••••••• guardada" : "Sin contraseña")
                                      : "••••••••"
                                tone: 0.3
                            }
                            TextInput {
                                id: passwordInput
                                anchors.fill: parent
                                verticalAlignment: TextInput.AlignVCenter
                                color: Theme.ink(1)
                                selectionColor: Theme.brand1(0.45)
                                selectedTextColor: Theme.ink(1)
                                font.family: root.showPassword ? Theme.fontMono : Theme.fontUi
                                font.pixelSize: Theme.textSm
                                echoMode: root.showPassword ? TextInput.Normal : TextInput.Password
                                maximumLength: 1024
                                selectByMouse: true
                                activeFocusOnTab: true
                                Accessible.name: "Contraseña"
                                onTextChanged: root.edited("password")
                                onAccepted: root.submit()
                            }
                            HoverHandler { cursorShape: Qt.IBeamCursor }
                            TapHandler {
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: passwordInput.forceActiveFocus()
                            }
                        }
                        IconButton {
                            id: eyeButton
                            anchors.right: parent.right
                            anchors.rightMargin: 6
                            anchors.verticalCenter: parent.verticalCenter
                            plain: true
                            size: 32
                            iconName: root.revealing ? "" : root.showPassword ? "eyeOff" : "eye"
                            hint: root.showPassword ? "Ocultar contraseña" : "Ver contraseña"
                            enabled: !root.revealing
                            onClicked: root.togglePassword()
                        }
                        Spinner {
                            visible: root.revealing
                            anchors.centerIn: eyeButton
                        }
                    }
                }
            }
        }

        /* ── Base de datos ─────────────────────────────────────────── */
        Column {
            id: databasePane
            visible: root.tab === "database"
            width: parent.width
            spacing: 20

            /* Redis: índice de la base */
            ServerField {
                visible: root.isRedis
                width: parent.width
                label: "Índice de la base (opcional)"
                GlassField {
                    id: redisField
                    width: parent.width
                    mono: true
                    maximumLength: 2
                    inputMethodHints: Qt.ImhDigitsOnly
                    placeholder: root.hints.database
                    onTextChanged: {
                        const clean = text.replace(/[^0-9]/g, "")
                        if (clean !== text) { text = clean; return }
                        root.edited("database")
                    }
                    onAccepted: root.submit()
                }
                Hint {
                    width: parent.width
                    text: "Redis numera sus bases de 0 a 15. Vacío usa la 0."
                }
            }

            /* SQL: todas las bases o una concreta */
            ServerField {
                visible: !root.isRedis
                width: parent.width
                label: "Bases a las que entra la conexión"

                Segmented {
                    width: parent.width
                    value: root.singleDatabase ? "single" : "all"
                    options: [
                        { id: "all", label: "Todas las bases de datos" },
                        { id: "single", label: "Una base concreta" }
                    ]
                    onPicked: id => { root.resetProbe(); root.singleDatabase = id === "single" }
                    Accessible.name: "Bases de datos"
                }
                Hint {
                    width: parent.width
                    text: root.singleDatabase
                          ? "La conexión entra directamente a la base elegida."
                          : "La conexión entra al servidor completo y el explorador muestra todas sus bases."
                }
            }

            Column {
                visible: pickerLoader.active
                width: parent.width
                spacing: 6

                /* Solo existe mientras se ve: al entrar en la pestaña se conecta y lista. */
                Loader {
                    id: pickerLoader
                    width: parent.width
                    active: root.visible && root.tab === "database" && !root.isRedis && root.singleDatabase
                    sourceComponent: ConnectionDatabasePicker {
                        width: pickerLoader.width
                        value: root.database
                        credentialsKey: root.credentialsKey
                        blockedReason: root.pickerBlocked
                        load: root.loadDatabases
                        onChange: name => { root.resetProbe(); root.setDatabase(name) }
                    }
                }
                Hint {
                    width: parent.width
                    text: "Lista las bases del servidor con los datos de la pestaña Conexión"
                          + (root.tunnelOn ? " y el túnel SSH" : "") + "."
                }
            }
        }

        /* ── Túnel SSH ─────────────────────────────────────────────── */
        Column {
            id: sshPane
            visible: root.tab === "ssh"
            width: parent.width
            spacing: 20

            Glass {
                width: parent.width
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                implicitHeight: tunnelText.implicitHeight + 32

                Column {
                    id: tunnelText
                    x: 16; y: 16
                    width: parent.width - 32 - tunnelToggle.width - 16
                    spacing: 4
                    Label {
                        width: parent.width
                        text: "Conectar por túnel SSH"
                        tone: 0.9
                        font.weight: Font.Medium
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Label {
                        width: parent.width
                        text: "Para motores que solo escuchan dentro del servidor o de su red privada. Al activarlo, el host de la pestaña Conexión pasa a ser "
                              + root.tunnelHost + " (visto desde el servidor SSH)."
                        tone: 0.5
                        font.pixelSize: Theme.textXs
                        lineHeight: 1.4
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
                Toggle {
                    id: tunnelToggle
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    checked: root.tunnelOn
                    Accessible.name: "Conectar por túnel SSH"
                    onToggled: {
                        root.setTunnel(checked)
                        /* El interruptor sigue siempre al estado real. */
                        checked = Qt.binding(() => root.tunnelOn)
                    }
                }
            }

            Segmented {
                visible: root.tunnelOn
                width: parent.width
                value: root.tunnelKind
                options: [
                    { id: "server", label: "Servidor existente" },
                    { id: "custom", label: "Credenciales SSH" }
                ]
                onPicked: id => root.selectTunnelKind(id)
                Accessible.name: "Origen del túnel"
            }

            /* Por un servidor del panel */
            ServerField {
                visible: root.tunnelOn && root.tunnelKind === "server"
                width: parent.width
                spacing: 8
                label: "Servidor SSH *"

                Glass {
                    variant: "input"
                    width: parent.width
                    height: Theme.fieldHeight
                    Select {
                        anchors.fill: parent
                        anchors.leftMargin: 14
                        anchors.rightMargin: 14
                        value: root.sshServerId
                        options: root.serverOptions
                        placeholder: root.servers.length > 0 ? "Elige un servidor" : "No tienes servidores dados de alta"
                        enabled: root.servers.length > 0
                        onPicked: value => { root.resetProbe(); root.sshServerId = value }
                        Accessible.name: "Servidor SSH del túnel"
                    }
                }
                Label {
                    visible: !!root.selectedServer && !root.selectedServer.hostKeyFingerprint
                    width: parent.width
                    text: (root.selectedServer ? root.selectedServer.name : "")
                          + " aún no tiene la huella SSH confirmada. Confírmala desde su detalle antes de usarlo como túnel."
                    color: Theme.tone("amber").text
                    font.pixelSize: Theme.textXs
                    lineHeight: 1.4
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Hint {
                    visible: !root.selectedServer || !!root.selectedServer.hostKeyFingerprint
                    width: parent.width
                    text: "Usa el usuario, la llave privada y la huella confirmada de ese servidor."
                }
            }

            /* Con credenciales SSH propias */
            Column {
                visible: root.tunnelOn && root.tunnelKind === "custom"
                width: parent.width
                spacing: 20

                Flow {
                    id: sshHostRow
                    width: parent.width
                    spacing: 16
                    readonly property real third: Math.floor((width - 16) / 3)

                    ServerField {
                        width: root.wide ? sshHostRow.width - 16 - sshHostRow.third : sshHostRow.width
                        label: "Host SSH *"
                        GlassField {
                            id: sshHostField
                            width: parent.width
                            mono: true
                            maximumLength: 253
                            placeholder: "bastion.example.com"
                            onTextChanged: root.edited("sshHost")
                            onAccepted: root.submit()
                        }
                    }
                    ServerField {
                        width: root.wide ? sshHostRow.third : sshHostRow.width
                        label: "Puerto SSH *"
                        GlassField {
                            id: sshPortField
                            width: parent.width
                            mono: true
                            maximumLength: 5
                            inputMethodHints: Qt.ImhDigitsOnly
                            onTextChanged: {
                                const clean = text.replace(/[^0-9]/g, "")
                                if (clean !== text) { text = clean; return }
                                root.edited("sshPort")
                            }
                            onAccepted: root.submit()
                        }
                    }
                }

                Flow {
                    id: sshUserRow
                    width: parent.width
                    spacing: 16
                    readonly property real half: Math.floor((width - 16) / 2)

                    ServerField {
                        width: root.wide ? sshUserRow.half : sshUserRow.width
                        label: "Usuario SSH *"
                        GlassField {
                            id: sshUserField
                            width: parent.width
                            maximumLength: 64
                            placeholder: "deploy"
                            onTextChanged: root.edited("sshUsername")
                            onAccepted: root.submit()
                        }
                    }
                    ServerField {
                        width: root.wide ? sshUserRow.half : sshUserRow.width
                        label: "Autenticación"
                        Segmented {
                            width: parent.width
                            value: root.sshAuth
                            options: [
                                { id: "password", label: "Contraseña" },
                                { id: "key", label: "Llave privada" }
                            ]
                            onPicked: id => { if (id !== root.sshAuth) root.selectSshAuth(id) }
                            Accessible.name: "Autenticación SSH"
                        }
                    }
                }

                /* Llave privada */
                Column {
                    visible: root.sshAuth === "key"
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
                            text: "Llave privada SSH *"
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
                            text: root.keyState && root.keyState.valid ? "Llave válida" : "Llave inválida"
                        }
                    }
                    GlassArea {
                        id: keyArea
                        width: parent.width
                        height: 124
                        mono: true
                        placeholder: root.storedSecretUsable && !root.sshSecretDirty
                                     ? "Guardada. Pega otra para reemplazarla."
                                     : "-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"
                        onTextChanged: root.edited("sshSecret")
                    }
                    Hint {
                        width: parent.width
                        text: "Sin frase de paso. Se guarda cifrada y no vuelve a mostrarse."
                    }
                }

                /* Contraseña SSH */
                ServerField {
                    visible: root.sshAuth !== "key"
                    width: parent.width
                    label: "Contraseña SSH *"
                    GlassField {
                        id: sshPasswordField
                        width: parent.width
                        password: true
                        maximumLength: 16384
                        placeholder: root.storedSecretUsable && !root.sshSecretDirty ? "•••••••• guardada" : "••••••••"
                        onTextChanged: root.edited("sshSecret")
                        onAccepted: root.submit()
                    }
                }

                /* Huella: se lee sin autenticarse y se confirma antes de enviar credenciales. */
                ServerField {
                    width: parent.width
                    label: "Huella del servidor SSH *"

                    /* Ya confirmada */
                    Column {
                        visible: root.hostKeyConfirmed && !root.scan
                        width: parent.width
                        spacing: 8

                        HostKeyBlock {
                            width: parent.width
                            label: "Confirmada"
                            info: ({ algorithm: root.sshHostKeyAlgorithm || null, fingerprint: root.sshHostKeyFingerprint })
                            tone: "muted"
                        }
                        SoftButton {
                            implicitHeight: 36
                            text: "Volver a leer"
                            loading: root.scanning
                            enabled: !root.scanning
                            onClicked: root.readHostKey()
                        }
                    }

                    /* Leída, pendiente de comparar */
                    Column {
                        visible: !!root.scan
                        width: parent.width
                        spacing: 12

                        ServerNotice {
                            width: parent.width
                            accent: Theme.warn

                            /* Texto seleccionable: el comando se copia para ejecutarlo en el servidor. */
                            TextEdit {
                                width: parent.width
                                textFormat: TextEdit.RichText
                                text: logic.mono(root.scan ? root.scan.target : "", 0.8)
                                      + " presentó esta clave. Aún no se envió ninguna credencial: compárala en el servidor con "
                                      + logic.mono(logic.hostKeyCheckCommand, 0.8)
                                      + ". Si no coincide, no continúes."
                                readOnly: true
                                selectByMouse: true
                                wrapMode: TextEdit.Wrap
                                color: Theme.ink(0.6)
                                selectionColor: Theme.brand1(0.45)
                                selectedTextColor: Theme.ink(1)
                                font.family: Theme.fontUi
                                font.pixelSize: Theme.textXs
                            }
                        }
                        HostKeyBlock {
                            width: parent.width
                            label: "Presentada por el servidor"
                            info: root.scan ? root.scan.key : null
                            tone: "muted"
                        }
                        Flow {
                            width: parent.width
                            spacing: 8
                            SoftButton {
                                implicitHeight: 36
                                text: "Descartar"
                                onClicked: root.scan = null
                            }
                            PrimaryButton {
                                implicitHeight: 36
                                text: "Coincide: confirmar"
                                onClicked: root.confirmHostKey()
                            }
                        }
                    }

                    /* Sin leer todavía */
                    Column {
                        visible: !root.hostKeyConfirmed && !root.scan
                        width: parent.width
                        spacing: 6

                        SoftButton {
                            text: "Leer huella del servidor"
                            loading: root.scanning
                            enabled: !root.scanning && sshHostField.text.trim() !== "" && root.sshPort > 0
                            onClicked: root.readHostKey()
                        }
                        Hint {
                            width: parent.width
                            text: "El panel solo se autentica contra la huella que confirmes."
                        }
                    }

                    Label {
                        visible: root.scanError !== ""
                        width: parent.width
                        topPadding: 2
                        text: root.scanError
                        color: Theme.tone("rose").text
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }
        }
    }

    /* ── Resultado de la prueba ────────────────────────────────────── */
    ServerNotice {
        visible: root.testResult !== null
        width: root.bodyWidth
        pad: 14
        accent: root.testResult && root.testResult.ok ? Theme.ok : Theme.danger

        Label {
            readonly property color okText: Theme.tone("emerald").text
            width: parent.width
            textFormat: Text.RichText
            text: {
                const result = root.testResult
                if (!result) return ""
                if (!result.ok) return logic.esc(result.error || "No se pudo conectar")
                let line = "Conexión correcta" + (root.tunnelOn ? " por túnel SSH" : "")
                if (result.version)
                    line += logic.code(" · " + root.engineLabels[root.engine] + " " + result.version, okText)
                return line + logic.code(" · " + result.latencyMs + " ms", Qt.alpha(okText, 0.7))
            }
            color: root.testResult && root.testResult.ok ? okText : Theme.tone("rose").text
            lineHeight: 1.3
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }
}
