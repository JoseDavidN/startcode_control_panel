import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Lista de conexiones a bases de datos del usuario (`GET /databases`).
   Cabecera, buscador y paginación quedan fijos; solo la rejilla se desplaza.
   Las tarjetas no conectan a nada: la conexión se prueba al crearla o
   editarla y solo se abre al entrar a su vista de consultas. */
Item {
    id: root

    /* 3 columnas × 3 filas: con muchas conexiones se pagina en vez de alargar la rejilla. */
    /* Tarjetas que ya entraron con animación (ver `Entrance`). */
    readonly property var entranceSeen: ({})
    readonly property int pageSize: 9

    property var connections: []
    property bool loading: true
    property bool failed: false
    property string search: ""
    /* "" = sin filtro; "none" en la etiqueta = conexiones sin etiqueta. */
    property string engineFilter: ""
    property string tagFilter: ""
    property int page: 1
    /* Conexión abierta: su vista ocupa el sitio de la lista, sin cambiar de sección. */
    property string openId: ""
    property bool startHandled: false

    /* Por el ancho del contenido, no de la pantalla: en mosaico la ventana
       puede ocupar media pantalla. */
    readonly property int columns: Math.max(1, Math.min(3, Math.floor((width + 20) / 380)))
    readonly property bool compact: width < 720
    readonly property int activeFilters: (engineFilter !== "" ? 1 : 0) + (tagFilter !== "" ? 1 : 0)

    readonly property var engineOrder: ["mysql", "mariadb", "postgresql", "redis"]
    readonly property var engineLabels: ({ mysql: "MySQL", mariadb: "MariaDB", postgresql: "PostgreSQL", redis: "Redis" })
    readonly property var tagOrder: ["production", "staging", "testing", "development", "backup"]
    readonly property var tags: ({
        production: { label: "Producción", tone: "fuchsia" },
        staging: { label: "Preproducción", tone: "orange" },
        testing: { label: "Pruebas", tone: "sky" },
        development: { label: "Desarrollo", tone: "teal" },
        backup: { label: "Respaldo", tone: "" }
    })

    /* Trazos que aún no tienen nombre en `Icon`. */
    readonly property string tableIcon: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 10h18M9 10v10"
    readonly property string userIcon: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21a8 8 0 0116 0"

    /* Solo los motores que tienen las conexiones de la cuenta. */
    readonly property var usedEngines: engineOrder.filter(e => connections.some(c => c.engine === e))

    readonly property var filtered: {
        const q = search.trim().toLowerCase()
        return connections.filter(c =>
            (q === ""
                || (c.name || "").toLowerCase().includes(q)
                || (c.host || "").toLowerCase().includes(q)
                || (c.database || "").toLowerCase().includes(q)
                || (engineLabels[c.engine] || "").toLowerCase().includes(q))
            && (engineFilter === "" || c.engine === engineFilter)
            && (tagFilter === "" || (tagFilter === "none" ? !c.tag : c.tag === tagFilter)))
    }
    readonly property int pages: Math.max(1, Math.ceil(filtered.length / pageSize))
    /* Si al filtrar o borrar quedan menos páginas, se muestra la última. */
    readonly property int current: Math.min(page, pages)
    readonly property var pageItems: filtered.slice((current - 1) * pageSize, current * pageSize)

    /* ── Datos ─────────────────────────────────────────────────────── */
    function load() {
        Api.request("GET", "/databases", null, (ok, data) => {
            root.loading = false
            root.failed = !ok
            if (ok) root.connections = data ? Array.from(data) : []
            /* `STARTCODE_PAGE=databases/<id>` abre esa conexión al arrancar (capturas). */
            const wanted = StartPage.split("/")[0] === "databases" ? StartPage.split("/")[1] : ""
            if (ok && wanted && !root.startHandled) {
                root.startHandled = true
                if (root.connections.some(c => c.id === wanted)) root.openConnection(wanted)
            }
        })
    }

    Component.onCompleted: load()

    /* ── Acciones ──────────────────────────────────────────────────── */
    function openConnection(id) {
        filters.close()
        openId = id
    }
    function newConnection() {
        connectionModal.connection = null
        connectionModal.open()
    }
    function editConnection(conn) {
        connectionModal.connection = conn
        connectionModal.open()
    }
    function setSearch(text) { search = text; page = 1 }
    function setEngineFilter(value) { engineFilter = value; page = 1 }
    function setTagFilter(value) { tagFilter = value; page = 1 }
    function clearFilters() { engineFilter = ""; tagFilter = ""; page = 1 }

    function tunnelHint(conn) {
        return conn.sshMode === "custom" && conn.sshHost
            ? "Por túnel SSH a través de " + (conn.sshUsername || "") + "@" + conn.sshHost + ":" + (conn.sshPort || 22)
            : "Por túnel SSH a través de un servidor del panel"
    }

    /* Crear, editar y eliminar ocurren dentro del modal: al cerrarse se
       vuelve a pedir la lista para reflejar lo que haya cambiado. */
    ConnectionModal {
        id: connectionModal
        onClosed: root.load()
    }

    /* ── Piezas ────────────────────────────────────────────────────── */

    /* Recuadro hundido con un dato de la conexión. */
    component DataBox: Rectangle {
        id: box
        property string label
        property string iconName: ""
        property string iconPath: ""
        default property alias content: slot.data
        /* Lo que va al extremo derecho del rótulo (la insignia del túnel). */
        property alias extra: extraSlot.data

        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: 70
        radius: Theme.radiusXl
        color: Theme.tintSunken
        border.width: 1
        border.color: Theme.hairlineSoft

        RowLayout {
            id: head
            x: 14; y: 12
            width: parent.width - 28
            height: 18
            spacing: 6
            Icon {
                size: 14
                color: Theme.ink(0.45)
                name: box.iconName
                path: box.iconName !== "" ? (paths[box.iconName] ?? "") : box.iconPath
            }
            Label {
                Layout.fillWidth: true
                text: box.label
                tone: 0.45
                font.pixelSize: Theme.textCaption
                font.weight: Font.Medium
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
            }
            Item {
                id: extraSlot
                /* No se oculta el hueco: `visible` del hijo depende del suyo y no volvería a mostrarse. */
                implicitWidth: children.length > 0 && children[0].visible ? children[0].implicitWidth : 0
                implicitHeight: 18
            }
        }
        Item {
            id: slot
            x: 14
            y: 36
            width: parent.width - 28
            height: 20
        }
    }

    component ConnectionCard: Glass {
        id: card
        property var conn

        elevation: "raised"
        highlighted: cardHover.hovered
        implicitHeight: content.implicitHeight + 40
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: conn.name
        Keys.onReturnPressed: root.openConnection(card.conn.id)
        Keys.onEnterPressed: root.openConnection(card.conn.id)
        Keys.onSpacePressed: root.openConnection(card.conn.id)
        borderColor: activeFocus ? Theme.focusRing : highlighted ? Theme.hairlineHover : Theme.hairline

        /* Al pasar el ratón la tarjeta se levanta un poco. */
        transform: Translate {
            y: cardHover.hovered && !Theme.reducedMotion ? -4 : 0
            Behavior on y { NumberAnimation { duration: Theme.moBase; easing.type: Easing.OutBack; easing.overshoot: 2 } }
        }

        HoverHandler { id: cardHover; cursorShape: Qt.PointingHandCursor }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            onTapped: point => {
                /* El botón de editar no abre la conexión. */
                const p = editButton.mapFromItem(card, point.position.x, point.position.y)
                if (!editButton.contains(p)) root.openConnection(card.conn.id)
            }
        }

        ColumnLayout {
            id: content
            x: 20; y: 20
            width: parent.width - 40
            spacing: 0

            /* Cabecera: motor y nombre */
            RowLayout {
                Layout.fillWidth: true
                spacing: 16
                EngineBadge { engine: card.conn.engine; Layout.alignment: Qt.AlignTop }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2
                    Label {
                        Layout.fillWidth: true
                        text: card.conn.name
                        font.pixelSize: 18
                        font.weight: Font.DemiBold
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Label {
                            text: root.engineLabels[card.conn.engine] || card.conn.engine
                            tone: 0.55
                        }
                        Label {
                            Layout.fillWidth: true
                            visible: !!card.conn.version
                            text: " · v" + (card.conn.version || "")
                            mono: true
                            tone: 0.4
                        }
                        Item { Layout.fillWidth: true; visible: !card.conn.version }
                    }
                }
                IconButton {
                    id: editButton
                    Layout.alignment: Qt.AlignTop
                    iconName: "edit"
                    hint: "Editar conexión"
                    onClicked: root.editConnection(card.conn)
                }
            }

            /* Datos de la conexión */
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 20
                spacing: 12

                DataBox {
                    label: "Host"
                    iconName: "server"
                    extra: Rectangle {
                        visible: !!card.conn.sshMode && card.conn.sshMode !== "none"
                        implicitWidth: tunnelLabel.implicitWidth + 12
                        width: implicitWidth
                        height: 18
                        radius: 9
                        color: Qt.alpha(Theme.tone("violet").base, 0.15)
                        border.width: 1
                        border.color: Qt.alpha(Theme.tone("violet").base, 0.25)
                        Label {
                            id: tunnelLabel
                            anchors.centerIn: parent
                            text: "Túnel SSH"
                            color: Theme.tone("violet").text
                            font.pixelSize: Theme.textCaption
                            font.weight: Font.Medium
                        }
                        HoverTip { text: root.tunnelHint(card.conn) }
                    }

                    /* El host cede sitio al puerto y se recorta el primero. */
                    Label {
                        id: hostLabel
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(Math.ceil(implicitWidth), Math.max(20, parent.width - portLabel.width))
                        text: card.conn.host
                        mono: true
                        tone: 0.85
                        font.features: { "tnum": 1 }
                    }
                    Label {
                        id: portLabel
                        anchors.left: hostLabel.right
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.ceil(implicitWidth)
                        text: ":" + card.conn.port
                        mono: true
                        tone: 0.4
                        font.features: { "tnum": 1 }
                    }
                }

                DataBox {
                    label: "Base de datos"
                    iconPath: root.tableIcon

                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        visible: !!card.conn.database
                        text: card.conn.engine === "redis" ? "db" + card.conn.database : (card.conn.database || "")
                        mono: true
                        tone: 0.85
                        HoverTip { text: card.conn.database || "" }
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        visible: !card.conn.database
                        text: "Servidor completo"
                        tone: 0.4
                    }
                }
            }

            /* Pie: usuario y, al otro extremo de la fila, la etiqueta */
            Rectangle { Layout.fillWidth: true; Layout.topMargin: 20; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 16
                spacing: 8
                Icon { path: root.userIcon; color: Theme.ink(0.55) }
                Label {
                    Layout.fillWidth: true
                    text: card.conn.username || "—"
                    mono: true
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                }
                Badge {
                    readonly property var tag: root.tags[card.conn.tag]
                    visible: tag !== undefined
                    pill: true
                    text: tag ? tag.label : ""
                    tone: tag ? tag.tone : ""
                }
            }
        }
    }

    /* Estado vacío: cristal con borde discontinuo. */
    component EmptyBox: Glass {
        id: empty
        property string title
        property string detail: ""

        Layout.fillWidth: true
        implicitHeight: emptyBody.implicitHeight + 128
        elevation: "flat"
        borderColor: "transparent"

        HoverHandler { id: emptyHover }
        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            ShapePath {
                strokeColor: emptyHover.hovered ? Theme.edgeDashedHover : Theme.edgeDashed
                strokeWidth: 1
                strokeStyle: ShapePath.DashLine
                dashPattern: [4, 4]
                fillColor: "transparent"
                PathRectangle {
                    x: 0.5; y: 0.5
                    width: empty.width - 1
                    height: empty.height - 1
                    radius: Theme.radius2xl
                }
            }
        }
        Column {
            id: emptyBody
            anchors.centerIn: parent
            width: parent.width - 48
            spacing: 12
            Icon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: "database"; size: 40
                color: Theme.ink(0.2)
            }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
                text: empty.title
                tone: 0.6
                font.weight: Font.Medium
            }
            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Math.min(320, parent.width)
                visible: empty.detail !== ""
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
                text: empty.detail
                tone: 0.35
                font.pixelSize: Theme.textXs
            }
        }
    }

    component Chip: Item {
        id: chip
        property string text
        property bool on: false
        signal picked()
        width: chipLabel.implicitWidth + 24
        height: 32
        Accessible.role: Accessible.Button
        Accessible.name: text
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            visible: !chip.on
            color: chipHover.hovered ? Theme.tintActive : Theme.tintHover
            border.width: 1
            border.color: Theme.hairline
        }
        Elevation { anchors.fill: parent; visible: chip.on; level: "brandSm"; radius: Theme.radiusLg }
        BrandFill { anchors.fill: parent; radius: Theme.radiusLg; visible: chip.on }
        Label {
            id: chipLabel
            anchors.centerIn: parent
            text: chip.text
            color: chip.on ? Theme.onBrand : Theme.ink(chipHover.hovered ? 1 : 0.7)
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
        HoverHandler { id: chipHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: chip.picked() }
    }

    /* Botón de número de página. */
    component PageButton: Item {
        id: pageButton
        property int number
        readonly property bool on: number === root.current
        width: Math.max(36, numberLabel.implicitWidth + 16)
        height: 36
        Accessible.role: Accessible.Button
        Accessible.name: "Página " + number
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusXl
            visible: !pageButton.on
            color: pageHover.hovered ? Theme.tintHover : "transparent"
        }
        Elevation { anchors.fill: parent; visible: pageButton.on; level: "brandSm"; radius: Theme.radiusXl }
        BrandFill { anchors.fill: parent; visible: pageButton.on }
        Label {
            id: numberLabel
            anchors.centerIn: parent
            text: pageButton.number
            color: pageButton.on ? Theme.onBrand : Theme.ink(pageHover.hovered ? 1 : 0.6)
            font.weight: Font.Medium
            font.features: { "tnum": 1 }
        }
        HoverHandler { id: pageHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.page = pageButton.number }
    }

    /* ── Vista de la conexión abierta ──────────────────────────────── */
    Loader {
        anchors.fill: parent
        active: root.openId !== ""
        sourceComponent: DatabaseDetail {
            connectionId: root.openId
            onBack: { root.openId = ""; root.load() }
        }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    ColumnLayout {
        anchors.fill: parent
        spacing: 20
        visible: root.openId === ""

        /* Cabecera */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 96
            elevation: "raised"

            Item {
                id: headIcon
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                width: 56; height: 56
                Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
                BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
                Icon { anchors.centerIn: parent; name: "database"; size: 28; color: Theme.onBrand }
            }
            Column {
                anchors.left: headIcon.right
                anchors.leftMargin: 16
                anchors.right: parent.right
                anchors.rightMargin: 24
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                Label {
                    width: parent.width
                    text: "Bases de Datos"
                    font.pixelSize: 24
                    font.weight: Font.Bold
                    font.letterSpacing: -0.4
                }
                Label {
                    width: parent.width
                    text: root.connections.length === 0 ? "Aún no hay conexiones registradas"
                        : root.connections.length + " " + (root.connections.length === 1 ? "conexión guardada" : "conexiones guardadas")
                    tone: 0.55
                }
            }
        }

        /* Buscador, filtros y alta */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 64
            elevation: "raised"
            z: 2

            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 12

                Icon { Layout.leftMargin: 12; name: "search"; color: Theme.ink(0.45) }
                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        visible: searchInput.text === ""
                        text: "Buscar por nombre, motor, IP o base de datos…"
                        tone: 0.4
                    }
                    TextInput {
                        id: searchInput
                        anchors.fill: parent
                        verticalAlignment: TextInput.AlignVCenter
                        clip: true
                        color: Theme.ink(0.9)
                        selectionColor: Theme.brand1(0.45)
                        selectedTextColor: Theme.ink(1)
                        font.family: Theme.fontUi
                        font.pixelSize: Theme.textSm
                        selectByMouse: true
                        Accessible.name: "Buscar conexiones"
                        onTextChanged: root.setSearch(text)
                    }
                    HoverHandler { cursorShape: Qt.IBeamCursor }
                }

                SecondaryButton {
                    id: filterButton
                    implicitWidth: filterRow.implicitWidth + 32
                    Accessible.name: "Filtros"
                    onClicked: filters.visible ? filters.close() : filters.open()
                    contentItem: Item {
                        Row {
                            id: filterRow
                            anchors.centerIn: parent
                            spacing: 8
                            Icon { anchors.verticalCenter: parent.verticalCenter; name: "filter"; color: Theme.ink(root.activeFilters > 0 ? 1 : 0.85) }
                            Label {
                                visible: !root.compact
                                anchors.verticalCenter: parent.verticalCenter
                                text: "Filtros"
                                tone: root.activeFilters > 0 ? 1 : 0.85
                                font.weight: Font.Medium
                            }
                            Item {
                                visible: root.activeFilters > 0
                                anchors.verticalCenter: parent.verticalCenter
                                width: 20; height: 20
                                BrandFill { anchors.fill: parent; radius: 10 }
                                Label { anchors.centerIn: parent; text: root.activeFilters; color: Theme.onBrand; font.pixelSize: 11; font.weight: Font.DemiBold }
                            }
                        }
                    }
                }

                PrimaryButton {
                    implicitWidth: addRow.implicitWidth + 32
                    Accessible.name: "Agregar conexión"
                    onClicked: root.newConnection()
                    contentItem: Item {
                        Row {
                            id: addRow
                            anchors.centerIn: parent
                            spacing: 8
                            Icon { anchors.verticalCenter: parent.verticalCenter; name: "plus"; color: Theme.onBrand }
                            Label { visible: !root.compact; anchors.verticalCenter: parent.verticalCenter; text: "Agregar conexión"; color: Theme.onBrand; font.weight: Font.Medium }
                        }
                    }
                }
            }
        }

        /* Solo esta zona se desplaza */
        ScrollArea {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentHeight: body.implicitHeight

            ColumnLayout {
                id: body
                width: scroll.width
                spacing: 12

                Item {
                    Layout.fillWidth: true
                    implicitHeight: 200
                    visible: root.loading
                    Spinner { anchors.centerIn: parent; size: 40; color: Theme.brandLight1 }
                }

                Glass {
                    Layout.fillWidth: true
                    implicitHeight: 88
                    elevation: "raised"
                    visible: !root.loading && root.failed
                    Label {
                        anchors.centerIn: parent
                        width: parent.width - 64
                        horizontalAlignment: Text.AlignHCenter
                        tone: 0.55
                        font.pixelSize: Theme.textBase
                        text: "Error al cargar las conexiones"
                    }
                }

                EmptyBox {
                    visible: !root.loading && !root.failed && root.connections.length === 0
                    title: "Todavía no hay conexiones"
                    detail: "Agrega una conexión a MySQL, MariaDB, PostgreSQL o Redis con el botón «Agregar conexión»."
                }

                EmptyBox {
                    visible: !root.loading && !root.failed && root.connections.length > 0 && root.filtered.length === 0
                    title: "Ninguna conexión coincide con la búsqueda o los filtros"
                }

                GridLayout {
                    id: grid
                    Layout.fillWidth: true
                    visible: !root.loading && !root.failed && root.filtered.length > 0
                    columns: root.columns
                    columnSpacing: 20
                    rowSpacing: 20

                    Repeater {
                        model: root.loading || root.failed ? [] : root.pageItems
                        ConnectionCard {
                            id: connItem
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.preferredWidth: 1
                            Layout.alignment: Qt.AlignTop
                            conn: modelData
                            required property int index
                            Entrance { target: connItem; index: connItem.index; key: String(connItem.modelData.id); seen: root.entranceSeen }
                        }
                    }

                    /* Cada cambio de página entra con un fundido y desde arriba. */
                    NumberAnimation { id: pageIn; target: grid; property: "opacity"; from: 0; to: 1; duration: Theme.moBase }
                    Connections {
                        target: root
                        function onCurrentChanged() {
                            scroll.contentY = 0
                            if (!Theme.reducedMotion) pageIn.restart()
                        }
                    }
                }
            }
        }

        /* Paginación */
        Glass {
            id: pager
            Layout.fillWidth: true
            implicitHeight: 60
            elevation: "raised"
            visible: root.pages > 1 && !root.loading && !root.failed

            readonly property int numbersWidth: root.pages * 36 + (root.pages - 1) * 6
            /* Con muchas páginas en una ventana estrecha los números no caben:
               se resume en «página / total». */
            readonly property bool numbersFit: numbersWidth + 84 + 24 + (rangeLabel.visible ? rangeLabel.implicitWidth + 36 : 0) <= width

            Label {
                id: rangeLabel
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                visible: !root.compact
                text: ((root.current - 1) * root.pageSize + 1) + "–" + Math.min(root.current * root.pageSize, root.filtered.length)
                    + " de " + root.filtered.length + " conexiones"
                tone: 0.45
                font.pixelSize: Theme.textXs
                font.features: { "tnum": 1 }
            }
            Row {
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6
                IconButton {
                    iconName: "chevronLeft"
                    hint: "Página anterior"
                    enabled: root.current > 1
                    onClicked: root.page = root.current - 1
                }
                Repeater {
                    model: pager.numbersFit ? root.pages : 0
                    PageButton {
                        required property int index
                        number: index + 1
                    }
                }
                Label {
                    visible: !pager.numbersFit
                    anchors.verticalCenter: parent.verticalCenter
                    leftPadding: 8; rightPadding: 8
                    text: root.current + " / " + root.pages
                    tone: 0.7
                    font.weight: Font.Medium
                    font.features: { "tnum": 1 }
                }
                IconButton {
                    iconName: "chevronRight"
                    hint: "Página siguiente"
                    enabled: root.current < root.pages
                    onClicked: root.page = root.current + 1
                }
            }
        }
    }

    /* ── Desplegable de filtros ────────────────────────────────────── */
    Glass {
        id: filters
        function open() { visible = true }
        function close() { visible = false }

        visible: false
        z: 10
        variant: "float"
        radius: Theme.radiusXl
        width: Math.min(320, root.width - 16)
        height: filterBody.implicitHeight + 32
        x: Math.max(0, filterButton.mapToItem(root, filterButton.width, 0).x - width)
        y: filterButton.mapToItem(root, 0, filterButton.height).y + 8

        Keys.onEscapePressed: close()
        onVisibleChanged: if (visible) forceActiveFocus()

        ColumnLayout {
            id: filterBody
            x: 16; y: 16
            width: parent.width - 32
            spacing: 16

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8
                Label { text: "Motor"; tone: 0.55; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    Chip { text: "Todos"; on: root.engineFilter === ""; onPicked: root.setEngineFilter("") }
                    Repeater {
                        model: root.usedEngines
                        Chip {
                            required property var modelData
                            text: root.engineLabels[modelData]
                            on: root.engineFilter === modelData
                            onPicked: root.setEngineFilter(modelData)
                        }
                    }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8
                Label { text: "Etiqueta"; tone: 0.55; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    Chip { text: "Todas"; on: root.tagFilter === ""; onPicked: root.setTagFilter("") }
                    Repeater {
                        model: root.tagOrder.map(key => ({ value: key, label: root.tags[key].label }))
                            .concat([{ value: "none", label: "Sin etiqueta" }])
                        Chip {
                            required property var modelData
                            text: modelData.label
                            on: root.tagFilter === modelData.value
                            onPicked: root.setTagFilter(modelData.value)
                        }
                    }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                visible: root.activeFilters > 0
                spacing: 8
                Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
                GhostButton {
                    Layout.alignment: Qt.AlignRight
                    implicitHeight: 32
                    text: "Limpiar filtros"
                    onClicked: root.clearFilters()
                }
            }
        }
    }
    /* Un clic fuera del desplegable lo cierra. */
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        enabled: filters.visible
        onTapped: point => {
            const inside = filters.contains(filters.mapFromItem(root, point.position.x, point.position.y))
            const onButton = filterButton.contains(filterButton.mapFromItem(root, point.position.x, point.position.y))
            if (!inside && !onButton) filters.close()
        }
    }
}
