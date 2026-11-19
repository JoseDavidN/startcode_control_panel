import QtQuick
import QtQuick.Shapes
import StartCode

/* Pods de Kubernetes del servidor. Se leen por SSH con kubectl (o el de k3s,
   microk8s o rke2) al abrir la pestaña y luego solo con Actualizar. Solo
   lectura. No trae desplazamiento propio: la página ya desplaza. */
Glass {
    id: root

    /* `{ id, name, host, os, status }` */
    property var server
    /* Unidad de systemd que delató Kubernetes (k3s, kubelet…), sin `.service`. */
    property string unit: ""
    /* Estado de esa unidad según el inventario. Vacío: se busca en los datos
       en vivo y, si no han llegado, en el último inventario guardado. */
    property string unitState: ""

    /* ── Estado de la unidad ───────────────────────────────────────── */
    property var fetchedUnits: null
    property bool unitsSettled: false
    readonly property var liveEntry: { Realtime.revision; return server ? Realtime.live(server.id) : null }

    function unitName(name) { return String(name || "").replace(/\.service$/, "") }
    function stateIn(list) {
        const wanted = unitName(unit)
        const found = list ? Array.from(list).find(s => unitName(s.name) === wanted) : null
        return found ? String(found.state || "") : ""
    }
    readonly property string inventoryState: {
        const live = liveEntry ? liveEntry.services : null
        return (live ? stateIn(live.list || live) : "") || stateIn(fetchedUnits)
    }
    /* Si el inventario no dice nada, se intenta leer igualmente: el backend
       responde con el motivo exacto. */
    readonly property string clusterState: unitState !== "" ? unitState
                                         : inventoryState !== "" ? inventoryState
                                         : unitsSettled ? "active" : ""
    readonly property bool stateKnown: clusterState !== ""
    readonly property bool running: clusterState === "active"

    /* ── Lectura ───────────────────────────────────────────────────── */
    property var result: null       // { distribution, pods, metrics, readAt }
    property var apiError: null     // { message, code, hint, status }
    property bool fetching: false
    property string filter: ""
    property string namespace: "all"
    /* active | problems | all */
    property string view: "active"
    /* Pods desplegados, por «namespace/nombre»: sobreviven a un refresco. */
    property var openPods: ({})
    property bool ready: false
    property int ticket: 0
    /* Refresca edades y «leído hace…» sin volver a pedir nada. */
    property int tick: 0

    readonly property bool loading: !stateKnown || (fetching && result === null)
    readonly property bool needsSudo: apiError !== null
                                      && (apiError.code === "SUDO_REQUIRED" || apiError.code === "SUDO_PASSWORD")
    readonly property string sudoReason: !apiError ? ""
        : apiError.code === "SUDO_PASSWORD" ? (apiError.message || "")
        : (apiError.hint || "El kubeconfig del clúster solo lo puede leer root y sudo pide contraseña.")
    /* Qué se pinta cuando el clúster está activo y no hay error. */
    readonly property string listState: (stateKnown && !running) || apiError !== null ? ""
                                      : loading ? "loading" : "pods"

    function isDone(p) { return p.phase === "Succeeded" || p.status === "Succeeded" || p.status === "Completed" }
    /* Algo va mal: no está en marcha, o en marcha con contenedores sin listos. */
    function isProblem(p) { return !isDone(p) && (p.status !== "Running" || p.ready < p.total) }
    function containersOf(p) { return p.containers ? Array.from(p.containers) : [] }

    readonly property var all: result && result.pods ? Array.from(result.pods) : []
    readonly property bool hasMetrics: !!(result && result.metrics)
    readonly property var namespaces: {
        const seen = []
        for (const p of all) if (!seen.includes(p.namespace)) seen.push(p.namespace)
        return seen.sort()
    }
    readonly property var counts: ({
        running: all.filter(p => p.status === "Running" && p.ready === p.total).length,
        problems: all.filter(p => isProblem(p)).length,
        done: all.filter(p => isDone(p)).length
    })
    readonly property var pods: {
        const term = filter.trim().toLowerCase()
        return all
            .filter(p => namespace === "all" || p.namespace === namespace)
            .filter(p => view === "all" ? true : view === "problems" ? isProblem(p) : !isDone(p))
            .filter(p => !term
                || String(p.name || "").toLowerCase().includes(term)
                || String(p.owner || "").toLowerCase().includes(term)
                || containersOf(p).some(c => String(c.image || "").toLowerCase().includes(term)))
            /* Primero lo que falla; dentro, por namespace y nombre. */
            .sort((a, b) => Number(isProblem(b)) - Number(isProblem(a))
                || String(a.namespace).localeCompare(String(b.namespace))
                || String(a.name).localeCompare(String(b.name)))
    }
    readonly property var views: [
        { id: "active", label: "Activos" },
        { id: "problems", label: "Con problemas" + (counts.problems ? " (" + counts.problems + ")" : "") },
        { id: "all", label: "Todos" }
    ]

    /* ── Columnas: las secundarias se ocultan según el ancho y pasan al
       detalle desplegable del pod, para no perder el dato. ─────────── */
    readonly property real tableWidth: Math.max(0, width - 40)
    readonly property bool showReady: tableWidth >= 420
    readonly property bool showAge: tableWidth >= 480
    readonly property bool showRestarts: tableWidth >= 560
    readonly property bool showUsage: hasMetrics && tableWidth >= 700
    readonly property real statusWidth: tableWidth >= 480 ? 120 : 96
    readonly property real podWidth: Math.max(80, tableWidth - 24 - (statusWidth + 12)
                                              - (showReady ? 64 + 12 : 0) - (showRestarts ? 72 + 12 : 0)
                                              - (showUsage ? 72 + 12 + 80 + 12 : 0) - (showAge ? 56 + 12 : 0))

    /* Tono del estado: semántico (ok, atención, error) o neutro para lo terminado. */
    function statusTone(p) {
        if (isDone(p)) return ""
        if (p.status === "Running" && p.ready === p.total) return "emerald"
        const status = String(p.status || "")
        if (status === "Running" || status === "Pending" || status === "ContainerCreating" || status === "Terminating"
                || (status.startsWith("Init:") && !/Err|BackOff/.test(status)))
            return "amber"
        return "rose"
    }
    function toneColors(name, strength) {
        if (name === "") return { bg: Theme.tintActive, ring: Theme.hairline, fg: Theme.ink(0.55) }
        const tone = Theme.tone(name)
        return { bg: Qt.alpha(tone.base, strength), ring: Qt.alpha(tone.base, 0.2), fg: tone.text }
    }
    /* «3d», «5h», «12m»: la edad como la da kubectl. */
    function age(iso) {
        if (!iso) return "—"
        const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
        if (s < 60) return Math.floor(s) + "s"
        if (s < 3600) return Math.floor(s / 60) + "m"
        if (s < 86400) return Math.floor(s / 3600) + "h"
        return Math.floor(s / 86400) + "d"
    }
    function cpu(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " cores" : Math.round(m) + "m" }
    function usageCpu(p) { return p.usage ? cpu(p.usage.cpuMillicores) : hasMetrics ? "—" : "" }
    function usageMemory(p) { return p.usage ? Format.bytes(p.usage.memoryBytes) : hasMetrics ? "—" : "" }

    function togglePod(key) {
        const next = Object.assign({}, openPods)
        if (next[key]) delete next[key]; else next[key] = true
        openPods = next
    }

    /* `password` solo llega desde el modal; si no, vale la que ya se
       aceptó en este servidor durante la sesión. */
    function load(password) {
        if (!server || !running) return
        const pw = password || Sudo.get(server.id)
        const mine = ++ticket
        fetching = true
        Api.request("POST", "/agent-data/servers/" + server.id + "/kubernetes/pods",
                    pw ? { sudoPassword: pw } : {}, (ok, data, error) => {
            if (mine !== root.ticket) return
            root.fetching = false
            if (ok) {
                root.result = data
                root.apiError = null
                if (pw) Sudo.set(root.server.id, pw)
                sudoModal.close()
                return
            }
            root.apiError = error || ({})
            /* Una contraseña rechazada no se vuelve a mandar. */
            if (root.apiError.code === "SUDO_PASSWORD") Sudo.clear(root.server.id)
            if (root.needsSudo) {
                if (sudoModal.opened) { sudoField.text = ""; sudoField.forceFocus() }
                else sudoModal.open()
            } else {
                sudoModal.close()
            }
        }, 60000)
    }
    function submitSudo() {
        if (sudoField.text === "" || fetching) return
        load(sudoField.text)
    }

    Component.onCompleted: {
        ready = true
        if (unitState === "" && inventoryState === "" && server) {
            Api.request("GET", "/agent-data/servers/" + server.id + "/latest", null, (ok, data) => {
                if (ok && data && data.services) root.fetchedUnits = data.services.list || []
                root.unitsSettled = true
            })
        }
        if (running && visible) load()
    }
    /* Entrar a la pestaña siempre lee de nuevo; dentro, nada automático. */
    onRunningChanged: if (ready && running && visible) load()
    onVisibleChanged: if (ready && visible && running && !fetching) load()

    Timer { interval: 30000; repeat: true; running: root.visible && root.result !== null; onTriggered: root.tick++ }

    implicitHeight: column.implicitHeight + 40

    /* ── Piezas ────────────────────────────────────────────────────── */
    component DashedBox: Item {
        id: dashed
        property string title
        property string detail: ""
        property real titleTone: 0.55
        width: parent ? parent.width : 0
        implicitHeight: dashedColumn.implicitHeight + 80
        Shape {
            anchors.fill: parent
            ShapePath {
                strokeColor: Theme.edgeDashed
                strokeWidth: 1
                fillColor: "transparent"
                strokeStyle: ShapePath.DashLine
                dashPattern: [4, 3]
                PathRectangle {
                    x: 0.5; y: 0.5
                    width: Math.max(0, dashed.width - 1)
                    height: Math.max(0, dashed.height - 1)
                    radius: Theme.radiusXl
                }
            }
        }
        Column {
            id: dashedColumn
            anchors.centerIn: parent
            width: parent.width - 32
            spacing: 4
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: dashed.title
                tone: dashed.titleTone
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                visible: dashed.detail !== ""
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: dashed.detail
                tone: 0.35
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    component Chip: Rectangle {
        id: chip
        property string label
        property int value: 0
        property string tone: ""
        readonly property var colors: root.toneColors(tone, 0.1)
        implicitWidth: chipRow.implicitWidth + 20
        implicitHeight: 28
        radius: Theme.radiusLg
        color: colors.bg
        border.width: 1
        border.color: colors.ring
        Row {
            id: chipRow
            anchors.centerIn: parent
            spacing: 6
            Label { text: String(chip.value); color: chip.colors.fg; font.pixelSize: Theme.textXs; font.weight: Font.DemiBold }
            Label { text: chip.label; color: chip.colors.fg; font.pixelSize: Theme.textXs }
        }
    }

    component HeadCell: Label {
        tone: 0.4
        font.pixelSize: Theme.textCaption
        font.weight: Font.DemiBold
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 0.5
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
    }

    component Cell: Label {
        mono: true
        tone: 0.7
        font.pixelSize: Theme.textXs
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
    }

    component Detail: Column {
        id: detail
        property string label
        property string value: "—"
        spacing: 2
        Label {
            width: parent.width
            text: detail.label
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
        Label {
            width: parent.width
            text: detail.value
            mono: true
            tone: 0.75
            font.pixelSize: Theme.textXs
        }
    }

    component PodRow: Column {
        id: row
        required property var modelData
        required property int index
        readonly property var pod: modelData
        readonly property string key: pod.namespace + "/" + pod.name
        readonly property bool open: root.openPods[key] === true
        readonly property bool done: root.isDone(pod)
        readonly property var tone: root.toneColors(root.statusTone(pod), 0.15)
        /* Lo del detalle, más las columnas que el ancho haya ocultado. */
        readonly property var details: {
            root.tick
            const list = [
                { label: "Nodo", value: pod.node ?? "—" },
                { label: "IP del pod", value: pod.podIP ?? "—" },
                { label: "Fase", value: pod.phase || "—" },
                { label: "Creado", value: pod.createdAt ? Format.timeAgo(pod.createdAt) : "—" }
            ]
            if (!root.showReady) list.push({ label: "Listos", value: pod.ready + "/" + pod.total })
            if (!root.showRestarts) list.push({ label: "Reinicios", value: String(pod.restarts) })
            if (root.hasMetrics && !root.showUsage) {
                list.push({ label: "CPU", value: root.usageCpu(pod) })
                list.push({ label: "Memoria", value: root.usageMemory(pod) })
            }
            if (!root.showAge) list.push({ label: "Edad", value: root.age(pod.createdAt) })
            return list
        }

        width: parent ? parent.width : 0

        Rectangle { visible: row.index > 0; width: parent.width; height: 1; color: Theme.line }

        Rectangle {
            id: hit
            width: parent.width
            height: 48
            radius: Theme.radiusLg
            color: rowHover.hovered || activeFocus ? Theme.tintHover : "transparent"
            activeFocusOnTab: true
            Accessible.role: Accessible.Button
            Accessible.name: row.pod.name || ""
            Accessible.description: row.open ? "Desplegado" : "Plegado"
            Keys.onReturnPressed: root.togglePod(row.key)
            Keys.onSpacePressed: root.togglePod(row.key)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }

            HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.togglePod(row.key) }

            Row {
                x: 12
                height: parent.height
                spacing: 12

                Item {
                    width: root.podWidth
                    height: parent.height
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        name: "chevronRight"
                        size: 14
                        color: Theme.ink(0.4)
                        rotation: row.open ? 90 : 0
                        Behavior on rotation { NumberAnimation { duration: Theme.moFast } }
                    }
                    Column {
                        id: naming
                        x: 22
                        width: parent.width - 22
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 1
                        Label {
                            width: parent.width
                            text: row.pod.name || ""
                            tone: 0.9
                            font.weight: Font.Medium
                        }
                        Row {
                            width: parent.width
                            Label {
                                id: namespaceLabel
                                width: Math.min(implicitWidth, naming.width)
                                text: row.pod.namespace || ""
                                mono: true
                                tone: 0.4
                                font.pixelSize: 11
                            }
                            Label {
                                width: Math.max(0, naming.width - namespaceLabel.width)
                                text: row.pod.owner ? " · " + row.pod.owner : ""
                                tone: 0.4
                                font.pixelSize: 11
                            }
                        }
                    }
                    HoverTip { text: row.pod.name || "" }
                }

                Item {
                    width: root.statusWidth
                    height: parent.height
                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(parent.width, statusLabel.implicitWidth + 12)
                        height: 18
                        radius: Theme.radiusMd
                        color: row.tone.bg
                        border.width: 1
                        border.color: row.tone.ring
                        Label {
                            id: statusLabel
                            anchors.centerIn: parent
                            width: parent.width - 12
                            horizontalAlignment: Text.AlignHCenter
                            text: row.pod.status || ""
                            color: row.tone.fg
                            font.pixelSize: Theme.textCaption
                            font.weight: Font.Medium
                        }
                    }
                    HoverTip { text: row.pod.status || "" }
                }

                Cell {
                    visible: root.showReady
                    width: 64
                    text: row.pod.ready + "/" + row.pod.total
                    color: row.pod.ready < row.pod.total && !row.done ? Theme.tone("amber").text : Theme.ink(0.7)
                }
                Cell {
                    visible: root.showRestarts
                    width: 72
                    text: String(row.pod.restarts)
                    color: row.pod.restarts > 0 ? Theme.tone("amber").text : Theme.ink(0.45)
                }
                Cell { visible: root.showUsage; width: 72; text: root.usageCpu(row.pod) }
                Cell { visible: root.showUsage; width: 80; text: root.usageMemory(row.pod) }
                Item {
                    visible: root.showAge
                    width: 56
                    height: parent.height
                    Cell {
                        width: parent.width
                        horizontalAlignment: Text.AlignRight
                        text: { root.tick; return root.age(row.pod.createdAt) }
                        tone: 0.45
                    }
                    HoverTip { text: row.pod.createdAt || "" }
                }
            }
        }

        Loader {
            active: row.open
            width: parent.width
            sourceComponent: Item {
                implicitHeight: panel.implicitHeight + 8
                Glass {
                    id: panel
                    readonly property real inner: Math.max(0, width - 24)
                    readonly property int columns: inner >= 440 ? 4 : 2
                    x: 32
                    width: parent.width - 32 - 12
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    implicitHeight: panelColumn.implicitHeight + 24

                    Column {
                        id: panelColumn
                        x: 12; y: 12
                        width: panel.inner
                        spacing: 12

                        Grid {
                            width: parent.width
                            columns: panel.columns
                            columnSpacing: 16
                            rowSpacing: 8
                            Repeater {
                                model: row.details
                                Detail {
                                    required property var modelData
                                    width: (panel.inner - 16 * (panel.columns - 1)) / panel.columns
                                    label: modelData.label
                                    value: modelData.value
                                }
                            }
                        }

                        Column {
                            width: parent.width
                            spacing: 6
                            Label {
                                width: parent.width
                                text: "Contenedores"
                                tone: 0.4
                                font.pixelSize: Theme.textCaption
                                font.capitalization: Font.AllUppercase
                                font.letterSpacing: 0.5
                            }
                            Repeater {
                                model: root.containersOf(row.pod)
                                Item {
                                    id: line
                                    required property var modelData
                                    readonly property string trailing: (modelData.reason ?? modelData.state ?? "")
                                        + (modelData.restarts ? " · " + modelData.restarts + " reinicios" : "")
                                    width: parent.width
                                    height: 18
                                    Rectangle {
                                        id: dot
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: 6; height: 6; radius: 3
                                        color: line.modelData.ready ? Theme.tone("emerald").text
                                             : line.modelData.state === "terminated" ? Theme.ink(0.3)
                                             : Theme.tone("amber").text
                                    }
                                    Label {
                                        id: containerName
                                        x: 18
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: Math.min(implicitWidth, (line.width - 18) * 0.4)
                                        text: line.modelData.name || ""
                                        tone: 0.8
                                        font.pixelSize: Theme.textXs
                                        font.weight: Font.Medium
                                    }
                                    Label {
                                        id: containerState
                                        anchors.right: parent.right
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: Math.min(implicitWidth, (line.width - 18) * 0.4)
                                        horizontalAlignment: Text.AlignRight
                                        text: line.trailing
                                        tone: 0.45
                                        font.pixelSize: Theme.textXs
                                    }
                                    Item {
                                        anchors.left: containerName.right
                                        anchors.leftMargin: 12
                                        anchors.right: containerState.left
                                        anchors.rightMargin: 12
                                        height: parent.height
                                        Label {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: line.modelData.image || ""
                                            mono: true
                                            tone: 0.45
                                            font.pixelSize: Theme.textXs
                                        }
                                        HoverTip { text: line.modelData.image || "" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Contenido ─────────────────────────────────────────────────── */
    Column {
        id: column
        x: 20; y: 20
        width: parent.width - 40
        spacing: 16

        /* Cabecera: título a la izquierda y controles a la derecha; en
           estrecho los controles bajan y ocupan todo el ancho. */
        Item {
            id: header
            readonly property bool pickNamespace: root.namespaces.length > 1
            readonly property real controlsWidth: (pickNamespace ? 210 + 8 : 0) + 180 + 8 + refresh.implicitWidth
            readonly property bool wide: width >= controlsWidth + 240
            width: parent.width
            height: wide ? Math.max(titles.height, controls.height) : titles.height + 12 + controls.height

            Column {
                id: titles
                width: header.wide ? parent.width - header.controlsWidth - 12 : parent.width
                anchors.verticalCenter: header.wide ? parent.verticalCenter : undefined
                spacing: 2
                Label {
                    width: parent.width
                    text: "Pods de Kubernetes"
                    font.pixelSize: Theme.textBase
                    font.weight: Font.DemiBold
                }
                Label {
                    width: parent.width
                    text: {
                        root.tick
                        if (root.result)
                            return root.result.distribution + " · " + root.all.length + " pods · leído "
                                + Format.timeAgo(root.result.readAt)
                        return root.running || !root.stateKnown ? "Leyendo los pods por SSH…"
                                                                : root.unitName(root.unit) + " está " + root.clusterState
                    }
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
            }

            Flow {
                id: controls
                x: header.wide ? parent.width - header.controlsWidth : 0
                y: header.wide ? (parent.height - height) / 2 : titles.height + 12
                width: header.wide ? header.controlsWidth + 1 : parent.width
                spacing: 8

                Glass {
                    visible: header.pickNamespace
                    variant: "input"
                    width: header.wide ? 210 : controls.width
                    height: 36
                    Select {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 12
                        Accessible.name: "Namespace"
                        value: root.namespace
                        options: [{ value: "all", label: "Todos los namespaces" }]
                            .concat(root.namespaces.map(n => ({ value: n, label: n })))
                        onPicked: value => root.namespace = value
                    }
                }
                GlassField {
                    width: header.wide ? 180 : controls.width - refresh.width - 8
                    implicitHeight: 36
                    placeholder: "Filtrar pods…"
                    onTextChanged: root.filter = text
                }
                SecondaryButton {
                    id: refresh
                    implicitHeight: 36
                    implicitWidth: refreshRow.implicitWidth + 28
                    text: root.fetching ? "Leyendo…" : "Actualizar"
                    enabled: !root.fetching && root.running
                    onClicked: root.load()
                    contentItem: Item {
                        Row {
                            id: refreshRow
                            anchors.centerIn: parent
                            spacing: 8
                            Spinner {
                                anchors.verticalCenter: parent.verticalCenter
                                visible: root.fetching
                                color: Theme.ink(0.75)
                            }
                            Icon {
                                anchors.verticalCenter: parent.verticalCenter
                                visible: !root.fetching
                                path: "M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
                                color: Theme.ink(0.75)
                            }
                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: refresh.text
                                tone: 0.75
                                font.pixelSize: Theme.textXs
                                font.weight: Font.Medium
                            }
                        }
                    }
                }
            }
        }

        /* Kubernetes parado */
        DashedBox {
            visible: root.stateKnown && !root.running
            title: "Kubernetes no está activo (" + root.unitName(root.unit) + ")"
            detail: "Inícialo desde el tab Servicios para ver sus pods."
        }

        /* Hace falta sudo: la contraseña se pide en un modal */
        Column {
            visible: root.running && root.needsSudo
            width: Math.min(parent.width, 448)
            spacing: 12
            Glass {
                variant: "soft"
                elevation: "raised"
                radius: Theme.radiusXl
                width: parent.width
                implicitHeight: sudoColumn.implicitHeight + 32
                Column {
                    id: sudoColumn
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 4
                    Label { width: parent.width; text: "Hace falta sudo"; font.weight: Font.DemiBold }
                    Label {
                        width: parent.width
                        text: root.sudoReason
                        tone: 0.6
                        font.pixelSize: Theme.textXs
                        lineHeight: 1.4
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }
            PrimaryButton {
                implicitHeight: 44
                text: root.fetching ? "Leyendo…" : "Continuar"
                enabled: !root.fetching
                onClicked: sudoModal.open()
            }
            Label {
                width: parent.width
                text: "Se usa solo para leer Kubernetes mientras el detalle esté abierto y no se guarda."
                tone: 0.4
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        /* Error del servidor */
        Glass {
            visible: root.running && root.apiError !== null && !root.needsSudo
            variant: "soft"
            elevation: "raised"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            width: parent.width
            implicitHeight: errorColumn.implicitHeight + 32
            Column {
                id: errorColumn
                x: 16; y: 16
                width: parent.width - 32
                spacing: 4
                Label {
                    width: parent.width
                    text: (root.apiError && root.apiError.message) || "No se pudo leer Kubernetes"
                    color: Theme.tone("rose").text
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    visible: text !== ""
                    width: parent.width
                    text: (root.apiError && root.apiError.hint) || ""
                    mono: true
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                }
            }
        }

        /* Primera lectura */
        DashedBox {
            visible: root.listState === "loading"
            title: "Leyendo los pods del clúster…"
            titleTone: 0.45
        }

        /* Resumen y selector de qué pods mostrar */
        Item {
            id: summary
            /* Ancho natural de las tres insignias en una línea. */
            readonly property real chipsWidth: chipRunning.implicitWidth + chipProblems.implicitWidth + chipDone.implicitWidth + 16
            readonly property bool wide: width >= chipsWidth + 12 + switcher.width
            visible: root.listState === "pods"
            width: parent.width
            height: wide ? Math.max(chips.height, switcher.height) : chips.height + 8 + switcher.height

            Flow {
                id: chips
                width: summary.wide ? summary.chipsWidth + 1 : parent.width
                anchors.verticalCenter: summary.wide ? parent.verticalCenter : undefined
                spacing: 8
                Chip { id: chipRunning; label: "en ejecución"; value: root.counts.running; tone: "emerald" }
                Chip { id: chipProblems; label: "con problemas"; value: root.counts.problems; tone: root.counts.problems ? "rose" : "" }
                Chip { id: chipDone; label: "completados"; value: root.counts.done }
            }

            Glass {
                id: switcher
                x: summary.wide ? parent.width - width : 0
                y: summary.wide ? (parent.height - height) / 2 : chips.height + 8
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                width: Math.min(switchRow.implicitWidth + 8, summary.width)
                height: 32
                Accessible.role: Accessible.Grouping
                Accessible.name: "Qué pods mostrar"
                Row {
                    id: switchRow
                    x: 4; y: 4
                    spacing: 4
                    Repeater {
                        model: root.views
                        Item {
                            id: option
                            required property var modelData
                            readonly property bool chosen: root.view === modelData.id
                            width: optionLabel.implicitWidth + 20
                            height: 24
                            activeFocusOnTab: true
                            Accessible.role: Accessible.RadioButton
                            Accessible.name: modelData.label
                            Accessible.checked: chosen
                            Keys.onReturnPressed: root.view = modelData.id
                            Keys.onSpacePressed: root.view = modelData.id

                            Elevation { anchors.fill: parent; visible: option.chosen; level: "brandSm"; radius: Theme.radiusLg }
                            BrandFill { anchors.fill: parent; visible: option.chosen; radius: Theme.radiusLg }
                            Rectangle {
                                anchors.fill: parent
                                visible: !option.chosen
                                radius: Theme.radiusLg
                                color: optionHover.hovered || option.activeFocus ? Theme.tintHover : "transparent"
                            }
                            Label {
                                id: optionLabel
                                anchors.centerIn: parent
                                text: option.modelData.label
                                color: option.chosen ? Theme.onBrand
                                     : Theme.ink(optionHover.hovered ? 1 : 0.55)
                                font.pixelSize: Theme.textXs
                            }
                            HoverHandler { id: optionHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.view = option.modelData.id }
                        }
                    }
                }
            }
        }

        /* Ningún pod que mostrar */
        DashedBox {
            visible: root.listState === "pods" && root.pods.length === 0
            title: root.all.length === 0 ? "No hay pods en el clúster"
                 : root.view === "problems" && !root.filter ? "Ningún pod con problemas"
                 : "Ningún pod coincide con el filtro"
        }

        /* Tabla */
        Column {
            visible: root.listState === "pods" && root.pods.length > 0
            width: parent.width
            spacing: 0

            Item {
                width: parent.width
                height: 32
                Row {
                    x: 12
                    height: parent.height
                    spacing: 12
                    HeadCell { width: root.podWidth; leftPadding: 20; text: "Pod" }
                    HeadCell { width: root.statusWidth; text: "Estado" }
                    HeadCell { visible: root.showReady; width: 64; text: "Listos" }
                    HeadCell { visible: root.showRestarts; width: 72; text: "Reinicios" }
                    HeadCell { visible: root.showUsage; width: 72; text: "CPU" }
                    HeadCell { visible: root.showUsage; width: 80; text: "Memoria" }
                    HeadCell { visible: root.showAge; width: 56; horizontalAlignment: Text.AlignRight; text: "Edad" }
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
            }

            Repeater {
                model: root.pods
                PodRow {}
            }

            Item { visible: footnote.visible; width: 1; height: 12 }
            Label {
                id: footnote
                visible: root.result !== null && !root.hasMetrics
                width: parent.width
                text: "Sin consumo por pod: el clúster no tiene metrics-server instalado."
                tone: 0.4
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    /* ── Contraseña de sudo ────────────────────────────────────────── */
    Modal {
        id: sudoModal
        title: "Hace falta sudo"
        size: "sm"
        onOpened: { sudoField.text = ""; sudoField.forceFocus() }
        onClosed: sudoField.text = ""

        Label {
            width: parent ? parent.width : 0
            text: root.sudoReason
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        GlassField {
            id: sudoField
            width: parent ? parent.width : 0
            password: true
            placeholder: "Contraseña del usuario SSH"
            maximumLength: 256
            onAccepted: root.submitSudo()
        }
        Label {
            width: parent ? parent.width : 0
            text: "Se usa solo para leer Kubernetes mientras el detalle esté abierto y no se guarda."
            tone: 0.4
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }

        footer: Row {
            spacing: 8
            SecondaryButton { text: "Cancelar"; onClicked: sudoModal.close() }
            PrimaryButton {
                text: root.fetching ? "Leyendo…" : "Continuar"
                enabled: sudoField.text !== "" && !root.fetching
                onClicked: root.submitSudo()
            }
        }
    }
}
