import QtQuick
import QtQuick.Shapes
import StartCode

/* Las últimas líneas del journal de una unidad: saber que algo está en
   `failed` no sirve de nada si para ver el motivo hay que salir a la terminal.

       ServiceLogsModal { id: logs; server: root.server }
       logs.show("nginx.service")

   No se guarda nada entre aperturas: unos registros de hace diez minutos no
   sirven para diagnosticar lo que pasa ahora. */
Modal {
    id: root

    /* Servidor del detalle: `{ id, name, host, os, status }`. */
    property var server: ({})
    property string serviceName: ""

    /* Respuesta del backend: `{ service, lines }`; null hasta que llega. */
    property var result: null
    property bool fetching: false
    property string error: ""
    /* Descarta la respuesta de una petición anterior (otra unidad, o ya cerrado). */
    property int requestId: 0

    readonly property string lines: result ? String(result.lines || "") : ""

    function show(name) {
        serviceName = name
        result = null
        error = ""
        open()
        load()
    }

    function load() {
        if (serviceName === "" || !server || !server.id) return
        const id = ++requestId
        fetching = true
        Api.request("POST", "/agent-data/servers/" + server.id + "/services/" + encodeURIComponent(serviceName) + "/logs",
                    { lines: 200 }, (ok, data, failure) => {
            if (id !== root.requestId) return
            root.fetching = false
            if (ok) {
                root.error = ""
                root.result = data || null
            } else {
                /* Lo ya leído se conserva debajo del error. */
                root.error = (failure && failure.message) || "Error en la petición"
            }
        }, 45000)
    }

    title: "Journal de " + serviceName
    size: "lg"

    onClosed: {
        requestId++
        fetching = false
        result = null
        error = ""
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    /* Caja de borde discontinuo para la carga y el estado vacío. */
    component DashedBox: Item {
        id: box
        property string text
        width: root.bodyWidth
        implicitHeight: boxLabel.implicitHeight + 96

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

    /* ── Qué se muestra y botón de releer ──────────────────────────── */
    Item {
        width: root.bodyWidth
        implicitHeight: Math.max(caption.implicitHeight, refresh.height)

        Label {
            id: caption
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - refresh.width - 12
            textFormat: Text.RichText
            text: "Últimas 200 líneas de <span style=\"font-family:'" + Theme.fontMono + "'\">journalctl -u "
                + root.escapeHtml(root.serviceName) + "</span>"
            tone: 0.45
            font.pixelSize: Theme.textXs
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }

        SecondaryButton {
            id: refresh
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: 36
            implicitWidth: refreshRow.implicitWidth + 28
            enabled: !root.fetching
            text: root.fetching ? "Leyendo…" : "Actualizar"
            onClicked: root.load()
            contentItem: Item {
                Row {
                    id: refreshRow
                    anchors.centerIn: parent
                    spacing: 8
                    Spinner { visible: root.fetching; anchors.verticalCenter: parent.verticalCenter; color: Theme.ink(0.75) }
                    Icon {
                        visible: !root.fetching
                        anchors.verticalCenter: parent.verticalCenter
                        path: "M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
                        color: Theme.ink(refresh.hovered ? 1 : 0.75)
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        text: refresh.text
                        tone: refresh.hovered ? 1 : 0.75
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Medium
                    }
                }
            }
        }
    }

    /* ── Error de lectura ──────────────────────────────────────────── */
    Glass {
        visible: root.error !== ""
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Qt.alpha(Theme.danger, 0.2)
        implicitHeight: errorLabel.implicitHeight + 24
        Label {
            id: errorLabel
            x: 12; y: 12
            width: parent.width - 24
            text: root.error
            color: Theme.tone("rose").text
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }
    }

    /* ── Journal ───────────────────────────────────────────────────── */
    DashedBox {
        visible: root.fetching && !root.result
        text: "Leyendo el journal del servidor…"
    }

    Glass {
        id: output
        visible: root.result !== null
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        /* Como mucho el 55 % de la ventana, y sin pasarse de lo que cabe en el
           modal: el journal se desplaza dentro de su caja. */
        readonly property real limit: Math.max(160, Math.min((root.maxBodyHeight + 96) * 0.55, root.maxBodyHeight - 200))
        implicitHeight: Math.min(limit, journal.implicitHeight + 32)

        ScrollArea {
            id: journalScroll
            anchors.fill: parent
            anchors.margins: 1
            contentHeight: journal.implicitHeight + 32

            TextEdit {
                id: journal
                x: 16; y: 16
                width: journalScroll.width - 32
                text: root.lines
                textFormat: TextEdit.PlainText
                readOnly: true
                selectByMouse: true
                wrapMode: TextEdit.Wrap
                color: Theme.ink(0.7)
                selectionColor: Theme.brand1(0.45)
                selectedTextColor: Theme.ink(1)
                font.family: Theme.fontMono
                font.pixelSize: 11
            }
        }
    }

    DashedBox {
        visible: !root.fetching && !root.result && root.error === ""
        text: "Sin salida para esta unidad."
    }
}
