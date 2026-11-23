import QtQuick
import QtQuick.Dialogs
import QtQuick.Templates as T
import StartCode

/* Exportar: CSV o XLSX del resultado completo, con «Guardar como».

   `getTable` es una función `getTable(done)`: reúne todas las filas de la
   consulta (con las columnas sensibles ocultas enmascaradas como en la tabla)
   y llama a `done(source, mensajeDeError)`, con
   `source = { table: { columns, rows }, total, complete }` o `null` si falló. */
Item {
    id: root

    property var result: null
    /* Nombre base del archivo, sin extensión. */
    property string fileName: ""
    property var getTable: null
    property int hiddenCount: 0
    /* Sin sitio: solo el icono. */
    property bool compact: false

    property bool busy: false
    property string pendingFormat: ""
    property var pendingSource: null
    /* Momento en que se cerró el menú: el clic que lo cierra no debe reabrirlo. */
    property double closedAt: 0

    implicitHeight: 28
    implicitWidth: buttonRow.implicitWidth + 20
    opacity: busy ? 0.5 : 1
    Accessible.role: Accessible.ButtonMenu
    Accessible.name: "Exportar"

    function localeCount(n) { return Number(n).toLocaleString(Qt.locale(), "f", 0) }

    /* ── Colores de la hoja a partir del tema activo ── */
    function hexByte(n) {
        const s = Math.max(0, Math.min(255, Math.round(n))).toString(16)
        return (s.length < 2 ? "0" + s : s).toUpperCase()
    }
    function toHex(rgb) { return hexByte(rgb[0]) + hexByte(rgb[1]) + hexByte(rgb[2]) }
    /* Mezcla el color sobre blanco con la opacidad dada. */
    function tint(rgb, alpha) { return toHex([0, 1, 2].map(i => 255 + (rgb[i] - 255) * alpha)) }
    /* Cabecera con el color de marca y su tinta; filas alternas teñidas de la
       marca sobre blanco. El color del texto lo pone el exportador. */
    function sheetTheme() {
        const brand = Theme.p.brand1Rgb
        return {
            header: toHex(brand),
            headerText: String(Theme.p.onBrand).replace("#", "").toUpperCase(),
            stripe: tint(brand, 0.09),
            border: tint(brand, 0.28)
        }
    }

    function toggle() {
        if (busy) return
        if (menu.visible) { menu.close(); return }
        if (Date.now() - closedAt < 250) return
        menu.open()
    }

    function exportAs(format) {
        menu.close()
        if (busy || typeof getTable !== "function") return
        busy = true
        pendingFormat = format
        getTable((source, message) => {
            if (!source) {
                root.busy = false
                Toasts.error("No se pudo exportar", message || "")
                return
            }
            root.pendingSource = source
            const folder = Transfers.downloadsDir()
            saveDialog.nameFilters = [format.toUpperCase() + " (*." + format + ")"]
            saveDialog.defaultSuffix = format
            saveDialog.selectedFile = Transfers.urlFromLocalPath(Transfers.joinPath(folder, root.fileName + "." + format))
            saveDialog.open()
        })
    }

    function save(path) {
        const source = pendingSource
        pendingSource = null
        if (!source) { busy = false; return }
        if (path === "") {
            busy = false
            Toasts.error("No se pudo exportar", "El destino elegido no es una carpeta local")
            return
        }
        const table = source.table
        /* El XLSX toma los colores del tema activo en el momento de exportar. */
        const failure = pendingFormat === "csv"
            ? exporter.writeCsv(path, table.columns, table.rows)
            : exporter.writeXlsx(path, table.columns, table.rows, "Resultados", sheetTheme())
        busy = false
        if (failure !== "") { Toasts.error("No se pudo exportar", failure); return }
        const rows = localeCount(table.rows.length)
        if (source.complete) Toasts.success("Consulta exportada", rows + " filas en " + path)
        else Toasts.warning("Consulta exportada en parte",
                            rows + " de " + localeCount(source.total) + " filas en " + path
                            + ". Filtra la consulta para exportar el resto.")
    }

    TableExporter { id: exporter }

    FileDialog {
        id: saveDialog
        fileMode: FileDialog.SaveFile
        onAccepted: root.save(Transfers.localPathFromUrl(selectedFile))
        /* Canceló el diálogo de guardar. */
        onRejected: { root.pendingSource = null; root.busy = false }
    }

    /* ── Botón ── */
    Glass {
        anchors.fill: parent
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusLg
        highlighted: buttonHover.hovered && !root.busy
    }
    Row {
        id: buttonRow
        anchors.centerIn: parent
        spacing: 6
        Spinner {
            visible: root.busy
            anchors.verticalCenter: parent.verticalCenter
            size: 14
        }
        Icon {
            visible: !root.busy
            anchors.verticalCenter: parent.verticalCenter
            name: "download"
            size: 14
            color: Theme.ink(buttonHover.hovered ? 1 : 0.75)
        }
        Label {
            visible: !root.compact
            anchors.verticalCenter: parent.verticalCenter
            text: root.busy ? "Exportando…" : "Exportar"
            tone: buttonHover.hovered ? 1 : 0.75
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
        Icon {
            anchors.verticalCenter: parent.verticalCenter
            name: "chevronDown"
            size: 12
            color: Theme.ink(buttonHover.hovered ? 1 : 0.75)
        }
    }
    HoverHandler { id: buttonHover; cursorShape: root.busy ? Qt.ArrowCursor : Qt.PointingHandCursor }
    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.toggle() }
    HoverTip {
        text: root.result && root.result.truncated && !menu.visible
              ? "Exporta las " + root.localeCount(root.result.rowCount) + " filas, no solo las mostradas"
              : root.compact ? "Exportar" : ""
    }

    /* ── Menú ── */
    component FormatItem: Rectangle {
        id: item
        property string badge: ""
        property string toneName: "sky"
        property string text: ""
        signal picked()

        width: parent ? parent.width : 0
        height: 36
        radius: Theme.radiusLg
        color: itemHover.hovered ? Theme.tintHover : "transparent"
        Accessible.role: Accessible.MenuItem
        Accessible.name: item.text

        Rectangle {
            id: badgeBox
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            width: 36
            height: 19
            radius: Theme.radiusMd
            color: Qt.alpha(Theme.tone(item.toneName).base, 0.15)
            border.width: 1
            border.color: Qt.alpha(Theme.tone(item.toneName).text, 0.2)
            Label {
                anchors.centerIn: parent
                text: item.badge
                mono: true
                color: Theme.tone(item.toneName).text
                font.pixelSize: Theme.textCaption
                font.weight: Font.DemiBold
            }
        }
        Label {
            anchors.left: badgeBox.right
            anchors.leftMargin: 10
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            text: item.text
            tone: itemHover.hovered ? 1 : 0.75
            font.pixelSize: Theme.textXs
        }
        HoverHandler { id: itemHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: item.picked() }
    }

    T.Popup {
        id: menu
        parent: T.Overlay.overlay
        width: 232
        height: menuColumn.implicitHeight + 8
        padding: 4
        modal: false
        focus: true
        closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside
        onAboutToShow: {
            const overlay = T.Overlay.overlay
            const point = root.mapToItem(overlay, root.width - width, root.height + 6)
            x = Math.max(8, Math.min(point.x, overlay.width - width - 8))
            y = point.y + height > overlay.height - 8 ? root.mapToItem(overlay, 0, -height - 6).y : point.y
        }
        onClosed: root.closedAt = Date.now()
        enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
        exit: Transition { NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Theme.moFast } }
        background: Glass { variant: "float"; radius: Theme.radiusXl }

        contentItem: Column {
            id: menuColumn
            FormatItem {
                badge: "CSV"
                toneName: "sky"
                text: "Texto separado por comas"
                onPicked: root.exportAs("csv")
            }
            FormatItem {
                badge: "XLSX"
                toneName: "emerald"
                text: "Libro de Excel"
                onPicked: root.exportAs("xlsx")
            }
            Item {
                visible: root.hiddenCount > 0
                width: parent.width
                height: hiddenNote.implicitHeight + 15
                Rectangle { y: 4; width: parent.width; height: 1; color: Theme.line }
                Label {
                    id: hiddenNote
                    x: 12
                    y: 11
                    width: parent.width - 24
                    text: (root.hiddenCount === 1
                           ? "La columna oculta se exporta enmascarada"
                           : "Las " + root.hiddenCount + " columnas ocultas se exportan enmascaradas")
                          + "; muéstrala para exportar su valor."
                    tone: 0.4
                    font.pixelSize: Theme.textCaption
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
    }
}
