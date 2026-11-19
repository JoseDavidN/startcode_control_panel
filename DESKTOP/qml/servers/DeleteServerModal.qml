import QtQuick
import StartCode

/* Borrar un servidor desinstala su agente y arrastra métricas y
   notificaciones por la cascada de la base de datos, así que va en dos pasos:
   primero se confirma escribiendo el nombre —es irreversible y no debe salir
   de un clic accidental en la tarjeta— y después se pide la contraseña de
   sudo, que es lo que hace falta para entrar en la máquina y quitar el servicio.

   `server` es el elemento de GET /servers. `deleted(serverId)` al terminar. */
Modal {
    id: root

    property var server: null

    signal deleted(string serverId)

    title: "Eliminar servidor"
    size: "sm"
    /* Mientras se desinstala el agente no se cierra. */
    dismissable: !busy

    /* ── Estado ────────────────────────────────────────────────────── */
    /* 'confirm' | 'sudo' */
    property string phase: "confirm"
    property bool busy: false
    property string error: ""
    /* `{ code, message, detail? }` del 409: el agente no se pudo desinstalar. */
    property var agentError: null
    property bool force: false

    readonly property string serverName: server && server.name ? server.name : ""
    readonly property bool matches: !!server && confirmField.text.trim() === serverName
    readonly property string agentState: server && server.metadata && server.metadata.agent && server.metadata.agent.state
                                         ? server.metadata.agent.state : ""
    /* Estados del agente en los que hay algo que desinstalar antes de borrar. */
    readonly property bool hasAgent: ["installed", "failed", "installing"].includes(agentState)
    readonly property bool canProceed: matches && !busy && !(agentError !== null && !force)

    ServerForms { id: logic }

    /* Cada apertura empieza de cero: no se arrastra la confirmación de otro servidor. */
    function reset() {
        root.phase = "confirm"
        root.busy = false
        root.error = ""
        root.agentError = null
        root.force = false
        confirmField.text = ""
        sudoField.text = ""
    }
    onAboutToShow: reset()
    /* La casilla pierde su enlace al pulsarla: se sincroniza a mano. */
    onForceChanged: if (forceBox.checked !== force) forceBox.checked = force
    onOpened: confirmField.forceFocus()
    onPhaseChanged: {
        if (!visible) return
        if (phase === "sudo") sudoField.forceFocus()
        else confirmField.forceFocus()
    }

    function handleDelete() {
        if (!root.canProceed) return
        root.error = ""

        const id = root.server.id
        const name = root.serverName
        const body = { force: root.force }
        if (sudoField.text !== "") body.sudoPassword = sudoField.text

        root.busy = true
        Api.request("DELETE", "/servers/" + id, body, (ok, data, failure) => {
            root.busy = false
            if (ok) {
                Toasts.success("Servidor eliminado", data && data.warning ? data.warning : name)
                root.deleted(id)
                root.close()
                return
            }

            /* 409: el agente no se pudo desinstalar y el servidor sigue ahí. Se
               ofrece forzar, pero a conciencia: hay que marcar la casilla. */
            if (failure && failure.status === 409) {
                const response = failure.data || {}
                /* Nest puede envolver el objeto del ConflictException en `message`. */
                const nested = response.message && typeof response.message === "object"
                             ? response.message.agentError : undefined
                root.agentError = nested || response.agentError
                                  || { code: "UNKNOWN", message: "No se pudo desinstalar el agente" }
                return
            }

            root.error = (failure && failure.message) || "No se pudo eliminar el servidor"
        }, 180000)
    }

    /* Sin agente que quitar no hay nada que preguntar: se borra directo. */
    function next() {
        if (!root.matches || root.busy) return
        if (root.hasAgent) root.phase = "sudo"
        else handleDelete()
    }

    footer: Row {
        spacing: 12
        SecondaryButton {
            text: root.phase === "sudo" ? "Atrás" : "Cancelar"
            enabled: !root.busy
            onClicked: {
                if (root.phase === "sudo") root.phase = "confirm"
                else root.close()
            }
        }
        DangerButton {
            text: root.busy ? (root.hasAgent ? "Desinstalando agente…" : "Eliminando…")
                : root.force ? "Eliminar de todos modos"
                : root.phase === "confirm" && root.hasAgent ? "Continuar"
                : "Eliminar servidor"
            loading: root.busy
            enabled: root.canProceed
            onClicked: {
                if (root.phase === "confirm") root.next()
                else root.handleDelete()
            }
        }
    }

    /* ── 1. Confirmar con el nombre ────────────────────────────────── */
    ServerNotice {
        visible: root.phase === "confirm"
        width: root.bodyWidth
        accent: Theme.danger
        edge: 0.25
        iconName: "alert"
        iconColor: Theme.tone("rose").text

        Label {
            width: parent.width
            text: "Esta acción no se puede deshacer"
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            text: root.hasAgent
                  ? "Se desinstalará el agente de la máquina y se eliminarán su historial de métricas y sus notificaciones."
                  : "Se eliminarán su historial de métricas y sus notificaciones."
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    ServerField {
        visible: root.phase === "confirm"
        width: root.bodyWidth
        rich: true
        label: "Escribe " + logic.mono(root.serverName, 0.8) + " para confirmar"
        GlassField {
            id: confirmField
            width: parent.width
            placeholder: root.serverName
            onAccepted: root.next()
        }
    }

    /* ── 2. Contraseña de sudo para desinstalar el agente ──────────── */
    ServerNotice {
        visible: root.phase === "sudo"
        width: root.bodyWidth
        accent: Theme.ink(1)
        edge: 0
        borderColor: Theme.hairlineSoft

        Label {
            width: parent.width
            text: "Desinstalar el agente de " + (root.server && root.server.host ? root.server.host : "")
            font.weight: Font.DemiBold
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            textFormat: Text.RichText
            text: "El panel entrará por SSH como "
                  + logic.mono(root.server && root.server.username ? root.server.username : "", 0.75)
                  + " para parar el servicio y borrar el agente. Si ese usuario no es root, hace falta su contraseña de sudo."
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    ServerField {
        visible: root.phase === "sudo"
        width: root.bodyWidth
        rich: true
        label: "Contraseña de sudo <span style=\"color:" + Theme.ink(0.35) + "\">(opcional)</span>"
        GlassField {
            id: sudoField
            width: parent.width
            password: true
            maximumLength: 256
            placeholder: "Vacío si el usuario es root"
            onAccepted: root.handleDelete()
        }
        Label {
            width: parent.width
            text: "Se usa solo para esta operación y no se guarda."
            tone: 0.4
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── El agente no se pudo desinstalar: se ofrece forzar ────────── */
    ServerNotice {
        visible: root.agentError !== null
        width: root.bodyWidth
        accent: Theme.danger
        spacing: 12

        Column {
            width: parent.width
            spacing: 4
            Label {
                width: parent.width
                text: "No se pudo desinstalar el agente"
                color: Theme.tone("rose").text
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                width: parent.width
                text: root.agentError && root.agentError.message ? root.agentError.message : ""
                color: Qt.alpha(Theme.tone("rose").text, 0.85)
                font.pixelSize: Theme.textXs
                lineHeight: 1.4
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Item { width: 1; height: 4; visible: errorDetail.visible }
            ServerErrorDetail {
                id: errorDetail
                width: parent.width
                detail: root.agentError && root.agentError.detail ? root.agentError.detail : ""
                maxHeight: 128
            }
        }

        Item {
            width: parent.width
            height: Math.max(20, forceLabel.implicitHeight)
            CheckBox {
                id: forceBox
                y: 1
                enabled: !root.busy
                /* La etiqueta de al lado también conmuta: la casilla sigue al estado. */
                checked: root.force
                Accessible.name: "Eliminar de todos modos"
                onToggled: root.force = checked
            }
            Label {
                id: forceLabel
                x: 26
                width: parent.width - 26
                text: "Eliminar de todos modos. El agente seguirá instalado en la máquina y habrá que quitarlo a mano."
                tone: 0.7
                font.pixelSize: Theme.textXs
                lineHeight: 1.4
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            /* La etiqueta también conmuta la casilla, como un <label>. */
            MouseArea {
                x: 26
                width: parent.width - 26
                height: parent.height
                cursorShape: Qt.PointingHandCursor
                onClicked: if (!root.busy) root.force = !root.force
            }
        }
    }

    ServerNotice {
        visible: root.error !== ""
        width: root.bodyWidth
        pad: 12
        accent: Theme.danger
        Label {
            width: parent.width
            text: root.error
            color: Theme.tone("rose").text
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }
}
