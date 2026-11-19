import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Pestaña «Comandos» del detalle de un servidor: registro de los comandos
   ejecutados en él, de cualquier usuario. Se ejecutan desde la barra flotante
   (`CommandBar`); aquí solo se consultan y, al pulsar uno, se pide cargarlo
   en la barra con `reuse(comando)`. Sin desplazamiento propio: crece con
   `implicitHeight`. */
Glass {
    id: root

    /* Servidor del detalle: `{ id, name, host, os, status }`. */
    property var server: ({})
    readonly property string serverId: server && server.id ? String(server.id) : ""

    /* Últimos 50 comandos, más recientes primero. */
    property var history: []
    /* Solo la primera carga muestra «Cargando…»; al refrescar se conserva la lista. */
    property bool loading: true

    /* Pide cargar el comando en la barra flotante para volver a ejecutarlo. */
    signal reuse(string command)

    /* Vuelve a pedir el historial: llamarla cuando la barra termine un comando. */
    function reload() {
        const id = serverId
        if (id === "") return
        Api.request("GET", "/agent-data/servers/" + encodeURIComponent(id) + "/commands?limit=50", null, (ok, data) => {
            if (!root || root.serverId !== id) return
            root.loading = false
            if (ok && data) root.history = Array.from(data)
        })
    }

    function statusLabel(status, exitCode) {
        if (status === "timeout") return "tiempo agotado"
        if (status === "failed") return "no ejecutado"
        return "exit " + (exitCode === null || exitCode === undefined ? "?" : exitCode)
    }
    function statusTone(status) {
        return status === "ok" ? "emerald" : status === "timeout" ? "amber" : "rose"
    }
    function fmtMs(ms) {
        const n = Number(ms) || 0
        return n < 1000 ? n + " ms" : (n / 1000).toFixed(1) + " s"
    }
    function fullDateTime(iso) {
        const ms = Date.parse(iso)
        if (isNaN(ms)) return "—"
        return new Date(ms).toLocaleString(Qt.locale("es_ES"), "dd MMM yyyy, HH:mm")
    }

    onServerIdChanged: { history = []; loading = true; reload() }
    Component.onCompleted: reload()

    implicitHeight: column.implicitHeight + 40

    /* Caja de borde discontinuo para los estados vacío y de carga. */
    component DashedBox: Item {
        id: box
        property string text
        Layout.fillWidth: true
        implicitHeight: boxLabel.implicitHeight + 64

        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                strokeColor: Theme.edgeDashed
                strokeWidth: 1
                strokeStyle: ShapePath.DashLine
                dashPattern: [4, 4]
                fillColor: "transparent"
                PathRectangle {
                    x: 0.5; y: 0.5
                    width: box.width - 1
                    height: box.height - 1
                    radius: Theme.radiusXl
                }
            }
        }
        Label {
            id: boxLabel
            anchors.centerIn: parent
            width: parent.width - 32
            horizontalAlignment: Text.AlignHCenter
            text: box.text
            tone: 0.45
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    ColumnLayout {
        id: column
        x: 20; y: 20
        width: parent.width - 40
        spacing: 16

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2
            Label {
                Layout.fillWidth: true
                text: "Comandos ejecutados"
                font.pixelSize: Theme.textBase
                font.weight: Font.DemiBold
            }
            Label {
                Layout.fillWidth: true
                text: "Últimos 50 comandos en este servidor, de cualquier usuario · pulsa uno para cargarlo en la línea de comandos"
                tone: 0.45
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        DashedBox {
            visible: root.loading
            text: "Cargando…"
        }
        DashedBox {
            visible: !root.loading && root.history.length === 0
            text: "Todavía no se ha ejecutado ningún comando desde el panel."
        }

        ColumnLayout {
            Layout.fillWidth: true
            visible: !root.loading && root.history.length > 0
            spacing: 6

            Repeater {
                model: root.history

                Glass {
                    id: row
                    required property var modelData
                    readonly property string fullCommand: (modelData.sudo ? "sudo " : "") + modelData.command
                    readonly property var author: modelData.user || {}

                    Layout.fillWidth: true
                    implicitHeight: grid.implicitHeight + 16
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    highlighted: rowHover.hovered
                    borderColor: activeFocus ? Theme.focusRing
                               : rowHover.hovered ? Theme.hairlineHover : Theme.hairlineSoft

                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: "Cargar en la línea de comandos: " + fullCommand
                    Keys.onReturnPressed: root.reuse(fullCommand)
                    Keys.onEnterPressed: root.reuse(fullCommand)
                    Keys.onSpacePressed: root.reuse(fullCommand)

                    HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: root.reuse(row.fullCommand)
                    }

                    GridLayout {
                        id: grid
                        x: 12; y: 8
                        width: parent.width - 24
                        columns: 2
                        columnSpacing: 12
                        rowSpacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 6
                            Label {
                                visible: row.modelData.sudo === true
                                text: "sudo"
                                mono: true
                                color: Theme.tone("amber").text
                                font.pixelSize: Theme.textXs
                            }
                            Label {
                                Layout.fillWidth: true
                                text: row.modelData.command
                                textFormat: Text.PlainText
                                maximumLineCount: 1
                                mono: true
                                tone: 0.85
                                font.pixelSize: Theme.textXs
                                /* La ayuda va sobre el comando para no pisar la de la fecha. */
                                HoverTip { text: "Cargar en la línea de comandos" }
                            }
                        }
                        Badge {
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                            text: root.statusLabel(row.modelData.status, row.modelData.exitCode)
                            tone: root.statusTone(row.modelData.status)
                        }

                        RowLayout {
                            id: authorLine
                            Layout.fillWidth: true
                            spacing: 0
                            Label {
                                /* Se mide contra la fila, no contra este mismo layout
                                   (dependería de su propio ancho y se reorganizaría sin fin). */
                                Layout.maximumWidth: Math.max(40, row.width * 0.35)
                                text: (row.author.name || row.author.email || "") + " · "
                                textFormat: Text.PlainText
                                tone: 0.45
                                font.pixelSize: 11
                            }
                            Label {
                                Layout.fillWidth: true
                                text: row.modelData.cwd || "~"
                                textFormat: Text.PlainText
                                mono: true
                                tone: 0.45
                                font.pixelSize: 11
                            }
                        }
                        Label {
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                            text: Format.timeAgo(row.modelData.createdAt) + " · " + root.fmtMs(row.modelData.durationMs)
                            tone: 0.4
                            font.pixelSize: 11
                            elide: Text.ElideNone
                            HoverTip { text: root.fullDateTime(row.modelData.createdAt) }
                        }
                    }
                }
            }
        }
    }
}
