import QtQuick
import QtQuick.Templates as T
import StartCode

/* Modal del sistema. Se monta sobre toda la ventana, con la cabecera fija y
   el cuerpo con desplazamiento; nunca supera la ventana (48 px libres arriba
   y abajo). El contenido se declara dentro y se apila en vertical:

       Modal { id: m; title: "…"; size: "md"
           Label { … }            // cuerpo
           footer: Row { … }      // opcional: barra de botones fija abajo
       }

   `open()` / `close()`; `dismissable: false` para un paso obligatorio. */
T.Popup {
    id: root

    property string title: ""
    /* sm 448 · md 672 · lg 768 · xl 1024 · 2xl 1400 */
    property string size: "md"
    /* Ocupa todo el alto disponible (lectores, exploradores). */
    property bool tall: false
    property bool dismissable: true
    /* Relleno del cuerpo; 0 si el contenido trae el suyo. */
    property int bodyPadding: 24
    property int bodySpacing: 16
    /* Botones de la cabecera, a la izquierda del de cerrar. */
    property alias actions: actionRow.data
    /* Barra inferior fija (botones de aceptar y cancelar). */
    property Item footer: null
    default property alias content: bodyColumn.data
    /* Ancho útil del cuerpo, para quien necesite medir. */
    readonly property real bodyWidth: bodyColumn.width

    readonly property var widths: ({ sm: 448, md: 672, lg: 768, xl: 1024, "2xl": 1400 })
    readonly property real maxBodyHeight: T.Overlay.overlay ? T.Overlay.overlay.height - 96 : 600

    parent: T.Overlay.overlay
    anchors.centerIn: parent
    width: parent ? Math.min(widths[size] || widths.md, parent.width - 32) : 0
    height: tall ? maxBodyHeight
                 : Math.min(maxBodyHeight, header.height + bodyColumn.implicitHeight + bodyPadding * 2 + footerBox.height)
    modal: true
    focus: true
    padding: 0
    closePolicy: dismissable ? T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside : T.Popup.NoAutoClose

    T.Overlay.modal: Rectangle {
        color: Qt.rgba(0, 0, 0, 0.6)
        Behavior on opacity { NumberAnimation { duration: Theme.moBase } }
    }

    /* Entra creciendo con un pequeño rebote; sale encogiéndose. */
    enter: Transition {
        ParallelAnimation {
            NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moBase }
            NumberAnimation {
                property: "scale"; from: Theme.reducedMotion ? 1 : 0.9; to: 1; duration: Theme.moSlow
                easing.type: Easing.OutBack; easing.overshoot: Theme.moOvershoot
            }
        }
    }
    exit: Transition {
        ParallelAnimation {
            NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Theme.moFast }
            NumberAnimation { property: "scale"; from: 1; to: Theme.reducedMotion ? 1 : 0.96; duration: Theme.moFast; easing.type: Easing.InCubic }
        }
    }

    background: Glass {
        variant: "float"
        elevation: "modal"
        /* Como superficie exterior, desenfoca la app que queda detrás. */
        backdrop: root.visible ? Theme.scene : null
    }

    contentItem: Item {
        Item {
            id: header
            width: parent.width
            height: 64
            Label {
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - 48 - headerButtons.width - 16
                text: root.title
                color: Theme.brandLight1
                font.pixelSize: 18
                font.weight: Font.DemiBold
                font.letterSpacing: -0.3
            }
            Row {
                id: headerButtons
                anchors.right: parent.right
                anchors.rightMargin: 24
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Row { id: actionRow; spacing: 8; anchors.verticalCenter: parent.verticalCenter }
                IconButton {
                    visible: root.dismissable
                    size: 32
                    iconName: "close"
                    hint: "Cerrar"
                    onClicked: root.close()
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        ScrollArea {
            id: scroll
            anchors.top: header.bottom
            anchors.bottom: footerBox.top
            width: parent.width
            contentHeight: bodyColumn.implicitHeight + root.bodyPadding * 2
            Column {
                id: bodyColumn
                x: root.bodyPadding
                y: root.bodyPadding
                width: scroll.width - root.bodyPadding * 2
                spacing: root.bodySpacing
            }
        }

        Item {
            id: footerBox
            anchors.bottom: parent.bottom
            width: parent.width
            height: root.footer ? root.footer.implicitHeight + 32 : 0
            visible: root.footer !== null
            Rectangle { width: parent.width; height: 1; color: Theme.line }
        }
    }

    onFooterChanged: {
        if (!footer) return
        footer.parent = footerBox
        footer.anchors.right = footerBox.right
        footer.anchors.rightMargin = 24
        footer.anchors.verticalCenter = footerBox.verticalCenter
    }
}
