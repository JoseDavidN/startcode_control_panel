import QtQuick
import StartCode

/* Cierra un proceso del servidor con SIGTERM. Mismas dos fases que
   `ServiceActionModal`: confirmar el cierre y, si el proceso es de otro
   usuario y sudo pide contraseña, pedirla. Lleva dentro toda la lógica:

       ProcessKillModal {
           id: killModal
           server: root.server
           onKilled: pid => …      // ocultar el proceso de la lista
           onSettled: …            // volver a pedir el detalle
       }
       killModal.show(proc, etiqueta)

   La contraseña validada se guarda en `Sudo`, compartida con las acciones de
   servicio del mismo servidor. */
Modal {
    id: root

    /* Servidor del detalle: `{ id, name, host, os, status }`. */
    property var server: ({})

    /* El proceso debe ocultarse ya: terminó, o ya no existía. */
    signal killed(int pid)
    /* La petición terminó, bien o mal: conviene volver a pedir el detalle. */
    signal settled()

    /* Elemento de `processes.topList`: `{ pid, name, cpu, mem, memRss, user, command }`. */
    property var proc: null
    property string label: ""
    /* confirm | sudo */
    property string phase: "confirm"
    /* Texto del backend que explica por qué hace falta sudo. */
    property string hint: ""
    property string error: ""
    property bool pending: false

    readonly property int pid: proc ? Number(proc.pid) || 0 : 0
    readonly property string command: proc ? String(proc.command || "") : ""
    readonly property bool canSubmit: !pending && (phase !== "sudo" || passwordField.text !== "")

    function show(process, name) {
        if (pending) return
        proc = process
        label = name
        phase = "confirm"
        hint = ""
        error = ""
        passwordField.text = ""
        open()
    }

    function submit() {
        if (!canSubmit || !proc) return
        /* Sin contraseña escrita se reusa la ya validada en este servidor. */
        execute(proc, label, (phase === "sudo" ? passwordField.text : "") || Sudo.get(server.id))
    }

    function execute(process, name, password) {
        const serverId = server.id
        const target = Number(process.pid)
        error = ""
        pending = true

        Api.request("POST", "/agent-data/servers/" + serverId + "/processes/" + target + "/kill",
                    password ? { sudoPassword: password } : {}, (ok, data, failure) => {
            root.pending = false
            root.settled()

            if (ok) {
                const result = data || {}
                if (password) Sudo.set(serverId, password)
                root.close()

                if (!result.success) {
                    Toasts.error("No se pudo cerrar " + name, result.error || "")
                    return
                }
                if (result.exited) {
                    root.killed(target)
                    Toasts.success("Proceso cerrado", name + " (PID " + target + ")")
                } else {
                    /* `Toasts` no tiene variante de advertencia: va como aviso informativo. */
                    Toasts.warning("Señal enviada", name + " (PID " + target + ") sigue activo: puede tardar en terminar o ignorar SIGTERM.")
                }
                return
            }

            const fail = failure || {}

            /* El servidor pide contraseña de sudo: segunda fase, con el mismo proceso. */
            if (fail.code === "SUDO_REQUIRED") {
                Sudo.clear(serverId)
                root.hint = fail.hint || fail.message || ""
                root.phase = "sudo"
                if (!root.visible) root.open()
                passwordField.forceFocus()
                return
            }

            if (fail.code === "PROCESS_NOT_FOUND") root.killed(target)

            const message = fail.message || "No se pudo cerrar el proceso"
            root.error = message

            /* Con la contraseña rechazada el modal sigue abierto para reintentar. */
            if (fail.code === "SUDO_PASSWORD") {
                /* La guardada dejó de valer: que la próxima acción la pida de nuevo. */
                Sudo.clear(serverId)
            } else {
                root.close()
                Toasts.error("No se pudo cerrar " + name, message)
            }
        })
    }

    title: "Cerrar " + label
    size: "sm"
    /* Con la petición en curso no se puede cerrar. */
    dismissable: !pending

    onClosed: error = ""

    /* ── Fase de confirmación ──────────────────────────────────────── */
    Glass {
        visible: root.phase === "confirm"
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Qt.alpha(Theme.danger, 0.25)
        implicitHeight: confirmText.implicitHeight + 32

        Icon {
            x: 16; y: 18
            size: 20
            name: "alert"
            color: Theme.tone("rose").text
        }
        Column {
            id: confirmText
            x: 48; y: 16
            width: parent.width - 64
            spacing: 4
            Flow {
                width: parent.width
                spacing: 4
                Label { text: "Se cerrará"; font.weight: Font.DemiBold }
                Label {
                    width: Math.min(implicitWidth, confirmText.width)
                    text: root.label
                    mono: true
                    tone: 0.85
                    font.weight: Font.DemiBold
                }
                Label {
                    text: "(PID " + root.pid + ")"
                    mono: true
                    tone: 0.55
                    font.weight: Font.DemiBold
                }
            }
            Label {
                visible: root.command !== ""
                width: parent.width
                text: root.command
                mono: true
                tone: 0.45
                font.pixelSize: 11
                wrapMode: Text.WrapAnywhere
                maximumLineCount: 2
            }
            Item { width: 1; height: 4 }
            Label {
                width: parent.width
                textFormat: Text.RichText
                text: "Se envía " + root.monoSpan("SIGTERM") + " (sin " + root.monoSpan("-9")
                    + "): el proceso puede guardar y terminar limpio. Si lo gestiona un servicio, systemd podría volver a arrancarlo."
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.3
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    /* ── Fase de sudo ──────────────────────────────────────────────── */
    Glass {
        visible: root.phase === "sudo"
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        implicitHeight: sudoText.implicitHeight + 32

        Column {
            id: sudoText
            x: 16; y: 16
            width: parent.width - 32
            spacing: 4
            Label { width: parent.width; text: "Hace falta sudo"; font.weight: Font.DemiBold }
            Label {
                width: parent.width
                text: root.hint !== "" ? root.hint : "El proceso es de otro usuario y el usuario SSH no es root."
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.3
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }
    Column {
        visible: root.phase === "sudo"
        width: root.bodyWidth
        spacing: 6
        Label { text: "Contraseña de sudo"; tone: 0.55; font.pixelSize: Theme.textXs; font.weight: Font.Medium }
        GlassField {
            id: passwordField
            width: parent.width
            password: true
            placeholder: "Contraseña del usuario SSH"
            maximumLength: 256
            onAccepted: root.submit()
        }
        Label {
            width: parent.width
            text: "Se usa solo para esta acción y no se guarda."
            tone: 0.4
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── Error del cierre ──────────────────────────────────────────── */
    Glass {
        visible: root.error !== ""
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Qt.alpha(Theme.danger, 0.2)
        implicitHeight: errorLabel.implicitHeight + 24
        Label {
            id: errorLabel
            x: 12; y: 12
            width: parent.width - 24
            text: root.error
            color: Theme.tone("rose").text
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }
    }

    /* Palabra en monoespaciada dentro de un párrafo. */
    function monoSpan(word) {
        return "<span style=\"font-family:'" + Theme.fontMono + "'\">" + word + "</span>"
    }

    footer: Row {
        spacing: 12
        SecondaryButton {
            text: "Cancelar"
            enabled: !root.pending
            onClicked: root.close()
        }
        DangerButton {
            text: root.pending ? "Cerrando…" : "Cerrar proceso"
            enabled: root.canSubmit
            onClicked: root.submit()
        }
    }
}
