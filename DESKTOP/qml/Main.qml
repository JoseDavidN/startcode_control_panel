import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import StartCode

Window {
    id: window

    readonly property bool mac: Qt.platform.os === "osx"
    /* Margen de la ventana sin marco desde el que se puede redimensionar. */
    readonly property int resizeMargin: 6

    width: 1600
    height: 900
    minimumWidth: 1280
    minimumHeight: 720
    visible: true
    title: "StartCode Panel"
    color: Theme.bgBase
    /* macOS conserva sus semáforos sobre el contenido; Windows y Linux van sin marco. */
    flags: mac ? Qt.Window | Qt.ExpandedClientAreaHint | Qt.NoTitleBarBackgroundHint
               : Qt.Window | Qt.FramelessWindowHint

    /* Tema, tipografía y movimiento: preferencias de la cuenta. El login va siempre en Nocturno. */
    readonly property var appearance: Auth.preferences.appearance
    Binding { target: Theme; property: "forceNocturno"; value: !Auth.authenticated }
    Binding { target: Theme; property: "userTheme"; value: window.appearance.theme || "dark" }
    Binding { target: Theme; property: "fontChoice"; value: window.appearance.font || "grotesk" }
    Binding { target: Theme; property: "reducedMotion"; value: window.appearance.reducedMotion === true }

    /* Escena: todo lo que no es un modal ni un aviso. */
    Item {
        id: scene
        anchors.fill: parent

        AppBackground {
            id: background
            anchors.fill: parent
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 0

            TitleBar {
                Layout.fillWidth: true
                window: window
            }

            Loader {
                Layout.fillWidth: true
                Layout.fillHeight: true
                sourceComponent: Auth.authenticated ? app : login
            }
        }
    }

    ToastHost {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 28
        z: 100
    }

    Component {
        id: login
        Login { backdrop: background }
    }
    Component {
        id: app
        AppLayout { backdrop: background }
    }

    /* ── Redimensionado de la ventana sin marco ────────────────────── */
    component ResizeEdge: MouseArea {
        property int edges
        visible: !window.mac && !TilingDesktop && window.visibility === Window.Windowed
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton
        cursorShape: edges === (Qt.LeftEdge | Qt.TopEdge) || edges === (Qt.RightEdge | Qt.BottomEdge) ? Qt.SizeFDiagCursor
                   : edges === (Qt.RightEdge | Qt.TopEdge) || edges === (Qt.LeftEdge | Qt.BottomEdge) ? Qt.SizeBDiagCursor
                   : edges & (Qt.LeftEdge | Qt.RightEdge) ? Qt.SizeHorCursor : Qt.SizeVerCursor
        onPressed: window.startSystemResize(edges)
    }
    ResizeEdge { edges: Qt.LeftEdge; width: window.resizeMargin; anchors { left: parent.left; top: parent.top; bottom: parent.bottom; topMargin: 12; bottomMargin: 12 } }
    ResizeEdge { edges: Qt.RightEdge; width: window.resizeMargin; anchors { right: parent.right; top: parent.top; bottom: parent.bottom; topMargin: 12; bottomMargin: 12 } }
    ResizeEdge { edges: Qt.TopEdge; height: window.resizeMargin; anchors { top: parent.top; left: parent.left; right: parent.right; leftMargin: 12; rightMargin: 12 } }
    ResizeEdge { edges: Qt.BottomEdge; height: window.resizeMargin; anchors { bottom: parent.bottom; left: parent.left; right: parent.right; leftMargin: 12; rightMargin: 12 } }
    ResizeEdge { edges: Qt.LeftEdge | Qt.TopEdge; width: 12; height: 12; anchors { left: parent.left; top: parent.top } }
    ResizeEdge { edges: Qt.RightEdge | Qt.TopEdge; width: 12; height: 12; anchors { right: parent.right; top: parent.top } }
    ResizeEdge { edges: Qt.LeftEdge | Qt.BottomEdge; width: 12; height: 12; anchors { left: parent.left; bottom: parent.bottom } }
    ResizeEdge { edges: Qt.RightEdge | Qt.BottomEdge; width: 12; height: 12; anchors { right: parent.right; bottom: parent.bottom } }
}
