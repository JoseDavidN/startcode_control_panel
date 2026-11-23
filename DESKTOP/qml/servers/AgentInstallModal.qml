import QtQuick
import StartCode

/* Instalar (o reinstalar) el agente en el servidor: primero pregunta la
   contraseña de sudo y después enseña el trabajo actividad a actividad, con
   los pasos que el backend manda por el socket `/agent`.

   Con `action: "uninstall"` hace la desinstalación con la misma pantalla
   (ver `AgentUninstallModal`): es el mismo trabajo, así que no se pinta de
   dos maneras distintas.

       AgentInstallModal { id: m; server: root.server; onSettled: recargar() }
       m.open() */
Modal {
    id: root

    /* `{ id, name, … }` del servidor. */
    property var server: null
    /* "install" | "uninstall" */
    property string action: "install"
    /* Solo en memoria: se manda con la operación y no se guarda. */
    property string sudoPassword: ""

    /* "form" = pidiendo lo que haga falta; "process" = trabajando. */
    property string phase: "form"
    /* "running" | "success" | "error" */
    property string status: "running"
    /* `{ code, message, detail? }` del intento fallido. */
    property var error: null
    /* Pasos finos del backend recibidos hasta ahora. */
    property var steps: []
    property bool busy: false

    /* La operación terminó, bien o mal: el estado del agente pudo cambiar. */
    signal settled(bool ok)

    readonly property bool uninstalling: action === "uninstall"
    readonly property string serverName: server ? String(server.name || "") : ""
    readonly property string serverId: server ? String(server.id || "") : ""

    /* Descarta respuestas de un intento anterior. */
    property int runId: 0
    property double startedAt: 0
    /* La petición se quedó sin respuesta y se sigue el trabajo por el estado. */
    property bool waiting: false
    property int pollFailures: 0
    property bool detailOpen: false

    /* El cliente HTTP corta a los 30 s y esto puede tardar más: es el mismo
       margen que da el panel web a estas operaciones. */
    readonly property int operationTimeout: 180000
    readonly property int clientTimeout: 180000

    /* El backend informa de pasos finos; aquí se agrupan en actividades con
       sentido y el detalle del paso en curso viaja como subtítulo. */
    readonly property var installActivities: [
        { id: "connect", label: "Conectando con el servidor", covers: ["ssh"] },
        { id: "prepare", label: "Comprobando el servidor", covers: ["privileges", "systemd", "arch"] },
        { id: "download", label: "Descargando el agente", covers: ["download", "checksum"] },
        { id: "install", label: "Instalando el servicio", covers: ["config", "service"] },
        { id: "verify", label: "Comprobando que reporta", covers: ["verify", "handshake"] }
    ]
    readonly property var uninstallActivities: [
        { id: "connect", label: "Conectando con el servidor", covers: ["ssh", "privileges"] },
        { id: "stop", label: "Parando el agente", covers: ["service"] },
        { id: "clean", label: "Borrando archivos", covers: ["files"] },
        { id: "verify", label: "Comprobando que no queda nada", covers: ["verify"] }
    ]
    readonly property var activities: resolveActivities(uninstalling ? uninstallActivities : installActivities, steps, status)

    /* ── Lo que se pinta en la pantalla de proceso ─────────────────── */
    readonly property var failedActivity: activities.find(a => a.status === "failed") || null
    readonly property var runningActivity: activities.find(a => a.status === "running") || null
    readonly property var currentActivity: failedActivity || runningActivity || activities[activities.length - 1] || null
    readonly property var previousActivity: {
        if (!currentActivity) return null
        const index = activities.findIndex(a => a.id === currentActivity.id)
        for (let i = index - 1; i >= 0; i--) {
            if (activities[i].status === "done") return activities[i]
        }
        return null
    }
    readonly property int doneCount: activities.filter(a => a.status === "done").length
    readonly property bool isError: status === "error" || failedActivity !== null
    readonly property bool isDone: status === "success"
    readonly property real percent: doneCount / Math.max(1, activities.length) * 100

    title: (uninstalling ? "Desinstalar agente · " : "Instalar agente · ") + serverName
    size: "md"
    /* Con el trabajo en marcha no se cierra: seguiría en el servidor sin verse. */
    dismissable: !busy

    onAboutToShow: resetState()
    onOpened: formField.forceFocus()
    onClosed: resetState()

    /* Una actividad se da por terminada cuando la siguiente ha empezado, o
       cuando el proceso entero acabó bien: así la pantalla avanza de una en
       una en vez de quedarse con varias casillas a medio marcar. */
    function resolveActivities(list, stepList, overall) {
        const byId = {}
        stepList.forEach(s => { byId[s.id] = s })
        const reported = list.map(activity => activity.covers.map(id => byId[id]).filter(s => !!s))

        /* La última actividad de la que se sabe algo: todo lo anterior ya pasó. */
        let current = -1
        reported.forEach((covered, index) => { if (covered.length > 0) current = index })

        return list.map((activity, index) => {
            const covered = reported[index]
            const failed = covered.find(s => s.status === "failed")
            const last = covered[covered.length - 1]

            let state
            if (failed) state = "failed"
            else if (overall === "success") state = "done"
            else if (index < current) state = "done"
            else if (index === current) state = "running"
            else state = "pending"

            const detail = failed && failed.detail ? failed.detail : last && last.detail ? last.detail : ""
            return { id: activity.id, label: activity.label, covers: activity.covers, status: state, detail: detail }
        })
    }

    function resetState() {
        runId++
        busy = false
        waiting = false
        pollFailures = 0
        phase = "form"
        status = "running"
        error = null
        steps = []
        detailOpen = false
    }

    /* Los pasos finales completan lo que el socket no llegó a traer. */
    function applyResult(finalSteps) {
        if (!finalSteps) return
        let next = steps.slice()
        Array.from(finalSteps).forEach(step => {
            const index = next.findIndex(s => s.id === step.id)
            if (index >= 0) next[index] = step
            else next.push(step)
        })
        steps = next
    }

    function start() {
        if (busy || !serverId) return
        phase = "process"
        status = "running"
        error = null
        steps = []
        detailOpen = false
        waiting = false
        pollFailures = 0
        busy = true
        startedAt = Date.now()

        const run = ++runId
        const body = {}
        if (sudoPassword) body.sudoPassword = sudoPassword
        if (!uninstalling) body.reinstall = true

        Api.request(uninstalling ? "DELETE" : "POST",
                    "/servers/" + serverId + (uninstalling ? "/agent" : "/agent/install"),
                    body, (ok, data, failure) => {
            if (run !== root.runId) return
            if (ok) {
                const result = data || {}
                root.applyResult(result.steps)
                root.finish(result.ok === true, result.error)
                return
            }
            /* Sin respuesta tras agotar la espera del cliente: el servidor
               sigue trabajando, así que se sigue su estado en vez de fallar. */
            if (failure && failure.status === 0 && Date.now() - root.startedAt >= root.clientTimeout - 2000) {
                root.waiting = true
                return
            }
            root.finish(false, { code: "UNKNOWN", message: failure && failure.message ? failure.message : "La operación no se completó" })
        }, 180000)
    }

    function finish(ok, failure) {
        waiting = false
        busy = false
        if (ok) {
            status = "success"
            error = null
        } else {
            status = "error"
            error = failure || { code: "UNKNOWN", message: "La operación no se completó" }
        }
        settled(ok)
    }

    /* Seguimiento sin respuesta HTTP: el estado guardado dice cómo acabó. */
    function poll() {
        const run = runId
        Api.request("GET", "/servers/" + serverId + "/agent", null, (ok, agent, failure) => {
            if (run !== root.runId || !root.waiting) return
            if (!ok || !agent) {
                if (++root.pollFailures >= 3)
                    root.finish(false, { code: "UNKNOWN", message: failure && failure.message ? failure.message : "La operación no se completó" })
                return
            }
            root.pollFailures = 0

            if (root.uninstalling) {
                if (agent.state === "not_installed") {
                    root.applyResult(agent.steps)
                    root.finish(true, null)
                    return
                }
                /* Un fallo al desinstalar no se guarda en el estado: solo lo
                   cuenta el paso fallido que llegó por el socket. */
                const failed = root.steps.find(s => s.status === "failed")
                if (failed) {
                    root.finish(false, {
                        code: failed.id === "privileges" ? "SUDO_PASSWORD" : "UNKNOWN",
                        message: failed.detail || "La operación no se completó"
                    })
                }
                return
            }

            if (agent.state === "installing") return
            root.applyResult(agent.steps)
            /* Un error de este intento es posterior a su arranque; uno más
               viejo es de otro intento y no cuenta. */
            const fresh = agent.lastError && agent.lastAttemptAt
                          && Date.parse(agent.lastError.at) >= Date.parse(agent.lastAttemptAt)
            if (fresh) root.finish(false, agent.lastError)
            else if (agent.state === "installed") root.finish(true, null)
            else root.finish(false, agent.lastError)
        })
    }

    Timer {
        interval: 3000
        repeat: true
        running: root.waiting
        onTriggered: {
            if (Date.now() - root.startedAt > root.operationTimeout) {
                root.finish(false, { code: "UNKNOWN", message: "No se recibió respuesta del servidor" })
                return
            }
            root.poll()
        }
    }

    /* Se deja ver el visto bueno un momento antes de cerrar. */
    Timer {
        interval: 1200
        running: root.isDone && root.visible
        onTriggered: root.close()
    }

    Connections {
        target: Realtime
        function onEvent(name, payload) {
            if (name !== "agent:install:progress" || !root.visible || root.phase !== "process") return
            if (!payload || !payload.step || !root.serverId || payload.serverId !== root.serverId) return
            const step = payload.step
            root.steps = root.steps.filter(s => s.id !== step.id).concat([step])
        }
    }

    /* ── Antes de tocar nada se pregunta lo que hace falta ─────────── */
    Column {
        visible: root.phase === "form"
        width: root.bodyWidth
        spacing: 20

        Label {
            width: parent.width
            text: root.uninstalling
                  ? "Se parará el servicio y se borrarán el binario, la unidad de systemd y la configuración de " + root.serverName + "."
                  : "El panel se conectará por SSH a " + root.serverName + ", descargará el agente y lo dejará corriendo como servicio de systemd."
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            lineHeight: 1.4
        }

        Column {
            width: parent.width
            spacing: 6

            Row {
                spacing: 4
                Label { text: "Contraseña de sudo"; tone: 0.55; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
                Label { text: "(opcional)"; tone: 0.35; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
            }
            GlassField {
                id: formField
                width: parent.width
                password: true
                placeholder: "Solo si el usuario SSH no es root"
                text: root.sudoPassword
                onTextChanged: if (root.sudoPassword !== text) root.sudoPassword = text
                onAccepted: root.start()
                Accessible.name: "Contraseña de sudo"
            }
            Label {
                width: parent.width
                text: "Se usa para esta operación y no se guarda. Si el usuario es root o tiene sudo sin contraseña, déjalo vacío."
                tone: 0.4
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Column {
            width: parent.width
            spacing: 12
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            Row {
                anchors.right: parent.right
                spacing: 12
                SecondaryButton { text: "Cancelar"; onClicked: root.close() }
                PrimaryButton { visible: !root.uninstalling; text: "Instalar agente"; onClicked: root.start() }
                DangerButton { visible: root.uninstalling; text: "Desinstalar agente"; onClicked: root.start() }
            }
        }
    }

    /* ── Proceso: una sola actividad a la vista, la que está pasando ── */
    Column {
        visible: root.phase === "process"
        width: root.bodyWidth
        topPadding: 8
        bottomPadding: 8
        spacing: 16

        Glass {
            id: processCard
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.min(384, parent.width)
            variant: "soft"
            elevation: "raised"
            radius: Theme.radius2xl
            implicitHeight: processColumn.implicitHeight + 56

            Column {
                id: processColumn
                x: 28; y: 28
                width: parent.width - 56

                /* Indicador */
                Item {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 64; height: 64
                    Rectangle {
                        anchors.fill: parent
                        radius: width / 2
                        color: "transparent"
                        border.width: 2
                        border.color: root.isDone ? Qt.alpha(Theme.ok, 0.6)
                                    : root.isError ? Qt.alpha(Theme.danger, 0.6) : Theme.hairline
                    }
                    Spinner {
                        anchors.fill: parent
                        visible: !root.isDone && !root.isError
                        size: 64
                        color: Theme.brandLight1
                    }
                    Icon {
                        anchors.centerIn: parent
                        size: 28
                        name: root.isDone ? "check" : root.isError ? "close" : "server"
                        strokeWidth: root.isDone || root.isError ? 2 : 1.75
                        color: root.isDone ? Theme.tone("emerald").text
                             : root.isError ? Theme.tone("rose").text : Theme.ink(0.6)
                    }
                }

                Item { width: 1; height: 20 }

                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: root.isDone ? (root.uninstalling ? "Agente desinstalado" : "Agente instalado")
                        : root.status === "error" ? "La operación no se completó"
                        : root.uninstalling ? "Quitando el agente" : "Instalando el agente"
                    font.pixelSize: Theme.textBase
                    font.weight: Font.DemiBold
                }
                Item { width: 1; height: 4 }
                Label {
                    width: parent.width
                    visible: root.serverName !== ""
                    horizontalAlignment: Text.AlignHCenter
                    text: root.serverName
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
                Item { width: 1; height: 20 }

                /* Actividad en curso: una sola, la que importa ahora */
                Glass {
                    id: currentBox
                    visible: !root.isDone && root.currentActivity !== null
                    width: parent.width
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    borderColor: root.isError ? Qt.alpha(Theme.danger, 0.25) : Theme.brand1(0.25)
                    implicitHeight: currentColumn.implicitHeight + 28

                    Rectangle {
                        anchors.fill: parent
                        visible: root.isError
                        radius: currentBox.radius
                        color: Qt.alpha(Theme.danger, 0.07)
                    }
                    Column {
                        id: currentColumn
                        x: 14; y: 14
                        width: parent.width - 28
                        spacing: 6
                        Item {
                            width: parent.width
                            height: 20
                            Rectangle {
                                visible: root.isError
                                x: 3
                                anchors.verticalCenter: parent.verticalCenter
                                width: 8; height: 8; radius: 4
                                color: Theme.danger
                            }
                            Spinner {
                                visible: !root.isError
                                anchors.verticalCenter: parent.verticalCenter
                                size: 14
                                color: Theme.brandLight1
                            }
                            Label {
                                x: 26
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - 26
                                text: root.currentActivity ? root.currentActivity.label : ""
                                color: root.isError ? Theme.tone("rose").text : Theme.ink(1)
                                font.weight: Font.Medium
                            }
                        }
                        Label {
                            x: 26
                            width: parent.width - 26
                            visible: text !== ""
                            text: root.currentActivity ? root.currentActivity.detail : ""
                            mono: true
                            tone: 0.45
                            font.pixelSize: 11
                            HoverTip { text: parent.text }
                        }
                    }
                }
                Item { width: 1; height: 12; visible: currentBox.visible }

                /* La anterior, ya resuelta: da la sensación de avance sin llenar la caja */
                Row {
                    id: previousRow
                    visible: !root.isDone && root.previousActivity !== null
                    x: 4
                    width: parent.width - 4
                    spacing: 8
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        name: "check"
                        size: 14
                        strokeWidth: 2
                        color: Qt.alpha(Theme.tone("emerald").text, 0.8)
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 22
                        text: root.previousActivity ? root.previousActivity.label : ""
                        color: Qt.alpha(Theme.tone("emerald").text, 0.8)
                        font.pixelSize: Theme.textXs
                    }
                }
                Item { width: 1; height: 16; visible: previousRow.visible }

                /* Progreso */
                Rectangle {
                    width: parent.width
                    height: 6
                    radius: 3
                    color: Theme.track
                    BrandFill {
                        height: parent.height
                        width: parent.width * Math.max(root.isError ? 0 : 4, root.percent) / 100
                        radius: 3
                        from: root.isError ? Theme.tone("rose").base : Theme.brand1(1)
                        to: root.isError ? Theme.tone("orange").base : Theme.brand2(1)
                        Behavior on width { NumberAnimation { duration: 500; easing.type: Easing.OutCubic } }
                    }
                }
                Item { width: 1; height: 12 }
                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: (root.isDone ? root.activities.length : root.doneCount) + " de " + root.activities.length + " completadas"
                    mono: true
                    tone: 0.3
                    font.pixelSize: Theme.textCaption
                }
            }
        }

        /* Qué falló y cómo seguir */
        Glass {
            id: errorBox
            visible: root.error !== null
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.min(384, parent.width)
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            implicitHeight: errorColumn.implicitHeight + 32

            readonly property string detail: root.error && root.error.detail ? String(root.error.detail) : ""
            readonly property bool needsSudo: root.error !== null
                                              && (root.error.code === "NO_SUDO" || root.error.code === "SUDO_PASSWORD")

            Column {
                id: errorColumn
                x: 16; y: 16
                width: parent.width - 32
                spacing: 12

                SelectableText {
                    width: parent.width
                    text: root.error ? String(root.error.message || "") : ""
                    color: Theme.tone("rose").text
                    font.weight: Font.DemiBold
                    wrapMode: TextEdit.WordWrap
                }

                ServerErrorDetail {
                    width: parent.width
                    detail: errorBox.detail
                    maxHeight: 160
                }

                Column {
                    visible: errorBox.needsSudo
                    width: parent.width
                    spacing: 6
                    onVisibleChanged: if (visible) retryField.forceFocus()
                    Label { text: "Contraseña de sudo"; tone: 0.55; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
                    GlassField {
                        id: retryField
                        width: parent.width
                        password: true
                        placeholder: "No se guarda en ninguna parte"
                        text: root.sudoPassword
                        onTextChanged: if (root.sudoPassword !== text) root.sudoPassword = text
                        onAccepted: root.start()
                        Accessible.name: "Contraseña de sudo"
                    }
                }

                Row {
                    anchors.right: parent.right
                    spacing: 8
                    SecondaryButton { implicitHeight: 36; text: "Cerrar"; onClicked: root.close() }
                    PrimaryButton { implicitHeight: 36; text: "Reintentar"; enabled: !root.busy; onClicked: root.start() }
                }
            }
        }
    }
}
