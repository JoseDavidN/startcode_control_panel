import QtQuick
import StartCode

/* Acción sobre una unidad systemd, en dos fases:

   - `confirm`: solo para `stop`. Parar una unidad no se deshace solo, y hay
     servicios que dejan la máquina incomunicada: no debe salir de un clic
     accidental en la tarjeta.
   - `sudo`: cuando el backend responde `SUDO_REQUIRED`, porque el usuario SSH
     no es root y sudo pide contraseña.

   No ejecuta nada: `confirmed(password)` pide la acción ("" en la fase de
   confirmación) y `dismissed()` avisa de que el usuario lo cerró. Quien lo usa
   lo abre con `show(…)`, y lo cierra con `hide()` cuando la acción termina. */
Modal {
    id: root

    property string serviceName: ""
    /* start | stop | restart | enable | disable */
    property string action: "start"
    /* confirm | sudo */
    property string phase: "confirm"
    /* Texto del backend que explica por qué hace falta sudo. */
    property string hint: ""
    property string error: ""
    property bool pending: false

    signal confirmed(string password)
    /* El usuario lo cerró (Cancelar, Escape, fuera o la X), no `hide()`. */
    signal dismissed()

    readonly property var actionLabel: ({
        start: "Iniciar", stop: "Parar", restart: "Reiniciar", enable: "Habilitar", disable: "Deshabilitar"
    })
    readonly property var pendingLabel: ({
        start: "Iniciando…", stop: "Parando…", restart: "Reiniciando…", enable: "Habilitando…", disable: "Deshabilitando…"
    })
    readonly property bool canSubmit: !pending && (phase !== "sudo" || passwordField.text !== "")

    /* Cierre pedido por código: no cuenta como que el usuario canceló. */
    property bool silent: false
    /* Entre `show()` y el cierre: distingue abrir de cambiar de fase. */
    property bool shown: false

    /* Abre el modal o, si ya está abierto, lo pasa a otra fase (de confirmar a sudo). */
    function show(name, act, ph, why) {
        serviceName = name
        action = act
        phase = ph
        hint = why || ""
        if (!shown) {
            shown = true
            passwordField.text = ""
        }
        silent = false
        open()
        focusPassword()
    }
    function hide() {
        if (!shown) return
        shown = false
        silent = true
        close()
    }
    function submit() {
        if (!canSubmit) return
        confirmed(phase === "sudo" ? passwordField.text : "")
    }
    function focusPassword() {
        if (phase === "sudo" && opened) passwordField.forceFocus()
    }

    title: (actionLabel[action] || "") + " " + serviceName
    size: "sm"
    /* Con la acción en curso no se puede cerrar. */
    dismissable: !pending

    onOpened: focusPassword()
    onClosed: {
        const byUser = !silent
        silent = false
        shown = false
        if (byUser) dismissed()
    }

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
                Label { text: "Se detendrá"; font.weight: Font.DemiBold }
                Label {
                    width: Math.min(implicitWidth, confirmText.width)
                    text: root.serviceName
                    mono: true
                    tone: 0.85
                    font.weight: Font.DemiBold
                }
            }
            Label {
                width: parent.width
                textFormat: Text.RichText
                text: "El servicio dejará de dar servicio hasta que vuelvas a iniciarlo. Parar unidades como "
                    + root.monoSpan("sshd") + ", " + root.monoSpan("postgresql") + " o " + root.monoSpan("startcode-agent")
                    + " puede dejar el servidor incomunicado o al panel sin métricas."
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
                text: root.hint !== "" ? root.hint : "systemctl necesita privilegios y el usuario SSH no es root."
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

    /* ── Error de la acción ────────────────────────────────────────── */
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
            visible: root.action === "stop"
            text: root.pending ? root.pendingLabel.stop : root.actionLabel.stop
            enabled: root.canSubmit
            onClicked: root.submit()
        }
        PrimaryButton {
            visible: root.action !== "stop"
            text: root.pending ? (root.pendingLabel[root.action] || "") : (root.actionLabel[root.action] || "")
            enabled: root.canSubmit
            onClicked: root.submit()
        }
    }
}
