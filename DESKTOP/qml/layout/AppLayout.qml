import QtQuick
import QtQuick.Layouts
import StartCode

/* Estructura de la app con sesión: barra lateral y panel de contenido. */
Item {
    id: root

    /* Fondo que desenfocan los dos paneles exteriores. */
    required property Item backdrop

    property string page: StartPage.split("/")[0]
    /* Pestaña de Configuración a la que saltar (la pide el asistente). */
    property string settingsTab: ""
    /* Servidor o conexión a abrir al entrar en su sección (lo pide el panel o un aviso). */
    property string openTarget: ""

    Connections {
        target: AppNav
        function onOpen(page, target) {
            root.settingsTab = page === "settings" ? target : ""
            root.openTarget = page === "servers" || page === "databases" ? target : ""
            if (root.page === page) { view.active = false; view.active = true }
            else root.page = page
        }
    }


    /* En mosaico la ventana puede quedar en media pantalla o menos: el
       sidebar pasa a riel y los márgenes se estrechan. */
    readonly property bool narrow: width < 1100
    readonly property int gutter: width < 760 ? 10 : 20
    readonly property bool railPreferred: ((Auth.user.preferences || {}).appearance || {}).sidebarMode === "collapsed"

    RowLayout {
        anchors.fill: parent
        anchors.margins: root.gutter
        spacing: root.gutter

        Sidebar {
            Layout.fillHeight: true
            backdrop: root.backdrop
            current: root.page
            collapsed: root.narrow || root.railPreferred
            onNavigate: page => { root.settingsTab = ""; root.openTarget = ""; root.page = page }
            unread: NotificationState.unread
        }

        Glass {
            Layout.fillWidth: true
            Layout.fillHeight: true
            backdrop: root.backdrop

            /* Cabecera: ruta de la sección. */
            Item {
                id: head
                width: parent.width
                height: 42
                Label {
                    x: 20
                    anchors.verticalCenter: parent.verticalCenter
                    text: "startcode://" + root.page
                    mono: true
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                }
                AssistantLauncher {
                    anchors.right: parent.right
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
            }

            /* Cada página entra con opacidad y 8 px de subida. */
            Loader {
                id: view
                anchors.top: head.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: root.width < 760 ? 12 : 24

                property real rise: 0
                property real grow: 1
                transform: [
                    Scale { origin.x: view.width / 2; origin.y: view.height / 2; xScale: view.grow; yScale: view.grow },
                    Translate { y: view.rise }
                ]

                sourceComponent: root.page === "servers" ? servers : root.page === "databases" ? databases
                               : root.page === "settings" ? settings : root.page === "notifications" ? notifications : dashboard
                onLoaded: enter.restart()

                Connections {
                    target: root
                    function onPageChanged() { view.active = false; view.active = true }
                }

                ParallelAnimation {
                    id: enter
                    NumberAnimation { target: view; property: "opacity"; from: 0; to: 1; duration: Theme.moSlow }
                    NumberAnimation {
                        target: view; property: "grow"; from: Theme.reducedMotion ? 1 : 0.985; to: 1; duration: Theme.moSlow
                        easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
                    }
                    NumberAnimation {
                        target: view; property: "rise"; from: Theme.moRise; to: 0; duration: Theme.moSlow
                        easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.moEase
                    }
                }
            }
        }
    }

    /* Muelle global de terminales SSH: sigue abierto al cambiar de sección. */
    TerminalDock {
        anchors.fill: parent
        z: 20
        backdrop: root.backdrop
    }

    /* Asistente de IA: panel lateral sobre toda la app, también sobre la terminal. */
    Component.onCompleted: AssistantBridge.open = false
    AssistantPanel {
        visible: AssistantBridge.open
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: parent.right
        anchors.margins: root.gutter
        width: Math.min(implicitWidth, parent.width - root.gutter * 2)
        backdrop: root.backdrop
        z: 60
        onSettingsRequested: { AssistantBridge.open = false; root.settingsTab = "assistant"; root.page = "settings" }
    }
    /* El asistente puede proponer dar de alta un servidor o una conexión:
       se abre el formulario ya rellenado y el usuario decide. */
    AddServerModal { id: assistantServerModal }
    ConnectionModal { id: assistantConnectionModal }
    Connections {
        target: AssistantBridge
        function onServerFormRequested(data) { assistantServerModal.prefill(data); assistantServerModal.open() }
        function onConnectionFormRequested(data) {
            assistantConnectionModal.connection = null
            assistantConnectionModal.prefill(data)
            assistantConnectionModal.open()
        }
    }

    /* Avisos de la cuenta: insignia, avisos en la app y notificaciones del sistema. */
    NotificationWatcher {}

    /* Cierre por inactividad y aviso de versiones nuevas: una vez, mientras haya sesión. */
    InactivityWatcher {}
    SettingsSystemUpdater { inBackground: true }

    /* Aviso de clave de host SSH cambiada: lo abre cualquier acción rechazada por ese motivo. */
    HostKeyMismatchModal { id: hostKeyModal }
    Connections {
        target: Api
        function onHostKeyMismatch(error) { hostKeyModal.show(error) }
    }
    Connections {
        target: TerminalSessions
        function onHostKeyMismatch(payload) { hostKeyModal.show(payload) }
    }
    /* Al cerrar la sesión no queda ninguna shell abierta. */
    Component.onDestruction: TerminalSessions.closeAll()

    Component {
        id: settings
        Settings {
            onBack: root.page = "dashboard"
            /* No se vacía aquí: la página se crea dos veces al cambiar de sección. */
            Component.onCompleted: if (root.settingsTab !== "") activeTab = root.settingsTab
        }
    }
    Component {
        id: databases
        Databases { Component.onCompleted: if (root.openTarget !== "") openConnection(root.openTarget) }
    }
    Component {
        id: servers
        Servers { requestedId: root.openTarget }
    }
    Component { id: dashboard; Dashboard {} }
    Component { id: notifications; Notifications {} }
}
