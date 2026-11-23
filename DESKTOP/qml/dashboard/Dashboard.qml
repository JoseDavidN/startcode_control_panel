import QtQuick
import QtQuick.Layouts
import StartCode

/* Panel de operaciones: el estado de la flota de un vistazo. Cabecera con
   saludo y estado global, indicadores, gráfica histórica, servidores por
   prioridad y, al lado, avisos, bases de datos y accesos rápidos.

   Lo que llega por el socket se combina al leer con el resumen del API
   (misma regla que la lista de servidores): gana la fuente más reciente. */
Item {
    id: root

    readonly property int staleMs: 5 * 60000
    /* Tope de servidores que entran en la media histórica de la flota: una petición por cada uno. */
    readonly property int maxFleetSeries: 12
    readonly property int maxRows: 8

    /* Por el ancho del contenido, no de la pantalla: en mosaico la ventana puede ser estrecha. */
    readonly property bool compact: width < 640
    readonly property bool wide: width >= 980
    readonly property int kpiColumns: width >= 1240 ? 6 : width >= 640 ? 3 : 2
    readonly property int gap: compact ? 12 : 20

    /* ── Datos ─────────────────────────────────────────────────────── */
    property var servers: []
    property var summary: ({})
    property var overview: null
    property var connections: []
    property var notices: []
    property bool loading: true
    property bool failed: false
    property bool summaryLoaded: false
    property bool connectionsLoaded: false
    property bool noticesLoaded: false
    /* Avanza cada medio minuto: vuelve a evaluar qué métricas ya son viejas. */
    property int tick: 0
    property date now: new Date()

    /* Gráfica */
    property string chartServer: ""          // vacío = toda la flota
    property int rangeHours: 24
    property var history: null               // { cpu, memory, disk: [{ t, v }], start, end, count }
    property bool historyLoading: false
    property bool historyFailed: false
    property bool historyStarted: false
    property int historyToken: 0

    readonly property var monitoring: (Auth.preferences || {}).monitoring || {}
    readonly property real cpuThreshold: monitoring.cpuThreshold || 80
    readonly property real memoryThreshold: monitoring.memoryThreshold || 85
    readonly property real diskThreshold: monitoring.diskThreshold || 90

    /* El backend agrega cualquier rango en 120 cubos y guarda 30 días de historial. */
    readonly property var ranges: [
        { value: 1, label: "1 h" }, { value: 6, label: "6 h" },
        { value: 24, label: "24 h" }, { value: 168, label: "7 d" }
    ]
    readonly property var engineLabels: ({ mysql: "MySQL", mariadb: "MariaDB", postgresql: "PostgreSQL", redis: "Redis" })

    function loadServers() {
        Api.request("GET", "/servers", null, (ok, data) => {
            root.loading = false
            root.failed = !ok && root.servers.length === 0
            if (ok) root.servers = data || []
            if (root.chartServer !== "" && !root.servers.some(s => s.id === root.chartServer)) root.chartServer = ""
            root.startHistory()
        })
    }
    function loadSummary() {
        Api.request("GET", "/agent-data/servers-summary", null, (ok, data) => {
            if (ok && data) {
                const next = {}
                for (const item of data.servers || []) next[item.serverId] = item
                root.summary = next
            }
            root.summaryLoaded = true
            root.startHistory()
        })
    }
    function loadOverview() {
        Api.request("GET", "/agent-data/overview", null, (ok, data) => { if (ok && data) root.overview = data })
    }
    function loadConnections() {
        Api.request("GET", "/databases", null, (ok, data) => {
            root.connectionsLoaded = true
            if (ok) root.connections = data || []
        })
    }
    function loadNotices() {
        Api.request("GET", "/notifications?unread=true&limit=5", null, (ok, data) => {
            root.noticesLoaded = true
            if (ok && data) root.notices = data.items || []
        })
    }
    function reload() { loadServers(); loadSummary(); loadOverview() }
    function retry() { loading = true; failed = false; reload(); loadConnections(); loadNotices() }

    /* La primera serie espera a tener servidores y resumen: la media de la
       flota solo pide los servidores que alguna vez reportaron. */
    function startHistory() {
        if (historyStarted || loading || !summaryLoaded) return
        historyStarted = true
        loadHistory()
    }
    function loadHistory() {
        const ids = chartServer !== "" ? [chartServer]
            : fleet.filter(e => e.rt.hasMetrics).slice(0, maxFleetSeries).map(e => e.server.id)
        const token = ++historyToken
        if (ids.length === 0) {
            history = null; historyLoading = false; historyFailed = false
            return
        }
        historyLoading = true
        /* Todos los servidores comparten los mismos cubos (mismo rango, misma
           rejilla de tiempo), así que la media de la flota se cose por instante. */
        const buckets = {}
        let pending = ids.length, answered = 0, start = 0, end = 0
        ids.forEach(id => {
            Api.request("GET", "/agent-data/servers/" + id + "/historical?hours=" + rangeHours, null, (ok, data) => {
                if (token !== root.historyToken) return   // respuesta de una selección anterior
                if (ok && data) {
                    answered++
                    start = Date.parse(data.startTime) || start
                    end = Date.parse(data.endTime) || end
                    const cpu = data.cpu || [], memory = data.memory || [], disk = data.disk || []
                    for (let i = 0; i < cpu.length; i++) {
                        const t = Date.parse(cpu[i].timestamp)
                        if (isNaN(t)) continue
                        const b = buckets[t] || (buckets[t] = { cpu: 0, memory: 0, disk: 0, n: 0 })
                        b.cpu += cpu[i].value || 0
                        b.memory += memory[i] ? memory[i].value || 0 : 0
                        b.disk += disk[i] ? disk[i].value || 0 : 0
                        b.n++
                    }
                }
                if (--pending > 0) return
                root.historyLoading = false
                root.historyFailed = answered === 0
                if (answered === 0) { root.history = null; return }
                const times = Object.keys(buckets).map(Number).sort((a, b) => a - b)
                root.history = {
                    cpu: times.map(t => ({ t: t, v: buckets[t].cpu / buckets[t].n })),
                    memory: times.map(t => ({ t: t, v: buckets[t].memory / buckets[t].n })),
                    disk: times.map(t => ({ t: t, v: buckets[t].disk / buckets[t].n })),
                    start: start, end: end, count: answered
                }
            })
        })
    }
    function pickServer(id) { if (chartServer !== id) { chartServer = id; history = null; loadHistory() } }
    function pickRange(hours) { if (rangeHours !== hours) { rangeHours = hours; history = null; loadHistory() } }

    Component.onCompleted: { reload(); loadConnections(); loadNotices() }

    Timer { interval: 1000; running: true; repeat: true; onTriggered: root.now = new Date() }
    Timer { interval: 30000; running: true; repeat: true; onTriggered: root.tick++ }
    Timer { interval: 5 * 60000; running: true; repeat: true; onTriggered: { root.loadServers(); root.loadConnections() } }
    /* Con el socket caído el resumen se pide cada minuto; conectado, cada cinco. */
    Timer { interval: Realtime.connected ? 5 * 60000 : 60000; running: true; repeat: true; onTriggered: root.loadSummary() }
    Timer { interval: 60000; running: true; repeat: true; onTriggered: root.loadOverview() }
    /* La serie corta envejece antes: se renueva cada minuto; las demás, cada cinco. */
    Timer {
        interval: root.rangeHours <= 1 ? 60000 : 5 * 60000
        running: root.historyStarted
        repeat: true
        onTriggered: root.loadHistory()
    }
    Timer { id: presenceDebounce; interval: 1000; onTriggered: root.reload() }
    Connections {
        target: Realtime
        function onPresenceChanged() { presenceDebounce.restart() }
    }
    Connections {
        target: NotificationState
        function onRevisionChanged() { root.loadNotices() }
    }

    /* ── Estado combinado de un servidor (igual que en la lista) ───── */
    function mapStatus(status) {
        if (status === "online") return "online"
        if (status === "offline" || status === "error") return "offline"
        if (["warning", "maintenance", "checking", "pending"].includes(status)) return "warning"
        return "unknown"
    }
    function runtimeOf(server) {
        Realtime.revision   // dependencia: recalcular con cada dato en vivo
        const snapshot = root.summary[server.id]
        const live = Realtime.live(server.id)
        const num = value => (value === undefined || value === null ? null : value)

        if (!snapshot && !live.status && !live.metrics) {
            return { state: mapStatus(server.status) === "online" ? "online" : "unknown", live: false,
                     hasMetrics: false, stale: false, lastMetricAt: 0, cpu: null, memory: null, disk: null,
                     uptime: null, services: null, servicesTotal: null, processes: null }
        }

        const snap = snapshot || {}
        const liveAt = live.timestamp || 0
        const snapshotAt = snap.lastMetricAt ? Date.parse(snap.lastMetricAt) : 0
        const useLive = !!live.metrics && liveAt > 0 && (!snapshotAt || liveAt >= snapshotAt)
        const source = useLive ? live.metrics : snap
        const lastMetricAt = useLive ? liveAt : (snapshotAt || liveAt)
        const hasMetrics = snap.hasMetrics === true || !!live.metrics

        let state
        if (live.status === "online") state = "online"
        else if (live.status === "offline") state = "offline"
        else if (snap.agentConnected) state = "online"
        else {
            state = mapStatus(snap.status || server.status)
            if (!hasMetrics && state !== "online") state = "unknown"
        }

        const liveServices = live.services && live.services.length !== undefined ? Array.from(live.services) : null
        return {
            state: state,
            live: !!(live.metrics || live.status),
            hasMetrics: hasMetrics,
            stale: hasMetrics && lastMetricAt > 0 && Date.now() - lastMetricAt > root.staleMs,
            lastMetricAt: lastMetricAt,
            cpu: num(source.cpu), memory: num(source.memory), disk: num(source.disk), uptime: num(source.uptime),
            services: liveServices ? liveServices.filter(s => s.state === "active").length : num(snap.services),
            servicesTotal: liveServices ? liveServices.length : num(snap.servicesTotal),
            processes: live.processes && live.processes.total !== undefined ? live.processes.total : num(snap.processes)
        }
    }

    /* Cada servidor con su estado, sus motivos de atención y su carga, ya
       ordenado: caídos, con atención y después por la métrica más alta. */
    readonly property var fleet: {
        Realtime.revision
        root.tick
        const entries = servers.map(server => {
            const rt = runtimeOf(server)
            const issues = []
            let level = 0
            if (rt.state === "offline") {
                level = 2
                issues.push("Sin conexión")
            } else {
                if (rt.state === "warning") issues.push("En revisión")
                if (rt.hasMetrics) {
                    if (rt.cpu !== null && rt.cpu >= cpuThreshold) issues.push("CPU " + Math.round(rt.cpu) + "%")
                    if (rt.memory !== null && rt.memory >= memoryThreshold) issues.push("Memoria " + Math.round(rt.memory) + "%")
                    if (rt.disk !== null && rt.disk >= diskThreshold) issues.push("Disco " + Math.round(rt.disk) + "%")
                    if (rt.stale && rt.state === "online") issues.push("Sin reportes " + Format.timeAgo(rt.lastMetricAt))
                }
                if (issues.length > 0) level = 1
            }
            const snap = summary[server.id] || {}
            return {
                server: server, rt: rt, issues: issues, level: level,
                lastSeen: snap.lastSeen || server.lastSeen || "",
                worst: rt.hasMetrics ? Math.max(rt.cpu || 0, rt.memory || 0, rt.disk || 0) : -1
            }
        })
        return entries.sort((a, b) => b.level - a.level || b.worst - a.worst)
    }

    readonly property int onlineCount: fleet.filter(e => e.rt.state === "online").length
    readonly property int downCount: fleet.filter(e => e.level === 2).length
    readonly property int attentionCount: fleet.filter(e => e.level === 1).length
    readonly property int reportingCount: fleet.filter(e => e.rt.hasMetrics).length

    /* Medias de los servidores en línea con métricas; null = nadie reporta. */
    readonly property var averages: {
        const reporting = fleet.filter(e => e.rt.state === "online" && e.rt.hasMetrics)
        const mean = key => {
            const values = reporting.map(e => e.rt[key]).filter(v => v !== null)
            return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
        }
        return { cpu: mean("cpu"), memory: mean("memory"), disk: mean("disk"), count: reporting.length }
    }

    /* Estado global de la flota para la píldora de la cabecera. */
    readonly property var fleetStatus: {
        if (loading) return { tone: "", text: "Comprobando…" }
        if (failed) return { tone: "rose", text: "Sin conexión con el panel" }
        if (servers.length === 0) return { tone: "", text: "Sin servidores" }
        const parts = []
        if (downCount > 0) parts.push(downCount + (downCount === 1 ? " caído" : " caídos"))
        if (attentionCount > 0) parts.push(attentionCount + " con atención")
        if (parts.length === 0) return { tone: "emerald", text: "Todo en orden" }
        return { tone: downCount > 0 ? "rose" : "amber", text: parts.join(" · ") }
    }

    readonly property string greeting: {
        const hour = now.getHours()
        const hello = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches"
        const user = Auth.user || {}
        const name = user.firstname || String(user.name || "").split(" ")[0]
        return name ? hello + ", " + name : hello
    }
    readonly property string today: {
        const text = now.toLocaleDateString(Qt.locale("es_ES"), "dddd, d 'de' MMMM")
        return text.charAt(0).toUpperCase() + text.slice(1)
    }
    readonly property string clock: now.toLocaleTimeString(Qt.locale("es_ES"), "HH:mm:ss")

    /* «2 MySQL · 1 PostgreSQL»: cuántas conexiones hay de cada motor. */
    readonly property string enginesSummary: {
        if (!connectionsLoaded) return ""
        if (connections.length === 0) return "Ninguna conexión agregada"
        return Object.keys(engineLabels)
            .map(engine => [engine, connections.filter(c => c.engine === engine).length])
            .filter(pair => pair[1] > 0)
            .map(pair => pair[1] + " " + engineLabels[pair[0]])
            .join(" · ")
    }

    function metricStatus(value, threshold) {
        if (value === null) return ""
        return value >= threshold ? "danger" : value >= threshold * 0.85 ? "warn" : "ok"
    }
    function percentText(value) { return value === null ? "—" : String(Math.round(value)) }

    /* Los umbrales que coinciden comparten línea: «Umbral CPU / Memoria 80%». */
    readonly property var chartThresholds: {
        const groups = {}
        const add = (value, name) => { (groups[value] || (groups[value] = [])).push(name) }
        add(cpuThreshold, "CPU"); add(memoryThreshold, "Memoria"); add(diskThreshold, "Disco")
        return Object.keys(groups).map(Number).sort((a, b) => a - b)
            .map(value => ({ value: value, tone: "amber", label: "Umbral " + groups[value].join(" / ") + " " + value + "%" }))
    }
    readonly property var chartSeries: history === null ? [] : [
        { label: "CPU", tone: "blue", points: history.cpu },
        { label: "Memoria", tone: "teal", points: history.memory },
        { label: "Disco", tone: "orange", points: history.disk }
    ]
    readonly property bool chartHasData: history !== null && history.cpu.length > 0

    /* ── Piezas ────────────────────────────────────────────────────── */
    component StatusPill: Rectangle {
        id: pill
        readonly property var colors: Theme.tone(root.fleetStatus.tone)
        readonly property bool neutral: root.fleetStatus.tone === ""
        implicitWidth: pillRow.implicitWidth + 24
        implicitHeight: 28
        radius: height / 2
        color: neutral ? Theme.tintActive : Qt.alpha(colors.base, 0.15)
        border.width: 1
        border.color: neutral ? Theme.hairline : Qt.alpha(colors.base, 0.25)
        Accessible.role: Accessible.Button
        Accessible.name: "Estado de la flota: " + root.fleetStatus.text
        Row {
            id: pillRow
            anchors.centerIn: parent
            spacing: 8
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: 8; height: 8; radius: 4
                color: pill.neutral ? Theme.ink(0.4) : pill.colors.base
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: root.fleetStatus.text
                color: pill.neutral ? Theme.ink(0.65) : pill.colors.text
                font.pixelSize: Theme.textXs
                font.weight: Font.DemiBold
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: AppNav.open("servers", "") }
    }

    /* Botón de un segmento del selector de rango. */
    component RangeButton: Item {
        id: segment
        property int hours
        property string text
        readonly property bool on: root.rangeHours === hours
        width: segmentLabel.implicitWidth + 20
        height: 28
        activeFocusOnTab: true
        Accessible.role: Accessible.RadioButton
        Accessible.name: "Últimas " + text
        Accessible.checked: on
        Keys.onReturnPressed: root.pickRange(hours)
        Keys.onSpacePressed: root.pickRange(hours)
        BrandFill { anchors.fill: parent; radius: Theme.radiusLg; visible: segment.on }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            visible: !segment.on && (segmentHover.hovered || segment.activeFocus)
            color: Theme.tintHover
        }
        Label {
            id: segmentLabel
            anchors.centerIn: parent
            text: segment.text
            color: segment.on ? Theme.onBrand : Theme.ink(segmentHover.hovered ? 0.9 : 0.6)
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
        HoverHandler { id: segmentHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.pickRange(segment.hours) }
    }

    /* Fila clicable genérica de la columna estrecha. */
    component HitRow: Rectangle {
        id: hit
        property string accessibleName: ""
        readonly property alias hovered: hitHover.hovered
        signal clicked()
        radius: Theme.radiusXl
        color: hitHover.hovered ? Theme.tintHover : "transparent"
        border.width: activeFocus ? 1 : 0
        border.color: Theme.focusRing
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: accessibleName
        Keys.onReturnPressed: hit.clicked()
        Keys.onSpacePressed: hit.clicked()
        Behavior on color { ColorAnimation { duration: Theme.moFast } }
        HoverHandler { id: hitHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: hit.clicked() }
    }

    component NoticeRow: HitRow {
        id: notice
        property var item: ({})
        readonly property color accent: item.severity === "error" ? Theme.danger
                                      : item.severity === "warning" ? Theme.warn : Theme.info
        accessibleName: (item.title || "") + ". " + (item.body || "")
        implicitHeight: noticeText.implicitHeight + 20
        onClicked: AppNav.open("notifications", "")

        Rectangle {
            x: 2; y: 10
            width: 3
            height: parent.height - 20
            radius: 1.5
            color: notice.accent
        }
        Icon {
            x: 14; y: 11
            name: notice.item.severity === "error" ? "alertCircle" : notice.item.severity === "warning" ? "alert" : "info"
            color: notice.accent
        }
        Column {
            id: noticeText
            x: 38; y: 10
            width: parent.width - 48
            spacing: 2
            Label {
                width: parent.width
                text: notice.item.title || ""
                font.weight: Font.DemiBold
                font.pixelSize: 13
            }
            Label {
                visible: text !== ""
                width: parent.width
                text: notice.item.body || ""
                tone: 0.55
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                maximumLineCount: 2
            }
            Label {
                width: parent.width
                text: Format.timeAgo(notice.item.createdAt)
                    + (notice.item.metadata && notice.item.metadata.serverName ? " · " + notice.item.metadata.serverName : "")
                tone: 0.4
                font.pixelSize: 11
            }
        }
    }

    component ConnectionRow: HitRow {
        id: connection
        property var item: ({})
        readonly property color stateColor: item.status === "connected" ? Theme.ok
                                          : item.status === "disconnected" ? Theme.danger : Theme.ink(0.3)
        accessibleName: (item.name || "") + ", " + (root.engineLabels[item.engine] || item.engine || "")
        implicitHeight: 52
        onClicked: AppNav.open("databases", item.id)

        Rectangle {
            id: engineBox
            x: 8
            anchors.verticalCenter: parent.verticalCenter
            width: 36; height: 36
            radius: Theme.radiusLg
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairlineSoft
            EngineIcon { anchors.centerIn: parent; engine: connection.item.engine || ""; size: 18 }
        }
        Column {
            anchors.left: engineBox.right
            anchors.leftMargin: 12
            anchors.right: stateDot.left
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 1
            Label { width: parent.width; text: connection.item.name || ""; font.weight: Font.Medium }
            Label {
                width: parent.width
                text: (root.engineLabels[connection.item.engine] || "") + " · " + (connection.item.host || "") + ":" + (connection.item.port || "")
                mono: true
                tone: 0.45
                font.pixelSize: 11
            }
        }
        Rectangle {
            id: stateDot
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            width: 8; height: 8; radius: 4
            color: connection.stateColor
            Accessible.name: connection.item.status === "connected" ? "Conectada"
                           : connection.item.status === "disconnected" ? "Sin conexión" : "Sin comprobar"
            HoverTip { text: parent.Accessible.name }
        }
    }

    component QuickLink: Glass {
        id: quick
        property string text
        property string iconName
        signal clicked()
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: 48
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        highlighted: quickHover.hovered
        borderColor: activeFocus ? Theme.focusRing : highlighted ? Theme.hairlineHover : Theme.hairlineSoft
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: text
        Keys.onReturnPressed: quick.clicked()
        Keys.onSpacePressed: quick.clicked()
        Icon {
            id: quickIcon
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            name: quick.iconName
            color: Theme.brandLight1
        }
        Label {
            anchors.left: quickIcon.right
            anchors.leftMargin: 10
            anchors.right: parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            text: quick.text
            tone: quickHover.hovered ? 1 : 0.8
            font.pixelSize: 13
            font.weight: Font.Medium
        }
        HoverHandler { id: quickHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: quick.clicked() }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    ScrollArea {
        id: scroll
        anchors.fill: parent
        contentHeight: body.implicitHeight

        ColumnLayout {
            id: body
            width: scroll.width
            spacing: root.gap

            /* Cabecera: saludo, fecha y hora, estado global. */
            Glass {
                id: header
                readonly property int pad: root.compact ? 16 : 24
                Layout.fillWidth: true
                elevation: "raised"
                implicitHeight: headRow.implicitHeight + pad * 2

                RowLayout {
                    id: headRow
                    x: header.pad; y: header.pad
                    width: parent.width - header.pad * 2
                    spacing: 16

                    Item {
                        visible: !root.compact
                        implicitWidth: 52; implicitHeight: 52
                        Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
                        BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
                        Icon { anchors.centerIn: parent; name: "chart"; size: 26; color: Theme.onBrand }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Label {
                            Layout.fillWidth: true
                            text: root.greeting
                            font.pixelSize: root.compact ? 20 : 24
                            font.weight: Font.Bold
                            font.letterSpacing: -0.4
                        }
                        Label {
                            Layout.fillWidth: true
                            text: root.compact ? root.today + " · " + root.clock
                                : root.overview && root.overview.lastReportAt
                                    ? root.today + " · último reporte del agente " + Format.timeAgo(root.overview.lastReportAt)
                                    : root.today
                            tone: 0.55
                            font.features: { "tnum": 1 }
                        }
                        StatusPill { visible: root.compact; Layout.topMargin: 8 }
                    }
                    ColumnLayout {
                        visible: !root.compact
                        spacing: 6
                        Label {
                            Layout.alignment: Qt.AlignRight
                            text: root.clock
                            mono: true
                            tone: 0.95
                            font.pixelSize: 20
                            font.weight: Font.DemiBold
                            Accessible.name: "Hora actual " + root.clock
                        }
                        StatusPill { Layout.alignment: Qt.AlignRight }
                    }
                }
            }

            /* Indicadores */
            GridLayout {
                Layout.fillWidth: true
                columns: root.kpiColumns
                columnSpacing: root.gap
                rowSpacing: root.gap

                DashboardKpi {
                    enterIndex: 0
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "Servidores en línea"
                    iconName: "server"; tone: "emerald"
                    loading: root.loading
                    value: String(root.onlineCount)
                    suffix: "/" + root.servers.length
                    sub: root.servers.length === 0 ? "Ninguno registrado"
                       : root.downCount > 0 ? root.downCount + (root.downCount === 1 ? " caído" : " caídos")
                       : root.reportingCount + " con métricas"
                    bar: root.servers.length > 0 ? root.onlineCount / root.servers.length * 100 : -1
                    status: root.servers.length === 0 ? "" : root.downCount > 0 ? "danger"
                          : root.onlineCount < root.servers.length ? "warn" : "ok"
                    onClicked: AppNav.open("servers", "")
                }
                DashboardKpi {
                    enterIndex: 1
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "CPU media"
                    iconName: "cpu"; tone: "blue"
                    loading: root.loading
                    value: root.percentText(root.averages.cpu)
                    suffix: root.averages.cpu === null ? "" : "%"
                    sub: root.averages.cpu === null ? "Sin métricas" : "Umbral " + root.cpuThreshold + "%"
                    bar: root.averages.cpu === null ? -1 : root.averages.cpu
                    marker: root.cpuThreshold
                    status: root.metricStatus(root.averages.cpu, root.cpuThreshold)
                    onClicked: AppNav.open("servers", "")
                }
                DashboardKpi {
                    enterIndex: 2
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "Memoria media"
                    iconName: "memory"; tone: "teal"
                    loading: root.loading
                    value: root.percentText(root.averages.memory)
                    suffix: root.averages.memory === null ? "" : "%"
                    sub: root.averages.memory === null ? "Sin métricas" : "Umbral " + root.memoryThreshold + "%"
                    bar: root.averages.memory === null ? -1 : root.averages.memory
                    marker: root.memoryThreshold
                    status: root.metricStatus(root.averages.memory, root.memoryThreshold)
                    onClicked: AppNav.open("servers", "")
                }
                DashboardKpi {
                    enterIndex: 3
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "Disco medio"
                    iconName: "disk"; tone: "orange"
                    loading: root.loading
                    value: root.percentText(root.averages.disk)
                    suffix: root.averages.disk === null ? "" : "%"
                    sub: root.averages.disk === null ? "Sin métricas" : "Umbral " + root.diskThreshold + "%"
                    bar: root.averages.disk === null ? -1 : root.averages.disk
                    marker: root.diskThreshold
                    status: root.metricStatus(root.averages.disk, root.diskThreshold)
                    onClicked: AppNav.open("servers", "")
                }
                DashboardKpi {
                    enterIndex: 4
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "Avisos sin leer"
                    iconName: "bell"; tone: "amber"
                    value: String(NotificationState.unread)
                    sub: NotificationState.unread === 0 ? "Todo leído"
                       : NotificationState.unread === 1 ? "Pendiente de revisar" : "Pendientes de revisar"
                    status: NotificationState.unread > 0 ? "warn" : "ok"
                    onClicked: AppNav.open("notifications", "")
                }
                DashboardKpi {
                    enterIndex: 5
                    Layout.fillWidth: true; Layout.preferredWidth: 1
                    label: "Bases de datos"
                    iconName: "database"; tone: "violet"
                    loading: !root.connectionsLoaded
                    value: String(root.connections.length)
                    sub: root.enginesSummary
                    onClicked: AppNav.open("databases", "")
                }
            }

            /* Zona principal: dos columnas en ancho, una en estrecho. */
            GridLayout {
                Layout.fillWidth: true
                columns: root.wide ? 2 : 1
                columnSpacing: root.gap
                rowSpacing: root.gap

                /* ── Izquierda: gráfica y servidores ── */
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignTop
                    spacing: root.gap

                    /* Cargando */
                    DashboardCard {
                        enterIndex: 4
                        Layout.fillWidth: true
                        visible: root.loading
                        title: "Actividad de la flota"
                        Item {
                            width: parent.width; height: 220
                            Spinner { anchors.centerIn: parent; size: 32; color: Theme.brandLight1 }
                        }
                    }

                    /* Error de carga */
                    DashboardCard {
                        enterIndex: 5
                        Layout.fillWidth: true
                        visible: !root.loading && root.failed
                        title: "Servidores"
                        DashboardEmpty {
                            width: parent.width
                            iconName: "alertCircle"
                            title: "Error al cargar los servidores"
                            hint: "No se pudo leer el estado de la flota. Comprueba la conexión con el panel e inténtalo de nuevo."
                            actionText: "Reintentar"
                            onAction: root.retry()
                        }
                    }

                    /* Sin servidores */
                    DashboardCard {
                        enterIndex: 6
                        Layout.fillWidth: true
                        visible: !root.loading && !root.failed && root.servers.length === 0
                        title: "Servidores"
                        DashboardEmpty {
                            width: parent.width
                            iconName: "server"
                            title: "Sin servidores registrados"
                            hint: "Agrega un servidor para empezar a recopilar métricas: aquí aparecerán su CPU, memoria y disco."
                            actionText: "Agregar servidor"
                            onAction: AppNav.open("servers", "")
                        }
                    }

                    /* Gráfica histórica */
                    DashboardCard {
                        enterIndex: 7
                        id: chartCard
                        Layout.fillWidth: true
                        visible: !root.loading && !root.failed && root.servers.length > 0
                        z: 2
                        title: "Actividad"
                        hint: root.chartServer === ""
                            ? (root.history && root.history.count > 1 ? "media de " + root.history.count + " servidores" : "toda la flota")
                            : "CPU, memoria y disco"
                        spacing: 14

                        Flow {
                            width: parent.width
                            spacing: 10

                            Glass {
                                visible: root.servers.length > 1
                                variant: "input"
                                width: Math.min(240, parent.width)
                                height: 36
                                Select {
                                    anchors.fill: parent
                                    anchors.leftMargin: 12
                                    anchors.rightMargin: 10
                                    Accessible.name: "Servidor de la gráfica"
                                    value: root.chartServer
                                    options: [{ value: "", label: "Toda la flota" }]
                                        .concat(root.servers.map(s => ({ value: s.id, label: s.name })))
                                    onPicked: value => root.pickServer(value)
                                }
                            }
                            Rectangle {
                                width: rangeRow.implicitWidth + 8
                                height: 36
                                radius: Theme.radiusXl
                                color: Theme.tintSunken
                                border.width: 1
                                border.color: Theme.hairline
                                Accessible.role: Accessible.Grouping
                                Accessible.name: "Rango de la gráfica"
                                Row {
                                    id: rangeRow
                                    anchors.centerIn: parent
                                    spacing: 2
                                    Repeater {
                                        model: root.ranges
                                        RangeButton {
                                            required property var modelData
                                            hours: modelData.value
                                            text: modelData.label
                                        }
                                    }
                                }
                            }
                            Item {
                                visible: root.historyLoading && root.history !== null
                                width: 20; height: 36
                                Spinner { anchors.centerIn: parent; size: 14; color: Theme.ink(0.5) }
                            }
                        }

                        Item {
                            width: parent.width
                            height: 220
                            visible: root.history === null && (root.historyLoading || !root.historyStarted)
                            Spinner { anchors.centerIn: parent; size: 28; color: Theme.brandLight1 }
                        }
                        DashboardEmpty {
                            width: parent.width
                            visible: root.historyStarted && !root.historyLoading && root.historyFailed
                            iconName: "alertCircle"
                            title: "No se pudo cargar la serie"
                            hint: "El historial de métricas no respondió."
                            actionText: "Reintentar"
                            onAction: root.loadHistory()
                        }
                        DashboardEmpty {
                            width: parent.width
                            visible: root.historyStarted && !root.historyLoading && !root.historyFailed && !root.chartHasData
                            title: "Sin histórico de métricas"
                            hint: root.reportingCount === 0 && root.chartServer === ""
                                ? "La serie se construye con lo que envía el agente de monitoreo. Instálalo en un servidor y aquí aparecerán su CPU, memoria y disco."
                                : "No hay reportes del agente en este rango. Prueba con uno más amplio."
                        }
                        DashboardChart {
                            width: parent.width
                            visible: root.chartHasData
                            plotHeight: root.compact ? 200 : 260
                            series: root.chartSeries
                            thresholds: root.chartThresholds
                            startTime: root.history ? root.history.start : 0
                            endTime: root.history ? root.history.end : 0
                            formatTime: root.rangeHours > 48
                                ? (t => new Date(t).toLocaleDateString(Qt.locale("es_ES"), "d MMM"))
                                : (t => new Date(t).toLocaleTimeString(Qt.locale("es_ES"), "HH:mm"))
                        }
                    }

                    /* Servidores por prioridad */
                    DashboardCard {
                        enterIndex: 7
                        Layout.fillWidth: true
                        visible: !root.loading && !root.failed && root.servers.length > 0
                        title: root.downCount + root.attentionCount > 0 ? "Servidores que requieren atención" : "Servidores por carga"
                        hint: root.downCount + root.attentionCount > 0 ? "y el resto, por carga" : ""
                        actionText: root.servers.length > root.maxRows ? "Ver los " + root.servers.length : "Ver todos"
                        onAction: AppNav.open("servers", "")
                        spacing: 2

                        /* Nada que atender: se dice, en vez de dejar la lista sin contexto. */
                        Rectangle {
                            visible: root.downCount + root.attentionCount === 0
                            width: parent.width
                            height: 40
                            radius: Theme.radiusXl
                            color: Qt.alpha(Theme.ok, 0.12)
                            border.width: 1
                            border.color: Qt.alpha(Theme.ok, 0.25)
                            Icon { id: okIcon; x: 12; anchors.verticalCenter: parent.verticalCenter; name: "checkCircle"; color: Theme.ok }
                            Label {
                                anchors.left: okIcon.right
                                anchors.leftMargin: 10
                                anchors.right: parent.right
                                anchors.rightMargin: 12
                                anchors.verticalCenter: parent.verticalCenter
                                text: root.reportingCount === 0 ? "Ningún servidor caído. Instala el agente para vigilar CPU, memoria y disco."
                                    : "Ningún servidor caído ni por encima de sus umbrales."
                                tone: 0.8
                                font.pixelSize: Theme.textXs
                            }
                        }
                        Item { visible: root.downCount + root.attentionCount === 0; width: 1; height: 6 }

                        Repeater {
                            model: root.fleet.slice(0, root.maxRows)
                            DashboardServerRow {
                                required property var modelData
                                width: parent.width
                                server: modelData.server
                                rt: modelData.rt
                                issues: modelData.issues
                                level: modelData.level
                                lastSeen: modelData.lastSeen
                                cpuThreshold: root.cpuThreshold
                                memoryThreshold: root.memoryThreshold
                                diskThreshold: root.diskThreshold
                                onClicked: AppNav.open("servers", modelData.server.id)
                            }
                        }
                    }
                }

                /* ── Derecha: avisos, bases de datos y accesos ── */
                ColumnLayout {
                    Layout.fillWidth: !root.wide
                    Layout.preferredWidth: root.wide ? Math.max(320, Math.min(420, root.width * 0.3)) : -1
                    Layout.alignment: Qt.AlignTop
                    spacing: root.gap

                    DashboardCard {
                        enterIndex: 7
                        Layout.fillWidth: true
                        title: "Últimos avisos"
                        hint: NotificationState.unread > root.notices.length && root.notices.length > 0
                            ? root.notices.length + " de " + NotificationState.unread : ""
                        actionText: "Ver todos"
                        onAction: AppNav.open("notifications", "")
                        spacing: 2

                        Item {
                            width: parent.width; height: 72
                            visible: !root.noticesLoaded
                            Spinner { anchors.centerIn: parent; size: 20; color: Theme.ink(0.5) }
                        }
                        DashboardEmpty {
                            width: parent.width
                            visible: root.noticesLoaded && root.notices.length === 0
                            compact: true
                            iconName: "checkCircle"
                            title: "Sin avisos pendientes"
                            hint: "Los avisos nuevos de tus servidores aparecerán aquí."
                        }
                        Repeater {
                            model: root.notices
                            NoticeRow {
                                required property var modelData
                                width: parent.width
                                item: modelData
                            }
                        }
                    }

                    DashboardCard {
                        enterIndex: 7
                        Layout.fillWidth: true
                        title: "Bases de datos"
                        hint: root.connections.length > 6 ? "6 de " + root.connections.length : ""
                        actionText: root.connections.length > 0 ? "Ver todas" : ""
                        onAction: AppNav.open("databases", "")
                        spacing: 2

                        Item {
                            width: parent.width; height: 72
                            visible: !root.connectionsLoaded
                            Spinner { anchors.centerIn: parent; size: 20; color: Theme.ink(0.5) }
                        }
                        DashboardEmpty {
                            width: parent.width
                            visible: root.connectionsLoaded && root.connections.length === 0
                            compact: true
                            iconName: "database"
                            title: "Ninguna conexión agregada"
                            hint: "Guarda una conexión para consultar tus bases desde el panel."
                            actionText: "Agregar conexión"
                            onAction: AppNav.open("databases", "")
                        }
                        Repeater {
                            model: root.connections.slice(0, 6)
                            ConnectionRow {
                                required property var modelData
                                width: parent.width
                                item: modelData
                            }
                        }
                    }

                    DashboardCard {
                        enterIndex: 7
                        Layout.fillWidth: true
                        title: "Accesos rápidos"

                        GridLayout {
                            width: parent.width
                            columns: 2
                            columnSpacing: 10
                            rowSpacing: 10
                            QuickLink { text: "Servidores"; iconName: "server"; onClicked: AppNav.open("servers", "") }
                            QuickLink { text: "Bases de Datos"; iconName: "database"; onClicked: AppNav.open("databases", "") }
                            QuickLink { text: "Notificaciones"; iconName: "bell"; onClicked: AppNav.open("notifications", "") }
                            QuickLink { text: "Monitoreo"; iconName: "activity"; onClicked: AppNav.open("settings", "monitoring") }
                        }
                    }
                }
            }
        }
    }
}
