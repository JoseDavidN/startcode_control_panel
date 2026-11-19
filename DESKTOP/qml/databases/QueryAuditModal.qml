import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Consultas peligrosas confirmadas en el editor sobre esta conexión: las 50
   más recientes, con su motivo, la base, la duración y cómo terminaron.

       QueryAuditModal { id: audit; connectionId: conn.id }   // audit.open()

   Se pide al abrir; lo ya cargado se sigue viendo mientras se refresca.
   `load()` la vuelve a pedir (tras confirmar una consulta peligrosa). */
Modal {
    id: root

    property string connectionId: ""

    /* `DatabaseQueryAuditEntry[]` tal como los devuelve el backend. */
    property var entries: []
    /* Cargando sin nada que enseñar todavía. */
    property bool loading: false
    property bool failed: false
    /* Descarta respuestas de una petición anterior. */
    property int requestSeq: 0

    function load() {
        if (!connectionId) return
        const seq = ++requestSeq
        loading = entries.length === 0 && !failed
        Api.request("GET", "/databases/" + connectionId + "/audit", null, (ok, data, error) => {
            if (seq !== root.requestSeq) return
            root.loading = false
            if (!ok) { root.failed = true; return }
            root.failed = false
            root.entries = data && data.length !== undefined && typeof data !== "string" ? Array.from(data) : []
        })
    }

    /** Fecha y hora completas para el texto de ayuda de una fila. */
    function fullDateTime(at) {
        const d = new Date(at)
        if (isNaN(d.getTime())) return "—"
        return d.toLocaleString(Qt.locale("es_ES"), "dd MMM yyyy, HH:mm")
    }

    title: "Auditoría de consultas peligrosas"
    size: "lg"

    onAboutToShow: load()
    /* Otra conexión: lo cargado ya no vale. */
    onConnectionIdChanged: {
        requestSeq++
        entries = []
        loading = false
        failed = false
        if (visible) load()
    }

    Label {
        width: root.bodyWidth
        text: "Cada consulta que pidió confirmación y se ejecutó igualmente, con quién la lanzó, sobre qué base y cómo terminó. Se muestran las 50 más recientes."
        tone: 0.45
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }

    Label {
        visible: root.loading
        width: root.bodyWidth
        topPadding: 24
        bottomPadding: 24
        horizontalAlignment: Text.AlignHCenter
        text: "Cargando…"
        tone: 0.45
    }
    Label {
        visible: root.failed
        width: root.bodyWidth
        topPadding: 24
        bottomPadding: 24
        horizontalAlignment: Text.AlignHCenter
        text: "No se pudo cargar la auditoría"
        color: Theme.tone("rose").text
    }

    Item {
        id: empty
        visible: !root.loading && !root.failed && root.entries.length === 0
        width: root.bodyWidth
        height: emptyColumn.implicitHeight + 80

        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                strokeColor: Theme.edgeDashed
                strokeWidth: 1.5
                strokeStyle: ShapePath.DashLine
                dashPattern: [4, 4]
                fillColor: "transparent"
                PathRectangle {
                    x: 0.75; y: 0.75
                    width: empty.width - 1.5
                    height: empty.height - 1.5
                    radius: Theme.radiusXl
                }
            }
        }
        Column {
            id: emptyColumn
            anchors.centerIn: parent
            width: parent.width - 32
            spacing: 8
            Icon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: "shieldPlain"
                size: 32
                color: Theme.ink(0.2)
            }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: "Todavía no se ha confirmado ninguna consulta peligrosa"
                tone: 0.55
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    Column {
        visible: root.entries.length > 0
        width: root.bodyWidth
        spacing: 10

        Repeater {
            model: root.entries
            delegate: Glass {
                id: card
                required property var modelData

                readonly property bool succeeded: modelData.status === "ok"
                readonly property bool hasRows: succeeded && modelData.affectedRows !== null
                                                && modelData.affectedRows !== undefined

                width: parent.width
                height: cardColumn.implicitHeight + 32
                variant: "soft"
                radius: Theme.radiusXl

                Column {
                    id: cardColumn
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 0

                    RowLayout {
                        width: parent.width
                        spacing: 8
                        Badge {
                            Layout.alignment: Qt.AlignTop
                            text: card.succeeded ? "Ejecutada" : "Error"
                            tone: card.succeeded ? "emerald" : "rose"
                        }
                        Label {
                            Layout.fillWidth: true
                            text: card.modelData.reason || ""
                            color: Theme.tone("amber").text
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Label {
                            Layout.alignment: Qt.AlignTop
                            text: Format.timeAgo(card.modelData.createdAt)
                            tone: 0.4
                            font.pixelSize: Theme.textXs
                            HoverTip { text: root.fullDateTime(card.modelData.createdAt) }
                        }
                    }

                    Item { width: 1; height: 10 }

                    /* La sentencia, con su propio desplazamiento si es larga. */
                    Rectangle {
                        width: parent.width
                        height: Math.min(160, queryText.implicitHeight + 24)
                        radius: Theme.radiusLg
                        color: Theme.tintSunken
                        border.width: 1
                        border.color: Theme.hairlineSoft

                        ScrollArea {
                            anchors.fill: parent
                            anchors.margins: 1
                            contentHeight: queryText.implicitHeight + 22
                            Label {
                                id: queryText
                                x: 11; y: 11
                                width: parent.width - 22
                                text: card.modelData.query || ""
                                tone: 0.8
                                mono: true
                                font.pixelSize: Theme.textXs
                                wrapMode: Text.WrapAnywhere
                                elide: Text.ElideNone
                                textFormat: Text.PlainText
                            }
                        }
                    }

                    Item { width: 1; height: 8 }

                    Flow {
                        width: parent.width
                        spacing: 8
                        Label {
                            visible: !!card.modelData.schema
                            text: card.modelData.schema || ""
                            tone: 0.45; mono: true; font.pixelSize: 11
                        }
                        Label {
                            visible: !!card.modelData.schema
                            text: "·"
                            tone: 0.2; mono: true; font.pixelSize: 11
                        }
                        Label {
                            text: card.modelData.durationMs + " ms"
                            tone: 0.45; mono: true; font.pixelSize: 11
                        }
                        Label {
                            visible: card.hasRows
                            text: "·"
                            tone: 0.2; mono: true; font.pixelSize: 11
                        }
                        Label {
                            visible: card.hasRows
                            text: card.hasRows
                                  ? card.modelData.affectedRows + (card.modelData.affectedRows === 1 ? " fila" : " filas")
                                  : ""
                            tone: 0.45; mono: true; font.pixelSize: 11
                        }
                    }

                    Item { visible: errorText.visible; width: 1; height: 6 }
                    Label {
                        id: errorText
                        visible: !!card.modelData.error
                        width: parent.width
                        text: card.modelData.error || ""
                        color: Theme.tone("rose").text
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                        textFormat: Text.PlainText
                    }
                }
            }
        }
    }
}
