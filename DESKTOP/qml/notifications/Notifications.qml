import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import QtQuick.Window
import StartCode

/* Historial de notificaciones de la cuenta: filtros por tipo y por no
   leídas, y las acciones de marcar, borrar y vaciar. Cabecera y filtros
   quedan fijos; solo se desplaza la lista. */
Item {
    id: root

    readonly property int pageSize: 50
    /* Tope del backend para `limit` (y del historial que guarda por usuario). */
    readonly property int maxLimit: 200
    /* Lo que el original da por fresco antes de volver a pedir al recuperar el foco. */
    readonly property int staleMs: 15000

    readonly property var typeLabels: ({
        server_offline: "Servidor caído", server_online: "Reconexión", cpu_high: "CPU alta",
        memory_high: "Memoria alta", disk_high: "Disco alto", security: "Seguridad", system: "Sistema"
    })
    readonly property var filters: [{ id: "all", label: "Todas" }]
        .concat(Object.keys(typeLabels).map(key => ({ id: key, label: typeLabels[key] })))
    readonly property string checkAllPath: "M1 13l4 4L13 9M11 13l4 4L23 5"

    /* ── Estado ────────────────────────────────────────────────────── */
    property string typeFilter: "all"
    property bool onlyUnread: false
    property int limit: pageSize

    property var items: []
    /* Las filas se identifican por id y leen aquí sus datos: así un refresco
       no las vuelve a crear ni mueve el desplazamiento. */
    property var byId: ({})
    property int total: 0
    property int unread: 0

    property bool loading: true
    property bool loadingMore: false
    property bool failed: false
    property bool markingAll: false
    property bool clearing: false
    property var busyIds: ({})
    /* Solo cuenta la respuesta de la última petición lanzada. */
    property int ticket: 0
    property double loadedAt: 0

    readonly property bool compact: width < 640
    readonly property bool windowActive: Window.active

    ListModel { id: rowModel }

    /* ── Datos ─────────────────────────────────────────────────────── */
    /* `fresh`: consulta nueva (cambió un filtro), sin nada que enseñar mientras llega. */
    function load(fresh) {
        if (fresh) {
            loading = true
            loadingMore = false
            rowModel.clear()
            items = []
            byId = ({})
            total = 0
        }
        const mine = ++ticket
        const params = []
        if (typeFilter !== "all") params.push("type=" + encodeURIComponent(typeFilter))
        if (onlyUnread) params.push("unread=true")
        params.push("limit=" + limit)
        params.push("offset=0")
        Api.request("GET", "/notifications?" + params.join("&"), null, (ok, data) => {
            if (mine !== root.ticket) return
            root.loading = false
            root.loadingMore = false
            root.failed = !ok
            root.loadedAt = Date.now()
            if (!ok) return
            const body = data || {}
            root.applyList(body.items && body.items.length !== undefined ? Array.from(body.items) : [])
            root.total = body.total || 0
            root.unread = body.unread || 0
        })
    }

    function applyList(list) {
        const map = {}
        for (const item of list) map[item.id] = item
        for (let i = rowModel.count - 1; i >= 0; i--) {
            if (map[rowModel.get(i).nid] === undefined) rowModel.remove(i)
        }
        byId = map
        for (let i = 0; i < list.length; i++) {
            const id = list[i].id
            if (i < rowModel.count && rowModel.get(i).nid === id) continue
            let found = -1
            for (let j = i + 1; j < rowModel.count; j++) {
                if (rowModel.get(j).nid === id) { found = j; break }
            }
            if (found >= 0) rowModel.move(found, i, 1)
            else rowModel.insert(i, { nid: id })
        }
        items = list
    }

    function applyFilter(id) {
        if (id === typeFilter && limit === pageSize) return
        typeFilter = id
        limit = pageSize
        load(true)
    }
    function toggleUnread() {
        onlyUnread = !onlyUnread
        limit = pageSize
        load(true)
    }
    function loadMore() {
        limit = Math.min(maxLimit, limit + pageSize)
        loadingMore = true
        load(false)
    }

    /* Tras cualquier cambio: lista al día e insignia de la barra lateral. */
    function changed() {
        load(false)
        NotificationState.refresh()
    }
    function setBusy(id, on) {
        const next = Object.assign({}, busyIds)
        if (on) next[id] = true
        else delete next[id]
        busyIds = next
    }

    /* ── Acciones ──────────────────────────────────────────────────── */
    function markRead(id) {
        if (busyIds[id]) return
        setBusy(id, true)
        Api.request("PATCH", "/notifications/read", { ids: [id] }, (ok, data, error) => {
            root.setBusy(id, false)
            if (ok) root.changed()
            else Toasts.error("No se pudo marcar como leída", error.message)
        })
    }
    function markAllRead() {
        if (markingAll) return
        markingAll = true
        Api.request("PATCH", "/notifications/read", { all: true }, (ok, data, error) => {
            root.markingAll = false
            if (ok) root.changed()
            else Toasts.error("No se pudieron marcar como leídas", error.message)
        })
    }
    function removeOne(id) {
        if (busyIds[id]) return
        setBusy(id, true)
        Api.request("DELETE", "/notifications/" + encodeURIComponent(id), null, (ok, data, error) => {
            root.setBusy(id, false)
            if (ok) root.changed()
            else Toasts.error("No se pudo borrar la notificación", error.message)
        })
    }
    function clearAll() {
        if (clearing) return
        clearing = true
        Api.request("DELETE", "/notifications", null, (ok, data, error) => {
            root.clearing = false
            if (ok) root.changed()
            else Toasts.error("No se pudo vaciar el historial", error.message)
        })
    }

    NotificationClearModal {
        id: clearModal
        total: root.total
        onConfirmed: root.clearAll()
    }

    Component.onCompleted: load(true)

    /* El servidor avisó de novedades. */
    Connections {
        target: NotificationState
        function onRevisionChanged() { root.load(false) }
    }
    /* Al volver a la ventana o a la página, si lo mostrado ya es viejo. */
    function refreshIfStale() {
        if (visible && windowActive && !loading && Date.now() - loadedAt > staleMs) load(false)
    }
    onWindowActiveChanged: refreshIfStale()
    onVisibleChanged: refreshIfStale()

    /* ── Piezas ────────────────────────────────────────────────────── */
    component HeadButton: SecondaryButton {
        id: headButton
        property string iconName: ""
        property string iconPath: ""
        property bool busy: false
        property bool dangerTone: false
        readonly property var rose: Theme.tone("rose")
        readonly property color inkColor: dangerTone ? rose.text : Theme.ink(0.85)

        implicitWidth: headRow.implicitWidth + (root.compact ? 24 : 32)
        opacity: enabled ? 1 : 0.4
        Accessible.name: text

        background: Glass {
            variant: "soft"
            radius: Theme.radiusXl
            highlighted: headButton.hovered && !headButton.dangerTone
            borderColor: headButton.visualFocus ? Theme.focusRing
                       : headButton.dangerTone ? Qt.alpha(headButton.rose.base, 0.15)
                       : headButton.hovered ? Theme.hairlineHover : Theme.hairlineSoft
            Rectangle {
                anchors.fill: parent
                radius: Theme.radiusXl
                visible: headButton.dangerTone && headButton.hovered
                color: Qt.alpha(headButton.rose.base, 0.1)
            }
        }
        contentItem: Item {
            Row {
                id: headRow
                anchors.centerIn: parent
                spacing: 8
                Spinner {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: headButton.busy
                    color: headButton.inkColor
                }
                Icon {
                    id: headIconGlyph
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !headButton.busy
                    color: headButton.inkColor
                    path: headButton.iconPath !== "" ? headButton.iconPath
                        : (headIconGlyph.paths[headButton.iconName] ?? "")
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !root.compact
                    text: headButton.text
                    color: headButton.inkColor
                    font.weight: Font.Medium
                }
            }
        }
        /* En estrecho el botón se queda en el icono: el texto pasa a la ayuda. */
        HoverTip { text: root.compact ? headButton.text : "" }
    }

    component FilterChip: Item {
        id: chip
        property string label
        property bool on: false
        signal picked()

        width: Math.ceil(chipLabel.implicitWidth) + 28
        height: 36
        scale: chipTap.pressed ? 0.98 : 1
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: label
        Keys.onReturnPressed: picked()
        Keys.onSpacePressed: picked()

        Elevation { anchors.fill: parent; visible: chip.on; level: "brandSm"; radius: Theme.radiusXl }
        BrandFill { anchors.fill: parent; visible: chip.on }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusXl
            color: !chip.on && chipHover.hovered ? Theme.tintHover : "transparent"
            border.width: chip.activeFocus ? 1 : 0
            border.color: Theme.focusRing
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Label {
            id: chipLabel
            anchors.centerIn: parent
            text: chip.label
            color: chip.on ? Theme.onBrand : Theme.ink(chipHover.hovered ? 1 : 0.6)
            font.weight: Font.Medium
        }
        HoverHandler { id: chipHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { id: chipTap; gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: chip.picked() }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    ColumnLayout {
        anchors.fill: parent
        spacing: 20

        /* Cabecera */
        Glass {
            Layout.fillWidth: true
            implicitHeight: 96
            elevation: "raised"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: root.compact ? 16 : 24
                anchors.rightMargin: root.compact ? 16 : 24
                spacing: root.compact ? 8 : 16

                Item {
                    implicitWidth: 56; implicitHeight: 56
                    Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
                    BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
                    Icon { anchors.centerIn: parent; name: "bell"; size: 28; color: Theme.onBrand }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.leftMargin: root.compact ? 4 : 0
                    spacing: 2
                    Label {
                        Layout.fillWidth: true
                        text: "Notificaciones"
                        font.pixelSize: 24
                        font.weight: Font.Bold
                        font.letterSpacing: -0.4
                    }
                    Label {
                        Layout.fillWidth: true
                        text: root.unread > 0 ? root.unread + " sin leer" : "Todo al día"
                        tone: 0.55
                    }
                }
                HeadButton {
                    text: "Marcar todas"
                    iconPath: root.checkAllPath
                    busy: root.markingAll
                    enabled: root.unread > 0 && !root.markingAll
                    onClicked: root.markAllRead()
                }
                HeadButton {
                    text: "Vaciar"
                    iconName: "trash"
                    dangerTone: true
                    busy: root.clearing
                    enabled: root.total > 0 && !root.clearing
                    onClicked: clearModal.open()
                }
            }
        }

        /* Filtros */
        Glass {
            Layout.fillWidth: true
            elevation: "raised"
            /* En estrecho «Solo no leídas» baja a su propia línea. */
            implicitHeight: (root.compact ? chips.height + 8 + unreadSwitch.height
                                          : Math.max(chips.height, unreadSwitch.height)) + 24

            Flow {
                id: chips
                x: 12; y: 12
                width: parent.width - 24 - (root.compact ? 0 : unreadSwitch.width + 16)
                spacing: 8
                Repeater {
                    model: root.filters
                    FilterChip {
                        required property var modelData
                        label: modelData.label
                        on: root.typeFilter === modelData.id
                        onPicked: root.applyFilter(modelData.id)
                    }
                }
            }

            Item {
                id: unreadSwitch
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 12
                width: Math.ceil(unreadLabel.implicitWidth) + 28
                height: 36
                scale: unreadTap.pressed ? 0.98 : 1
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: "Solo no leídas"
                Accessible.checkable: true
                Accessible.checked: root.onlyUnread
                Keys.onReturnPressed: root.toggleUnread()
                Keys.onSpacePressed: root.toggleUnread()

                Glass {
                    anchors.fill: parent
                    visible: !root.onlyUnread
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    borderColor: unreadSwitch.activeFocus ? Theme.focusRing
                               : unreadHover.hovered ? Theme.hairlineHover : Theme.hairlineSoft
                }
                BrandFill { anchors.fill: parent; visible: root.onlyUnread; strength: 0.18 }
                Rectangle {
                    anchors.fill: parent
                    visible: root.onlyUnread
                    radius: Theme.radiusXl
                    color: "transparent"
                    border.width: 1
                    border.color: unreadSwitch.activeFocus ? Theme.focusRing : Theme.hairline
                }
                Label {
                    id: unreadLabel
                    anchors.centerIn: parent
                    text: "Solo no leídas"
                    tone: root.onlyUnread || unreadHover.hovered ? 1 : 0.6
                    font.weight: Font.Medium
                }
                HoverHandler { id: unreadHover; cursorShape: Qt.PointingHandCursor }
                TapHandler { id: unreadTap; gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.toggleUnread() }
            }
        }

        /* Lista: lo único que se desplaza */
        ScrollArea {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentHeight: body.height

            Column {
                id: body
                width: scroll.width

                Item {
                    width: body.width
                    height: 148
                    visible: root.loading
                    Row {
                        anchors.centerIn: parent
                        spacing: 12
                        Spinner { anchors.verticalCenter: parent.verticalCenter; size: 20; color: Theme.ink(0.45) }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Cargando notificaciones…"
                            tone: 0.45
                            font.pixelSize: Theme.textBase
                        }
                    }
                }

                Glass {
                    width: body.width
                    implicitHeight: errorLabel.implicitHeight + 64
                    elevation: "raised"
                    visible: !root.loading && root.failed
                    Label {
                        id: errorLabel
                        anchors.centerIn: parent
                        width: parent.width - 64
                        horizontalAlignment: Text.AlignHCenter
                        text: "No se pudo cargar el historial de notificaciones."
                        color: Theme.tone("rose").text
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }

                Item {
                    id: emptyBox
                    width: body.width
                    height: emptyColumn.implicitHeight + 128
                    visible: !root.loading && !root.failed && root.items.length === 0

                    Glass { anchors.fill: parent; elevation: "flat"; borderColor: "transparent" }
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
                                radius: Theme.radius2xl
                            }
                        }
                    }
                    Column {
                        id: emptyColumn
                        anchors.centerIn: parent
                        width: parent.width - 48
                        spacing: 12
                        Icon {
                            anchors.horizontalCenter: parent.horizontalCenter
                            name: "bell"
                            size: 40
                            color: Theme.ink(0.2)
                        }
                        Label {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            text: root.onlyUnread || root.typeFilter !== "all"
                                ? "Nada que mostrar con este filtro"
                                : "Todavía no hay notificaciones"
                            tone: 0.6
                            font.weight: Font.Medium
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                        Label {
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: Math.min(320, parent.width)
                            horizontalAlignment: Text.AlignHCenter
                            text: "Las alertas de servidores caídos y de umbrales de CPU, memoria o disco aparecerán aquí. "
                                + "Los tipos activos se eligen en Configuración → Notificaciones."
                            tone: 0.35
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                }

                Column {
                    id: rows
                    width: body.width
                    spacing: 10
                    visible: !root.loading && !root.failed && root.items.length > 0

                    Repeater {
                        model: rowModel
                        NotificationRow {
                            required property string nid
                            width: rows.width
                            item: root.byId[nid] || ({})
                            busy: root.busyIds[nid] === true
                            onRead: id => root.markRead(id)
                            onRemove: id => root.removeOne(id)
                        }
                    }

                    SecondaryButton {
                        id: moreButton
                        width: rows.width
                        implicitHeight: 44
                        visible: root.items.length < root.total
                        enabled: !root.loadingMore
                        onClicked: root.loadMore()
                        contentItem: Item {
                            Row {
                                anchors.centerIn: parent
                                spacing: 8
                                Spinner { anchors.verticalCenter: parent.verticalCenter; visible: root.loadingMore }
                                Label {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: "Cargar más (" + (root.total - root.items.length) + " restantes)"
                                    tone: moreButton.hovered ? 1 : 0.7
                                    font.weight: Font.Medium
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
