import QtQuick
import StartCode

/* Aviso de clave de host SSH cambiada (posible MITM) o aún sin confirmar
   (primera conexión a un servidor dado de alta sin escanear su huella). Se
   monta una vez y lo abre cualquier conexión rechazada por el backend: HTTP,
   terminal o SFTP.

       HostKeyMismatchModal { id: hostKeyAlert; onAccepted: serverId => … }
       hostKeyAlert.show(cuerpoDelError)   // devuelve si era un rechazo de clave

   `show` recibe el cuerpo con `code: "HOST_KEY_MISMATCH"` (dos huellas) o
   `"HOST_KEY_UNVERIFIED"` (sin guardada) y su `hostKey`. Aceptar fija la
   huella recibida; `accepted(serverId)` avisa para recargar y repetir la acción. */
Modal {
    id: root

    signal accepted(string serverId)

    /* `{ serverId, host, port, expected: { algorithm, fingerprint } | null, received }` */
    property var mismatch: null
    /* 'warn' | 'confirm' */
    property string phase: "warn"
    property string error: ""
    property bool busy: false

    readonly property bool first: mismatch === null || mismatch.expected === null
    readonly property string target: mismatch ? mismatch.host + ":" + mismatch.port : ""
    readonly property string fingerprint: mismatch ? mismatch.received.fingerprint : ""
    readonly property bool wide: bodyWidth >= 520

    title: first ? "Confirma la clave de host SSH" : "La clave de host SSH cambió"
    size: "md"
    /* Mientras se acepta la huella no se cierra. */
    dismissable: !busy

    ServerForms { id: logic }

    /* El detalle si `payload` es un HOST_KEY_MISMATCH (con las dos huellas) o
       un HOST_KEY_UNVERIFIED (sin guardada: `expected` null) bien formado. */
    function extract(payload) {
        if (!payload || !payload.hostKey) return null
        if (payload.code !== "HOST_KEY_MISMATCH" && payload.code !== "HOST_KEY_UNVERIFIED") return null
        const key = payload.hostKey
        const isKey = value => !!value && typeof value.fingerprint === "string"
        const hasExpected = key.expected !== null && key.expected !== undefined
        if (typeof key.serverId !== "string" || !key.serverId || !isKey(key.received)) return null
        if (payload.code === "HOST_KEY_MISMATCH" ? !isKey(key.expected) : hasExpected) return null
        return {
            serverId: key.serverId,
            host: key.host,
            port: key.port,
            expected: hasExpected ? { algorithm: key.expected.algorithm || null, fingerprint: key.expected.fingerprint } : null,
            received: { algorithm: key.received.algorithm || null, fingerprint: key.received.fingerprint }
        }
    }

    /* Abre el aviso si `errorBody` es un rechazo de clave de host. Devuelve si lo era. */
    function show(errorBody) {
        const next = extract(errorBody)
        if (!next) return false
        /* Varias peticiones del mismo servidor fallan a la vez: un solo aviso. */
        if (root.mismatch && root.mismatch.serverId === next.serverId
                && root.mismatch.received.fingerprint === next.received.fingerprint) {
            if (!root.visible) root.open()
            return true
        }
        root.mismatch = next
        root.phase = "warn"
        root.error = ""
        root.open()
        return true
    }

    function confirm() {
        if (root.busy || !root.mismatch) return
        const current = root.mismatch
        const wasFirst = root.first
        const where = root.target
        root.busy = true
        Api.request("POST", "/servers/" + current.serverId + "/host-key/accept",
                    { fingerprint: current.received.fingerprint }, (ok, data, failure) => {
            root.busy = false
            if (!ok) {
                root.phase = "warn"
                root.error = (failure && failure.message) || "No se pudo aceptar la huella"
                return
            }
            Toasts.success(wasFirst ? "Huella confirmada" : "Nueva huella aceptada",
                           where + " " + (wasFirst ? "ya está disponible" : "vuelve a estar disponible") + ". Repite la acción.")
            root.accepted(current.serverId)
            root.close()
        })
    }

    /* Cerrado, el aviso se olvida: el mismo rechazo vuelve a enseñarse la próxima vez. */
    onClosed: {
        root.mismatch = null
        root.phase = "warn"
        root.error = ""
    }

    footer: Row {
        spacing: 12
        SecondaryButton {
            text: root.phase === "confirm" ? "Volver" : "Cancelar"
            enabled: !root.busy
            onClicked: {
                if (root.phase === "confirm") { root.phase = "warn"; root.error = "" }
                else root.close()
            }
        }
        /* Primera conexión: acción de marca. Huella cambiada: acción de riesgo. */
        PrimaryButton {
            visible: root.first
            text: root.busy ? "Aceptando…" : root.phase === "confirm" ? "Sí, coincide" : "Confiar en esta huella"
            loading: root.busy
            enabled: !root.busy
            onClicked: {
                if (root.phase === "confirm") root.confirm()
                else { root.phase = "confirm"; root.error = "" }
            }
        }
        DangerButton {
            visible: !root.first
            text: root.busy ? "Aceptando…" : root.phase === "confirm" ? "Sí, aceptar nueva huella" : "Aceptar nueva huella"
            loading: root.busy
            enabled: !root.busy
            onClicked: {
                if (root.phase === "confirm") root.confirm()
                else { root.phase = "confirm"; root.error = "" }
            }
        }
    }

    /* ── Primera conexión ──────────────────────────────────────────── */
    ServerNotice {
        visible: root.first
        width: root.bodyWidth
        accent: Theme.warn
        iconColor: Theme.tone("amber").text
        iconPath: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3"
        spacing: 8

        Label {
            width: parent.width
            text: "Primera conexión a este servidor"
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            textFormat: Text.RichText
            text: "El panel aún no tiene una huella confirmada para " + logic.mono(root.target, 0.8)
                  + ", así que no envió ninguna credencial. Compara la de abajo con la del propio servidor antes de confiar en ella:"
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        /* El comando se puede seleccionar para copiarlo. */
        TextEdit {
            width: parent.width
            textFormat: TextEdit.RichText
            text: logic.mono(logic.hostKeyCheckCommand, 0.8) + " (o el archivo del algoritmo que aparece abajo)."
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.Wrap
            color: Theme.ink(0.6)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontUi
            font.pixelSize: Theme.textXs
        }
    }

    /* ── Huella cambiada ───────────────────────────────────────────── */
    ServerNotice {
        visible: !root.first
        width: root.bodyWidth
        accent: Theme.danger
        edge: 0.25
        iconName: "alert"
        iconColor: Theme.tone("rose").text
        spacing: 8

        Label {
            width: parent.width
            text: "Posible ataque de intermediario (MITM)"
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            textFormat: Text.RichText
            text: logic.mono(root.target, 0.8)
                  + " presenta una clave de host distinta de la guardada, así que el panel cortó la conexión antes de autenticarse."
                  + " Puede deberse a una reinstalación o a que se regeneraron las claves del servidor, pero también a que alguien intercepta la conexión."
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            textFormat: Text.RichText
            text: "Compruébala en el propio servidor con " + logic.mono(logic.hostKeyCheckCommand, 0.8)
                  + " (o el archivo del algoritmo que aparece abajo) antes de aceptarla."
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── Huellas ───────────────────────────────────────────────────── */
    Flow {
        id: keys
        visible: !root.first
        width: root.bodyWidth
        spacing: 12
        readonly property real half: Math.floor((width - 12) / 2)

        HostKeyBlock {
            width: root.wide ? keys.half : keys.width
            label: "Guardada"
            info: root.mismatch ? root.mismatch.expected : null
            tone: "muted"
        }
        HostKeyBlock {
            width: root.wide ? keys.half : keys.width
            label: "Recibida ahora"
            info: root.mismatch ? root.mismatch.received : null
            tone: "danger"
        }
    }
    HostKeyBlock {
        visible: root.first
        width: root.bodyWidth
        label: "Presentada por el servidor"
        info: root.mismatch ? root.mismatch.received : null
        tone: "muted"
    }

    ServerNotice {
        visible: root.phase === "confirm"
        width: root.bodyWidth
        accent: Theme.ink(1)
        edge: 0
        borderColor: Theme.hairlineSoft

        Label {
            width: parent.width
            text: root.first ? "¿Coincide con la del servidor?" : "¿Confías en la nueva clave?"
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Label {
            width: parent.width
            textFormat: Text.RichText
            text: "El panel conectará a " + logic.esc(root.target) + " solo si presenta "
                  + logic.mono(root.fingerprint, 0.8) + ". Quedará registrado en tus notificaciones de seguridad."
            tone: 0.6
            font.pixelSize: Theme.textXs
            lineHeight: 1.4
            wrapMode: Text.Wrap
            elide: Text.ElideNone
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
