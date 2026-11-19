import QtQuick
import QtQuick.Layouts
import StartCode

/* Resultado de la última consulta. Con filas, la tabla (`ResultGrid`); si no,
   el estado: sin ejecutar, ejecutando, error, filas afectadas o sin filas.

   La tabla solo existe mientras hay filas que mostrar: al ejecutar otra
   consulta se desmonta y la siguiente arranca sin selección, columnas
   reveladas ni cambios pendientes. */
Item {
    id: root

    /* `QueryResult` de `POST /databases/:id/query`, o null/undefined. */
    property var result: null
    /* Mensaje de error de la consulta, o null/"". */
    property var error: null
    property bool running: false
    /* Conexión sobre la que se guardan las celdas editadas. */
    property string connectionId: ""
    property var sessionId: null
    /* Nombre base del archivo exportado, sin extensión. */
    property string fileName: ""
    /* Consulta que dio el resultado (`{ sql, schema }`): al exportar se repite para traer todas las filas. */
    property var query: null
    /* Vuelve a ejecutar la consulta (tras crear o borrar filas). */
    signal rerun()

    readonly property bool hasError: error !== null && error !== undefined && String(error) !== ""
    readonly property bool hasResult: result !== null && result !== undefined
    readonly property bool hasColumns: hasResult && result.columns !== null && result.columns !== undefined
    readonly property bool showGrid: hasColumns && result.columns.length > 0
                                     && Boolean(result.rows) && result.rows.length > 0
                                     && !running && !hasError && Boolean(sessionId)

    function localeCount(n) { return Number(n).toLocaleString(Qt.locale(), "f", 0) }

    /* ── Resumen de la barra ── */
    Component {
        id: statusComponent
        Row {
            spacing: 8

            Label {
                visible: !root.running && !root.hasError && !root.hasResult
                anchors.verticalCenter: parent.verticalCenter
                text: "Ejecuta una consulta para ver los resultados"
                tone: 0.4
                font.pixelSize: Theme.textXs
            }
            Label {
                visible: root.running
                anchors.verticalCenter: parent.verticalCenter
                text: "Ejecutando…"
                tone: 0.55
                font.pixelSize: Theme.textXs
            }
            Row {
                visible: !root.running && root.hasError
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6
                Icon { anchors.verticalCenter: parent.verticalCenter; name: "alert"; size: 16; color: Theme.tone("rose").text }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Error"
                    color: Theme.tone("rose").text
                    font.pixelSize: Theme.textXs
                }
            }
            Icon {
                visible: !root.running && !root.hasError && root.hasResult
                anchors.verticalCenter: parent.verticalCenter
                name: "check"
                size: 16
                color: Theme.tone("emerald").text
            }
            /* Consulta con filas. */
            Label {
                visible: !root.running && !root.hasError && root.hasColumns
                anchors.verticalCenter: parent.verticalCenter
                text: root.hasColumns ? root.localeCount(root.result.rowCount) + " " + (root.result.rowCount === 1 ? "fila" : "filas") : ""
                tone: 0.6
                font.pixelSize: Theme.textXs
            }
            Label {
                visible: !root.running && !root.hasError && root.hasColumns && root.result.truncated === true
                anchors.verticalCenter: parent.verticalCenter
                text: root.hasColumns && root.result.rows ? "· se muestran las primeras " + root.localeCount(root.result.rows.length) : ""
                color: Theme.tone("amber").text
                font.pixelSize: Theme.textXs
            }
            /* Sentencia sin filas (INSERT, UPDATE, DDL…). */
            Label {
                visible: !root.running && !root.hasError && root.hasResult && !root.hasColumns
                anchors.verticalCenter: parent.verticalCenter
                text: {
                    if (!root.hasResult || root.hasColumns) return ""
                    const affected = root.result.affectedRows === null || root.result.affectedRows === undefined ? 0 : root.result.affectedRows
                    return affected + " " + (affected === 1 ? "fila afectada" : "filas afectadas")
                         + (root.result.insertId ? " · id insertado " + root.result.insertId : "")
                }
                tone: 0.6
                font.pixelSize: Theme.textXs
            }
        }
    }

    /* ── Con filas: la tabla ── */
    Loader {
        id: gridLoader
        anchors.fill: parent
        active: root.showGrid
        sourceComponent: ResultGrid {
            result: root.result
            connectionId: root.connectionId
            sessionId: root.sessionId ? String(root.sessionId) : ""
            fileName: root.fileName
            query: root.query
            status: statusComponent
            onRerun: root.rerun()
        }
    }

    /* ── Sin filas: el estado ── */
    Item {
        anchors.fill: parent
        visible: !root.showGrid

        Item {
            id: bar
            width: parent.width
            height: 44

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 20
                anchors.rightMargin: 20
                spacing: 12

                Label {
                    visible: root.width >= 420
                    Layout.minimumWidth: implicitWidth
                    text: "RESULTADOS"
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                    font.letterSpacing: 0.6
                }
                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    Loader {
                        anchors.verticalCenter: parent.verticalCenter
                        sourceComponent: statusComponent
                    }
                }
                Label {
                    visible: root.hasResult && !root.running && !root.hasError
                    Layout.minimumWidth: implicitWidth
                    text: (root.hasResult ? root.result.durationMs : 0) + " ms"
                    mono: true
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        ScrollArea {
            anchors.top: bar.bottom
            anchors.bottom: parent.bottom
            width: parent.width
            visible: root.hasError && !root.running
            contentHeight: errorBox.height + 32

            Rectangle {
                id: errorBox
                x: 16
                y: 16
                width: parent.width - 32
                height: errorEdit.implicitHeight + 32
                radius: Theme.radiusXl
                color: Qt.alpha(Theme.tone("rose").base, 0.1)
                border.width: 1
                border.color: Qt.alpha(Theme.tone("rose").text, 0.2)

                TextEdit {
                    id: errorEdit
                    x: 16
                    y: 16
                    width: parent.width - 32
                    text: root.hasError ? String(root.error) : ""
                    readOnly: true
                    selectByMouse: true
                    wrapMode: TextEdit.Wrap
                    color: Theme.tone("rose").text
                    selectionColor: Theme.brand1(0.35)
                    selectedTextColor: Theme.ink(1)
                    font.family: Theme.fontMono
                    font.pixelSize: Theme.textXs
                }
            }
        }

        Label {
            visible: !root.hasError && !root.running && root.hasColumns
            anchors.top: bar.bottom
            anchors.bottom: parent.bottom
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            text: "La consulta no devolvió filas"
            tone: 0.4
        }
    }
}
