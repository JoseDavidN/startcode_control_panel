import QtQuick
import QtQuick.Shapes
import StartCode

/* Contenedores Docker en ejecución. Se leen por SSH al abrir la pestaña (no
   los manda el agente), así que la lista es una foto: se vuelve a leer con
   Actualizar. No trae desplazamiento propio: la página ya desplaza. */
Glass {
    id: root

    /* `{ id, name, host, os, status }` */
    property var server
    /* Estado de docker.service según el inventario. Vacío: se busca en los
       datos en vivo y, si no han llegado, en el último inventario guardado. */
    property string dockerState: ""

    /* ── Estado de la unidad ───────────────────────────────────────── */
    property var fetchedUnits: null
    property bool unitsSettled: false
    readonly property var liveEntry: { Realtime.revision; return server ? Realtime.live(server.id) : null }

    function unitName(name) { return String(name || "").replace(/\.service$/, "") }
    function stateIn(list) {
        const found = list ? Array.from(list).find(s => unitName(s.name) === "docker") : null
        return found ? String(found.state || "") : ""
    }
    readonly property string inventoryState: {
        const live = liveEntry ? liveEntry.services : null
        return (live ? stateIn(live.list || live) : "") || stateIn(fetchedUnits)
    }
    /* Si el inventario no dice nada, se intenta leer igualmente: el backend
       responde con el motivo exacto. */
    readonly property string daemonState: dockerState !== "" ? dockerState
                                        : inventoryState !== "" ? inventoryState
                                        : unitsSettled ? "active" : ""
    readonly property bool stateKnown: daemonState !== ""
    readonly property bool daemonUp: daemonState === "active"

    /* ── Lectura ───────────────────────────────────────────────────── */
    property var result: null       // { containers, readAt }
    property var apiError: null     // { message, code, hint, status }
    property bool fetching: false
    property string filter: ""
    property bool ready: false
    property int ticket: 0
    /* Refresca el «leído hace…» sin volver a pedir nada. */
    property int tick: 0

    readonly property bool loading: !stateKnown || (fetching && result === null)
    readonly property bool needsSudo: apiError !== null
                                      && (apiError.code === "SUDO_REQUIRED" || apiError.code === "SUDO_PASSWORD")
    readonly property string sudoReason: !apiError ? ""
        : apiError.code === "SUDO_PASSWORD" ? (apiError.message || "")
        : (apiError.hint || "El usuario SSH no está en el grupo docker y sudo pide contraseña.")

    readonly property var allContainers: result && result.containers ? Array.from(result.containers) : []
    readonly property var containers: {
        const term = filter.trim().toLowerCase()
        return allContainers
            .filter(c => !term
                || String(c.name || "").toLowerCase().includes(term)
                || String(c.image || "").toLowerCase().includes(term)
                || String(c.composeProject || "").toLowerCase().includes(term))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }

    /* `password` solo llega desde el modal; si no, vale la que ya se
       aceptó en este servidor durante la sesión. */
    function load(password) {
        if (!server || !daemonUp) return
        const pw = password || Sudo.get(server.id)
        const mine = ++ticket
        fetching = true
        Api.request("POST", "/agent-data/servers/" + server.id + "/docker/containers",
                    pw ? { sudoPassword: pw } : {}, (ok, data, error) => {
            if (mine !== root.ticket) return
            root.fetching = false
            if (ok) {
                root.result = data
                root.apiError = null
                if (pw) Sudo.set(root.server.id, pw)
                sudoModal.close()
                return
            }
            root.apiError = error || ({})
            /* Una contraseña rechazada no se vuelve a mandar. */
            if (root.apiError.code === "SUDO_PASSWORD") Sudo.clear(root.server.id)
            if (root.needsSudo) {
                if (sudoModal.opened) { sudoField.text = ""; sudoField.forceFocus() }
                else sudoModal.open()
            } else {
                sudoModal.close()
            }
        }, 45000)
    }
    function submitSudo() {
        if (sudoField.text === "" || fetching) return
        load(sudoField.text)
    }

    /* "Up 6 days (healthy)" → healthy / unhealthy / starting; sin
       healthcheck, solo el estado del contenedor. */
    function healthOf(c) {
        const match = /\((healthy|unhealthy|health: starting)\)/.exec(String(c.status || ""))
        if (match && match[1] === "unhealthy") return { label: "unhealthy", tone: "rose" }
        if (match && match[1] === "health: starting") return { label: "starting", tone: "amber" }
        if (match && match[1] === "healthy") return { label: "healthy", tone: "emerald" }
        return { label: String(c.state || ""), tone: "emerald" }
    }

    Component.onCompleted: {
        ready = true
        if (dockerState === "" && inventoryState === "" && server) {
            Api.request("GET", "/agent-data/servers/" + server.id + "/latest", null, (ok, data) => {
                if (ok && data && data.services) root.fetchedUnits = data.services.list || []
                root.unitsSettled = true
            })
        }
        if (daemonUp && visible) load()
    }
    /* Entrar a la pestaña siempre lee de nuevo; dentro, nada automático. */
    onDaemonUpChanged: if (ready && daemonUp && visible) load()
    onVisibleChanged: if (ready && visible && daemonUp && !fetching) load()

    Timer { interval: 30000; repeat: true; running: root.visible && root.result !== null; onTriggered: root.tick++ }

    implicitHeight: column.implicitHeight + 40

    /* ── Piezas ────────────────────────────────────────────────────── */
    component DashedBox: Item {
        id: dashed
        property string title
        property string detail: ""
        property real titleTone: 0.55
        width: parent ? parent.width : 0
        implicitHeight: dashedColumn.implicitHeight + 80
        Shape {
            anchors.fill: parent
            ShapePath {
                strokeColor: Theme.edgeDashed
                strokeWidth: 1
                fillColor: "transparent"
                strokeStyle: ShapePath.DashLine
                dashPattern: [4, 3]
                PathRectangle {
                    x: 0.5; y: 0.5
                    width: Math.max(0, dashed.width - 1)
                    height: Math.max(0, dashed.height - 1)
                    radius: Theme.radiusXl
                }
            }
        }
        Column {
            id: dashedColumn
            anchors.centerIn: parent
            width: parent.width - 32
            spacing: 4
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: dashed.title
                tone: dashed.titleTone
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                visible: dashed.detail !== ""
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: dashed.detail
                tone: 0.35
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    component Detail: Column {
        id: detail
        property string label
        property string value: "—"
        /* 0 = sin límite de líneas. */
        property int maxLines: 0
        property string tip: ""
        spacing: 2
        Label {
            width: parent.width
            text: detail.label
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
        Label {
            width: parent.width
            text: detail.value
            mono: true
            tone: 0.75
            font.pixelSize: Theme.textXs
            wrapMode: Text.WrapAnywhere
            elide: detail.maxLines > 0 ? Text.ElideRight : Text.ElideNone
            maximumLineCount: detail.maxLines > 0 ? detail.maxLines : 1000
            HoverTip { text: detail.tip }
        }
    }

    component Bar: Column {
        id: bar
        property string label
        property real value: 0
        property string detail: value.toFixed(1) + "%"
        readonly property var tones: Format.barTones(value)
        spacing: 4
        Item {
            width: parent.width
            height: barValue.implicitHeight
            Label {
                anchors.left: parent.left
                anchors.right: barValue.left
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                text: bar.label
                tone: 0.4
                font.pixelSize: Theme.textCaption
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
            }
            Label {
                id: barValue
                anchors.right: parent.right
                width: Math.min(implicitWidth, parent.width * 0.75)
                text: bar.detail
                mono: true
                tone: 0.75
                font.pixelSize: Theme.textXs
            }
        }
        Rectangle {
            width: parent.width
            height: 4
            radius: 2
            color: Theme.track
            Rectangle {
                width: parent.width * Math.max(0, Math.min(100, bar.value)) / 100
                height: parent.height
                radius: 2
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Theme.tone(bar.tones[0]).base }
                    GradientStop { position: 1; color: Theme.tone(bar.tones[1]).base }
                }
                Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 700; easing.type: Easing.OutCubic } }
            }
        }
    }

    component ContainerCard: Glass {
        id: card
        required property var modelData
        readonly property var c: modelData
        readonly property var health: root.healthOf(c)
        readonly property real inner: Math.max(0, width - 32)
        /* En estrecho, el identificador y el estado bajan a su propia línea. */
        readonly property bool wide: inner >= 520
        readonly property int detailColumns: inner >= 860 ? 4 : inner >= 440 ? 2 : 1
        readonly property real detailWidth: (inner - 16 * (detailColumns - 1)) / detailColumns

        variant: "soft"
        elevation: "raised"
        radius: Theme.radiusXl
        width: parent ? parent.width : 0
        implicitHeight: cardColumn.implicitHeight + 32

        Column {
            id: cardColumn
            x: 16; y: 16
            width: card.inner
            spacing: 0

            Item {
                width: parent.width
                height: card.wide ? Math.max(identity.height, side.height) : identity.height + 8 + side.height

                Column {
                    id: identity
                    width: card.wide ? parent.width - side.width - 12 : parent.width
                    spacing: 4
                    Flow {
                        id: nameFlow
                        width: parent.width
                        spacing: 8
                        Label {
                            width: Math.min(implicitWidth, nameFlow.width)
                            height: 18
                            verticalAlignment: Text.AlignVCenter
                            text: card.c.name || ""
                            font.weight: Font.DemiBold
                        }
                        Badge { text: card.health.label; tone: card.health.tone }
                        Rectangle {
                            visible: !!card.c.composeProject
                            width: Math.min(composeLabel.implicitWidth + 12, nameFlow.width)
                            height: 18
                            radius: Theme.radiusMd
                            color: Theme.tintActive
                            border.width: 1
                            border.color: Theme.hairline
                            Label {
                                id: composeLabel
                                anchors.centerIn: parent
                                width: parent.width - 12
                                horizontalAlignment: Text.AlignHCenter
                                text: (card.c.composeProject || "") + (card.c.composeService ? " · " + card.c.composeService : "")
                                mono: true
                                tone: 0.6
                                font.pixelSize: Theme.textCaption
                            }
                            HoverTip { text: "Proyecto · servicio de docker compose" }
                        }
                    }
                    Item {
                        width: parent.width
                        height: imageLabel.implicitHeight
                        Label {
                            id: imageLabel
                            width: parent.width
                            text: card.c.image || ""
                            mono: true
                            tone: 0.55
                            font.pixelSize: Theme.textXs
                        }
                        HoverTip { text: card.c.image || "" }
                    }
                }

                Column {
                    id: side
                    readonly property real limit: card.wide ? card.inner * 0.45 : card.inner
                    x: card.wide ? parent.width - width : 0
                    y: card.wide ? 0 : identity.height + 8
                    width: Math.min(limit, Math.max(idLabel.implicitWidth, statusLabel.implicitWidth))
                    spacing: 2
                    Label {
                        id: idLabel
                        width: parent.width
                        horizontalAlignment: card.wide ? Text.AlignRight : Text.AlignLeft
                        text: card.c.id || ""
                        mono: true
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                    Label {
                        id: statusLabel
                        width: parent.width
                        horizontalAlignment: card.wide ? Text.AlignRight : Text.AlignLeft
                        text: card.c.status || ""
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                    }
                }
            }

            Item { width: 1; height: 12 }

            Grid {
                visible: !!card.c.stats
                width: parent.width
                columns: card.wide ? 2 : 1
                columnSpacing: 16
                rowSpacing: 16
                Bar {
                    width: (card.inner - 16 * (parent.columns - 1)) / parent.columns
                    label: "CPU"
                    value: card.c.stats ? Number(card.c.stats.cpuPercent) || 0 : 0
                }
                Bar {
                    width: (card.inner - 16 * (parent.columns - 1)) / parent.columns
                    label: "Memoria"
                    value: card.c.stats ? Number(card.c.stats.memPercent) || 0 : 0
                    detail: card.c.stats ? card.c.stats.memUsage + " · " + value.toFixed(1) + "%" : ""
                }
            }
            Label {
                visible: !card.c.stats
                width: parent.width
                text: "Sin estadísticas de consumo para este contenedor."
                tone: 0.4
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }

            Item { width: 1; height: 16 }

            Grid {
                width: parent.width
                columns: card.detailColumns
                columnSpacing: 16
                rowSpacing: 12
                Detail {
                    width: card.detailWidth
                    label: "Puertos"
                    value: card.c.ports && card.c.ports.length ? Array.from(card.c.ports).join("\n") : "—"
                }
                Detail {
                    width: card.detailWidth
                    label: "Redes"
                    value: card.c.networks && card.c.networks.length ? Array.from(card.c.networks).join(", ") : "—"
                }
                Detail {
                    width: card.detailWidth
                    label: "Volúmenes"
                    value: card.c.mounts && card.c.mounts.length ? Array.from(card.c.mounts).join("\n") : "—"
                }
                Detail { width: card.detailWidth; label: "Creado"; value: card.c.runningFor || card.c.createdAt || "—" }
                Detail { width: card.detailWidth; label: "Red I/O"; value: (card.c.stats && card.c.stats.netIO) || "—" }
                Detail { width: card.detailWidth; label: "Disco I/O"; value: (card.c.stats && card.c.stats.blockIO) || "—" }
                Detail { width: card.detailWidth; label: "PIDs"; value: card.c.stats ? String(card.c.stats.pids) : "—" }
                Detail {
                    width: card.detailWidth
                    label: "Comando"
                    value: card.c.command || "—"
                    maxLines: 2
                    tip: card.c.command || ""
                }
            }
        }
    }

    /* ── Contenido ─────────────────────────────────────────────────── */
    Column {
        id: column
        x: 20; y: 20
        width: parent.width - 40
        spacing: 20

        /* Cabecera: título a la izquierda y controles a la derecha; en
           estrecho los controles bajan y ocupan todo el ancho. */
        Item {
            id: header
            readonly property real controlsWidth: 200 + 8 + refresh.implicitWidth
            readonly property bool wide: width >= controlsWidth + 240
            width: parent.width
            height: wide ? Math.max(titles.height, controls.height) : titles.height + 12 + controls.height

            Column {
                id: titles
                width: header.wide ? parent.width - header.controlsWidth - 12 : parent.width
                anchors.verticalCenter: header.wide ? parent.verticalCenter : undefined
                spacing: 2
                Label {
                    width: parent.width
                    text: "Contenedores Docker"
                    font.pixelSize: Theme.textBase
                    font.weight: Font.DemiBold
                }
                Label {
                    width: parent.width
                    text: {
                        root.tick
                        if (root.result)
                            return root.allContainers.length + " en ejecución · leído " + Format.timeAgo(root.result.readAt)
                        return root.daemonUp || !root.stateKnown ? "Leyendo docker ps por SSH…"
                                                                 : "docker.service está " + root.daemonState
                    }
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
            }

            Row {
                id: controls
                x: header.wide ? parent.width - width : 0
                y: header.wide ? (parent.height - height) / 2 : titles.height + 12
                spacing: 8
                GlassField {
                    width: header.wide ? 200 : header.width - refresh.width - 8
                    implicitHeight: 36
                    placeholder: "Filtrar contenedores…"
                    onTextChanged: root.filter = text
                }
                SecondaryButton {
                    id: refresh
                    implicitHeight: 36
                    implicitWidth: refreshRow.implicitWidth + 28
                    text: root.fetching ? "Leyendo…" : "Actualizar"
                    enabled: !root.fetching && root.daemonUp
                    onClicked: root.load()
                    contentItem: Item {
                        Row {
                            id: refreshRow
                            anchors.centerIn: parent
                            spacing: 8
                            Spinner {
                                anchors.verticalCenter: parent.verticalCenter
                                visible: root.fetching
                                color: Theme.ink(0.75)
                            }
                            Icon {
                                anchors.verticalCenter: parent.verticalCenter
                                visible: !root.fetching
                                path: "M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
                                color: Theme.ink(0.75)
                            }
                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: refresh.text
                                tone: 0.75
                                font.pixelSize: Theme.textXs
                                font.weight: Font.Medium
                            }
                        }
                    }
                }
            }
        }

        /* Docker parado */
        DashedBox {
            visible: root.stateKnown && !root.daemonUp
            title: "El servicio de Docker no está activo"
            detail: "Inícialo desde el tab Servicios para ver sus contenedores."
        }

        /* Hace falta sudo: la contraseña se pide en un modal */
        Column {
            visible: root.daemonUp && root.needsSudo
            width: Math.min(parent.width, 448)
            spacing: 12
            Glass {
                variant: "soft"
                elevation: "raised"
                radius: Theme.radiusXl
                width: parent.width
                implicitHeight: sudoColumn.implicitHeight + 32
                Column {
                    id: sudoColumn
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 4
                    Label { width: parent.width; text: "Hace falta sudo"; font.weight: Font.DemiBold }
                    Label {
                        width: parent.width
                        text: root.sudoReason
                        tone: 0.6
                        font.pixelSize: Theme.textXs
                        lineHeight: 1.4
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }
            PrimaryButton {
                implicitHeight: 44
                text: root.fetching ? "Leyendo…" : "Continuar"
                enabled: !root.fetching
                onClicked: sudoModal.open()
            }
            Label {
                width: parent.width
                text: "Se usa solo para leer Docker mientras el detalle esté abierto y no se guarda."
                tone: 0.4
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        /* Error del servidor */
        Glass {
            visible: root.daemonUp && root.apiError !== null && !root.needsSudo
            variant: "soft"
            elevation: "raised"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            width: parent.width
            implicitHeight: errorColumn.implicitHeight + 32
            Column {
                id: errorColumn
                x: 16; y: 16
                width: parent.width - 32
                spacing: 4
                Label {
                    width: parent.width
                    text: (root.apiError && root.apiError.message) || "No se pudo leer Docker"
                    color: Theme.tone("rose").text
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    visible: text !== ""
                    width: parent.width
                    text: (root.apiError && root.apiError.hint) || ""
                    mono: true
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                }
            }
        }

        /* Primera lectura */
        DashedBox {
            visible: root.listState === "loading"
            title: "Leyendo contenedores del servidor…"
            titleTone: 0.45
        }

        /* Sin contenedores */
        DashedBox {
            visible: root.listState === "empty"
            title: root.filter ? "Ningún contenedor coincide con el filtro" : "No hay contenedores en ejecución"
        }

        Column {
            visible: root.listState === "list"
            width: parent.width
            spacing: 12
            Repeater {
                model: root.containers
                ContainerCard {}
            }
        }
    }

    /* Qué se pinta cuando Docker está activo y no hay error. */
    readonly property string listState: (stateKnown && !daemonUp) || apiError !== null ? ""
                                      : loading ? "loading"
                                      : containers.length === 0 ? "empty" : "list"

    /* ── Contraseña de sudo ────────────────────────────────────────── */
    Modal {
        id: sudoModal
        title: "Hace falta sudo"
        size: "sm"
        onOpened: { sudoField.text = ""; sudoField.forceFocus() }
        onClosed: sudoField.text = ""

        Label {
            width: parent ? parent.width : 0
            text: root.sudoReason
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        GlassField {
            id: sudoField
            width: parent ? parent.width : 0
            password: true
            placeholder: "Contraseña del usuario SSH"
            maximumLength: 256
            onAccepted: root.submitSudo()
        }
        Label {
            width: parent ? parent.width : 0
            text: "Se usa solo para leer Docker mientras el detalle esté abierto y no se guarda."
            tone: 0.4
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }

        footer: Row {
            spacing: 8
            SecondaryButton { text: "Cancelar"; onClicked: sudoModal.close() }
            PrimaryButton {
                text: root.fetching ? "Leyendo…" : "Continuar"
                enabled: sudoField.text !== "" && !root.fetching
                onClicked: root.submitSudo()
            }
        }
    }
}
