import QtQuick
import StartCode

/* Lista de las bases que ve el usuario en el servidor, para elegir una en el
   formulario de conexión. Se pide al crearse (al entrar en la pestaña) y cada
   vez que cambian los datos de conexión; pulsar una base la selecciona.

       ConnectionDatabasePicker {
           value: database
           credentialsKey: clave            // al cambiar, se vuelve a pedir
           blockedReason: motivo            // "" o null: se puede cargar
           load: done => …                  // done(ok, lista, mensajeDeError)
           onChange: name => database = name
       }
*/
Column {
    id: root

    property string value: ""
    /* Pide las bases con los datos actuales del formulario: `load(done)`,
       y al terminar `done(ok, [{ name, system }], mensaje)`. */
    property var load: null
    property string credentialsKey: ""
    /* Motivo por el que todavía no se puede cargar (faltan host o usuario). */
    property var blockedReason: null

    signal change(string name)

    /* null: aún no hay lista (sin pedir, bloqueada o con error). */
    property var items: null
    property bool loading: false
    property string error: ""
    /* Solo cuenta la última petición: las anteriores se descartan al llegar. */
    property int request: 0
    property bool ready: false

    readonly property string blocked: blockedReason ? String(blockedReason) : ""
    readonly property string selected: value.trim()
    /* Al editar, la base guardada puede no aparecer (sin permiso para listarla): se muestra igual. */
    readonly property var list: {
        const base = items || []
        if (items && selected !== "" && !base.some(item => item.name === selected))
            return [{ name: selected, system: false }].concat(base)
        return base
    }
    readonly property int firstSystem: list.findIndex(item => !!item.system)
    readonly property string message: blocked !== "" ? blocked
                                    : loading && !items ? "Conectando para listar las bases…"
                                    : error !== "" ? ""
                                    : list.length === 0 ? "El servidor no devolvió ninguna base" : ""

    spacing: 12

    function fetchList() {
        if (!root.load) return
        const current = ++root.request
        root.loading = true
        root.error = ""
        root.load((ok, result, failure) => {
            if (current !== root.request) return
            root.loading = false
            if (ok) {
                root.items = result ? Array.from(result) : []
            } else {
                root.items = null
                root.error = failure ? String(failure) : "No se pudieron cargar las bases"
            }
        })
    }

    function refresh() {
        if (!root.ready) return
        if (root.blocked !== "") {
            root.request++
            root.items = null
            root.loading = false
            return
        }
        fetchList()
    }

    /* Varios datos pueden cambiar a la vez: una sola petición por tanda. */
    onCredentialsKeyChanged: Qt.callLater(root.refresh)
    onBlockedChanged: Qt.callLater(root.refresh)
    Component.onCompleted: { root.ready = true; Qt.callLater(root.refresh) }
    /* Si se destruye con una petición en vuelo, su respuesta ya no cuenta. */
    Component.onDestruction: { root.ready = false; root.request++ }

    /* ── Selección actual y recarga ────────────────────────────────── */
    Item {
        width: root.width
        height: 28

        Label {
            id: caption
            anchors.verticalCenter: parent.verticalCenter
            text: "Base de datos seleccionada:"
            tone: 0.5
        }
        Label {
            anchors.left: caption.right
            anchors.leftMargin: 8
            anchors.right: reload.visible ? reload.left : parent.right
            anchors.rightMargin: reload.visible ? 8 : 0
            anchors.verticalCenter: parent.verticalCenter
            text: root.selected !== "" ? root.selected : "ninguna"
            mono: root.selected !== ""
            tone: root.selected !== "" ? 0.9 : 0.35
            font.pixelSize: root.selected !== "" ? 13 : Theme.textSm
            font.italic: root.selected === ""
        }
        IconButton {
            id: reload
            visible: root.blocked === ""
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            plain: true
            size: 28
            iconSize: 14
            iconName: root.loading ? "" : "refresh"
            hint: "Recargar bases"
            enabled: !root.loading
            onClicked: root.fetchList()
        }
        Spinner {
            visible: reload.visible && root.loading
            anchors.centerIn: reload
            size: 14
        }
    }

    /* ── Lista ─────────────────────────────────────────────────────── */
    Glass {
        width: root.width
        height: 224
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        Accessible.role: Accessible.List
        Accessible.name: "Bases de datos"

        ScrollArea {
            anchors.fill: parent
            anchors.margins: 4
            contentHeight: rows.implicitHeight

            Column {
                id: rows
                width: parent.width

                /* Bloqueada, conectando o vacía */
                Item {
                    visible: root.message !== ""
                    width: rows.width
                    height: messageLabel.implicitHeight + 20
                    Label {
                        id: messageLabel
                        x: 12; y: 10
                        width: parent.width - 24
                        text: root.message
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }

                /* Error, con reintento */
                Item {
                    visible: root.blocked === "" && !(root.loading && !root.items) && root.error !== ""
                    width: rows.width
                    height: Math.max(errorLabel.implicitHeight, retry.implicitHeight) + 20
                    Label {
                        id: errorLabel
                        x: 12
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 24 - retry.width - 12
                        text: root.error
                        color: Theme.tone("rose").text
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Label {
                        id: retry
                        anchors.right: parent.right
                        anchors.rightMargin: 12
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Reintentar"
                        tone: retryHover.hovered ? 1 : 0.6
                        font.pixelSize: Theme.textXs
                        font.underline: retryHover.hovered
                        Accessible.role: Accessible.Button
                        Accessible.name: text
                        HoverHandler { id: retryHover; cursorShape: Qt.PointingHandCursor }
                        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.fetchList() }
                    }
                }

                Repeater {
                    model: root.blocked === "" && root.error === "" && !(root.loading && !root.items) ? root.list : []

                    Column {
                        id: entry
                        required property var modelData
                        required property int index
                        readonly property bool chosen: modelData.name === root.selected
                        readonly property bool system: !!modelData.system
                        width: rows.width

                        /* Las del propio motor van al final, bajo su rótulo. */
                        Item {
                            visible: entry.index === root.firstSystem && root.firstSystem > 0
                            width: entry.width
                            height: 26
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
                            width: entry.width
                            height: 32
                            Accessible.role: Accessible.ListItem
                            Accessible.name: entry.modelData.name
                            Accessible.selected: entry.chosen

                            BrandFill {
                                anchors.fill: parent
                                visible: entry.chosen
                                radius: Theme.radiusLg
                                strength: 0.28
                            }
                            Rectangle {
                                anchors.fill: parent
                                radius: Theme.radiusLg
                                color: !entry.chosen && rowHover.hovered ? Theme.tintHover : "transparent"
                                border.width: 1
                                border.color: entry.chosen ? Theme.hairlineStrong : "transparent"
                            }
                            Icon {
                                id: rowIcon
                                x: 12
                                anchors.verticalCenter: parent.verticalCenter
                                name: "database"
                                size: 14
                                color: Theme.tone("violet").text
                            }
                            Label {
                                anchors.left: rowIcon.right
                                anchors.leftMargin: 8
                                anchors.right: rowCheck.visible ? rowCheck.left : parent.right
                                anchors.rightMargin: rowCheck.visible ? 8 : 12
                                anchors.verticalCenter: parent.verticalCenter
                                text: entry.modelData.name
                                mono: true
                                tone: entry.chosen ? 1 : entry.system ? 0.4 : rowHover.hovered ? 1 : 0.75
                                font.pixelSize: 13
                            }
                            Icon {
                                id: rowCheck
                                visible: entry.chosen
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
