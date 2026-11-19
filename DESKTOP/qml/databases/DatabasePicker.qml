import QtQuick
import StartCode

/* Lista de las bases que ve el usuario en el servidor. Se pide al crearse
   (al entrar en la pestaña) y cada vez que cambian los datos de conexión;
   pulsar una base la marca como seleccionada.

       DatabasePicker {
           value: form.database
           credentialsKey: host + "|" + port + "|" + user
           blockedReason: host === "" ? "Indica el host…" : null
           load: done => Api.request("POST", "/databases/schemas", body, done)
           onChange: value => form.database = value
       }

   `load` recibe `done(ok, lista, error)` (la misma firma que el callback de
   `Api.request`); también vale que devuelva una promesa con la lista. */
Item {
    id: root

    property string value: ""
    /* Pide las bases al servidor con los datos actuales del formulario. */
    property var load: null
    /* Cambia cuando cambian los datos de conexión: entonces la lista se vuelve a pedir. */
    property string credentialsKey: ""
    /* Motivo por el que todavía no se puede cargar (faltan host o usuario); vacío o null si se puede. */
    property var blockedReason: null

    signal change(string value)

    /* null: todavía sin lista. */
    property var items: null
    property bool loading: false
    property string errorText: ""
    property int requestSeq: 0
    property bool ready: false

    readonly property bool blocked: blockedReason !== null && blockedReason !== undefined && String(blockedReason) !== ""
    readonly property string selected: value.trim()
    /* Al editar, la base guardada puede no aparecer (sin permiso para listarla): se muestra igual. */
    readonly property var list: items && selected !== "" && !items.some(i => i.name === selected)
                                ? [{ name: selected, system: false }].concat(items)
                                : (items || [])
    readonly property int firstSystem: list.findIndex(v => v.system)

    implicitHeight: column.implicitHeight
    implicitWidth: 320

    function fetchList() {
        const request = ++requestSeq
        loading = true
        errorText = ""
        let settled = false
        const done = (ok, data, error) => {
            if (settled) return
            settled = true
            /* Llegó una respuesta de unos datos que ya cambiaron: se descarta. */
            if (request !== root.requestSeq) return
            if (ok) {
                root.items = data ? Array.from(data) : []
            } else {
                root.items = null
                root.errorText = (error && error.message) || "No se pudieron cargar las bases"
            }
            root.loading = false
        }
        if (typeof load !== "function") { done(false, null, null); return }
        let pending
        try { pending = load(done) } catch (e) { done(false, null, e); return }
        if (pending && typeof pending.then === "function")
            pending.then(data => done(true, data, null), error => done(false, null, error))
    }

    function refresh() {
        if (!ready) return
        if (blocked) { requestSeq++; items = null; loading = false; return }
        fetchList()
    }

    /* Agrupado: si cambian a la vez la clave y el motivo, una sola petición. */
    onCredentialsKeyChanged: Qt.callLater(refresh)
    onBlockedChanged: Qt.callLater(refresh)
    Component.onCompleted: { ready = true; refresh() }

    Column {
        id: column
        width: parent.width
        spacing: 12

        Item {
            width: parent.width
            height: 28

            Row {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - (reloadButton.visible ? reloadButton.width + 8 : 0)
                spacing: 8
                Label {
                    id: caption
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Base de datos seleccionada:"
                    tone: 0.5
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.max(0, parent.width - caption.width - 8)
                    text: root.selected !== "" ? root.selected : "ninguna"
                    tone: root.selected !== "" ? 0.9 : 0.35
                    mono: root.selected !== ""
                    font.pixelSize: root.selected !== "" ? 13 : Theme.textSm
                    font.italic: root.selected === ""
                }
            }

            Item {
                id: reloadButton
                visible: !root.blocked
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: 28; height: 28
                IconButton {
                    anchors.fill: parent
                    visible: !root.loading
                    size: 28
                    iconSize: 14
                    plain: true
                    iconName: "refresh"
                    hint: "Recargar bases"
                    onClicked: root.fetchList()
                }
                Spinner { anchors.centerIn: parent; visible: root.loading; size: 14 }
            }
        }

        Glass {
            width: parent.width
            height: 224
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            Accessible.role: Accessible.List
            Accessible.name: "Bases de datos"

            ScrollArea {
                id: scroll
                anchors.fill: parent
                anchors.margins: 4
                contentHeight: body.implicitHeight

                Column {
                    id: body
                    width: scroll.width

                    /* Estados sin lista */
                    Item {
                        visible: note.text !== ""
                        width: parent.width
                        height: Math.max(note.implicitHeight, retry.visible ? retry.implicitHeight : 0) + 20
                        Label {
                            id: note
                            x: 12; y: 10
                            width: parent.width - 24 - (retry.visible ? retry.width + 12 : 0)
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                            font.pixelSize: Theme.textXs
                            color: !root.blocked && !(root.loading && !root.items) && root.errorText !== ""
                                   ? Theme.tone("rose").text : Theme.ink(0.45)
                            text: root.blocked ? String(root.blockedReason)
                                : root.loading && !root.items ? "Conectando para listar las bases…"
                                : root.errorText !== "" ? root.errorText
                                : root.list.length === 0 ? "El servidor no devolvió ninguna base" : ""
                        }
                        Label {
                            id: retry
                            visible: !root.blocked && !(root.loading && !root.items) && root.errorText !== ""
                            anchors.right: parent.right
                            anchors.rightMargin: 12
                            y: 10
                            text: "Reintentar"
                            font.pixelSize: Theme.textXs
                            font.underline: retryHover.hovered
                            tone: retryHover.hovered ? 1 : 0.6
                            HoverHandler { id: retryHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.fetchList() }
                        }
                    }

                    Repeater {
                        model: note.text === "" ? root.list : []
                        delegate: Column {
                            id: entry
                            required property var modelData
                            required property int index
                            readonly property bool isSelected: modelData.name === root.selected
                            width: body.width

                            Item {
                                visible: entry.index === root.firstSystem && root.firstSystem > 0
                                width: parent.width
                                height: 28
                                Label {
                                    x: 12; y: 8
                                    text: "Sistema"
                                    tone: 0.3
                                    font.pixelSize: Theme.textCaption
                                    font.capitalization: Font.AllUppercase
                                    font.letterSpacing: 0.5
                                }
                            }

                            Item {
                                width: parent.width
                                height: 32
                                Accessible.role: Accessible.ListItem
                                Accessible.name: entry.modelData.name
                                Accessible.selected: entry.isSelected

                                Rectangle {
                                    anchors.fill: parent
                                    radius: Theme.radiusLg
                                    visible: !entry.isSelected
                                    color: rowHover.hovered ? Theme.tintHover : "transparent"
                                }
                                BrandFill { anchors.fill: parent; visible: entry.isSelected; radius: Theme.radiusLg; strength: 0.28 }
                                Rectangle {
                                    anchors.fill: parent
                                    visible: entry.isSelected
                                    radius: Theme.radiusLg
                                    color: "transparent"
                                    border.width: 1
                                    border.color: Theme.hairlineStrong
                                }

                                Icon {
                                    id: baseIcon
                                    x: 12
                                    anchors.verticalCenter: parent.verticalCenter
                                    name: "database"
                                    size: 14
                                    color: Theme.tone("violet").text
                                }
                                Label {
                                    anchors.left: baseIcon.right
                                    anchors.leftMargin: 8
                                    anchors.right: parent.right
                                    anchors.rightMargin: entry.isSelected ? 34 : 12
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: entry.modelData.name
                                    mono: true
                                    font.pixelSize: 13
                                    tone: entry.isSelected ? 1 : entry.modelData.system ? 0.4 : rowHover.hovered ? 1 : 0.75
                                }
                                Icon {
                                    visible: entry.isSelected
                                    anchors.right: parent.right
                                    anchors.rightMargin: 12
                                    anchors.verticalCenter: parent.verticalCenter
                                    name: "check"
                                    size: 14
                                    color: Theme.tone("emerald").text
                                }

                                HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
                                TapHandler {
                                    gesturePolicy: TapHandler.ReleaseWithinBounds
                                    onTapped: root.change(entry.modelData.name)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
