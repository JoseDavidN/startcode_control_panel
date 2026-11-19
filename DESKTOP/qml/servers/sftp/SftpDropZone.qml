import QtQuick
import QtQuick.Dialogs
import QtQuick.Shapes
import StartCode

/* Zona de arrastrar y soltar del explorador (DESIGN.md): borde discontinuo,
   resaltado de marca mientras se arrastra encima y dos botones para elegir
   con el diálogo del sistema. Lo elegido o soltado se recorre fuera de la
   interfaz (`Transfers.scan`); las carpetas de paquetes omitidas, en un aviso. */
Item {
    id: root

    property string destDir: ""
    property bool disabled: false

    /* `{ path, relPath, name, size }` por archivo, con la ruta relativa que conserva el árbol. */
    signal files(var list)

    property bool dragging: false
    property bool picking: false
    /* Entradas menos salidas del arrastre: sin contador, pasar sobre los
       hijos haría parpadear el resaltado. */
    property int depth: 0
    property int scans: 0
    property string scanId: ""

    implicitHeight: column.implicitHeight + 32
    opacity: disabled ? 0.5 : 1

    /* «No se cargaron 2 carpetas de paquetes o cachés (…)»; vacío si no se omitió nada. */
    function describeSkipped(skipped) {
        if (skipped.length === 0) return ""
        const names = []
        for (const path of skipped) {
            const name = path.split("/").pop() || path
            if (!names.includes(name)) names.push(name)
        }
        const shown = names.slice(0, 3).join(", ")
        const more = names.length > 3 ? " y " + (names.length - 3) + " más" : ""
        return "No se cargaron " + (skipped.length === 1 ? "una carpeta" : skipped.length + " carpetas")
             + " de paquetes o cachés (" + shown + more + "): se regeneran con el gestor de paquetes."
    }

    /* Rutas locales de lo elegido o soltado: los archivos tal cual, las carpetas con su árbol. */
    function load(urls) {
        const paths = []
        for (const url of Array.from(urls || [])) {
            const path = Transfers.localPathFromUrl(url)
            if (path !== "") paths.push(path)
        }
        if (paths.length === 0) {
            picking = false
            return
        }
        picking = true
        scanId = "sftp-scan-" + Date.now() + "-" + (++scans)
        Transfers.scan(scanId, paths)
    }

    Connections {
        target: Transfers
        function onScanFinished(id, found, skipped) {
            if (id !== root.scanId) return
            root.scanId = ""
            root.picking = false
            /* Lo elegido va a la cola; las carpetas de paquetes omitidas, en un aviso. */
            const note = root.describeSkipped(Array.from(skipped || []))
            if (note !== "") Toasts.info("Carpetas omitidas", note)
            const list = Array.from(found || [])
            if (list.length > 0) root.files(list)
        }
    }

    FileDialog {
        id: fileDialog
        title: "Elegir archivos"
        fileMode: FileDialog.OpenFiles
        onAccepted: root.load(selectedFiles)
        onRejected: root.picking = false
    }
    FolderDialog {
        id: folderDialog
        title: "Elegir carpeta"
        onAccepted: root.load([selectedFolder])
        onRejected: root.picking = false
    }

    /* ── Superficie ────────────────────────────────────────────────── */
    BrandFill {
        anchors.fill: parent
        visible: root.dragging
        radius: Theme.radiusXl
        strength: 0.18
    }
    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: root.dragging ? Theme.brand1(0.4) : zoneHover.hovered ? Theme.edgeDashedHover : Theme.edgeDashed
            strokeWidth: 1
            strokeStyle: ShapePath.DashLine
            dashPattern: [4, 3]
            fillColor: "transparent"
            PathRectangle {
                x: 0.5; y: 0.5
                width: root.width - 1
                height: root.height - 1
                radius: Theme.radiusXl
            }
        }
    }
    HoverHandler { id: zoneHover }

    DropArea {
        anchors.fill: parent
        keys: ["text/uri-list"]
        onEntered: {
            root.depth += 1
            if (!root.disabled) root.dragging = true
        }
        onExited: {
            root.depth -= 1
            if (root.depth <= 0) {
                root.depth = 0
                root.dragging = false
            }
        }
        onDropped: drop => {
            root.depth = 0
            root.dragging = false
            if (root.disabled || !drop.hasUrls) return
            drop.acceptProposedAction()
            /* Lo soltado directamente cuenta como elegido: no se omite aunque sea de paquetes. */
            root.load(drop.urls)
        }
    }

    Column {
        id: column
        x: 16
        y: 16
        width: parent.width - 32

        SftpIcon {
            anchors.horizontalCenter: parent.horizontalCenter
            kind: "upload"
            size: 24
            color: Theme.ink(0.35)
        }
        Item { width: 1; height: 8 }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: "Suelta aquí archivos o carpetas"
            tone: 0.7
        }
        Item { width: 1; height: 4 }
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 4
            Label {
                id: destTitle
                text: "Destino:"
                tone: 0.4
                font.pixelSize: Theme.textXs
            }
            Label {
                width: Math.min(implicitWidth, column.width - destTitle.width - 4)
                text: root.destDir || "—"
                mono: true
                tone: 0.6
                font.pixelSize: Theme.textXs
                elide: Text.ElideMiddle
                HoverTip { text: root.destDir }
            }
        }
        Item { width: 1; height: 12 }
        Row {
            width: parent.width
            spacing: 8
            SecondaryButton {
                width: (parent.width - 8) / 2
                text: "Elegir archivos"
                enabled: !root.disabled && !root.picking
                onClicked: {
                    root.picking = true
                    fileDialog.open()
                }
            }
            SecondaryButton {
                width: (parent.width - 8) / 2
                text: "Elegir carpeta"
                enabled: !root.disabled && !root.picking
                onClicked: {
                    root.picking = true
                    folderDialog.open()
                }
            }
        }
    }
}
