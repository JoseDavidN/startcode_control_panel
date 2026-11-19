import QtQuick
import QtQuick.Templates as T
import StartCode

/* Vista previa de lo elegido. De un archivo, sus datos (que en la lista van
   recortados). De una carpeta, lo que hay dentro sin entrar en ella: pulsar
   una de sus carpetas entra en la elegida y deja esa como la siguiente vista
   previa, así se baja por la ruta viendo siempre un nivel por delante. */
Glass {
    id: root

    /* Entrada elegida en la lista; null si no hay. */
    property var entry: null
    /* Lista una carpeta sin entrar en ella: `peek(ruta, (fallo, { entries }) => …)`. */
    property var peek: null

    /* Entra en la carpeta de la vista previa. */
    signal openFolder(string path)
    signal download(var entry)
    /* Entra en la carpeta de la vista previa y deja elegida una de sus carpetas. */
    signal drill(string parentPath, var child)

    readonly property var folder: entry && isNavigable(entry) ? entry : null
    /* `{ path, entries }` o `{ path, error }` de la última carpeta leída. */
    property var peeked: null
    readonly property var current: folder && peeked && peeked.path === folder.path ? peeked : null
    readonly property var inside: current && current.entries ? current.entries.filter(e => !e.name.startsWith(".")) : []
    readonly property int hidden: current && current.entries ? current.entries.length - inside.length : 0

    variant: "soft"
    radius: Theme.radiusXl

    function isNavigable(item) { return item.type === "dir" || item.linkType === "dir" }

    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
        return bytes + " B"
    }

    onFolderChanged: {
        if (!folder || !peek) return
        const path = folder.path
        peek(path, (failure, result) => {
            /* Si ya se eligió otra, esta respuesta no se enseña (`current` compara la ruta). */
            root.peeked = failure ? { path: path, error: failure || "No se pudo leer la carpeta" }
                                  : { path: path, entries: result.entries }
        })
    }

    /* Un dato del archivo: término a la izquierda, valor a la derecha. */
    component Datum: Row {
        id: datum
        property string term
        property string value
        property bool mono: true
        width: parent.width
        Label {
            width: 88
            text: datum.term
            tone: 0.4
            font.pixelSize: Theme.textXs
        }
        Label {
            width: parent.width - 88
            text: datum.value
            mono: datum.mono
            tone: 0.75
            font.pixelSize: Theme.textXs
            wrapMode: Text.WrapAnywhere
            elide: Text.ElideNone
        }
    }

    Item {
        id: head
        width: parent.width
        height: 40
        Label {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            text: "Vista previa"
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Nada elegido ──────────────────────────────────────────────── */
    Column {
        visible: !root.entry
        anchors.centerIn: parent
        anchors.verticalCenterOffset: head.height / 2
        width: parent.width - 48
        spacing: 8
        SftpIcon {
            anchors.horizontalCenter: parent.horizontalCenter
            kind: "folder"
            size: 28
            color: Theme.ink(0.25)
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            text: "Elige una carpeta para ver qué contiene"
            tone: 0.55
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            text: "Doble clic para entrar en ella"
            tone: 0.35
            font.pixelSize: Theme.textXs
        }
    }

    /* ── Un archivo: sus datos ─────────────────────────────────────── */
    ScrollArea {
        id: fileView
        visible: root.entry !== null && !root.folder
        y: head.height
        width: parent.width
        height: parent.height - y
        contentHeight: fileColumn.implicitHeight + 32

        Column {
            id: fileColumn
            x: 16
            y: 16
            width: fileView.width - 32
            spacing: 16

            Row {
                width: parent.width
                spacing: 10
                SftpIcon { y: 1; entry: root.entry; size: 20 }
                Label {
                    width: parent.width - 30
                    text: root.entry ? root.entry.name : ""
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                }
            }
            Column {
                width: parent.width
                spacing: 8
                Datum { term: "Tamaño"; value: root.entry ? root.formatSize(root.entry.size) : "" }
                Datum { term: "Permisos"; value: root.entry ? root.entry.permissions || "" : "" }
                Datum {
                    term: "Modificado"
                    mono: false
                    value: root.entry && root.entry.mtime
                        ? new Date(root.entry.mtime).toLocaleString(Qt.locale(), Locale.ShortFormat) : "—"
                }
                Datum { term: "Propietario"; value: root.entry ? root.entry.uid + ":" + root.entry.gid : "" }
                Datum { term: "Ruta"; value: root.entry ? root.entry.path : "" }
            }
            SftpChip {
                visible: root.entry !== null && root.entry.linkType !== "broken"
                width: parent.width
                implicitHeight: 36
                fontSize: Theme.textXs
                iconKind: "download"
                text: "Descargar"
                onClicked: root.download(root.entry)
            }
        }
    }

    /* ── Una carpeta: lo que contiene ──────────────────────────────── */
    Item {
        visible: root.folder !== null
        y: head.height
        width: parent.width
        height: parent.height - y

        Item {
            id: folderHead
            width: parent.width
            height: 48
            SftpIcon {
                id: folderGlyph
                x: 12
                anchors.verticalCenter: parent.verticalCenter
                kind: "folder"
                color: Theme.tone("violet").text
            }
            Label {
                x: 36
                width: Math.max(0, folderActions.x - x - 8)
                anchors.verticalCenter: parent.verticalCenter
                text: root.folder ? root.folder.name : ""
                HoverTip { text: root.folder ? root.folder.path : "" }
            }
            Row {
                id: folderActions
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                SftpChip {
                    iconKind: "download"
                    hint: "Descargar como .zip"
                    onClicked: root.download(root.folder)
                }
                SftpChip {
                    fontSize: Theme.textXs
                    text: "Abrir"
                    onClicked: root.openFolder(root.folder.path)
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        Item {
            id: contents
            y: folderHead.height
            width: parent.width
            height: parent.height - y - foot.height
            clip: true

            readonly property string notice: !root.current ? "Leyendo…"
                : root.current.error ? root.current.error
                : root.inside.length === 0
                    ? (root.hidden > 0 ? "Solo hay " + root.hidden + " elementos ocultos" : "Carpeta vacía")
                : ""

            Label {
                visible: contents.notice !== ""
                x: 12
                y: 32
                width: parent.width - 24
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
                text: contents.notice
                font.pixelSize: Theme.textXs
                color: root.current && root.current.error ? Theme.tone("rose").text : Theme.ink(0.45)
            }

            ListView {
                id: list
                anchors.fill: parent
                visible: contents.notice === ""
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                model: root.inside
                T.ScrollBar.vertical: SftpScrollBar { flick: list }

                delegate: Rectangle {
                    id: child
                    required property var modelData
                    readonly property bool nav: root.isNavigable(modelData)
                    width: list.width
                    height: 32
                    color: nav && childHover.hovered ? Theme.tintHover : "transparent"
                    Accessible.role: Accessible.ListItem
                    Accessible.name: modelData.name

                    SftpIcon {
                        x: 12
                        anchors.verticalCenter: parent.verticalCenter
                        entry: child.modelData
                        size: 14
                    }
                    Label {
                        x: 36
                        width: parent.width - x - 12 - (childSize.visible ? childSize.width + 10 : 0)
                        anchors.verticalCenter: parent.verticalCenter
                        text: child.modelData.name
                        tone: child.nav ? 0.85 : 0.55
                        font.pixelSize: Theme.textXs
                    }
                    Label {
                        id: childSize
                        visible: !child.nav
                        anchors.right: parent.right
                        anchors.rightMargin: 12
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.formatSize(child.modelData.size)
                        mono: true
                        tone: 0.35
                        font.pixelSize: 11
                    }
                    HoverHandler { id: childHover; cursorShape: child.nav ? Qt.PointingHandCursor : Qt.ArrowCursor }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        enabled: child.nav
                        onTapped: root.drill(root.folder.path, child.modelData)
                    }
                    HoverTip {
                        text: child.nav && root.folder
                            ? "Entrar en " + root.folder.name + " y ver " + child.modelData.name
                            : child.modelData.name
                    }
                }
            }
        }

        Item {
            id: foot
            anchors.bottom: parent.bottom
            width: parent.width
            height: visible ? 32 : 0
            visible: root.current !== null && root.current.entries !== undefined
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            Label {
                x: 12
                width: parent.width - 24
                anchors.verticalCenter: parent.verticalCenter
                tone: 0.4
                font.pixelSize: 11
                text: !foot.visible ? ""
                    : root.current.entries.length + " elementos"
                      + (root.hidden > 0 ? " · " + root.hidden + " ocultos" : "")
                      + (root.folder && root.folder.mtime ? " · " + Format.timeAgo(root.folder.mtime) : "")
            }
        }
    }
}
