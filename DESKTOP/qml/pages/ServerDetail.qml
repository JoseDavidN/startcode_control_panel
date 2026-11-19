import QtQuick
import QtQuick.Layouts
import StartCode

/* Detalle de un servidor: cabecera con el agente y las cifras rápidas,
   pestañas y el resumen. Los valores en vivo llegan por el socket; el resto,
   de `/agent-data/servers/:id/latest`. */
Item {
    id: root

    /* Servidor tal como estaba en la lista al abrirlo: `{ id, name, host, os, status }`. */
    required property var server
    /* Cifras de la lista en ese momento: respaldo mientras llega el detalle. */
    property var snapshot: ({})
    signal back()

    property var detail: null
    /* Respuesta sin normalizar: las pestañas leen de aquí sus listas. */
    property var rawDetail: null
    property bool loading: true
    property bool failed: false
    property var hostKey: ({})
    property string tab: "overview"
    /* Procesos cerrados en esta visita: se ocultan sin esperar al agente. */
    property var hiddenPids: []

    readonly property bool twoColumns: width >= 900
    readonly property var liveEntry: { Realtime.revision; return Realtime.live(server.id) }
    readonly property bool agentLive: Realtime.connected && liveEntry.status === "online"

    /* Primera fuente disponible: socket, detalle del API, lo que traía la lista. */
    function pick(live, fromDetail, fallback) {
        if (live !== undefined && live !== null) return live
        if (fromDetail !== undefined && fromDetail !== null) return fromDetail
        return fallback === undefined ? null : fallback
    }
    readonly property var liveMetrics: liveEntry.metrics || {}
    readonly property real cpu: pick(liveMetrics.cpu, detail ? detail.cpu.usage : null, snapshot.cpu) || 0
    readonly property real memory: pick(liveMetrics.memory, detail ? detail.memory.usagePercent : null, snapshot.memory) || 0
    readonly property real disk: pick(liveMetrics.disk, detail && detail.disk.length ? detail.disk[0].usagePercent : null, snapshot.disk) || 0
    readonly property var uptime: pick(liveMetrics.uptime, detail ? detail.system.uptimeSeconds : null, snapshot.uptime)

    /* ── Datos ─────────────────────────────────────────────────────── */
    function normalize(raw) {
        const cpu = raw.cpu || {}, mem = raw.memory || {}, net = raw.network || {}, sys = raw.system || {}
        const load = cpu.loadAverage || {}
        const fix = value => Number(value || 0).toFixed(2)
        const interfaces = (net.interfaces || []).map(i => ({
            iface: i.iface || "", ip4: i.ip4 || "", ip6: i.ip6 || "", mac: i.mac || "",
            operstate: i.operstate || "", rxBytes: i.rx_bytes || 0, txBytes: i.tx_bytes || 0
        }))
        const primary = interfaces.find(i => i.operstate === "up" && i.ip4) || interfaces.find(i => i.ip4) || interfaces[0] || null
        const disks = ((raw.disk || {}).filesystems || []).map(f => ({
            total: (f.size || 0) / 1073741824, used: (f.used || 0) / 1073741824, free: (f.available || 0) / 1073741824,
            usagePercent: f.usagePercent || 0, mountPoint: f.mount || "/", device: typeof f.fs === "string" ? f.fs : ""
        }))
        const processes = raw.processes || {}, services = raw.services || {}
        return {
            cpu: {
                usage: cpu.usage || 0,
                cores: cpu.cores || (cpu.usagePerCore || []).length || 1,
                physicalCores: cpu.physicalCores || 0,
                brand: cpu.brand || "", manufacturer: cpu.manufacturer || "",
                loadAverage: fix(load.current) + " / " + fix(load.avg5) + " / " + fix(load.avg15)
            },
            memory: { total: (mem.total || 0) / 1048576, used: (mem.used || 0) / 1048576, usagePercent: mem.usagePercent || 0 },
            disk: disks.length ? disks : [{ total: 0, used: 0, free: 0, usagePercent: 0, mountPoint: "/", device: "" }],
            network: {
                interfaces: interfaces, primary: primary,
                privateIp: (primary && primary.ip4) || (net.privateIPs || [])[0] || "N/A",
                publicIp: net.publicIP || "N/A"
            },
            system: {
                os: sys.distro || sys.platform || "Linux", kernel: sys.kernel || "N/A", hostname: sys.hostname || "N/A",
                arch: sys.arch || "", uptimeSeconds: sys.uptime === undefined ? null : sys.uptime
            },
            processes: { topList: processes.topList || [] },
            services: { list: services.list || [] }
        }
    }
    function loadDetail() {
        Api.request("GET", "/agent-data/servers/" + server.id + "/latest", null, (ok, data) => {
            root.loading = false
            root.failed = !ok
            if (ok && data) { root.rawDetail = data; root.detail = normalize(data) }
        })
    }
    Component.onDestruction: TerminalSessions.clearViewing(server.id)
    Component.onCompleted: {
        TerminalSessions.setViewing(server.id)
        loadDetail()
        Api.request("GET", "/servers/" + server.id, null, (ok, data) => { if (ok && data) root.hostKey = data })
    }
    /* Sin agente en vivo no llegan métricas por el socket: se pide cada 30 s. */
    Timer { interval: 30000; repeat: true; running: !root.agentLive; onTriggered: root.loadDetail() }

    /* ── Pestañas ──────────────────────────────────────────────────── */
    readonly property var units: detail ? detail.services.list.map(s => String(s.name || "").replace(/\.service$/, "")) : []
    readonly property var kubernetesUnits: ["k3s", "k3s-agent", "snap.microk8s.daemon-kubelite", "snap.microk8s.daemon-kubelet",
                                            "rke2-server", "rke2-agent", "k0scontroller", "k0sworker", "kubelet"]
    readonly property var tabs: [
        { id: "overview", label: "Resumen", icon: "chart", shown: true },
        { id: "services", label: "Servicios", icon: "box", shown: true },
        { id: "commands", label: "Comandos", icon: "code", shown: true },
        { id: "docker", label: "Docker", icon: "cube", shown: units.includes("docker") },
        { id: "kubernetes", label: "Kubernetes", icon: "helm", shown: kubernetesUnits.some(u => units.includes(u)) }
    ].filter(t => t.shown)

    /* ── Resumen: procesos y discos ────────────────────────────────── */
    function baseName(path) { return String(path || "").split("/").pop() }
    function processLabel(proc) {
        const parts = String(proc.command || "").trim().split(/\s+/)
        const bin = baseName(parts[0])
        if (bin === "" || (proc.name && bin.startsWith(proc.name))) return proc.name || bin || "PID " + proc.pid
        const arg = parts[1]
        if (/^(python[\d.]*|node|java|php[\d.]*|ruby|perl|bash|sh|dotnet)$/.test(bin) && arg && !arg.startsWith("-"))
            return bin + " " + baseName(arg)
        return bin
    }
    readonly property var topProcesses: !detail ? [] : detail.processes.topList
        .filter(p => !hiddenPids.includes(p.pid))
        .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
        .slice(0, 5)

    function diskOf(device) {
        const name = String(device).replace(/^\/dev\//, "")
        let match = name.match(/^((?:nvme\d+n\d+)|(?:mmcblk\d+)|(?:loop\d+))p\d+$/)
        if (match) return match[1]
        match = name.match(/^((?:sd|vd|xvd|hd)[a-z]+)\d+$/)
        if (match) return match[1]
        return name.includes("/") ? name.split("/").pop() : name
    }
    readonly property var diskGroups: {
        if (!detail) return []
        /* La misma partición puede venir montada varias veces: queda la ruta más corta. */
        const unique = {}
        for (const part of detail.disk) {
            const key = part.device || part.mountPoint
            if (!unique[key] || part.mountPoint.length < unique[key].mountPoint.length) unique[key] = part
        }
        const groups = [], index = {}
        for (const key in unique) {
            const part = unique[key]
            const name = part.device ? diskOf(part.device) : part.mountPoint
            if (index[name] === undefined) {
                index[name] = groups.length
                groups.push({ name: name, total: 0, used: 0, parts: [] })
            }
            const group = groups[index[name]]
            group.total += part.total
            group.used += part.used
            group.parts.push(part)
        }
        for (const group of groups) {
            group.usagePercent = group.total > 0 ? group.used / group.total * 100 : 0
            group.parts.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint))
        }
        return groups
    }
    function sizes(item) { return "(" + item.used.toFixed(1) + " / " + item.total.toFixed(1) + " GB)" }

    /* Estado systemd (`active`, `inactive`, `failed`…) de una unidad del inventario. */
    function unitState(unit) {
        if (!detail || unit === "") return ""
        const found = detail.services.list.find(s => String(s.name || "").replace(/\.service$/, "") === unit)
        return found ? String(found.state || "") : ""
    }

    /* Unidad systemd de Kubernetes detectada: la primera de la lista que exista. */
    readonly property string kubernetesUnit: kubernetesUnits.find(u => units.includes(u)) || ""
    /* Si la pestaña abierta deja de existir (se desinstaló Docker), vuelve al resumen. */
    onTabsChanged: if (!tabs.some(t => t.id === tab)) tab = "overview"

    Component { id: servicesTab; ServicesTab { server: root.server; detail: root.rawDetail; loading: root.loading; onReload: root.loadDetail(); onInstallRequested: installModal.open() } }
    Component { id: commandsTab; CommandsTab { server: root.server; onReuse: command => commandBar.load(command) } }
    Component { id: dockerTab; DockerTab { server: root.server; dockerState: root.unitState("docker") } }
    Component { id: kubernetesTab; KubernetesTab { server: root.server; unit: root.kubernetesUnit; unitState: root.unitState(root.kubernetesUnit) } }

    ProcessKillModal {
        id: killModal
        server: root.server
        onKilled: pid => root.hiddenPids = root.hiddenPids.concat([pid])
        onSettled: root.loadDetail()
    }
    SftpModal {
        id: sftpModal
        server: root.server
        /* El aviso de clave de host es global: se le pasa por la misma vía que los rechazos del API. */
        onHostKeyRejected: mismatch => Api.hostKeyMismatch({ code: "HOST_KEY_MISMATCH", hostKey: mismatch })
        onSessionRevoked: payload => Auth.sessionRevoked((payload && payload.reason) || "", (payload && payload.message) || "")
    }
    InstallServiceModal { id: installModal; server: root.server; onChanged: root.loadDetail() }

    /* ── Piezas ────────────────────────────────────────────────────── */
    component HeaderButton: SecondaryButton {
        id: headerButton
        property string iconName: ""
        implicitHeight: 36
        implicitWidth: buttonRow.implicitWidth + 28
        contentItem: Item {
            Row {
                id: buttonRow
                anchors.centerIn: parent
                spacing: 8
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: headerButton.iconName !== ""
                    name: headerButton.iconName
                    color: Theme.ink(0.85)
                }
                Label { anchors.verticalCenter: parent.verticalCenter; text: headerButton.text; tone: 0.85; font.weight: Font.Medium }
            }
        }
    }

    component SectionCard: Glass {
        id: section
        property string title
        property string iconName
        default property alias body: sectionBody.data
        variant: "soft"
        elevation: "raised"
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.preferredWidth: 1
        Layout.alignment: Qt.AlignTop
        implicitHeight: sectionColumn.implicitHeight + 40

        ColumnLayout {
            id: sectionColumn
            x: 20; y: 20
            width: parent.width - 40
            spacing: 16
            Row {
                spacing: 8
                Icon { anchors.verticalCenter: parent.verticalCenter; name: section.iconName; color: Theme.brandLight1 }
                Label { anchors.verticalCenter: parent.verticalCenter; text: section.title; tone: 0.8; font.weight: Font.DemiBold }
            }
            ColumnLayout {
                id: sectionBody
                Layout.fillWidth: true
                spacing: 0
            }
        }
    }

    component Pill: Rectangle {
        property string text
        property bool up: false
        implicitWidth: pillLabel.implicitWidth + 12
        implicitHeight: 18
        radius: 9
        color: up ? Qt.alpha(Theme.tone("emerald").base, 0.15) : Theme.tintActive
        Label {
            id: pillLabel
            anchors.centerIn: parent
            text: parent.text
            color: parent.up ? Theme.tone("emerald").text : Theme.ink(0.5)
            font.pixelSize: Theme.textCaption
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
    }

    component InfoRow: Item {
        id: info
        property string label
        property string value: "—"
        property string pill: ""
        property bool pillUp: false
        property bool last: false
        Layout.fillWidth: true
        implicitHeight: 41
        Label { id: infoLabel; anchors.verticalCenter: parent.verticalCenter; text: info.label; tone: 0.5 }
        Row {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8
            Label {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, info.width - infoLabel.width - 16 - (infoPill.visible ? infoPill.width + 8 : 0))
                text: info.value
                mono: true
                font.weight: Font.Medium
            }
            Pill { id: infoPill; anchors.verticalCenter: parent.verticalCenter; visible: info.pill !== ""; text: info.pill; up: info.pillUp }
        }
        Rectangle { visible: !info.last; anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    component QuickStat: Glass {
        id: stat
        property string label
        property real value: 0
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: 58
        MetricBar {
            x: 12; y: 12
            width: parent.width - 24
            compact: true
            spacing: 10
            label: stat.label
            value: stat.value
            valueText: stat.value.toFixed(1) + "%"
        }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    ScrollArea {
        id: scroll
        anchors.fill: parent
        /* Sitio para la línea de comandos, que flota sobre el final de la página. */
        contentHeight: page.implicitHeight + commandBar.implicitHeight + 16

        ColumnLayout {
            id: page
            width: scroll.width
            spacing: 20

            /* Cabecera */
            Glass {
                Layout.fillWidth: true
                elevation: "raised"
                implicitHeight: headColumn.implicitHeight + 40

                ColumnLayout {
                    id: headColumn
                    x: 20; y: 20
                    width: parent.width - 40
                    spacing: 0

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        IconButton {
                            iconName: "chevronLeft"
                            iconSize: 20
                            hint: "Volver"
                            onClicked: root.back()
                        }
                        Item {
                            implicitWidth: 48; implicitHeight: 48
                            Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radiusXl }
                            BrandFill { anchors.fill: parent }
                            Icon { anchors.centerIn: parent; name: "server"; size: 24; color: Theme.onBrand }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8
                                Label {
                                    Layout.maximumWidth: parent.width - 28
                                    text: root.server.name
                                    font.pixelSize: 20
                                    font.weight: Font.Bold
                                }
                                Icon {
                                    readonly property string state: ["online", "running", "active", "connected"].includes(root.server.status) ? "ok"
                                                                  : ["warning", "maintenance"].includes(root.server.status) ? "warn" : "down"
                                    size: 20
                                    name: state === "ok" ? "checkCircle" : state === "warn" ? "alert" : "xCircle"
                                    color: state === "ok" ? Theme.ok : state === "warn" ? Theme.warn : Theme.danger
                                }
                                Item { Layout.fillWidth: true }
                            }
                            Label { Layout.fillWidth: true; text: root.server.host + " · " + root.server.os; tone: 0.5 }
                        }

                        HeaderButton {
                            id: terminalButton
                            readonly property bool session: TerminalSessions.hasSession(root.server.id)
                            visible: root.width >= 760
                            iconName: "terminal"
                            text: session ? "Volver a la terminal" : "Abrir Terminal"
                            onClicked: TerminalSessions.open(root.server.id, root.server.name)
                            HoverTip { text: terminalButton.session ? "La sesión SSH sigue abierta: volver a ella" : "Abrir una shell SSH en este servidor" }
                        }
                        HeaderButton {
                            visible: root.width >= 760
                            iconName: "upload"
                            text: "SFTP"
                            onClicked: sftpModal.open()
                            HoverTip { text: "Subir archivos y carpetas por SFTP" }
                        }
                        PrimaryButton {
                            visible: root.width >= 760
                            implicitHeight: 36
                            implicitWidth: installRow.implicitWidth + 28
                            onClicked: installModal.open()
                            contentItem: Item {
                                Row {
                                    id: installRow
                                    anchors.centerIn: parent
                                    spacing: 8
                                    Icon { anchors.verticalCenter: parent.verticalCenter; name: "plus"; color: Theme.onBrand }
                                    Label { anchors.verticalCenter: parent.verticalCenter; text: "Instalar Servicio"; color: Theme.onBrand; font.weight: Font.Medium }
                                }
                            }
                        }
                    }

                    /* Agente */
                    AgentCard {
                        Layout.fillWidth: true
                        Layout.topMargin: 20
                        server: root.server
                        onChanged: root.loadDetail()
                    }

                    /* Cifras rápidas */
                    GridLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 12
                        columns: root.width >= 760 ? 4 : 2
                        columnSpacing: 12
                        rowSpacing: 12
                        QuickStat { label: "CPU"; value: root.cpu }
                        QuickStat { label: "Memoria"; value: root.memory }
                        QuickStat { label: "Disco"; value: root.disk }
                        Glass {
                            variant: "soft"
                            elevation: "flat"
                            radius: Theme.radiusXl
                            Layout.fillWidth: true
                            Layout.preferredWidth: 1
                            implicitHeight: 58
                            Column {
                                x: 12; y: 10
                                width: parent.width - 24
                                spacing: 4
                                Label { text: "Tiempo activo"; tone: 0.55; font.pixelSize: Theme.textXs }
                                Label { width: parent.width; text: Format.uptime(root.uptime); mono: true; font.weight: Font.DemiBold }
                            }
                        }
                    }
                }
            }

            /* Pestañas */
            Glass {
                Layout.fillWidth: true
                elevation: "raised"
                implicitHeight: tabFlow.implicitHeight + 16
                Flow {
                    id: tabFlow
                    x: 8; y: 8
                    width: parent.width - 16
                    spacing: 4
                    Repeater {
                        model: root.tabs
                        Item {
                            id: tabButton
                            required property var modelData
                            readonly property bool on: root.tab === modelData.id
                            width: tabRow.implicitWidth + 32
                            height: 36
                            Accessible.role: Accessible.PageTab
                            Accessible.name: modelData.label
                            Elevation { anchors.fill: parent; visible: tabButton.on; level: "brandSm"; radius: Theme.radiusXl }
                            BrandFill { anchors.fill: parent; visible: tabButton.on }
                            Rectangle {
                                anchors.fill: parent
                                radius: Theme.radiusXl
                                color: !tabButton.on && tabHover.hovered ? Theme.tintHover : "transparent"
                            }
                            Row {
                                id: tabRow
                                anchors.centerIn: parent
                                spacing: 8
                                Icon {
                                    anchors.verticalCenter: parent.verticalCenter
                                    name: tabButton.modelData.icon
                                    color: tabButton.on ? Theme.onBrand : Theme.ink(tabHover.hovered ? 1 : 0.6)
                                }
                                Label {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: tabButton.modelData.label
                                    color: tabButton.on ? Theme.onBrand : Theme.ink(tabHover.hovered ? 1 : 0.6)
                                    font.weight: Font.Medium
                                }
                            }
                            HoverHandler { id: tabHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.tab = tabButton.modelData.id }
                        }
                    }
                }
            }

            /* Contenido de las demás pestañas: se crea al entrar y se destruye al salir. */
            Loader {
                id: tabLoader
                Layout.fillWidth: true
                active: root.tab !== "overview"
                visible: active
                sourceComponent: root.tab === "services" ? servicesTab
                               : root.tab === "commands" ? commandsTab
                               : root.tab === "docker" ? dockerTab
                               : root.tab === "kubernetes" ? kubernetesTab : null
            }

            /* Aviso sin agente */
            Glass {
                Layout.fillWidth: true
                visible: root.tab === "overview" && !root.loading && (root.failed || !root.detail)
                variant: "soft"
                elevation: "raised"
                borderColor: Qt.alpha(Theme.tone("amber").base, 0.2)
                implicitHeight: Math.max(60, warning.implicitHeight + 40)
                Icon { x: 20; anchors.verticalCenter: parent.verticalCenter; name: "activity"; size: 20; color: Theme.tone("amber").text }
                Label {
                    id: warning
                    x: 52
                    width: parent.width - 72
                    anchors.verticalCenter: parent.verticalCenter
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                    tone: 0.7
                    text: "Sin datos del agente para este servidor. Los valores del resumen aparecerán en cuanto el agente de monitoreo reporte."
                }
            }

            /* Resumen */
            GridLayout {
                Layout.fillWidth: true
                visible: root.tab === "overview"
                columns: root.twoColumns ? 2 : 1
                columnSpacing: 20
                rowSpacing: 20

                SectionCard {
                    title: "Información del Sistema"
                    iconName: "terminal"

                    Rectangle {
                        Layout.fillWidth: true
                        Layout.bottomMargin: 12
                        visible: !!root.detail && root.detail.cpu.brand !== ""
                        implicitHeight: 58
                        radius: Theme.radiusXl
                        color: Theme.tintSunken
                        border.width: 1
                        border.color: Theme.hairline
                        Icon { x: 12; anchors.verticalCenter: parent.verticalCenter; name: "cpu"; color: Theme.brandLight1 }
                        Column {
                            x: 40
                            width: parent.width - 52
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 2
                            Label { width: parent.width; text: root.detail ? root.detail.cpu.brand : "" }
                            Label {
                                width: parent.width
                                mono: true
                                tone: 0.45
                                font.pixelSize: Theme.textXs
                                text: {
                                    if (!root.detail) return ""
                                    const c = root.detail.cpu
                                    return [c.manufacturer,
                                            c.physicalCores ? c.cores + " lógicos / " + c.physicalCores + " físicos" : c.cores + " núcleos",
                                            root.detail.system.arch].filter(part => part !== "").join(" · ")
                                }
                            }
                        }
                    }
                    InfoRow { label: "Sistema Operativo"; value: root.detail ? root.detail.system.os : "—" }
                    InfoRow { label: "Kernel"; value: root.detail ? root.detail.system.kernel : "—" }
                    InfoRow { label: "Hostname"; value: root.detail ? root.detail.system.hostname : "—" }
                    InfoRow {
                        label: "Load Average"
                        value: root.detail ? root.detail.cpu.loadAverage : "—"
                        last: !!root.detail && root.detail.cpu.brand !== ""
                    }
                    InfoRow {
                        visible: !root.detail || root.detail.cpu.brand === ""
                        label: "Núcleos"
                        value: root.detail ? String(root.detail.cpu.cores) : "—"
                        last: true
                    }
                }

                SectionCard {
                    id: networkCard
                    readonly property var net: root.detail ? root.detail.network : null
                    readonly property var primary: net ? net.primary : null
                    readonly property var others: net ? net.interfaces.filter(i => i !== primary) : []
                    title: "Red"
                    iconName: "network"

                    InfoRow {
                        visible: !!networkCard.primary
                        label: "Interfaz"
                        value: networkCard.primary ? networkCard.primary.iface : ""
                        pill: networkCard.primary ? (networkCard.primary.operstate || "desconocido") : ""
                        pillUp: !!networkCard.primary && networkCard.primary.operstate === "up"
                    }
                    InfoRow { label: "IP Privada"; value: networkCard.net ? networkCard.net.privateIp : "—" }
                    InfoRow { label: "IP Pública"; value: networkCard.net ? networkCard.net.publicIp : "—" }
                    InfoRow {
                        visible: !!networkCard.primary && networkCard.primary.mac !== ""
                        label: "MAC"
                        value: networkCard.primary ? networkCard.primary.mac : ""
                    }
                    InfoRow {
                        visible: !!networkCard.primary
                        label: "Tráfico"
                        value: networkCard.primary ? "↓ " + Format.bytes(networkCard.primary.rxBytes) + " · ↑ " + Format.bytes(networkCard.primary.txBytes) : ""
                    }
                    InfoRow { label: "Host"; value: root.server.host }
                    InfoRow {
                        label: "Clave de host"
                        last: true
                        value: root.hostKey.hostKeyFingerprint
                               ? ((root.hostKey.hostKeyAlgorithm || "") + " " + root.hostKey.hostKeyFingerprint).trim()
                               : "Sin confirmar: se pedirá en la próxima conexión SSH"
                    }

                    Label {
                        Layout.topMargin: 12
                        Layout.bottomMargin: 8
                        visible: networkCard.others.length > 0
                        text: "Otras interfaces"
                        tone: 0.4
                        font.pixelSize: Theme.textXs
                        font.capitalization: Font.AllUppercase
                        font.letterSpacing: 0.5
                    }
                    Repeater {
                        model: networkCard.others
                        Rectangle {
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.bottomMargin: 6
                            implicitHeight: 34
                            radius: Theme.radiusXl
                            color: Theme.tintSunken
                            border.width: 1
                            border.color: Theme.hairline
                            Label { x: 12; anchors.verticalCenter: parent.verticalCenter; text: modelData.iface; mono: true; tone: 0.75; font.pixelSize: Theme.textXs }
                            Row {
                                anchors.right: parent.right
                                anchors.rightMargin: 12
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 8
                                Label { anchors.verticalCenter: parent.verticalCenter; text: modelData.ip4 || modelData.ip6 || "—"; mono: true; tone: 0.45; font.pixelSize: Theme.textXs }
                                Pill { anchors.verticalCenter: parent.verticalCenter; text: modelData.operstate || "—"; up: modelData.operstate === "up" }
                            }
                        }
                    }
                }

                SectionCard {
                    title: "Consumo de memoria"
                    iconName: "memory"

                    Label {
                        visible: root.topProcesses.length === 0
                        text: "Sin datos de procesos todavía."
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                    Repeater {
                        model: root.topProcesses
                        Rectangle {
                            id: proc
                            required property var modelData
                            readonly property string name: root.processLabel(modelData)
                            Layout.fillWidth: true
                            Layout.bottomMargin: 8
                            implicitHeight: 66
                            radius: Theme.radiusXl
                            color: Theme.tintSunken
                            border.width: 1
                            border.color: Theme.hairline

                            Label {
                                x: 12; y: 8
                                width: parent.width - 150
                                text: proc.name
                                tone: 0.85
                                font.pixelSize: Theme.textXs
                                font.weight: Font.DemiBold
                            }
                            Label {
                                anchors.right: closeButton.left
                                anchors.rightMargin: 6
                                y: 8
                                text: Format.bytes(proc.modelData.memRss || 0)
                                mono: true
                                font.pixelSize: Theme.textXs
                                font.weight: Font.DemiBold
                            }
                            Item {
                                id: closeButton
                                anchors.right: parent.right
                                anchors.rightMargin: 8
                                y: 4
                                width: 24; height: 24
                                Accessible.role: Accessible.Button
                                Accessible.name: "Cerrar " + proc.name + " (PID " + proc.modelData.pid + ")"
                                Icon { anchors.centerIn: parent; name: "close"; size: 14; color: closeHover.hovered ? Theme.danger : Theme.ink(0.35) }
                                HoverHandler { id: closeHover; cursorShape: Qt.PointingHandCursor }
                                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: killModal.show(proc.modelData, proc.name) }
                                HoverTip { text: "Cerrar proceso (SIGTERM)" }
                            }
                            Label { x: 12; y: 30; text: "PID " + proc.modelData.pid; mono: true; tone: 0.45; font.pixelSize: Theme.textCaption }
                            Label {
                                anchors.right: parent.right
                                anchors.rightMargin: 12
                                y: 30
                                text: Number(proc.modelData.mem || 0).toFixed(1) + "% RAM"
                                mono: true
                                tone: 0.55
                                font.pixelSize: Theme.textCaption
                            }
                            MetricBar {
                                x: 12; y: 50
                                width: parent.width - 24
                                compact: true
                                value: proc.modelData.mem || 0
                            }
                        }
                    }
                }

                SectionCard {
                    title: "Recursos Detallados"
                    iconName: "cpu"

                    MetricBar { Layout.fillWidth: true; label: "CPU"; value: root.cpu }
                    MetricBar {
                        Layout.fillWidth: true
                        Layout.topMargin: 16
                        label: root.detail
                               ? "Memoria RAM (" + Math.round(root.detail.memory.used / 1024) + " / " + Math.round(root.detail.memory.total / 1024) + " GB)"
                               : "Memoria RAM"
                        value: root.memory
                    }
                    MetricBar {
                        Layout.fillWidth: true
                        Layout.topMargin: 16
                        visible: !root.detail
                        label: "Disco"
                        value: root.disk
                    }
                    Repeater {
                        model: root.diskGroups
                        ColumnLayout {
                            id: group
                            required property var modelData
                            readonly property bool single: modelData.parts.length === 1
                            Layout.fillWidth: true
                            Layout.topMargin: 16
                            spacing: 12
                            MetricBar {
                                Layout.fillWidth: true
                                label: group.single
                                       ? "Disco " + group.modelData.name + " · " + group.modelData.parts[0].mountPoint + " " + root.sizes(group.modelData)
                                       : "Disco " + group.modelData.name + " " + root.sizes(group.modelData)
                                value: group.modelData.usagePercent
                            }
                            /* Particiones del disco, sangradas bajo su total. */
                            Item {
                                Layout.fillWidth: true
                                Layout.leftMargin: 12
                                visible: !group.single
                                implicitHeight: parts.implicitHeight
                                Rectangle { width: 1; height: parent.height; color: Theme.line }
                                Column {
                                    id: parts
                                    x: 13
                                    width: parent.width - 13
                                    spacing: 10
                                    Repeater {
                                        model: group.single ? [] : group.modelData.parts
                                        MetricBar {
                                            required property var modelData
                                            width: parts.width
                                            compact: true
                                            label: (modelData.device.replace(/^\/dev\//, "") || modelData.mountPoint) + " · " + modelData.mountPoint + " " + root.sizes(modelData)
                                            value: modelData.usagePercent
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /* Línea de comandos: visible en todas las pestañas, sobre el contenido. */
    CommandBar {
        id: commandBar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        z: 5
        server: root.server
        height: implicitHeight
        /* Desenfoca la página que pasa por debajo. */
        backdrop: scroll
        onExecuted: if (root.tab === "commands" && tabLoader.item) tabLoader.item.reload()
    }
}
