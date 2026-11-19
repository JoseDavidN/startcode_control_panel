import QtQuick
import StartCode

/* Confirmación antes de vaciar el historial de notificaciones. */
Modal {
    id: root

    property int total: 0
    signal confirmed()

    title: "Vaciar notificaciones"
    size: "sm"

    Glass {
        width: root.bodyWidth
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Qt.alpha(Theme.danger, 0.25)
        implicitHeight: body.implicitHeight + 32

        Icon { x: 16; y: 18; size: 20; name: "alert"; color: Theme.tone("rose").text }
        Column {
            id: body
            x: 48; y: 16
            width: parent.width - 64
            spacing: 6
            Label {
                width: parent.width
                text: root.total === 1 ? "Se borrará 1 notificación" : "Se borrarán " + root.total + " notificaciones"
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                width: parent.width
                text: "Se elimina todo el historial, leído y sin leer. No se puede deshacer."
                tone: 0.6
                font.pixelSize: Theme.textXs
                lineHeight: 1.3
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }

    footer: Row {
        spacing: 12
        SecondaryButton { text: "Cancelar"; onClicked: root.close() }
        DangerButton {
            text: "Vaciar todo"
            onClicked: { root.close(); root.confirmed() }
        }
    }
}
