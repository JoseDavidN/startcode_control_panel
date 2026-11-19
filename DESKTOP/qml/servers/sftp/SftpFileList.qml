import QtQuick
import QtQuick.Templates as T
import StartCode

/* La carpeta actual del servidor: resumen y filtro de ocultos, cabecera de
   columnas y las filas. Un clic elige (vista previa), doble clic entra en una
   carpeta y el botón derecho abre el menú. Las casillas marcan lo que se
   descarga junto. Una sola plantilla de columnas para cabecera y filas. */
Glass {
    id: root

    property var entries: []
    property bool loading: false
    property string error: ""
    property bool creatingFolder: false
    /* Ruta de la fila elegida; vacío si no hay. */
    property string selected: ""
    /* Casillas marcadas: ruta → true. */
    property var checked: ({})
    /* Se puede descargar la carpeta en la que se está (no en la raíz). */
    property bool canDownloadCurrent: false

    signal select(var entry)
    signal checkedEdited(var checked)
    signal download(var entries)
    signal downloadCurrent()
    signal navigate(string path)
    signal createFolder(string name)
    signal cancelCreateFolder()

    property bool showHidden: false

    readonly property var shown: showHidden ? entries : entries.filter(e => !e.name.startsWith("."))
    readonly property int hiddenCount: entries.length - shown.length
    readonly property int folders: shown.filter(isNavigable).length
    /* Lo que se descarga: lo marcado que esté a la vista o, si no hay, la fila elegida. */
    readonly property var marked: shown.filter(e => checked[e.path] === true)
    readonly property var targets: {
        if (marked.length > 0) return marked
        const previewed = shown.find(e => e.path === selected)
        return previewed ? [previewed] : []
    }
    readonly property bool allMarked: shown.length > 0 && marked.length === shown.length

    /* Columnas: con poco ancho se van la fecha y luego los permisos. */
    readonly property bool showDate: width >= 500
    readonly property bool showPerms: width >= 400
    readonly property real nameWidth: Math.max(60, width - 24 - 18 - 12 - 16 - 12 - (12 + 80)
                                                 - (showPerms ? 12 + 96 : 0) - (showDate ? 12 + 104 : 0))
    readonly property real sizeX: 12 + 18 + 12 + 16 + 12 + nameWidth + 12
    readonly property real permsX: sizeX + 80 + 12
    readonly property real dateX: permsX + (showPerms ? 96 + 12 : 0)

    variant: "soft"
    radius: Theme.radiusXl

    function isNavigable(entry) { return entry.type === "dir" || entry.linkType === "dir" }

    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
        return bytes + " B"
    }

    function toggle(path) {
        const next = Object.assign({}, checked)
        if (next[path]) delete next[path]
        else next[path] = true
        checkedEdited(next)
    }

    function toggleAll() {
        const next = {}
        if (!allMarked) shown.forEach(e => next[e.path] = true)
        checkedEdited(next)
    }

    function openMenu(item, x, y, entry) {
        /* Sobre una fila marcada actúa sobre todas las marcadas, como en un explorador. */
        const list = checked[entry.path] === true ? marked : [entry]
        /* Con icono solo si el juego común ya trae los dos. */
        const icons = probe.paths.folder !== undefined && probe.paths.download !== undefined
        const items = []
        if (isNavigable(entry))
            items.push({ label: "Abrir", icon: icons ? "folder" : "", action: () => root.navigate(entry.path) })
        items.push({
            label: list.length > 1 ? "Descargar " + list.length + " elementos" : "Descargar",
            icon: icons ? "download" : "",
            action: () => root.download(list)
        })
        menu.openAt(item, x, y, items)
    }

    function confirmFolder() {
        const name = folderInput.text.trim()
        if (name === "") return cancelFolder()
        createFolder(name)
        folderInput.text = ""
    }

    function cancelFolder() {
        folderInput.text = ""
        cancelCreateFolder()
    }

    onCreatingFolderChanged: if (creatingFolder) folderInput.forceActiveFocus()

    Icon { id: probe; visible: false }
    FloatMenu { id: menu }

    /* Casilla sin etiqueta, con el aspecto de `CheckBox`. Marcada o no lo decide quien la usa. */
    component Tick: Item {
        id: tick
        property bool ticked: false
        property string label: ""
        signal toggled()
        width: 18
        height: 18
        opacity: enabled ? 1 : 0.4
        Accessible.role: Accessible.CheckBox
        Accessible.name: label
        Accessible.checked: ticked

        Rectangle {
            anchors.centerIn: parent
            width: 16; height: 16
            radius: 5
            visible: !tick.ticked
            color: Theme.chkBg
            border.width: 1
            border.color: tickArea.containsMouse ? Theme.hairlineStrong : Theme.chkBorder
        }
        BrandFill {
            anchors.centerIn: parent
            width: 16; height: 16
            radius: 5
            visible: tick.ticked
        }
        Icon {
            anchors.centerIn: parent
            visible: tick.ticked
            name: "check"
            size: 12
            strokeWidth: 2.5
            color: Theme.onBrand
        }
        /* Se queda con el clic y el doble clic: marcar no elige ni abre la fila. */
        MouseArea {
            id: tickArea
            anchors.fill: parent
            anchors.margins: -4
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: tick.toggled()
            onDoubleClicked: tick.toggled()
        }
    }

    component ColumnTitle: Label {
        tone: 0.4
        font.pixelSize: Theme.textCaption
        font.weight: Font.DemiBold
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 0.5
    }

    /* ── Resumen y filtro, fuera de la rejilla de columnas ─────────── */
    Item {
        id: summary
        width: parent.width
        height: 40

        Label {
            x: 12
            width: Math.max(0, actions.x - 24)
            anchors.verticalCenter: parent.verticalCenter
            tone: 0.5
            font.pixelSize: Theme.textXs
            text: {
                if (root.loading) return "Leyendo…"
                const files = root.shown.length - root.folders
                return root.folders + (root.folders === 1 ? " carpeta" : " carpetas") + " · "
                     + files + (files === 1 ? " archivo" : " archivos")
            }
        }
        Row {
            id: actions
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12

            SftpChip {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.targets.length > 0 || root.canDownloadCurrent
                iconKind: "download"
                text: root.targets.length === 0 ? "Descargar esta carpeta"
                    : root.targets.length > 1 ? "Descargar (" + root.targets.length + ")" : "Descargar"
                hint: root.targets.length === 1 ? root.targets[0].path : ""
                onClicked: root.targets.length > 0 ? root.download(root.targets) : root.downloadCurrent()
            }
            SftpChip {
                anchors.verticalCenter: parent.verticalCenter
                implicitHeight: 24
                pill: true
                plain: true
                active: root.showHidden
                tint: Theme.ink(0.5)
                text: root.showHidden ? "Ocultar ocultos"
                    : "Mostrar ocultos" + (root.hiddenCount > 0 ? " (" + root.hiddenCount + ")" : "")
                hint: root.hiddenCount > 0 ? root.hiddenCount + " elementos ocultos" : "Mostrar ocultos"
                onClicked: root.showHidden = !root.showHidden
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Cabecera de columnas ──────────────────────────────────────── */
    Item {
        id: columns
        y: summary.height
        width: parent.width
        height: 32

        Tick {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            label: "Marcar todo"
            ticked: root.allMarked
            enabled: root.shown.length > 0
            onToggled: root.toggleAll()
        }
        ColumnTitle { x: 12 + 18 + 12 + 16 + 12; width: root.nameWidth; anchors.verticalCenter: parent.verticalCenter; text: "Nombre" }
        ColumnTitle { x: root.sizeX; width: 80; anchors.verticalCenter: parent.verticalCenter; horizontalAlignment: Text.AlignRight; text: "Tamaño" }
        ColumnTitle { visible: root.showPerms; x: root.permsX; width: 96; anchors.verticalCenter: parent.verticalCenter; text: "Permisos" }
        ColumnTitle { visible: root.showDate; x: root.dateX; width: 104; anchors.verticalCenter: parent.verticalCenter; text: "Modificado" }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Carpeta nueva ─────────────────────────────────────────────── */
    Rectangle {
        id: folderRow
        y: columns.y + columns.height
        width: parent.width
        height: root.creatingFolder ? 40 : 0
        visible: root.creatingFolder
        color: Theme.tintSunken

        SftpIcon {
            x: 12 + 18 + 12
            anchors.verticalCenter: parent.verticalCenter
            kind: "folder"
            color: Theme.tone("violet").text
        }
        Label {
            x: folderInput.x
            width: folderInput.width
            anchors.verticalCenter: parent.verticalCenter
            visible: folderInput.text.length === 0
            text: "Nombre de la carpeta"
            mono: true
            tone: 0.3
        }
        TextInput {
            id: folderInput
            x: 12 + 18 + 12 + 16 + 12
            width: Math.max(40, parent.width - x - 12 - 28 - 8 - 28 - 8)
            height: parent.height
            clip: true
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: Theme.textSm
            selectByMouse: true
            Accessible.name: "Nombre de la carpeta"
            Keys.onReturnPressed: root.confirmFolder()
            Keys.onEnterPressed: root.confirmFolder()
            /* Solo cancela la carpeta nueva, no cierra el modal. */
            Keys.onEscapePressed: root.cancelFolder()
        }
        Row {
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8
            IconButton {
                size: 28
                iconSize: 14
                iconName: "check"
                hint: "Crear"
                onClicked: root.confirmFolder()
            }
            IconButton {
                size: 28
                iconSize: 14
                iconName: "close"
                hint: "Cancelar"
                onClicked: root.cancelFolder()
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Filas ─────────────────────────────────────────────────────── */
    Item {
        id: rowsBox
        y: folderRow.y + folderRow.height
        width: parent.width
        height: Math.max(0, parent.height - y)
        clip: true

        readonly property string notice: root.error !== "" ? root.error
            : root.loading && root.entries.length === 0 ? "Leyendo el directorio…"
            : root.shown.length === 0 ? (root.hiddenCount > 0 ? "Solo hay elementos ocultos" : "Directorio vacío")
            : ""

        Label {
            visible: rowsBox.notice !== ""
            x: 12
            y: 40
            width: parent.width - 24
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            text: rowsBox.notice
            color: root.error !== "" ? Theme.tone("rose").text : Theme.ink(0.45)
        }

        ListView {
            id: view
            anchors.fill: parent
            visible: rowsBox.notice === ""
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            opacity: root.loading ? 0.5 : 1
            Behavior on opacity { NumberAnimation { duration: Theme.moFast } }
            model: root.shown
            T.ScrollBar.vertical: SftpScrollBar { flick: view }

            delegate: Rectangle {
                id: row
                required property var modelData
                required property int index
                readonly property bool nav: root.isNavigable(modelData)
                readonly property bool isSelected: root.selected === modelData.path

                width: view.width
                height: 36
                color: isSelected ? Theme.tintActive : rowArea.containsMouse ? Theme.tintHover : "transparent"
                Accessible.role: Accessible.Row
                Accessible.name: modelData.name
                Accessible.selected: isSelected

                MouseArea {
                    id: rowArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    onClicked: mouse => {
                        if (mouse.button === Qt.RightButton) root.openMenu(row, mouse.x, mouse.y, row.modelData)
                        else root.select(row.modelData)
                    }
                    onDoubleClicked: mouse => {
                        if (mouse.button === Qt.LeftButton && row.nav) root.navigate(row.modelData.path)
                    }
                }
                HoverTip { text: row.nav ? "Clic: vista previa · Doble clic: abrir" : row.modelData.name }

                Tick {
                    x: 12
                    anchors.verticalCenter: parent.verticalCenter
                    label: "Marcar " + row.modelData.name
                    ticked: root.checked[row.modelData.path] === true
                    onToggled: root.toggle(row.modelData.path)
                }
                SftpIcon {
                    x: 12 + 18 + 12
                    anchors.verticalCenter: parent.verticalCenter
                    entry: row.modelData
                }
                Row {
                    x: 12 + 18 + 12 + 16 + 12
                    width: root.nameWidth
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8
                    Label {
                        width: Math.min(implicitWidth, root.nameWidth - (broken.visible ? broken.width + 8 : 0))
                        text: row.modelData.name
                        tone: row.nav ? 1 : 0.7
                    }
                    Label {
                        id: broken
                        visible: row.modelData.linkType === "broken"
                        anchors.verticalCenter: parent.verticalCenter
                        text: "enlace roto"
                        color: Theme.tone("rose").text
                        font.pixelSize: Theme.textXs
                    }
                }
                Label {
                    x: root.sizeX
                    width: 80
                    anchors.verticalCenter: parent.verticalCenter
                    horizontalAlignment: Text.AlignRight
                    text: row.nav ? "—" : root.formatSize(row.modelData.size)
                    mono: true
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                }
                Label {
                    visible: root.showPerms
                    x: root.permsX
                    width: 96
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.modelData.permissions || ""
                    mono: true
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
                Label {
                    visible: root.showDate
                    x: root.dateX
                    width: 104
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.modelData.mtime ? Format.timeAgo(row.modelData.mtime) : "—"
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
                Rectangle {
                    visible: row.index < view.count - 1
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: 1
                    color: Theme.line
                }
            }
        }
    }
}
