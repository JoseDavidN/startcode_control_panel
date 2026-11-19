import QtQuick
import StartCode

/* Configuración → Monitoreo: estado del tiempo real, intervalo de refresco
   y umbrales de alerta (preferencias `monitoring`), más la retención del
   historial, que es informativa: la aplica el backend. */
Column {
    id: root

    readonly property var settings: (Auth.preferences || {}).monitoring || {}

    /* Espejo de METRICS_RETENTION_DAYS en el backend (metrics-retention.service.ts). */
    readonly property int retentionDays: 30

    readonly property var refreshOptions: [
        { value: 5, label: "5 segundos" },
        { value: 15, label: "15 segundos" },
        { value: 30, label: "30 segundos" },
        { value: 60, label: "1 minuto" },
        { value: 300, label: "5 minutos" }
    ]

    readonly property string ramPath: "M4 7h16a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 7zM7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2"
    readonly property string diskPath: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 14h18M6 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"

    readonly property var thresholdRows: [
        { label: "CPU", key: "cpuThreshold", icon: "cpu", path: "" },
        { label: "Memoria", key: "memoryThreshold", icon: "", path: ramPath },
        { label: "Disco", key: "diskThreshold", icon: "", path: diskPath }
    ]

    readonly property var historyRows: [
        { label: "Datos conservados", value: retentionDays + " días" },
        { label: "Limpieza automática", value: "Cada día a las 03:30 (hora del servidor)" },
        { label: "Gráfico del dashboard", value: "Últimas 24 horas" }
    ]

    /* ── Resumen en vivo ───────────────────────────────────────────── */
    property var servers: []
    readonly property int registeredCount: servers.length
    /* En línea = lo que dice el socket ahora, no el estado guardado. */
    readonly property int onlineCount: {
        Realtime.revision
        let count = 0
        for (const server of servers) {
            if (Realtime.live(server.id).status === "online") count++
        }
        return count
    }
    readonly property int offlineCount: registeredCount - onlineCount

    /* Con poco ancho la ayuda del intervalo baja debajo del campo. */
    readonly property bool narrow: width < 520

    spacing: 32

    Component.onCompleted: loadServers()

    function loadServers() {
        Api.request("GET", "/servers", null, (ok, data) => {
            if (ok) root.servers = data || []
        })
    }

    function setThreshold(key, value) {
        const next = Object.assign({}, root.settings)
        next[key] = Math.round(value)
        Auth.patchPreferences("monitoring", next)
    }

    /* Red de seguridad: solo recoge cambios estructurales de la lista. */
    Timer { interval: 5 * 60 * 1000; running: true; repeat: true; onTriggered: root.loadServers() }
    Connections {
        target: Realtime
        function onPresenceChanged() { root.loadServers() }
    }

    component Divider: Rectangle {
        width: parent ? parent.width : 0
        height: 1
        color: Theme.line
    }

    component StatCell: Item {
        id: cell
        property int count: 0
        property color numberColor: Theme.ink(1)
        property string caption: ""
        implicitHeight: cellColumn.implicitHeight + 16
        Column {
            id: cellColumn
            y: 8
            width: parent.width
            spacing: 4
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: String(cell.count)
                color: cell.numberColor
                font.pixelSize: 24
                font.weight: Font.Bold
            }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: cell.caption
                tone: 0.45
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    /* ── Estado en tiempo real ─────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 16

        Item {
            width: parent.width
            height: 24
            SettingsSectionTitle {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - socketState.width - 12
                text: "Estado en Tiempo Real"
            }
            Row {
                id: socketState
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 8; height: 8; radius: 4
                    color: Realtime.connected ? Theme.ok : Theme.ink(0.2)
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: Realtime.connected ? "WebSocket activo" : "Sin conexión"
                    color: Realtime.connected ? Theme.tone("emerald").text : Theme.ink(0.35)
                    font.pixelSize: Theme.textXs
                    elide: Text.ElideNone
                }
            }
        }

        Glass {
            width: parent.width
            height: overview.implicitHeight + 32
            implicitHeight: height
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl

            Column {
                id: overview
                x: 16; y: 16
                width: parent.width - 32
                spacing: 12

                Item {
                    id: stats
                    readonly property real cellWidth: Math.max(0, (width - 32) / 3)
                    width: parent.width
                    height: Math.max(registeredCell.implicitHeight, onlineCell.implicitHeight, offlineCell.implicitHeight)

                    StatCell {
                        id: registeredCell
                        width: stats.cellWidth
                        height: parent.height
                        count: root.registeredCount
                        caption: "Servidores registrados"
                    }
                    StatCell {
                        id: onlineCell
                        x: stats.cellWidth + 16
                        width: stats.cellWidth
                        height: parent.height
                        count: root.onlineCount
                        numberColor: root.onlineCount > 0 ? Theme.tone("emerald").text : Theme.ink(0.35)
                        caption: "Agentes activos"
                    }
                    StatCell {
                        id: offlineCell
                        x: (stats.cellWidth + 16) * 2
                        width: stats.cellWidth
                        height: parent.height
                        count: root.offlineCount
                        numberColor: root.offlineCount > 0 ? Theme.tone("rose").text : Theme.ink(0.35)
                        caption: "Sin agente / offline"
                    }
                    Rectangle { x: onlineCell.x; width: 1; height: parent.height; color: Theme.line }
                    Rectangle { x: onlineCell.x + onlineCell.width - 1; width: 1; height: parent.height; color: Theme.line }
                }
                Divider { visible: root.registeredCount === 0 }
                Label {
                    visible: root.registeredCount === 0
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: "Sin servidores registrados — agrega uno desde la sección Servidores"
                    tone: 0.35
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
    }

    Divider {}

    /* ── Intervalo de actualización ────────────────────────────────── */
    Column {
        width: root.width
        spacing: 16

        SettingsSectionTitle { width: parent.width; text: "Intervalo de Actualización" }

        Item {
            width: parent.width
            height: root.narrow ? intervalField.height + 10 + intervalHelp.implicitHeight
                                : Math.max(intervalField.height, intervalHelp.implicitHeight)

            Glass {
                id: intervalField
                y: root.narrow ? 0 : (parent.height - height) / 2
                width: Math.min(parent.width, 206)
                height: Theme.fieldHeight
                variant: "input"

                Icon {
                    x: 14
                    anchors.verticalCenter: parent.verticalCenter
                    name: "refresh"
                    color: Theme.ink(0.45)
                }
                Select {
                    x: 38
                    width: parent.width - 52
                    height: parent.height
                    Accessible.name: "Intervalo de actualización"
                    value: root.settings.refreshInterval
                    options: root.refreshOptions
                    onPicked: value => Auth.patchPreferences("monitoring", { refreshInterval: value })
                }
            }
            Label {
                id: intervalHelp
                x: root.narrow ? 0 : intervalField.width + 12
                y: root.narrow ? intervalField.height + 10 : (parent.height - implicitHeight) / 2
                width: parent.width - x
                text: "Intervalo de polling HTTP. El WebSocket entrega métricas en tiempo real independientemente."
                tone: 0.45
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    Divider {}

    /* ── Umbrales de alerta ────────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 16

        Column {
            width: parent.width
            spacing: 4
            SettingsSectionTitle { width: parent.width; text: "Umbrales de Alerta" }
            Label {
                width: parent.width
                text: "Se aplican a cada servidor por separado: se notifica cuando cualquiera de ellos supera el umbral."
                tone: 0.4
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Column {
            id: thresholdList
            width: parent.width
            spacing: 24

            Repeater {
                model: root.thresholdRows
                Glass {
                    id: card
                    required property var modelData
                    readonly property real current: Number(root.settings[modelData.key]) || 0

                    width: thresholdList.width
                    height: 88
                    implicitHeight: height
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl

                    Icon {
                        id: cardIcon
                        x: 16; y: 18
                        color: Theme.ink(0.55)
                        path: card.modelData.path !== "" ? card.modelData.path : (cardIcon.paths[card.modelData.icon] ?? "")
                    }
                    Label {
                        x: 40; y: 16
                        width: parent.width - 56 - valueLabel.width - 8
                        text: card.modelData.label
                        font.weight: Font.Medium
                    }
                    Label {
                        id: valueLabel
                        anchors.right: parent.right
                        anchors.rightMargin: 16
                        y: 16
                        text: card.current + "%"
                        mono: true
                        font.weight: Font.DemiBold
                        elide: Text.ElideNone
                    }
                    RangeSlider {
                        x: 16; y: 48
                        width: parent.width - 32
                        min: 10
                        max: 100
                        value: card.current
                        label: "Umbral de " + card.modelData.label
                        onChange: value => root.setThreshold(card.modelData.key, value)
                    }
                }
            }
        }
    }

    Divider {}

    /* ── Historial de métricas ─────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 16

        Column {
            width: parent.width
            spacing: 4
            SettingsSectionTitle { width: parent.width; text: "Historial de Métricas" }
            Label {
                width: parent.width
                text: "Cada servidor guarda un punto de CPU, memoria y disco por reporte del agente. Lo usa el gráfico del dashboard."
                tone: 0.4
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Column {
            width: parent.width
            spacing: 12

            Glass {
                width: parent.width
                height: historyList.implicitHeight
                implicitHeight: height
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl

                Column {
                    id: historyList
                    width: parent.width

                    Repeater {
                        model: root.historyRows
                        Item {
                            id: historyRow
                            required property var modelData
                            required property int index
                            width: historyList.width
                            height: Math.max(historyName.implicitHeight, historyValue.implicitHeight) + 24

                            Rectangle { visible: historyRow.index > 0; width: parent.width; height: 1; color: Theme.line }
                            Label {
                                id: historyName
                                x: 16
                                anchors.verticalCenter: parent.verticalCenter
                                text: historyRow.modelData.label
                                tone: 0.55
                                elide: Text.ElideNone
                            }
                            Label {
                                id: historyValue
                                anchors.right: parent.right
                                anchors.rightMargin: 16
                                anchors.verticalCenter: parent.verticalCenter
                                width: Math.max(0, parent.width - 32 - historyName.implicitWidth - 16)
                                horizontalAlignment: Text.AlignRight
                                text: historyRow.modelData.value
                                mono: true
                                tone: 0.9
                                wrapMode: Text.WordWrap
                                elide: Text.ElideNone
                            }
                        }
                    }
                }
            }
            Label {
                width: parent.width
                text: "Lo anterior a " + root.retentionDays + " días se elimina; el estado actual de cada servidor no se ve afectado."
                tone: 0.35
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    SettingsSaveBar { width: root.width; label: "Guardar monitoreo" }
}
