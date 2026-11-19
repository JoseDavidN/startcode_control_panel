import QtQuick
import QtQuick.Layouts
import StartCode

/* Confirmación antes de borrar filas desde los resultados: dice de qué tabla,
   cuántas y con qué clave primaria. En un JOIN se elige la tabla.

   `targets`: `[{ id, ref: { schema, namespace?, table }, keys: [{ columna: valor }] }]`.
   Al confirmar emite `confirm(target)` y queda ocupado: quien lo usa borra y
   llama a `close()` si fue bien, o a `fail(mensaje)` si no. */
Modal {
    id: root

    property var targets: []
    /* Filas con cambios sin guardar: se pierden al repetir la consulta. */
    property int pendingRows: 0

    signal confirm(var target)

    property string targetId: ""
    property bool busy: false
    property string errorText: ""

    readonly property var target: {
        const list = targets || []
        for (let i = 0; i < list.length; i++)
            if (list[i].id === targetId) return list[i]
        return list.length > 0 ? list[0] : null
    }
    readonly property int n: target && target.keys ? target.keys.length : 0
    readonly property var shownKeys: {
        const out = []
        if (target && target.keys)
            for (let i = 0; i < Math.min(8, target.keys.length); i++) out.push(keyText(target.keys[i]))
        return out
    }

    /** El borrado falló: muestra el motivo y deja reintentar. */
    function fail(message) {
        errorText = message || "No se pudieron borrar las filas"
        busy = false
    }

    function refLabel(t) {
        if (!t) return ""
        return [t.schema, t.namespace, t.table].filter(Boolean).join(".")
    }
    function keyText(k) {
        return Object.keys(k).map(c => {
            const v = k[c]
            return c + " = " + (v === null || v === undefined ? "NULL"
                                : typeof v === "object" ? JSON.stringify(v) : String(v))
        }).join(", ")
    }
    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
    function accept() {
        if (busy || !target) return
        busy = true
        errorText = ""
        confirm(target)
    }

    title: n === 1 ? "Eliminar fila" : "Eliminar " + n + " filas"
    size: "sm"
    dismissable: !busy

    onAboutToShow: {
        targetId = targets && targets.length > 0 ? targets[0].id : ""
        busy = false
        errorText = ""
    }

    Glass {
        visible: (root.targets || []).length > 1
        width: root.bodyWidth
        height: 40
        variant: "input"
        Label {
            id: tableCaption
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            text: "TABLA"
            tone: 0.4
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.letterSpacing: 0.6
        }
        Select {
            anchors.left: tableCaption.right
            anchors.leftMargin: 8
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            enabled: !root.busy
            Accessible.name: "Tabla"
            value: root.target ? root.target.id : ""
            options: (root.targets || []).map(t => ({ value: t.id, label: root.refLabel(t.ref) }))
            onPicked: value => root.targetId = value
        }
    }

    RowLayout {
        width: root.bodyWidth
        spacing: 12

        Rectangle {
            Layout.alignment: Qt.AlignTop
            Layout.preferredWidth: 36
            Layout.preferredHeight: 36
            radius: Theme.radiusXl
            color: Qt.alpha(Theme.tone("rose").base, 0.15)
            border.width: 1
            border.color: Qt.alpha(Theme.tone("rose").text, 0.2)
            Icon { anchors.centerIn: parent; name: "trash"; size: 16; color: Theme.tone("rose").text }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 8

            Label {
                Layout.fillWidth: true
                textFormat: Text.RichText
                wrapMode: Text.Wrap
                elide: Text.ElideNone
                text: "¿Eliminar " + (root.n === 1 ? "la fila" : "las <b>" + root.n + " filas</b>")
                      + " de <span style=\"font-family:'" + Theme.fontMono + "'; font-weight:600\">"
                      + root.escapeHtml(root.refLabel(root.target ? root.target.ref : null)) + "</span>?"
            }

            ScrollArea {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(128, keyColumn.implicitHeight)
                contentHeight: keyColumn.implicitHeight
                Column {
                    id: keyColumn
                    width: parent.width
                    spacing: 2
                    Repeater {
                        model: root.shownKeys
                        Label {
                            required property string modelData
                            width: keyColumn.width
                            text: modelData
                            mono: true
                            tone: 0.6
                            font.pixelSize: Theme.textXs
                        }
                    }
                    Label {
                        visible: root.n > 8
                        width: keyColumn.width
                        text: "y " + (root.n - 8) + " más"
                        tone: 0.4
                        font.pixelSize: Theme.textXs
                    }
                }
            }

            Label {
                Layout.fillWidth: true
                text: "Se borran por su clave primaria, todas o ninguna. Esta acción no se puede deshacer y queda en la auditoría."
                tone: 0.55
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                visible: root.pendingRows > 0
                Layout.fillWidth: true
                text: "Los cambios sin guardar de otras filas se pierden al actualizar el resultado."
                color: Theme.tone("amber").text
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    Glass {
        visible: root.errorText !== ""
        width: root.bodyWidth
        height: errorLabel.implicitHeight + 24
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Qt.alpha(Theme.tone("rose").text, 0.2)
        Label {
            id: errorLabel
            x: 12
            y: 12
            width: parent.width - 24
            text: root.errorText
            color: Theme.tone("rose").text
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }
    }

    footer: Row {
        spacing: 8
        SecondaryButton {
            text: "Cancelar"
            enabled: !root.busy
            onClicked: root.close()
        }
        DangerButton {
            text: root.busy ? "Eliminando…" : root.n === 1 ? "Eliminar fila" : "Eliminar " + root.n + " filas"
            enabled: !root.busy
            onClicked: root.accept()
        }
    }
}
