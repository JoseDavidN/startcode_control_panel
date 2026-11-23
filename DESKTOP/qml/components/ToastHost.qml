import QtQuick
import StartCode

/* Pila de avisos, abajo y al centro de la ventana. */
Column {
    id: root

    spacing: 8
    width: 380

    Repeater {
        model: Toasts.model
        Glass {
            id: toast
            required property int toastId
            required property string kind
            required property string title
            required property string detail

            readonly property color accent: kind === "error" ? Theme.danger
                                          : kind === "warning" ? Theme.warn
                                          : kind === "success" ? Theme.ok : Theme.info

            variant: "float"
            radius: Theme.radiusXl
            width: root.width
            height: body.implicitHeight + 24

            Icon {
                x: 14; y: 13
                name: toast.kind === "error" || toast.kind === "warning" ? "alert" : toast.kind === "success" ? "check" : "info"
                color: toast.accent
            }
            Column {
                id: body
                x: 40; y: 12
                width: parent.width - 54
                spacing: 2
                Label {
                    width: parent.width
                    text: toast.title
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    width: parent.width
                    visible: toast.detail !== ""
                    text: toast.detail
                    tone: 0.6
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }

            Timer {
                interval: toast.kind === "error" ? 6000 : 4000
                running: true
                onTriggered: Toasts.dismiss(toast.toastId)
            }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: Toasts.dismiss(toast.toastId) }

            NumberAnimation on opacity { from: 0; to: 1; duration: Theme.moBase }
            transform: Translate { id: toastShift }
            NumberAnimation {
                target: toastShift; property: "x"; running: true
                from: Theme.reducedMotion ? 0 : 48; to: 0; duration: Theme.moSlow
                easing.type: Easing.OutBack; easing.overshoot: Theme.moOvershoot
            }
        }
    }
}
