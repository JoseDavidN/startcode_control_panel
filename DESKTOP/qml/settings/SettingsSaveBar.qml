import QtQuick
import StartCode

/* Botón de guardado de una sección de preferencias: envía ya lo pendiente
   (los cambios se aplican al momento y se sincronizan solos al poco) y
   confirma el resultado. */
Item {
    id: root

    property string label: "Guardar cambios"
    property bool saving: false
    property bool saved: false

    readonly property bool busy: saving || Auth.prefsStatus === "syncing"

    implicitHeight: 48

    Connections {
        target: Auth
        function onPreferencesFlushed(ok) {
            if (!root.saving) return
            root.saving = false
            root.saved = ok
            if (ok) savedTimer.restart()
        }
    }
    Timer { id: savedTimer; interval: 3000; onTriggered: root.saved = false }

    Row {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        spacing: 12
        Label {
            anchors.verticalCenter: parent.verticalCenter
            visible: Auth.prefsStatus === "error"
            text: "No se pudo sincronizar — reintenta"
            color: Theme.danger
            font.pixelSize: Theme.textXs
        }
        PrimaryButton {
            text: root.busy ? "Guardando…" : root.saved ? "Guardado" : root.label
            loading: root.busy
            enabled: !root.busy
            onClicked: { root.saving = true; Auth.flushPreferences() }
        }
    }
}
