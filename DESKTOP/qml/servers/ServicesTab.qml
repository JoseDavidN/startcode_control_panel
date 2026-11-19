import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Pestaña «Servicios» del detalle de un servidor: el inventario de systemd
   que envía el agente, con los fijados arriba, filtro, y las acciones sobre
   cada unidad (iniciar, parar, reiniciar, arranque automático, journal).
   Sin desplazamiento propio: crece con `implicitHeight`.

       ServicesTab {
           server: root.server
           detail: crudoDeLatest      // o null sin agente
           onReload: root.loadDetail()
           onInstallRequested: …      // botón «Nuevo Servicio»
       } */
Glass {
    id: root

    /* Servidor del detalle: `{ id, name, host, os, status }`. */
    property var server: ({})
    /* Respuesta cruda de `GET /agent-data/servers/:id/latest`, o null sin agente. */
    property var detail: null
    property bool loading: false

    /* Hay que volver a pedir el detalle (tras una acción o al fijar). */
    signal reload()
    /* Botón «Nuevo Servicio»: abre el instalador, que vive fuera de la pestaña. */
    signal installRequested()

    /* ── Estado ────────────────────────────────────────────────────── */
    property string serviceFilter: ""
    property bool onlyActive: false
    property string actionError: ""
    /* Última acción lanzada: bloquea solo su tarjeta, y el indicador va en el
       botón que la lanzó, no en los cuatro. */
    property bool actionPending: false
    property string pendingService: ""
    property string pendingAction: ""
    property int actionSeq: 0

    /* Cómo se cuenta la acción ya ejecutada en el aviso. */
    readonly property var actionPast: ({
        start: "iniciado", stop: "detenido", restart: "reiniciado",
        enable: "habilitado al arranque", disable: "quitado del arranque"
    })

    function unitName(unit) { return String(unit || "").replace(/\.service$/, "") }
    function asList(value) { return value && value.length !== undefined ? Array.from(value) : [] }

    /* ── Inventario ────────────────────────────────────────────────── */
    readonly property var services: detail && detail.services ? asList(detail.services.list) : []
    readonly property int activeCount: services.filter(s => s.state === "active").length
    readonly property int failedCount: services.filter(s => s.state === "failed").length

    /* Los que el usuario fijó para este servidor. Un servidor reporta ~160
       unidades y casi ninguna importa: esta lista decide qué se ve primero. */
    readonly property var pinned: detail && detail.services ? asList(detail.services.pinned) : []
    readonly property var pinnedUnits: pinned.map(unitName)

    function matches(service, term) {
        return term === ""
            || String(service.name || "").toLowerCase().includes(term)
            || String(service.displayName ?? "").toLowerCase().includes(term)
    }

    readonly property var pinnedServices: {
        const term = serviceFilter.trim().toLowerCase()
        const order = pinned
        /* Con un filtro escrito, lo fijado tampoco se libra: si no, la búsqueda
           devolvería resultados que no coinciden con lo buscado. */
        return services
            .filter(s => pinnedUnits.includes(unitName(s.name)))
            .filter(s => matches(s, term))
            .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    }

    /* Con ~160 unidades, pintarlas todas es ruido: primero las que fallan,
       luego las activas, y se corta la lista salvo que el usuario filtre. Lo
       fijado ya tiene su sección arriba y no se repite aquí. */
    readonly property var visibleServices: {
        const term = serviceFilter.trim().toLowerCase()
        const active = onlyActive
        const weight = state => state === "failed" ? 0 : state === "active" ? 1 : 2
        return services
            .filter(s => !pinnedUnits.includes(unitName(s.name)))
            .filter(s => active ? s.state === "active" : true)
            .filter(s => matches(s, term))
            .sort((a, b) => weight(a.state) - weight(b.state) || String(a.name).localeCompare(String(b.name)))
            .slice(0, term ? 200 : 60)
    }

    readonly property int shownCount: visibleServices.length + pinnedServices.length

    function cardBusy(serviceName) { return actionPending && pendingService === serviceName }
    function cardRunning(serviceName) { return cardBusy(serviceName) ? pendingAction : "" }

    /* ── Fijar ─────────────────────────────────────────────────────── */
    function togglePin(serviceName) {
        const unit = unitName(serviceName)
        const next = pinnedUnits.includes(unit)
            ? pinned.filter(name => unitName(name) !== unit)
            : pinned.concat([serviceName])

        /* El backend guarda la lista entera. */
        Api.request("PUT", "/agent-data/servers/" + server.id + "/services/pinned", { services: next }, ok => {
            if (ok) root.reload()
            else Toasts.error("No se pudo guardar el servicio fijado", serviceName)
        })
    }

    /* ── Acciones ──────────────────────────────────────────────────── */
    /* Parar pide confirmación, y cualquier acción puede acabar pidiendo la
       contraseña de sudo: las dos cosas viven en el mismo modal. */
    function runServiceAction(serviceName, action) {
        actionError = ""

        if (action === "stop") {
            actionModal.show(serviceName, action, "confirm", "")
            return
        }

        /* La contraseña ya validada se reusa para no pedirla en cada clic. */
        execute(serviceName, action, Sudo.get(server.id))
    }

    function execute(serviceName, action, password) {
        const serverId = server.id
        const seq = ++actionSeq
        actionError = ""
        pendingService = serviceName
        pendingAction = action
        actionPending = true

        Api.request("POST", "/agent-data/servers/" + serverId + "/services/" + encodeURIComponent(serviceName) + "/action",
                    password ? { action: action, sudoPassword: password } : { action: action }, (ok, data, failure) => {
            if (seq === root.actionSeq) root.actionPending = false
            /* También cuando falla: un `success: false` deja el servicio en un
               estado distinto al que muestra la tarjeta. */
            root.reload()

            if (ok) {
                const result = data || {}
                if (password) Sudo.set(serverId, password)
                actionModal.hide()

                if (result.success) {
                    Toasts.success("Servicio " + root.actionPast[action], serviceName)
                } else {
                    Toasts.error("No se pudo ejecutar «" + action + "» en " + serviceName, result.error || "")
                    root.actionError = serviceName + ": " + (result.error || "systemctl terminó con error")
                }
                return
            }

            const fail = failure || {}

            /* El servidor pide contraseña de sudo: se abre la segunda fase del
               modal con el mismo servicio y acción, en vez de dar el error por perdido. */
            if (fail.code === "SUDO_REQUIRED") {
                Sudo.clear(serverId)
                actionModal.show(serviceName, action, "sudo", fail.hint || fail.message || "")
                return
            }

            const message = fail.message || "No se pudo ejecutar la acción"
            root.actionError = serviceName + ": " + message

            /* Con la contraseña rechazada el modal sigue abierto para reintentar. */
            if (fail.code === "SUDO_PASSWORD") {
                /* La guardada dejó de valer: que la próxima acción la pida de nuevo. */
                Sudo.clear(serverId)
            } else {
                actionModal.hide()
                Toasts.error("No se pudo ejecutar «" + action + "» en " + serviceName, message)
            }
        })
    }

    implicitHeight: layout.implicitHeight + 40

    /* ── Piezas ────────────────────────────────────────────────────── */
    /* Rejilla de tarjetas: una, dos o tres columnas según el ancho. */
    component CardGrid: Flow {
        id: grid
        property var items: []
        property bool pinnedCards: false
        readonly property int columns: Math.max(1, Math.min(3, Math.floor((width + 16) / 400)))
        readonly property real cardWidth: Math.floor((width - (columns - 1) * 16) / columns)

        Layout.fillWidth: true
        spacing: 16

        Repeater {
            model: grid.items
            ServiceCard {
                required property var modelData
                width: grid.cardWidth
                service: modelData
                pinned: grid.pinnedCards
                busy: root.cardBusy(modelData.name)
                running: root.cardRunning(modelData.name)
                onActionRequested: (serviceName, action) => root.runServiceAction(serviceName, action)
                onPinToggled: serviceName => root.togglePin(serviceName)
                onLogsRequested: serviceName => logsModal.show(serviceName)
            }
        }
    }

    component SectionLabel: Label {
        Layout.fillWidth: true
        tone: 0.55
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
    }

    ColumnLayout {
        id: layout
        x: 20; y: 20
        width: parent.width - 40
        spacing: 0

        /* ── Cabecera: recuento, filtro y botones ──────────────────── */
        GridLayout {
            id: head
            readonly property bool wide: layout.width >= 720
            Layout.fillWidth: true
            Layout.bottomMargin: 20
            columns: wide ? 2 : 1
            columnSpacing: 12
            rowSpacing: 12

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8
                    Label {
                        text: "Servicios systemd"
                        font.pixelSize: Theme.textBase
                        font.weight: Font.DemiBold
                    }
                    /* El original no avisa de la carga; aquí basta un indicador discreto. */
                    Spinner { visible: root.loading && root.detail === null; size: 14; color: Theme.ink(0.45) }
                    Item { Layout.fillWidth: true }
                }
                Label {
                    Layout.fillWidth: true
                    text: root.services.length > 0
                        ? root.activeCount + " activos · " + root.failedCount + " fallidos · " + root.services.length + " en total"
                        : "Sin inventario del agente"
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
            }

            Flow {
                id: tools
                /* En ancho, la fila mide lo que suman sus piezas; un Flow sin
                   ancho se queda en el de la pieza más ancha y las apila. */
                readonly property real rowWidth: {
                    let total = 0
                    for (let i = 0; i < children.length; i++)
                        if (children[i].visible) total += children[i].width + spacing
                    return Math.max(0, total - spacing)
                }
                Layout.fillWidth: !head.wide
                Layout.preferredWidth: head.wide ? rowWidth : -1
                Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                spacing: 8

                GlassField {
                    width: Math.min(200, layout.width)
                    implicitHeight: 36
                    placeholder: "Filtrar servicios…"
                    onTextChanged: root.serviceFilter = text
                }

                Item {
                    id: activeToggle
                    width: activeLabel.implicitWidth + 28
                    height: 36
                    Accessible.role: Accessible.CheckBox
                    Accessible.name: activeLabel.text
                    Accessible.checked: root.onlyActive

                    Glass {
                        anchors.fill: parent
                        visible: !root.onlyActive
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        highlighted: activeHover.hovered
                    }
                    BrandFill { anchors.fill: parent; visible: root.onlyActive; strength: 0.28 }
                    Rectangle {
                        anchors.fill: parent
                        visible: root.onlyActive
                        radius: Theme.radiusXl
                        color: "transparent"
                        border.width: 1
                        border.color: Theme.hairline
                    }
                    Label {
                        id: activeLabel
                        anchors.centerIn: parent
                        text: "Solo activos"
                        tone: root.onlyActive || activeHover.hovered ? 1 : 0.6
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Medium
                    }
                    HoverHandler { id: activeHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.onlyActive = !root.onlyActive }
                }

                PrimaryButton {
                    id: installButton
                    implicitHeight: 36
                    implicitWidth: installRow.implicitWidth + 28
                    text: "Nuevo Servicio"
                    onClicked: root.installRequested()
                    contentItem: Item {
                        Row {
                            id: installRow
                            anchors.centerIn: parent
                            spacing: 8
                            Icon { anchors.verticalCenter: parent.verticalCenter; name: "plus"; color: Theme.onBrand }
                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: installButton.text
                                color: Theme.onBrand
                                font.weight: Font.Medium
                            }
                        }
                    }
                }
            }
        }

        /* ── Error de la última acción ─────────────────────────────── */
        Glass {
            visible: root.actionError !== ""
            Layout.fillWidth: true
            Layout.bottomMargin: 16
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            implicitHeight: actionErrorLabel.implicitHeight + 24
            Label {
                id: actionErrorLabel
                x: 12; y: 12
                width: parent.width - 24
                text: root.actionError
                color: Theme.tone("rose").text
                wrapMode: Text.Wrap
                elide: Text.ElideNone
            }
        }

        /* ── Sin inventario ────────────────────────────────────────── */
        Item {
            id: empty
            visible: root.services.length === 0
            Layout.fillWidth: true
            implicitHeight: emptyText.implicitHeight + 80

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
                        width: empty.width - 1
                        height: empty.height - 1
                        radius: Theme.radiusXl
                    }
                }
            }
            Column {
                id: emptyText
                anchors.centerIn: parent
                width: parent.width - 32
                spacing: 4
                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: "Sin servicios reportados"
                    tone: 0.55
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: "El agente envía el inventario de systemd cada pocos minutos."
                    tone: 0.35
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }

        /* ── Fijados ───────────────────────────────────────────────── */
        SectionLabel {
            visible: root.pinnedServices.length > 0
            Layout.bottomMargin: 12
            text: "Fijados · " + root.pinnedServices.length
        }
        CardGrid {
            visible: root.pinnedServices.length > 0
            Layout.bottomMargin: 24
            items: root.pinnedServices
            pinnedCards: true
        }

        /* ── Resto del inventario ──────────────────────────────────── */
        SectionLabel {
            visible: root.pinnedServices.length > 0 && root.visibleServices.length > 0
            Layout.bottomMargin: 12
            text: "Resto del inventario"
        }
        CardGrid {
            visible: root.visibleServices.length > 0
            items: root.visibleServices
        }

        Label {
            visible: root.services.length > root.shownCount
            Layout.fillWidth: true
            Layout.topMargin: 16
            horizontalAlignment: Text.AlignHCenter
            text: "Mostrando " + root.shownCount + " de " + root.services.length
                + ". Fija los que uses a diario o afina el filtro para ver el resto."
            tone: 0.35
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── Modales ───────────────────────────────────────────────────── */
    ServiceActionModal {
        id: actionModal
        error: root.actionError
        pending: root.actionPending
        /* Sin contraseña escrita (fase de confirmación) va la ya validada. */
        onConfirmed: password => root.execute(actionModal.serviceName, actionModal.action, password || Sudo.get(root.server.id))
        onDismissed: root.actionError = ""
    }

    ServiceLogsModal {
        id: logsModal
        server: root.server
    }
}
