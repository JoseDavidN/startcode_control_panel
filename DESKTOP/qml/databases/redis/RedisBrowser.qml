import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import QtQuick.Templates as T
import StartCode

/* Gestión de una conexión Redis. Arriba, claves de la base elegida (30 %) y el
   valor de la seleccionada (70 %); abajo, a todo el ancho, la consola. Todo va
   por la sesión de la vista, igual que el editor SQL. En ventanas estrechas
   los tres paneles se apilan y la vista se desplaza.

       RedisBrowser { conn: …; sessionId: …; onSessionClosed: … } */
Item {
    id: root

    /* `DatabaseConnection` tal como la devuelve el backend. */
    property var conn: null
    /* Sesión de la vista; "" mientras conecta o si se cerró. */
    property string sessionId: ""

    /* El backend dice que la sesión ya no existe: la cabecera ofrece reconectar. */
    signal sessionClosed()

    readonly property string connId: conn && conn.id ? String(conn.id) : ""
    readonly property string connName: conn && conn.name ? String(conn.name) : ""

    property int db: 0
    property string pattern: "*"
    /* Tipo por el que se filtra; "" = todos. */
    property string type: ""
    /* Clave abierta; "" = ninguna. */
    property string selected: ""

    /* Resumen del servidor (`RedisOverview`). */
    property var info: null

    /* SCAN paginado: las claves viven en `keyModel`. */
    property bool scanLoading: false
    property bool scanFetching: false
    property bool scanMore: false
    property string scanError: ""
    /* Cursor de la página siguiente; "0" = no hay más. */
    property string nextCursor: "0"
    property int pages: 0
    /* Cada búsqueda nueva invalida las respuestas que sigan en camino. */
    property int scanGen: 0
    property bool refetchQueued: false
    /* SCAN puede repetir una clave entre páginas. */
    property var seen: ({})

    readonly property bool hasNext: nextCursor !== "0"
    readonly property string scanKey: connId + "\u0000" + sessionId + "\u0000" + db + "\u0000" + pattern + "\u0000" + type
    readonly property string overviewKey: connId + "\u0000" + sessionId

    readonly property int dbCount: info && info.databases ? info.databases : 16
    readonly property var keyspace: {
        const map = {}
        const list = info && info.keyspace ? Array.from(info.keyspace) : []
        list.forEach(k => { map[k.db] = k })
        return map
    }
    readonly property var dbOptions: {
        const out = []
        for (let i = 0; i < dbCount; i++)
            out.push({ value: i, label: "db" + i, hint: keyspace[i] ? util.num(keyspace[i].keys) + " claves" : "vacía" })
        return out
    }
    readonly property var typeOptions: [{ value: "", label: "Todos los tipos" }]
        .concat(util.keyTypes.map(t => ({ value: t, label: util.typeLabels[t] })))
    readonly property int inDb: keyspace[db] ? keyspace[db].keys : 0

    /* Por debajo de este ancho la lista, el valor y la consola se apilan. */
    readonly property bool narrow: width < 820
    readonly property int gap: 20

    /* ── Datos ─────────────────────────────────────────────────────── */
    function base() { return "/databases/" + encodeURIComponent(connId) + "/redis" }

    function initialDb() {
        const n = conn ? Number(conn.database === null || conn.database === undefined ? 0 : conn.database) : 0
        return Number.isInteger(n) && n >= 0 && n <= 15 ? n : 0
    }

    function fail(error) {
        if (util.isSessionClosed(error)) root.sessionClosed()
    }

    function loadOverview() {
        if (connId === "" || sessionId === "") return
        const key = overviewKey
        Api.request("GET", base() + "/overview?session=" + encodeURIComponent(sessionId), null, (ok, data, error) => {
            if (!root || key !== root.overviewKey) return
            if (ok && data) root.info = data
            else root.fail(error)
        })
    }

    function requestScan(cursor, callback) {
        const body = { sessionId: sessionId, db: db, pattern: pattern, cursor: cursor }
        if (type !== "") body.type = type
        Api.request("POST", base() + "/scan", body, callback)
    }

    function appendKeys(list) {
        const items = Array.from(list || [])
        for (let i = 0; i < items.length; i++) {
            const k = items[i]
            const id = "=" + k.key
            if (seen[id]) continue
            seen[id] = true
            keyModel.append({ keyName: String(k.key), keyType: String(k.type), keyTtl: Number(k.ttl) })
        }
    }

    /* Búsqueda nueva (otra base, patrón, tipo o sesión): se empieza de cero. */
    function resetScan() {
        scanGen += 1
        keyModel.clear()
        seen = ({})
        nextCursor = "0"
        pages = 0
        scanError = ""
        scanMore = false
        refetchQueued = false
        scanLoading = false
        scanFetching = false
        if (connId === "" || sessionId === "") return

        const g = scanGen
        scanLoading = true
        scanFetching = true
        requestScan("0", (ok, data, error) => {
            if (!root || g !== root.scanGen) return
            root.scanLoading = false
            root.scanFetching = false
            if (ok && data) {
                root.appendKeys(data.keys)
                root.nextCursor = String(data.cursor)
                root.pages = 1
            } else {
                root.scanError = util.messageOf(error)
                root.fail(error)
            }
            if (root.refetchQueued) root.refetchScan()
        })
    }

    /* «Cargar más»: la página siguiente del mismo SCAN. */
    function loadMore() {
        if (!hasNext || scanFetching || connId === "" || sessionId === "") return
        const g = scanGen
        scanMore = true
        scanFetching = true
        requestScan(nextCursor, (ok, data, error) => {
            if (!root || g !== root.scanGen) return
            root.scanMore = false
            root.scanFetching = false
            if (ok && data) {
                root.scanError = ""
                root.appendKeys(data.keys)
                root.nextCursor = String(data.cursor)
                root.pages += 1
            } else {
                root.scanError = util.messageOf(error)
                root.fail(error)
            }
            if (root.refetchQueued) root.refetchScan()
        })
    }

    /* Vuelve a pedir las páginas ya cargadas, desde el principio, y cambia la
       lista de una vez al terminar (sin perder la posición). */
    function refetchScan() {
        if (connId === "" || sessionId === "") return
        if (scanFetching) { refetchQueued = true; return }
        refetchQueued = false
        const g = scanGen
        const wanted = Math.max(1, pages)
        const found = []
        let fetched = 0
        scanFetching = true

        const finish = (cursor, error) => {
            root.scanFetching = false
            if (error) {
                root.scanError = util.messageOf(error)
                root.fail(error)
            } else {
                const y = keyList.contentY
                keyModel.clear()
                root.seen = ({})
                root.appendKeys(found)
                root.nextCursor = cursor
                root.pages = fetched
                root.scanError = ""
                /* Filas de alto fijo: el tope se calcula sin esperar a que la lista se recoloque. */
                keyList.contentY = Math.max(-keyList.topMargin, Math.min(y, keyModel.count * 32 + 56 - keyList.height))
            }
            if (root.refetchQueued) root.refetchScan()
        }
        const step = cursor => {
            root.requestScan(cursor, (ok, data, error) => {
                if (!root || g !== root.scanGen) return
                if (!ok || !data) { finish("0", error || { message: "" }); return }
                fetched += 1
                Array.from(data.keys || []).forEach(k => found.push(k))
                const next = String(data.cursor)
                if (next !== "0" && fetched < wanted) step(next)
                else finish(next, null)
            })
        }
        step("0")
    }

    /* Un cambio puede tocar la lista, el valor abierto y el recuento de la base. */
    function invalidate(withValue) {
        loadOverview()
        refetchScan()
        if (withValue && selected !== "") valuePanel.refresh()
    }

    function changeDb(next) {
        db = next
        selected = ""
    }

    onConnIdChanged: {
        db = initialDb()
        selected = ""
        info = null
        searchField.text = ""
        pattern = "*"
        type = ""
    }
    onScanKeyChanged: Qt.callLater(root.resetScan)
    onOverviewKeyChanged: Qt.callLater(root.loadOverview)
    Component.onCompleted: {
        db = initialDb()
        Qt.callLater(root.resetScan)
        Qt.callLater(root.loadOverview)
    }

    RedisUtil { id: util }
    ListModel { id: keyModel }

    /* Al escribir en el buscador se espera a que pare para no lanzar un SCAN por tecla. */
    Timer {
        id: searchDebounce
        interval: 350
        onTriggered: root.pattern = util.toScanPattern(searchField.text)
    }

    ScrollArea {
        id: scroll
        anchors.fill: parent
        contentHeight: root.narrow ? 340 + 440 + 340 + root.gap * 2 : Math.max(height, 520)

        Item {
            id: board
            width: parent.width
            height: scroll.contentHeight

            readonly property real topHeight: root.narrow ? 340 : Math.floor((height - root.gap) * 3 / 5)
            readonly property real keysWidth: root.narrow ? width : Math.floor((width - root.gap) * 3 / 10)

            /* ── Claves ── */
            Glass {
                id: keysCard
                width: board.keysWidth
                height: board.topHeight
                elevation: "raised"

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0

                    Item {
                        Layout.fillWidth: true
                        implicitHeight: 44

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 16
                            anchors.rightMargin: 12
                            spacing: 4

                            Label {
                                Layout.fillWidth: true
                                text: "CLAVES"
                                tone: 0.4
                                font.pixelSize: Theme.textXs
                                font.weight: Font.DemiBold
                                font.letterSpacing: 0.6
                            }
                            Item {
                                implicitWidth: 28; implicitHeight: 28
                                IconButton {
                                    anchors.fill: parent
                                    visible: !root.scanFetching
                                    size: 28; iconSize: 14; plain: true
                                    iconName: "refresh"
                                    hint: "Volver a buscar"
                                    onClicked: { root.refetchScan(); root.loadOverview() }
                                }
                                Spinner { anchors.centerIn: parent; visible: root.scanFetching; size: 14; color: Theme.ink(0.6) }
                            }
                            RedisSmallButton {
                                text: "Nueva"
                                iconName: "plus"
                                enabled: root.sessionId !== ""
                                onClicked: newKeyModal.open()
                            }
                        }
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                    }

                    /* Base, tipo y buscador. */
                    Item {
                        Layout.fillWidth: true
                        implicitHeight: filters.implicitHeight + 24

                        ColumnLayout {
                            id: filters
                            x: 12; y: 12
                            width: parent.width - 24
                            spacing: 8

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                Glass {
                                    variant: "input"
                                    radius: Theme.radiusLg
                                    implicitWidth: 104
                                    implicitHeight: 32
                                    Select {
                                        anchors.fill: parent
                                        anchors.leftMargin: 10
                                        anchors.rightMargin: 8
                                        Accessible.name: "Base de Redis"
                                        value: root.db
                                        options: root.dbOptions
                                        onPicked: value => root.changeDb(value)
                                    }
                                }
                                Glass {
                                    Layout.fillWidth: true
                                    variant: "input"
                                    radius: Theme.radiusLg
                                    implicitHeight: 32
                                    Select {
                                        anchors.fill: parent
                                        anchors.leftMargin: 10
                                        anchors.rightMargin: 8
                                        Accessible.name: "Tipo de clave"
                                        value: root.type
                                        options: root.typeOptions
                                        onPicked: value => { root.type = value || ""; root.selected = "" }
                                    }
                                }
                            }
                            RedisField {
                                id: searchField
                                Layout.fillWidth: true
                                iconName: "search"
                                placeholder: "Buscar o patrón (user:*)"
                                clearable: true
                                clearHint: "Limpiar la búsqueda"
                                maximumLength: 1000
                                Accessible.name: "Buscar claves"
                                onTextChanged: searchDebounce.restart()
                                HoverTip { text: "Sin * ni ? busca las claves que contienen el texto; con ellos, el patrón tal cual (user:*)" }
                            }
                        }
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                    }

                    ListView {
                        id: keyList
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        topMargin: 4
                        bottomMargin: 4
                        clip: true
                        boundsBehavior: Flickable.StopAtBounds
                        model: keyModel
                        T.ScrollBar.vertical: SftpScrollBar { flick: keyList }

                        delegate: Rectangle {
                            id: keyRow
                            required property string keyName
                            required property string keyType
                            required property real keyTtl
                            readonly property bool isSelected: root.selected === keyName

                            width: keyList.width
                            height: 32
                            color: isSelected ? Theme.tintActive : keyArea.containsMouse ? Theme.tintHover : "transparent"
                            activeFocusOnTab: true
                            Accessible.role: Accessible.ListItem
                            Accessible.name: keyName
                            Accessible.selected: isSelected
                            Keys.onReturnPressed: root.selected = keyName
                            Keys.onEnterPressed: root.selected = keyName
                            Keys.onSpacePressed: root.selected = keyName

                            MouseArea {
                                id: keyArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.selected = keyRow.keyName
                            }
                            Rectangle {
                                anchors.fill: parent
                                visible: keyRow.activeFocus
                                color: "transparent"
                                border.width: 1
                                border.color: Theme.focusRing
                            }
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                spacing: 8

                                RedisTypeBadge { type: keyRow.keyType }
                                Label {
                                    Layout.fillWidth: true
                                    textFormat: Text.PlainText
                                    text: keyRow.keyName
                                    mono: true
                                    tone: keyRow.isSelected || keyArea.containsMouse ? 1 : 0.75
                                    font.pixelSize: Theme.textXs
                                }
                                Label {
                                    visible: keyRow.keyTtl >= 0
                                    text: visible ? util.formatTtl(keyRow.keyTtl) : ""
                                    tone: 0.35
                                    font.pixelSize: Theme.textCaption
                                }
                            }
                            HoverTip {
                                delay: 900
                                text: keyRow.keyName + (keyRow.keyTtl >= 0 ? "\nCaduca en " + util.formatTtl(keyRow.keyTtl) : "")
                            }
                        }

                        /* Estados y «Cargar más», al final de la lista. */
                        footer: Column {
                            width: keyList.width

                            Label {
                                visible: root.scanLoading
                                width: parent.width
                                topPadding: 24; bottomPadding: 24
                                horizontalAlignment: Text.AlignHCenter
                                text: "Buscando…"
                                tone: 0.4
                                font.pixelSize: Theme.textXs
                            }
                            Label {
                                visible: root.scanError !== ""
                                width: parent.width
                                topPadding: 24; bottomPadding: 24
                                leftPadding: 16; rightPadding: 16
                                horizontalAlignment: Text.AlignHCenter
                                textFormat: Text.PlainText
                                text: root.scanError
                                color: Theme.danger
                                font.pixelSize: Theme.textXs
                                wrapMode: Text.Wrap
                                elide: Text.ElideNone
                            }
                            Label {
                                visible: !root.scanLoading && root.scanError === "" && keyModel.count === 0
                                         && !root.hasNext && root.sessionId !== ""
                                width: parent.width
                                topPadding: 24; bottomPadding: 24
                                leftPadding: 16; rightPadding: 16
                                horizontalAlignment: Text.AlignHCenter
                                text: root.pattern === "*" && root.type === "" ? "db" + root.db + " no tiene claves" : "Ninguna clave coincide"
                                tone: 0.4
                                font.pixelSize: Theme.textXs
                                wrapMode: Text.Wrap
                                elide: Text.ElideNone
                            }
                            Item {
                                visible: root.hasNext
                                width: parent.width
                                height: 48
                                RedisSmallButton {
                                    x: 8; y: 8
                                    width: parent.width - 16
                                    text: root.scanMore ? "Buscando…" : "Cargar más"
                                    enabled: !root.scanMore
                                    onClicked: root.loadMore()
                                }
                            }
                        }
                    }

                    /* Resumen de la base y del servidor. */
                    Item {
                        Layout.fillWidth: true
                        implicitHeight: stats.implicitHeight + 16

                        Rectangle { width: parent.width; height: 1; color: Theme.line }
                        Flow {
                            id: stats
                            x: 16; y: 8
                            width: parent.width - 32
                            spacing: 6

                            Label {
                                text: util.num(keyModel.count) + (root.hasNext ? "+" : "") + " de " + util.num(root.inDb) + " en db" + root.db
                                tone: 0.4
                                font.pixelSize: 11
                            }
                            Label {
                                visible: !!root.info && root.info.usedMemory !== null && root.info.usedMemory !== undefined
                                text: visible ? "· " + Format.bytes(root.info.usedMemory)
                                                + (root.info.maxMemory ? " / " + Format.bytes(root.info.maxMemory) : "") : ""
                                tone: 0.4
                                font.pixelSize: 11
                                HoverTip { text: "Memoria usada / límite (maxmemory)" }
                            }
                            Label {
                                visible: !!root.info && root.info.connectedClients !== null && root.info.connectedClients !== undefined
                                text: visible ? "· " + root.info.connectedClients + " " + (root.info.connectedClients === 1 ? "cliente" : "clientes") : ""
                                tone: 0.4
                                font.pixelSize: 11
                            }
                            Label {
                                visible: !!root.info && root.info.role === "slave"
                                text: "· réplica"
                                color: Qt.alpha(Theme.warn, 0.8)
                                font.pixelSize: 11
                            }
                        }
                    }
                }
            }

            /* ── Valor ── */
            Glass {
                id: valueCard
                x: root.narrow ? 0 : board.keysWidth + root.gap
                y: root.narrow ? board.topHeight + root.gap : 0
                width: root.narrow ? board.width : board.width - board.keysWidth - root.gap
                height: root.narrow ? 440 : board.topHeight
                elevation: "raised"

                RedisValuePanel {
                    id: valuePanel
                    anchors.fill: parent
                    visible: root.selected !== ""
                    connectionId: root.connId
                    sessionId: root.sessionId
                    db: root.db
                    keyName: root.selected
                    onGone: renamedTo => root.selected = renamedTo
                    onChanged: root.invalidate(false)
                }

                Item {
                    id: emptyBox
                    visible: root.selected === ""
                    anchors.fill: parent
                    anchors.margins: 16

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
                                width: emptyBox.width - 1
                                height: emptyBox.height - 1
                                radius: Theme.radiusXl
                            }
                        }
                    }
                    Column {
                        anchors.centerIn: parent
                        width: Math.min(parent.width - 48, 340)
                        spacing: 8

                        Icon {
                            anchors.horizontalCenter: parent.horizontalCenter
                            name: "key"
                            size: 36
                            color: Theme.ink(0.2)
                        }
                        Label {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            text: "Elige una clave para ver su valor"
                            tone: 0.6
                            font.weight: Font.Medium
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Label {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            text: "Texto, hash, lista, conjunto, conjunto ordenado y stream se editan aquí; los demás tipos, desde la consola."
                            tone: 0.35
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                }
            }

            /* ── Consola ── */
            Glass {
                id: consoleCard
                y: root.narrow ? valueCard.y + valueCard.height + root.gap : board.topHeight + root.gap
                width: board.width
                height: root.narrow ? 340 : board.height - board.topHeight - root.gap
                elevation: "raised"

                RedisConsole {
                    id: redisConsole
                    anchors.fill: parent
                    connectionId: root.connId
                    connectionName: root.connName
                    sessionId: root.sessionId
                    db: root.db
                    onSessionClosed: root.sessionClosed()
                    onAudit: auditModal.open()
                    onChanged: root.invalidate(true)
                }
            }
        }
    }

    RedisNewKeyModal {
        id: newKeyModal
        connectionId: root.connId
        sessionId: root.sessionId
        db: root.db
        onCreated: key => {
            /* El panel de valor lee la clave nueva al seleccionarla. */
            root.selected = key
            root.invalidate(false)
        }
    }
    /* Auditoría de la conexión (componente común de la vista de bases). */
    QueryAuditModal {
        id: auditModal
        connectionId: root.connId
    }
}
