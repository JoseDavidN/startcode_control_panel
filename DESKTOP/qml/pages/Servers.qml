import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import StartCode

/* Lista de servidores: tarjetas o filas, con métricas en vivo. Lo que llega
   por el socket se guarda aparte de lo que devuelve el API y se combina al
   leer: gana la fuente más reciente. */
Item {
    id: root

    readonly property int maxFavorites: 3
    readonly property int staleMs: 5 * 60000

    property var servers: []
    property var summary: ({})
    property bool loading: true
    property bool failed: false
    property string search: ""
    property string osFilter: ""
    property string tagFilter: ""
    /* Servidor abierto: el detalle ocupa el sitio de la lista, sin cambiar de sección. */
    property var selected: null
    property bool opened: false
    /* Servidor a abrir en cuanto cargue la lista (lo pide el panel o un aviso). */
    property string requestedId: ""
    property var selectedSnapshot: ({})

    readonly property string view: ((Auth.user.preferences || {}).appearance || {}).serversView === "list" ? "list" : "cards"
    /* Por el ancho del contenido, no de la pantalla: en mosaico la ventana
       puede ocupar media pantalla. */
    readonly property int columns: Math.max(1, Math.min(3, Math.floor((width + 16) / 400)))
    readonly property bool compact: width < 720
    readonly property int activeFilters: (osFilter !== "" ? 1 : 0) + (tagFilter !== "" ? 1 : 0)

    readonly property var osLabels: ({
        ubuntu: "Ubuntu", centos: "CentOS", debian: "Debian", fedora: "Fedora", arch: "Arch Linux",
        solaris: "Solaris", openbsd: "OpenBSD", netbsd: "NetBSD", freebsd: "FreeBSD", other: "Otro"
    })
    readonly property var tags: ({
        production: { label: "Producción", tone: "fuchsia" },
        staging: { label: "Preproducción", tone: "orange" },
        testing: { label: "Pruebas", tone: "sky" },
        development: { label: "Desarrollo", tone: "teal" },
        backup: { label: "Respaldo", tone: "" }
    })

    /* ── Datos ─────────────────────────────────────────────────────── */
    function loadServers() {
        Api.request("GET", "/servers", null, (ok, data) => {
            root.loading = false
            root.failed = !ok
            if (ok) root.servers = data || []
            /* En depuración, `STARTCODE_PAGE=servers/<id>` abre ese servidor para las capturas. */
            const wanted = root.requestedId !== "" ? root.requestedId : StartPage.split("/")[1]
            if (ok && wanted && !root.opened) {
                root.opened = true
                const match = root.servers.find(s => s.id === wanted)
                if (match) root.openServer(match)
            }
        })
    }
    function loadSummary() {
        Api.request("GET", "/agent-data/servers-summary", null, (ok, data) => {
            if (!ok || !data) return
            const next = {}
            for (const item of data.servers || []) next[item.serverId] = item
            root.summary = next
        })
    }
    function reload() { loadServers(); loadSummary() }

    Component.onCompleted: reload()

    Timer { interval: 5 * 60000; running: true; repeat: true; onTriggered: root.loadServers() }
    /* Con el socket caído el resumen se pide cada minuto; conectado, cada cinco. */
    Timer { interval: Realtime.connected ? 5 * 60000 : 60000; running: true; repeat: true; onTriggered: root.loadSummary() }
    Timer { id: presenceDebounce; interval: 1000; onTriggered: root.reload() }
    Connections {
        target: Realtime
        function onPresenceChanged() { presenceDebounce.restart() }
    }

    /* ── Estado combinado de un servidor ───────────────────────────── */
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

    readonly property int onlineCount: {
        Realtime.revision
        let count = 0
        for (const server of servers) {
            if (summary[server.id] && runtimeOf(server).state === "online") count++
        }
        return count
    }
    readonly property int favoriteCount: servers.filter(s => !!s.favoritedAt).length

    /* Favoritos primero, por antigüedad de la marca; el resto, en el orden del backend. */
    readonly property var visibleServers: {
        const term = search.trim().toLowerCase()
        const matches = servers.filter(s => {
            if (term !== "" && !(s.name || "").toLowerCase().includes(term) && !(s.host || "").toLowerCase().includes(term))
                return false
            if (osFilter !== "" && s.os !== osFilter) return false
            if (tagFilter === "none") return !s.tag
            return tagFilter === "" || s.tag === tagFilter
        })
        const favorites = matches.filter(s => !!s.favoritedAt)
            .sort((a, b) => Date.parse(a.favoritedAt) - Date.parse(b.favoritedAt))
        return favorites.concat(matches.filter(s => !s.favoritedAt))
    }

    /* ── Formato ───────────────────────────────────────────────────── */
    function percent(value, digits) { return value === null ? "—" : value.toFixed(digits) + "%" }
    function count(value) { return value === null ? "—" : String(value) }
    function uptime(seconds) {
        if (seconds === null) return "—"
        const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60)
        return d > 0 ? d + "d " + h + "h " + m + "m" : h > 0 ? h + "h " + m + "m" : m + "m"
    }
    function timeAgo(at) {
        const seconds = Math.floor((Date.now() - at) / 1000)
        if (seconds < 60) return "hace un momento"
        if (seconds < 3600) return "hace " + Math.floor(seconds / 60) + " min"
        if (seconds < 86400) return "hace " + Math.floor(seconds / 3600) + " h"
        const days = Math.floor(seconds / 86400)
        if (days === 1) return "ayer"
        if (days < 30) return "hace " + days + " días"
        return new Date(at).toLocaleDateString(Qt.locale("es_ES"), "dd MMM yyyy")
    }

    /* ── Acciones ──────────────────────────────────────────────────── */
    function setFavorite(server, favorite) {
        const apply = value => {
            root.servers = root.servers.map(s => s.id === server.id ? Object.assign({}, s, { favoritedAt: value }) : s)
        }
        const previous = server.favoritedAt || null
        apply(favorite ? new Date().toISOString() : null)   // optimista
        Api.request("PUT", "/servers/" + server.id + "/favorite", { favorite: favorite }, (ok, data, error) => {
            if (!ok) {
                apply(previous)
                Toasts.error("No se pudo cambiar el favorito", error.message)
            }
            root.loadServers()
        })
    }
    function openServer(server) {
        const rt = runtimeOf(server)
        selectedSnapshot = { cpu: rt.cpu, memory: rt.memory, disk: rt.disk, uptime: rt.uptime }
        selected = server
    }
    function openMenu(item, x, y, server) {
        const favorite = !!server.favoritedAt
        const full = !favorite && root.favoriteCount >= root.maxFavorites
        menu.openAt(item, x, y, [
            { label: favorite ? "Quitar de favoritos" : full ? "Favoritos completos (3)" : "Marcar como favorito",
              icon: "star", enabled: !full, action: () => root.setFavorite(server, !favorite) },
            { label: "Editar", icon: "edit", separator: true, action: () => { editModal.server = server; editModal.open() } },
            { label: "Eliminar", icon: "trash", danger: true, action: () => { deleteModal.server = server; deleteModal.open() } }
        ])
    }

    FloatMenu { id: menu }

    AddServerModal { id: addModal; onSaved: root.reload(); onListChanged: root.reload() }
    EditServerModal { id: editModal; onSaved: root.reload(); onListChanged: root.reload() }
    DeleteServerModal {
        id: deleteModal
        onDeleted: serverId => {
            if (root.selected && root.selected.id === serverId) root.selected = null
            root.reload()
        }
    }

    /* ── Piezas ────────────────────────────────────────────────────── */
    component StatusBadge: Badge {
        property string state
        text: state === "online" ? "Online" : state === "warning" ? "Atención"
            : state === "unknown" ? "Sin datos" : "Offline"
        tone: state === "online" ? "emerald" : state === "warning" ? "amber"
            : state === "unknown" ? "" : "rose"
    }

    component LiveDot: Rectangle {
        width: 8; height: 8; radius: 4
        color: Theme.ok
        Accessible.name: "Métricas en vivo"
        SequentialAnimation on opacity {
            running: !Theme.reducedMotion
            loops: Animation.Infinite
            NumberAnimation { from: 1; to: 0.4; duration: 1000; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 0.4; to: 1; duration: 1000; easing.type: Easing.InOutQuad }
        }
    }

    component ServerIcon: Item {
        width: 40; height: 40
        BrandFill { anchors.fill: parent; strength: 0.18 }
        Rectangle { anchors.fill: parent; radius: Theme.radiusXl; color: "transparent"; border.width: 1; border.color: Theme.hairline }
        Icon { anchors.centerIn: parent; name: "monitor"; size: 20; color: Theme.brandLight1 }
    }

    component Tile: Item {
        id: tile
        property string label
        property string value
        property string iconName
        property string tone
        readonly property var colors: Theme.tone(tone)
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: 32

        Rectangle {
            id: box
            width: 32; height: 32
            radius: Theme.radiusLg
            border.width: 1
            border.color: Qt.alpha(tile.colors.base, 0.2)
            gradient: Gradient {
                GradientStop { position: 0; color: Qt.alpha(tile.colors.base, 0.25) }
                GradientStop { position: 1; color: Qt.alpha(tile.colors.base, 0.05) }
            }
            Icon { anchors.centerIn: parent; name: tile.iconName; color: tile.colors.text }
        }
        Column {
            anchors.left: box.right
            anchors.leftMargin: 10
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            Label {
                width: parent.width
                text: tile.label
                tone: 0.45
                font.pixelSize: Theme.textCaption
                font.weight: Font.Medium
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
            }
            Label {
                width: parent.width
                text: tile.value
                font.weight: Font.Bold
                font.features: { "tnum": 1 }
            }
        }
    }

    component MiniMetric: Column {
        id: mini
        property string label
        property var value: null
        property string from
        property string to
        width: 96
        spacing: 6
        Item {
            width: parent.width; height: 14
            Label {
                text: mini.label
                tone: 0.45
                font.pixelSize: Theme.textCaption
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
            }
            Label {
                anchors.right: parent.right
                text: root.percent(mini.value, 0)
                mono: true
                tone: mini.value === null ? 0.45 : 1
                font.pixelSize: Theme.textXs
            }
        }
        Rectangle {
            width: parent.width; height: 6; radius: 3
            color: Theme.track
            Rectangle {
                visible: mini.value !== null
                width: parent.width * Math.max(0, Math.min(100, mini.value || 0)) / 100
                height: parent.height
                radius: 3
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Theme.tone(mini.from).base }
                    GradientStop { position: 1; color: Theme.tone(mini.to).base }
                }
                Behavior on width { NumberAnimation { duration: 700; easing.type: Easing.OutCubic } }
            }
        }
    }

    /* Nombre, estrella de favorito y etiqueta. */
    component NameLine: Item {
        id: line
        property var server
        property var rt: null
        implicitHeight: 22
        Label {
            id: nameLabel
            anchors.verticalCenter: parent.verticalCenter
            /* El nombre cede sitio a las insignias y se recorta el primero. */
            width: Math.min(Math.ceil(implicitWidth), Math.max(40, line.width - extras.width - 8))
            text: line.server.name
            font.weight: Font.DemiBold
            font.pixelSize: Theme.textBase
        }
        Row {
            id: extras
            anchors.left: nameLabel.right
            anchors.leftMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                visible: !!line.server.favoritedAt
                name: "star"; size: 14
                color: Theme.brandLight1; fill: Theme.brandLight1
                Accessible.name: "Favorito"
            }
            StatusBadge {
                anchors.verticalCenter: parent.verticalCenter
                visible: line.rt !== null
                state: line.rt ? line.rt.state : ""
            }
            LiveDot {
                anchors.verticalCenter: parent.verticalCenter
                visible: line.rt !== null && line.rt.live && line.rt.state === "online"
            }
            Badge {
                readonly property var tag: root.tags[line.server.tag]
                anchors.verticalCenter: parent.verticalCenter
                visible: tag !== undefined
                pill: true
                text: tag ? tag.label : ""
                tone: tag ? tag.tone : ""
            }
        }
    }

    component ServerCard: Glass {
        id: card
        property var server
        readonly property var rt: root.runtimeOf(server)

        elevation: "raised"
        highlighted: cardHover.hovered
        implicitHeight: content.implicitHeight + 32
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: server.name
        Keys.onReturnPressed: root.openServer(card.server)
        Keys.onSpacePressed: root.openServer(card.server)
        borderColor: activeFocus ? Theme.focusRing : highlighted ? Theme.hairlineHover : Theme.hairline

        HoverHandler { id: cardHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.openServer(card.server) }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            acceptedButtons: Qt.RightButton
            onTapped: point => root.openMenu(card, point.position.x, point.position.y, card.server)
        }

        ColumnLayout {
            id: content
            x: 16; y: 16
            width: parent.width - 32
            spacing: 0

            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                ServerIcon {}
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2
                    NameLine { Layout.fillWidth: true; server: card.server }
                    Label {
                        Layout.fillWidth: true
                        text: card.server.host + " · " + card.server.os
                        mono: true
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                    }
                }
                Icon {
                    name: "chevronRight"
                    color: Theme.ink(cardHover.hovered ? 1 : 0.4)
                    transform: Translate { x: cardHover.hovered ? 2 : 0 }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 16
                spacing: 12
                opacity: card.rt.stale ? 0.6 : 1
                Tile { label: "CPU"; iconName: "cpu"; tone: "emerald"; value: root.percent(card.rt.cpu, 1) }
                Tile { label: "RAM"; iconName: "memory"; tone: "sky"; value: root.percent(card.rt.memory, 1) }
                Tile { label: "Disco"; iconName: "disk"; tone: "violet"; value: root.percent(card.rt.disk, 1) }
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 12
                opacity: card.rt.stale ? 0.6 : 1
                Tile { label: "Servicios"; iconName: "wrench"; tone: "fuchsia"; value: root.count(card.rt.services) }
                Tile { label: "Procesos"; iconName: "activity"; tone: "amber"; value: root.count(card.rt.processes) }
                Tile { label: "Activo"; iconName: "clock"; tone: "sky"; value: root.uptime(card.rt.uptime) }
            }

            Rectangle { Layout.fillWidth: true; Layout.topMargin: 16; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 8
                StatusBadge { state: card.rt.state }
                LiveDot { visible: card.rt.live && card.rt.state === "online" }
                Label {
                    visible: !card.rt.hasMetrics
                    text: "Instala el agente para ver métricas"
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
                Label {
                    visible: card.rt.stale
                    text: "Último reporte " + root.timeAgo(card.rt.lastMetricAt)
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
                Item { Layout.fillWidth: true }
                Label {
                    visible: card.rt.servicesTotal !== null
                    text: card.rt.services + " de " + card.rt.servicesTotal + " servicios activos"
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
            }
        }
    }

    component ServerRow: Rectangle {
        id: row
        property var server
        property bool last: false
        readonly property var rt: root.runtimeOf(server)

        implicitHeight: 72
        color: rowHover.hovered ? Theme.tintHover : "transparent"
        Accessible.role: Accessible.Button
        Accessible.name: server.name

        HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.openServer(row.server) }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            acceptedButtons: Qt.RightButton
            onTapped: point => root.openMenu(row, point.position.x, point.position.y, row.server)
        }
        Rectangle { visible: !row.last; anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            spacing: 16

            ServerIcon {}
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                NameLine { Layout.fillWidth: true; server: row.server; rt: row.rt }
                Label {
                    Layout.fillWidth: true
                    text: row.server.host + " · " + row.server.os
                    mono: true
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                }
            }
            Row {
                visible: root.width >= 900
                spacing: 20
                opacity: row.rt.stale ? 0.6 : 1
                MiniMetric { label: "CPU"; value: row.rt.cpu; from: row.rt.cpu >= 80 ? "rose" : "emerald"; to: row.rt.cpu >= 80 ? "orange" : "teal" }
                MiniMetric { label: "RAM"; value: row.rt.memory; from: "sky"; to: "blue" }
                MiniMetric { label: "Disco"; value: row.rt.disk; from: "violet"; to: "fuchsia" }
            }
            Row {
                visible: root.width >= 560
                spacing: 6
                Icon { anchors.verticalCenter: parent.verticalCenter; name: "wrench"; color: Theme.brandLight2 }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 24
                    text: root.count(row.rt.services)
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                    Accessible.description: "Servicios activos"
                }
            }
            Row {
                visible: root.width >= 560
                spacing: 6
                Icon { anchors.verticalCenter: parent.verticalCenter; name: "clock"; color: Theme.ink(0.55) }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 84
                    text: root.uptime(row.rt.uptime)
                    mono: true
                    tone: 0.75
                    font.pixelSize: Theme.textXs
                }
            }
            Icon { name: "chevronRight"; color: Theme.ink(rowHover.hovered ? 1 : 0.4) }
        }
    }

    component ToggleButton: Item {
        id: toggle
        property string value
        property string iconName
        property string hint
        readonly property bool on: root.view === value
        width: 36; height: 32
        Accessible.role: Accessible.RadioButton
        Accessible.name: hint
        BrandFill { anchors.fill: parent; radius: Theme.radiusLg; visible: toggle.on }
        Icon { anchors.centerIn: parent; name: toggle.iconName; color: toggle.on ? Theme.onBrand : Theme.ink(toggleHover.hovered ? 0.85 : 0.5) }
        HoverHandler { id: toggleHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: Auth.patchPreferences("appearance", { serversView: toggle.value }) }
    }

    component Chip: Item {
        id: chip
        property string text
        property bool on: false
        signal picked()
        width: chipLabel.implicitWidth + 24
        height: 32
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            visible: !chip.on
            color: chipHover.hovered ? Theme.tintActive : Theme.tintHover
            border.width: 1
            border.color: Theme.hairline
        }
        BrandFill { anchors.fill: parent; radius: Theme.radiusLg; visible: chip.on }
        Label {
            id: chipLabel
            anchors.centerIn: parent
            text: chip.text
            color: chip.on ? Theme.onBrand : Theme.ink(0.75)
            font.pixelSize: Theme.textXs
        }
        HoverHandler { id: chipHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: chip.picked() }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    Loader {
        anchors.fill: parent
        active: root.selected !== null
        sourceComponent: ServerDetail {
            server: root.selected
            snapshot: root.selectedSnapshot
            onBack: { root.selected = null; root.reload() }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 20
        visible: root.selected === null

        /* Cabecera */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 96
            elevation: "raised"

            Item {
                id: headIcon
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                width: 56; height: 56
                Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
                BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
                Icon { anchors.centerIn: parent; name: "server"; size: 28; color: Theme.onBrand }
            }
            Column {
                anchors.left: headIcon.right
                anchors.leftMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                Label {
                    text: "Servidores"
                    font.pixelSize: 24
                    font.weight: Font.Bold
                    font.letterSpacing: -0.4
                }
                Label {
                    text: root.servers.length === 0 ? "Aún no hay servidores registrados"
                        : root.onlineCount + " de " + root.servers.length + " en línea"
                    tone: 0.55
                }
            }
        }

        /* Barra de herramientas */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 64
            elevation: "raised"
            z: 2

            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 12

                Icon { Layout.leftMargin: 8; name: "search"; size: 20; color: Theme.ink(0.45) }
                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        visible: searchInput.text === ""
                        text: "Buscar servidores por nombre o IP…"
                        tone: 0.35
                    }
                    TextInput {
                        id: searchInput
                        anchors.fill: parent
                        verticalAlignment: TextInput.AlignVCenter
                        clip: true
                        color: Theme.ink(1)
                        selectionColor: Theme.brand1(0.45)
                        selectedTextColor: Theme.ink(1)
                        font.family: Theme.fontUi
                        font.pixelSize: Theme.textSm
                        selectByMouse: true
                        onTextChanged: root.search = text
                    }
                    HoverHandler { cursorShape: Qt.IBeamCursor }
                }

                Rectangle {
                    implicitWidth: 84; implicitHeight: 40
                    radius: Theme.radiusXl
                    color: Theme.tintSunken
                    border.width: 1
                    border.color: Theme.hairline
                    Accessible.role: Accessible.Grouping
                    Accessible.name: "Modo de vista"
                    Row {
                        anchors.centerIn: parent
                        spacing: 4
                        ToggleButton { value: "cards"; iconName: "grid"; hint: "Vista de tarjetas" }
                        ToggleButton { value: "list"; iconName: "list"; hint: "Vista de lista" }
                    }
                }

                SecondaryButton {
                    id: filterButton
                    implicitWidth: filterRow.implicitWidth + 32
                    onClicked: filters.visible ? filters.close() : filters.open()
                    contentItem: Item {
                        Row {
                            id: filterRow
                            anchors.centerIn: parent
                            spacing: 8
                            Icon { anchors.verticalCenter: parent.verticalCenter; name: "filter"; color: Theme.ink(0.85) }
                            Label { visible: !root.compact; anchors.verticalCenter: parent.verticalCenter; text: "Filtros"; tone: 0.85; font.weight: Font.Medium }
                            Item {
                                visible: root.activeFilters > 0
                                anchors.verticalCenter: parent.verticalCenter
                                width: 20; height: 20
                                BrandFill { anchors.fill: parent; radius: 10 }
                                Label { anchors.centerIn: parent; text: root.activeFilters; color: Theme.onBrand; font.pixelSize: 11; font.weight: Font.DemiBold }
                            }
                        }
                    }
                }

                PrimaryButton {
                    implicitWidth: addRow.implicitWidth + 32
                    onClicked: addModal.open()
                    contentItem: Item {
                        Row {
                            id: addRow
                            anchors.centerIn: parent
                            spacing: 8
                            Icon { anchors.verticalCenter: parent.verticalCenter; name: "plus"; color: Theme.onBrand }
                            Label { visible: !root.compact; anchors.verticalCenter: parent.verticalCenter; text: "Agregar servidor"; color: Theme.onBrand; font.weight: Font.Medium }
                        }
                    }
                }
            }
        }

        /* Contenido: lo único que se desplaza */
        ScrollArea {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentHeight: body.implicitHeight

            ColumnLayout {
                id: body
                width: scroll.width
                spacing: 12

                Item {
                    Layout.fillWidth: true
                    implicitHeight: 200
                    visible: root.loading
                    Spinner { anchors.centerIn: parent; size: 40; color: Theme.brandLight1 }
                }

                Glass {
                    Layout.fillWidth: true
                    implicitHeight: 84
                    elevation: "raised"
                    visible: !root.loading && (root.failed || (root.servers.length > 0 && root.visibleServers.length === 0))
                    Label {
                        anchors.centerIn: parent
                        tone: 0.55
                        text: root.failed ? "Error al cargar los servidores"
                                          : "Ningún servidor coincide con la búsqueda o los filtros"
                    }
                }

                GridLayout {
                    Layout.fillWidth: true
                    visible: !root.loading && !root.failed && root.view === "cards"
                    columns: root.columns
                    columnSpacing: 16
                    rowSpacing: 16
                    Repeater {
                        model: root.view === "cards" ? root.visibleServers : []
                        ServerCard {
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.preferredWidth: 1
                            server: modelData
                        }
                    }
                }

                Glass {
                    Layout.fillWidth: true
                    visible: !root.loading && !root.failed && root.view === "list" && root.visibleServers.length > 0
                    implicitHeight: rows.implicitHeight
                    elevation: "raised"
                    Column {
                        id: rows
                        width: parent.width
                        Repeater {
                            model: root.view === "list" ? root.visibleServers : []
                            ServerRow {
                                required property var modelData
                                required property int index
                                width: rows.width
                                server: modelData
                                last: index === root.visibleServers.length - 1
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Desplegable de filtros ────────────────────────────────────── */
    Glass {
        id: filters
        function open() { visible = true }
        function close() { visible = false }

        visible: false
        z: 10
        variant: "float"
        radius: Theme.radiusXl
        width: 320
        height: filterBody.implicitHeight + 32
        x: Math.max(0, filterButton.mapToItem(root, filterButton.width, 0).x - width)
        y: filterButton.mapToItem(root, 0, filterButton.height).y + 8

        Keys.onEscapePressed: close()
        onVisibleChanged: if (visible) forceActiveFocus()

        ColumnLayout {
            id: filterBody
            x: 16; y: 16
            width: parent.width - 32
            spacing: 16

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8
                Label { text: "Sistema operativo"; tone: 0.55; font.pixelSize: Theme.textXs }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    Chip { text: "Todos"; on: root.osFilter === ""; onPicked: root.osFilter = "" }
                    Repeater {
                        model: [...new Set(root.servers.map(s => s.os))]
                            .map(os => ({ value: os, label: root.osLabels[os] || os }))
                            .sort((a, b) => a.label.localeCompare(b.label))
                        Chip {
                            required property var modelData
                            text: modelData.label
                            on: root.osFilter === modelData.value
                            onPicked: root.osFilter = modelData.value
                        }
                    }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8
                Label { text: "Etiqueta"; tone: 0.55; font.pixelSize: Theme.textXs }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    Chip { text: "Todas"; on: root.tagFilter === ""; onPicked: root.tagFilter = "" }
                    Repeater {
                        model: Object.keys(root.tags).map(key => ({ value: key, label: root.tags[key].label }))
                            .concat([{ value: "none", label: "Sin etiqueta" }])
                        Chip {
                            required property var modelData
                            text: modelData.label
                            on: root.tagFilter === modelData.value
                            onPicked: root.tagFilter = modelData.value
                        }
                    }
                }
            }
            GhostButton {
                Layout.fillWidth: true
                visible: root.activeFilters > 0
                text: "Limpiar filtros"
                onClicked: { root.osFilter = ""; root.tagFilter = "" }
            }
        }
    }
    /* Un clic fuera del desplegable lo cierra. */
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        enabled: filters.visible
        onTapped: point => {
            const inside = filters.contains(filters.mapFromItem(root, point.position.x, point.position.y))
            const onButton = filterButton.contains(filterButton.mapFromItem(root, point.position.x, point.position.y))
            if (!inside && !onButton) filters.close()
        }
    }
}
