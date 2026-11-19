import QtQuick
import QtQuick.Dialogs
import QtQuick.Layouts
import StartCode

/* Explorador SFTP de un servidor. Alto fijo (todo el disponible) y tres
   columnas en una sola vista: la carpeta actual, la vista previa de lo
   elegido y las transferencias. Cada columna desplaza dentro; el modal no
   cambia de tamaño. Con poco ancho las columnas se apilan y desplaza el modal.

       SftpModal { id: sftp; server: root.server }
       …
       sftp.open()

   La sesión vive mientras el modal está abierto: al cerrarlo se cancelan las
   subidas y descargas en curso y el backend suelta la conexión SSH. */
Modal {
    id: root

    /* `{ id, name, host, os, status }` */
    property var server: ({})
    /* Archivos para enviar a la carpeta que se elija (Compartir por SFTP):
       `{ label, summary, files: [{ path, relPath, name, size }] }`, con rutas locales. */
    property var incoming: null

    /* La clave de host del servidor cambió o no está confirmada: para el aviso
       global, con las dos huellas (`{ serverId, host, port, expected, received }`). */
    signal hostKeyRejected(var mismatch)
    /* El backend terminó la sesión del panel por este socket (`{ reason, message }`). */
    signal sessionRevoked(var payload)

    property bool creatingFolder: false
    property string folderError: ""
    /* Entrada elegida (vista previa); null si no hay. */
    property var selected: null
    /* Casillas marcadas: ruta → true. Son de la carpeta que se ve. */
    property var checked: ({})
    /* Carpeta a la que ya se mandó lo de `incoming`: no se envía dos veces sin querer. */
    property string sentTo: ""
    /* Lo que espera a que se elija dónde guardarlo. */
    property var pendingTargets: []

    readonly property bool connected: session.status === "ready" || session.status === "reconnecting"
    readonly property bool hasUploads: uploads.model.count > 0
    readonly property bool hasDownloads: downloads.model.count > 0

    readonly property var statusText: ({
        ready: "Conexión SFTP activa",
        connecting: "Abriendo conexión SFTP…",
        reconnecting: "Conexión interrumpida, reconectando…",
        error: "No se pudo conectar",
        closed: "Conexión cerrada",
        idle: ""
    })

    title: (incoming ? "Enviar por SFTP · " : "SFTP · ") + (server.name || "")
    size: "2xl"
    tall: true

    onAboutToShow: {
        session.serverId = server.id || ""
        session.start()
    }
    onClosed: {
        uploads.reset()
        downloads.reset()
        session.stop()
        creatingFolder = false
        folderError = ""
        selected = null
        checked = ({})
        sentTo = ""
        pendingTargets = []
    }

    /* ── Sesión y colas ────────────────────────────────────────────── */
    property SftpSession session: SftpSession {
        onHostKeyRejected: mismatch => root.hostKeyRejected(mismatch)
        onSessionRevoked: payload => root.sessionRevoked(payload)
        onCwdChanged: {
            /* Al cambiar de carpeta la selección ya no está en la lista, salvo
               que la haya puesto la vista previa al bajar un nivel. */
            const kept = root.selected
            if (kept && (kept.path.slice(0, kept.path.lastIndexOf("/")) || "/") !== cwd) root.selected = null
            root.checked = ({})
        }
    }
    property SftpUploads uploads: SftpUploads { session: root.session }
    property SftpDownloads downloads: SftpDownloads { session: root.session }

    function isNavigable(entry) { return entry.type === "dir" || entry.linkType === "dir" }

    /* ── Subidas ───────────────────────────────────────────────────── */
    function handleFiles(files) {
        uploads.enqueue(files, failure => {
            if (failure) Toasts.error("No se pudo preparar la subida", failure)
        })
    }

    function sendIncoming() {
        if (!incoming) return
        sentTo = session.cwd
        handleFiles(incoming.files)
    }

    function handleCreateFolder(name) {
        folderError = ""
        session.createFolder(name, failure => {
            if (failure) root.folderError = failure || "No se pudo crear la carpeta"
            else root.creatingFolder = false
        })
    }

    /* Desde la vista previa: entrar en la carpeta elegida y dejar como nueva
       selección la subcarpeta pulsada. */
    function drill(parentPath, child) {
        session.navigate(parentPath, () => root.selected = child)
    }

    /* ── Descargas ─────────────────────────────────────────────────── */
    /* Nombre que viene de otro sistema, seguro para el disco local. */
    function safeFileName(name) {
        const clean = name.replace(/[/\\:*?"<>|\x00-\x1f\x7f]/g, "_").replace(/[. ]+$/, "")
        if (clean === "") return "descarga"
        return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(clean) ? "_" + clean : clean
    }
    /* Las carpetas llegan como .zip. */
    function fileNameOf(target) { return safeFileName(target.folder ? target.name + ".zip" : target.name) }

    /**
     * Uno: «Guardar como» con su nombre. Varios: una carpeta de destino, sin
     * pisar lo que ya haya en ella. El diálogo se abre antes de descargar nada.
     */
    function startDownloads(targets) {
        if (targets.length === 0 || saveDialog.visible || folderDialog.visible) return
        pendingTargets = targets
        if (targets.length === 1) {
            const name = fileNameOf(targets[0])
            const match = /\.(\w+)$/.exec(name)
            const folder = Transfers.downloadsDir()
            saveDialog.nameFilters = match ? [match[1].toUpperCase() + " (*." + match[1] + ")"] : []
            saveDialog.currentFolder = Transfers.urlFromLocalPath(folder)
            saveDialog.selectedFile = Transfers.urlFromLocalPath(Transfers.joinPath(folder, name))
            saveDialog.open()
        } else {
            folderDialog.currentFolder = Transfers.urlFromLocalPath(Transfers.downloadsDir())
            folderDialog.open()
        }
    }

    function queueDownloads(jobs) {
        pendingTargets = []
        if (jobs.length === 0) return
        downloads.enqueue(jobs)
        checked = ({})
    }

    function downloadEntries(entries) {
        startDownloads(entries.map(entry => ({
            path: entry.path,
            name: entry.name,
            folder: isNavigable(entry),
            size: isNavigable(entry) ? null : entry.size
        })))
    }

    function downloadCurrent() {
        const cwd = session.cwd
        startDownloads([{ path: cwd, name: cwd.slice(cwd.lastIndexOf("/") + 1), folder: true, size: null }])
    }

    FileDialog {
        id: saveDialog
        fileMode: FileDialog.SaveFile
        onAccepted: {
            const target = root.pendingTargets[0]
            const dest = Transfers.localPathFromUrl(selectedFile)
            if (!target || dest === "") {
                root.pendingTargets = []
                if (target) Toasts.error("No se pudo preparar la descarga", "El destino elegido no es una carpeta local")
                return
            }
            root.queueDownloads([Object.assign({}, target, { name: root.fileNameOf(target), dest: dest })])
        }
        onRejected: root.pendingTargets = []
    }
    FolderDialog {
        id: folderDialog
        title: "Elegir carpeta de destino"
        onAccepted: {
            const dir = Transfers.localPathFromUrl(selectedFolder)
            if (dir === "") {
                root.pendingTargets = []
                Toasts.error("No se pudo preparar la descarga", "El destino elegido no es una carpeta local")
                return
            }
            const taken = [], jobs = []
            for (const target of root.pendingTargets) {
                const name = root.fileNameOf(target)
                const dest = Transfers.uniquePath(Transfers.joinPath(dir, name), taken)
                taken.push(dest)
                jobs.push(Object.assign({}, target, { name: name, dest: dest }))
            }
            root.queueDownloads(jobs)
        }
        onRejected: root.pendingTargets = []
    }

    /* ── Cuerpo ────────────────────────────────────────────────────── */
    Item {
        id: body

        /* Alto visible del cuerpo: el del modal sin la cabecera ni el relleno. */
        readonly property real viewport: Math.max(240, root.height - 64 - root.bodyPadding * 2)
        /* wide: tres columnas · medium: lista y vista previa a la izquierda,
           transferencias a la derecha · narrow: todo apilado. */
        readonly property string mode: width >= 980 ? "wide" : width >= 640 ? "medium" : "narrow"

        width: root.bodyWidth
        height: mode === "narrow" ? Math.max(viewport, column.implicitHeight) : viewport

        ColumnLayout {
            id: column
            width: parent.width
            height: parent.height
            spacing: 16

            /* Estado de la conexión */
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Rectangle {
                    id: dot
                    readonly property bool pulsing: root.session.status === "connecting" || root.session.status === "reconnecting"
                    Layout.alignment: Qt.AlignVCenter
                    implicitWidth: 8
                    implicitHeight: 8
                    radius: 4
                    color: root.session.status === "ready" ? Theme.ok
                         : pulsing ? Theme.warn
                         : root.session.status === "error" ? Theme.danger : Theme.ink(0.3)
                    SequentialAnimation on opacity {
                        running: dot.pulsing && root.visible && !Theme.reducedMotion
                        loops: Animation.Infinite
                        alwaysRunToEnd: true
                        NumberAnimation { to: 0.5; duration: 1000; easing.type: Easing.InOutQuad }
                        NumberAnimation { to: 1; duration: 1000; easing.type: Easing.InOutQuad }
                    }
                }
                Label {
                    Layout.maximumWidth: column.width - 18
                    text: root.statusText[root.session.status] || ""
                    tone: 0.75
                }
                Label {
                    Layout.fillWidth: true
                    visible: root.session.info !== null
                    text: root.session.info ? root.session.info.user + "@" + root.session.info.host : ""
                    mono: true
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
            }

            Glass {
                visible: root.session.error !== ""
                Layout.fillWidth: true
                implicitHeight: errorColumn.implicitHeight + 32
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                borderColor: Qt.alpha(Theme.danger, 0.2)
                Column {
                    id: errorColumn
                    x: 16
                    y: 16
                    width: parent.width - 32
                    spacing: 4
                    Label {
                        width: parent.width
                        text: "Error de conexión SFTP"
                        color: Theme.tone("rose").text
                        font.weight: Font.DemiBold
                    }
                    Label {
                        width: parent.width
                        text: root.session.error
                        color: Qt.alpha(Theme.tone("rose").text, 0.8)
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }

            Column {
                visible: root.connected
                Layout.fillWidth: true
                spacing: 8
                SftpPathBar {
                    width: parent.width
                    cwd: root.session.cwd
                    busy: root.session.listing
                    peek: (path, done) => root.session.peek(path, done)
                    onNavigate: path => root.session.navigate(path)
                    onUp: root.session.up()
                    onRefresh: root.session.refresh()
                    onNewFolder: {
                        root.folderError = ""
                        root.creatingFolder = true
                    }
                }
                Label {
                    visible: root.folderError !== ""
                    width: parent.width
                    text: root.folderError
                    color: Theme.tone("rose").text
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }

            /* Lo que llega para enviar (Compartir por SFTP) */
            Glass {
                id: incomingBox
                readonly property bool sending: root.uploads.busy
                visible: root.connected && root.incoming !== null
                Layout.fillWidth: true
                implicitHeight: 64
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                borderColor: Theme.hairlineStrong

                Column {
                    x: 16
                    width: Math.max(0, sendButton.x - 28)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Row {
                        width: parent.width
                        Label {
                            id: incomingLabel
                            width: Math.min(implicitWidth, parent.width)
                            text: root.incoming ? root.incoming.label : ""
                            font.weight: Font.Medium
                        }
                        Label {
                            width: parent.width - incomingLabel.width
                            text: root.incoming ? " · " + root.incoming.summary : ""
                            tone: 0.45
                        }
                    }
                    Label {
                        width: parent.width
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                        text: root.sentTo !== ""
                            ? "Enviado a " + root.sentTo
                              + (incomingBox.sending ? ": no cierres esta ventana hasta que termine." : ".")
                            : "Destino: " + root.session.cwd + ". Navega hasta la carpeta y pulsa Enviar aquí."
                    }
                }
                PrimaryButton {
                    id: sendButton
                    anchors.right: parent.right
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.sentTo !== "" && root.sentTo === root.session.cwd ? "Enviado" : "Enviar aquí"
                    enabled: root.session.sessionId !== "" && !(root.sentTo !== "" && root.sentTo === root.session.cwd)
                    onClicked: root.sendIncoming()
                }
            }

            /* Carpeta actual, vista previa y transferencias */
            Item {
                id: area

                readonly property bool wide: body.mode === "wide"
                readonly property bool narrow: body.mode === "narrow"
                readonly property real sideWidth: wide ? 340 : narrow ? width : 300
                readonly property real leftWidth: narrow ? width : width - sideWidth - 16 - (wide ? 280 + 16 : 0)
                /* Apilado: alturas fijas, el que desplaza es el modal. */
                readonly property real stackedSide: dropZone.implicitHeight
                    + (queueUp.visible ? 12 + 260 : 0) + (queueDown.visible ? 12 + 260 : 0)
                readonly property real stackedHeight: narrow ? 360 + 16 + 260 + 16 + stackedSide : 0
                readonly property real listHeight: wide ? height : narrow ? 360 : Math.max(120, (height - 16) * 0.6)
                readonly property real previewHeight: wide ? height : narrow ? 260 : Math.max(0, height - 16 - listHeight)

                visible: root.connected
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.minimumHeight: stackedHeight
                Layout.preferredHeight: stackedHeight

                SftpFileList {
                    width: area.leftWidth
                    height: area.listHeight
                    entries: root.session.entries
                    loading: root.session.listing
                    error: root.session.listError
                    creatingFolder: root.creatingFolder
                    selected: root.selected ? root.selected.path : ""
                    checked: root.checked
                    canDownloadCurrent: root.session.cwd !== "" && root.session.cwd !== "/"
                    onSelect: entry => root.selected = entry
                    onCheckedEdited: next => root.checked = next
                    onDownload: entries => root.downloadEntries(entries)
                    onDownloadCurrent: root.downloadCurrent()
                    onNavigate: path => root.session.navigate(path)
                    onCreateFolder: name => root.handleCreateFolder(name)
                    onCancelCreateFolder: root.creatingFolder = false
                }

                SftpPreview {
                    x: area.wide ? area.leftWidth + 16 : 0
                    y: area.wide ? 0 : area.listHeight + 16
                    width: area.wide ? 280 : area.leftWidth
                    height: area.previewHeight
                    entry: root.selected
                    peek: (path, done) => root.session.peek(path, done)
                    onOpenFolder: path => root.session.navigate(path)
                    onDownload: entry => root.downloadEntries([entry])
                    onDrill: (parentPath, child) => root.drill(parentPath, child)
                }

                Item {
                    id: side
                    x: area.narrow ? 0 : area.width - area.sideWidth
                    y: area.narrow ? area.listHeight + 16 + area.previewHeight + 16 : 0
                    width: area.sideWidth
                    height: area.narrow ? area.stackedSide : area.height

                    /* Alto de cada cola: se reparten lo que deja la zona de soltar. */
                    readonly property int queues: (queueUp.visible ? 1 : 0) + (queueDown.visible ? 1 : 0)
                    readonly property real queueHeight: area.narrow ? 260
                        : Math.max(0, (height - dropZone.height - 12 * queues) / Math.max(1, queues))

                    SftpDropZone {
                        id: dropZone
                        width: parent.width
                        height: implicitHeight
                        destDir: root.session.cwd
                        disabled: root.session.sessionId === ""
                        onFiles: list => root.handleFiles(list)
                    }
                    /* Sin subidas, las descargas se quedan con todo el alto. */
                    SftpUploadQueue {
                        id: queueUp
                        visible: root.hasUploads || !root.hasDownloads
                        y: dropZone.height + 12
                        width: parent.width
                        height: side.queueHeight
                        uploads: root.uploads
                    }
                    SftpDownloadQueue {
                        id: queueDown
                        visible: root.hasDownloads
                        y: dropZone.height + 12 + (queueUp.visible ? side.queueHeight + 12 : 0)
                        width: parent.width
                        height: side.queueHeight
                        downloads: root.downloads
                    }
                }
            }

            /* Sin conexión, el estado y el error quedan arriba. */
            Item {
                visible: !root.connected
                Layout.fillWidth: true
                Layout.fillHeight: true
            }
        }
    }
}
