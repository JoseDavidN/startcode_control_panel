import QtQuick
import QtQuick.Templates as T
import StartCode

/* Estado del agente StartCode en la máquina y acciones para instalarlo,
   reinstalarlo, regenerar su token o quitarlo. Carga su propio estado
   (`GET /servers/:id/agent`) y lleva sus modales dentro.

       AgentCard { Layout.fillWidth: true; server: root.server; onChanged: recargar() } */
Glass {
    id: root

    /* `{ id, name, host, os, status }` */
    property var server: null
    /* Estado del agente tal como lo da el backend; null hasta la primera carga. */
    property var agent: null
    property bool loading: false

    /* El agente cambió (instalado, desinstalado, token): el detalle debe recargar. */
    signal changed()

    readonly property string serverId: server ? String(server.id || "") : ""
    readonly property string agentState: agent && agent.state ? agent.state : "not_installed"
    readonly property bool installed: agentState === "installed"
    readonly property bool busy: installModal.busy || uninstallModal.busy || tokenModal.busy

    readonly property var badges: ({
        installed: ["Instalado", "emerald"],
        installing: ["Instalando", "amber"],
        uninstalling: ["Quitando", "amber"],
        failed: ["Error", "rose"],
        not_installed: ["Sin instalar", ""]
    })
    readonly property var badge: badges[agentState] || badges.not_installed

    readonly property string subline: {
        const a = agent
        if (!a || !a.version) return "Sin agente: este servidor no reporta métricas"
        let text = String(a.version)
        if (a.arch) text += " · " + a.arch
        if (a.installedAt) text += " · instalado " + Format.timeAgo(a.installedAt)
        if (a.tokenRotating) text += " · rotando token"
        else if (a.tokenIssuedAt) text += " · token " + Format.timeAgo(a.tokenIssuedAt)
        return text
    }

    readonly property bool legacyToken: installed && !!(agent && agent.tokenLegacyUntil)
    readonly property bool showError: agentState === "failed" && !!(agent && agent.lastError)
    readonly property string errorDetail: showError && agent.lastError.detail ? String(agent.lastError.detail) : ""
    property bool errorDetailOpen: false

    /* Los botones caben a la derecha solo si queda sitio para el nombre. */
    readonly property real actionsWidth: installButton.implicitWidth
                                         + (tokenButton.visible ? tokenButton.implicitWidth + 8 : 0)
                                         + (uninstallButton.visible ? uninstallButton.implicitWidth + 8 : 0)
    readonly property bool wide: body.width >= actionsWidth + 16 + 260

    property int loadId: 0

    variant: "soft"
    elevation: "flat"
    radius: Theme.radiusXl
    implicitHeight: body.implicitHeight + 32

    function load() {
        if (!serverId) return
        const id = serverId
        const run = ++loadId
        loading = agent === null
        Api.request("GET", "/servers/" + id + "/agent", null, (ok, data) => {
            if (run !== root.loadId || id !== root.serverId) return
            root.loading = false
            if (ok && data) root.agent = data
        })
    }

    /* Tras una operación: se relee el estado y se avisa al detalle. */
    function settle() {
        load()
        changed()
    }

    function longDate(iso) {
        const ms = Date.parse(iso)
        if (isNaN(ms)) return "—"
        return new Date(ms).toLocaleDateString(Qt.locale("es_ES"), "d 'de' MMMM 'de' yyyy")
    }

    Component.onCompleted: load()
    onServerIdChanged: {
        agent = null
        errorDetailOpen = false
        load()
    }

    /* El agente confirmó un token rotado: cambia la sublínea. */
    Connections {
        target: Realtime
        function onEvent(name, payload) {
            if (name !== "agent:token:rotated" || !payload || !root.serverId) return
            if (payload.serverId === root.serverId) root.load()
        }
    }

    /* Botón de la tarjeta: cristal suave de 36 de alto, con tinta propia. */
    component CardButton: T.Button {
        id: cardButton
        property color textColor: Theme.ink(0.85)
        property string hint: ""

        implicitHeight: 36
        implicitWidth: cardButtonLabel.implicitWidth + 28
        hoverEnabled: true
        opacity: enabled ? 1 : 0.5
        scale: down ? 0.98 : 1
        Accessible.name: hint !== "" ? hint : text
        Behavior on scale { NumberAnimation { duration: Theme.moFast } }

        background: Glass {
            variant: "soft"
            radius: Theme.radiusXl
            highlighted: cardButton.hovered
            borderColor: cardButton.visualFocus ? Theme.focusRing
                       : cardButton.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        contentItem: Item {
            Label {
                id: cardButtonLabel
                anchors.centerIn: parent
                text: cardButton.text
                color: cardButton.textColor
                font.weight: Font.Medium
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        HoverTip { text: cardButton.hint }
    }

    Column {
        id: body
        x: 16; y: 16
        width: parent.width - 32
        spacing: 16

        /* Identidad y acciones: en fila si caben, apiladas si no. */
        Item {
            width: parent.width
            height: root.wide ? Math.max(info.height, actions.height)
                              : info.height + 12 + actions.height

            Row {
                id: info
                width: root.wide ? parent.width - actions.width - 16 : parent.width
                height: 36
                y: root.wide ? (parent.height - height) / 2 : 0
                spacing: 12

                Rectangle {
                    width: 36; height: 36
                    radius: Theme.radiusLg
                    color: Theme.tintSunken
                    border.width: 1
                    border.color: Theme.hairline
                    Icon { anchors.centerIn: parent; name: "cpu"; color: Theme.brandLight1 }
                }
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 48
                    spacing: 2
                    Row {
                        width: parent.width
                        spacing: 8
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.min(implicitWidth, parent.width - stateBadge.width - 8)
                            text: "Agente StartCode"
                            font.weight: Font.DemiBold
                        }
                        Badge {
                            id: stateBadge
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.loading ? "…" : root.badge[0]
                            tone: root.loading ? "" : root.badge[1]
                        }
                    }
                    Label {
                        width: parent.width
                        text: root.subline
                        mono: true
                        tone: 0.45
                        font.pixelSize: Theme.textXs
                    }
                }
            }

            Flow {
                id: actions
                width: root.wide ? root.actionsWidth : parent.width
                x: root.wide ? parent.width - width : 0
                y: root.wide ? (parent.height - height) / 2 : info.height + 12
                spacing: 8

                CardButton {
                    id: installButton
                    text: root.installed ? "Reinstalar" : "Instalar agente"
                    enabled: !root.busy
                    onClicked: installModal.open()
                }
                CardButton {
                    id: tokenButton
                    visible: root.installed
                    text: "Regenerar token"
                    hint: "Regenerar token del agente"
                    enabled: !root.busy
                    onClicked: tokenModal.open()
                }
                CardButton {
                    id: uninstallButton
                    visible: root.installed
                    text: "Desinstalar"
                    textColor: Theme.tone("rose").text
                    enabled: !root.busy
                    onClicked: uninstallModal.open()
                }
            }
        }

        /* Token heredado: caduca si no se reinstala. */
        Glass {
            visible: root.legacyToken
            width: parent.width
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.warn, 0.2)
            implicitHeight: legacyText.implicitHeight + 24
            Label {
                id: legacyText
                x: 12; y: 12
                width: parent.width - 24
                text: root.legacyToken
                      ? "Este agente es anterior a 2.2.0 y usa un token sin rotación, que deja de valer el "
                        + root.longDate(root.agent.tokenLegacyUntil) + ". Reinstálalo para pasar al token nuevo."
                      : ""
                color: Qt.alpha(Theme.tone("amber").text, 0.8)
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        /* Último intento fallido */
        Glass {
            visible: root.showError
            width: parent.width
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            implicitHeight: errorColumn.implicitHeight + 24
            Column {
                id: errorColumn
                x: 12; y: 12
                width: parent.width - 24
                spacing: 6
                Label {
                    width: parent.width
                    text: root.showError ? String(root.agent.lastError.message || "") : ""
                    color: Qt.alpha(Theme.tone("rose").text, 0.8)
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    visible: root.errorDetail !== ""
                    text: "Ver detalle"
                    tone: errorDetailHover.hovered ? 0.7 : 0.45
                    font.pixelSize: 11
                    Accessible.role: Accessible.Button
                    Accessible.name: text
                    HoverHandler { id: errorDetailHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.errorDetailOpen = !root.errorDetailOpen }
                }
                ScrollArea {
                    visible: root.errorDetail !== "" && root.errorDetailOpen
                    width: parent.width
                    height: Math.min(128, errorDetailText.implicitHeight)
                    contentHeight: errorDetailText.implicitHeight
                    Label {
                        id: errorDetailText
                        width: parent.width
                        text: root.errorDetail
                        mono: true
                        tone: 0.55
                        font.pixelSize: 11
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                }
            }
        }
    }

    /* ── Modales ───────────────────────────────────────────────────── */
    /* La contraseña escrita en uno vale para el otro mientras viva la tarjeta. */
    AgentInstallModal {
        id: installModal
        server: root.server
        onSudoPasswordChanged: if (uninstallModal.sudoPassword !== sudoPassword) uninstallModal.sudoPassword = sudoPassword
        onSettled: root.settle()
    }
    AgentUninstallModal {
        id: uninstallModal
        server: root.server
        onSudoPasswordChanged: if (installModal.sudoPassword !== sudoPassword) installModal.sudoPassword = sudoPassword
        onSettled: root.settle()
    }
    AgentTokenModal {
        id: tokenModal
        server: root.server
        onSettled: root.settle()
        /* Sin agente conectado el token quedó revocado: el siguiente paso es reinstalar. */
        onReinstallRequested: installModal.open()
    }
}
