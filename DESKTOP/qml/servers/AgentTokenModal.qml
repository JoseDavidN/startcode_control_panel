import QtQuick
import StartCode

/* «Regenerar token del agente»: confirmación y resultado en el mismo modal.
   Con el agente conectado el token se rota por su socket; sin él se revoca y
   toca reinstalar (`reinstallRequested`). */
Modal {
    id: root

    /* `{ id, name, … }` del servidor. */
    property var server: null
    property bool busy: false
    /* `{ mode: "rotating" | "revoked" }` cuando ya se regeneró. */
    property var result: null
    property string errorText: ""

    /* La petición terminó, bien o mal: el estado del agente pudo cambiar. */
    signal settled()
    /* El token quedó revocado y el usuario quiere reinstalar ya. */
    signal reinstallRequested()

    readonly property string serverName: server ? String(server.name || "") : ""
    readonly property bool revoked: result !== null && result.mode === "revoked"
    property int runId: 0

    title: "Regenerar token del agente · " + serverName
    size: "sm"
    /* Mientras se regenera no se cierra. */
    dismissable: !busy

    onAboutToShow: {
        runId++
        busy = false
        result = null
        errorText = ""
    }

    function regenerate() {
        if (busy || !server) return
        errorText = ""
        busy = true
        const run = ++runId
        Api.request("POST", "/servers/" + server.id + "/agent/token", {}, (ok, data, failure) => {
            if (run !== root.runId) return
            root.busy = false
            if (ok && data) root.result = data
            else root.errorText = failure && failure.message ? failure.message : "No se pudo regenerar el token"
            root.settled()
        })
    }

    /* ── Resultado ─────────────────────────────────────────────────── */
    Column {
        visible: root.result !== null
        width: root.bodyWidth
        spacing: 20

        Label {
            visible: !root.revoked
            width: parent.width
            text: "Se envió un token nuevo al agente. Lo guarda en su configuración y lo confirma en unos segundos; el anterior deja de valer entonces, con unos minutos de margen para los mensajes en camino."
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            lineHeight: 1.4
        }

        Glass {
            visible: root.revoked
            width: parent.width
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.warn, 0.2)
            implicitHeight: revokedColumn.implicitHeight + 32
            Column {
                id: revokedColumn
                x: 16; y: 16
                width: parent.width - 32
                spacing: 6
                Label {
                    width: parent.width
                    text: "El agente no estaba conectado"
                    color: Theme.tone("amber").text
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    width: parent.width
                    text: "El token quedó revocado y no hay por dónde enviarle uno nuevo. Reinstala el agente para que vuelva a reportar."
                    tone: 0.6
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                    lineHeight: 1.4
                }
            }
        }

        Column {
            width: parent.width
            spacing: 12
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            Flow {
                width: parent.width
                layoutDirection: Qt.RightToLeft
                spacing: 12
                PrimaryButton {
                    visible: root.revoked
                    text: "Reinstalar agente"
                    onClicked: { root.close(); root.reinstallRequested() }
                }
                SecondaryButton { text: "Cerrar"; onClicked: root.close() }
            }
        }
    }

    /* ── Confirmación ──────────────────────────────────────────────── */
    Column {
        visible: root.result === null
        width: root.bodyWidth
        spacing: 20

        Label {
            width: parent.width
            text: "Si el agente está conectado, recibe un token nuevo por su conexión y el actual deja de valer en cuanto lo confirma. Si no lo está, el token actual se revoca y tendrás que reinstalar el agente."
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            lineHeight: 1.4
        }
        Label {
            width: parent.width
            text: "Úsalo si crees que el token pudo filtrarse. Quedará registrado en tus notificaciones."
            tone: 0.45
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            lineHeight: 1.4
        }

        Glass {
            visible: root.errorText !== ""
            width: parent.width
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: Qt.alpha(Theme.danger, 0.2)
            implicitHeight: tokenError.implicitHeight + 24
            Label {
                id: tokenError
                x: 12; y: 12
                width: parent.width - 24
                text: root.errorText
                color: Qt.alpha(Theme.tone("rose").text, 0.8)
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        Column {
            width: parent.width
            spacing: 12
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            Flow {
                width: parent.width
                layoutDirection: Qt.RightToLeft
                spacing: 12
                PrimaryButton {
                    text: root.busy ? "Regenerando…" : "Regenerar token"
                    enabled: !root.busy
                    onClicked: root.regenerate()
                }
                SecondaryButton { text: "Cancelar"; enabled: !root.busy; onClicked: root.close() }
            }
        }
    }
}
