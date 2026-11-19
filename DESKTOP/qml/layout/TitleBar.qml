import QtQuick
import QtQuick.Window
import StartCode

/* Barra de título propia: 38 px, transparente sobre el fondo del tema.
   Toda la barra arrastra la ventana y el doble clic la maximiza. */
Item {
    id: root

    required property Window window

    readonly property string platform: Qt.platform.os === "osx" ? "mac"
                                     : Qt.platform.os === "windows" ? "windows" : "linux"
    readonly property bool maximized: window.visibility === Window.Maximized

    function toggleMaximize() {
        if (root.maximized) window.showNormal()
        else window.showMaximized()
    }

    implicitHeight: Theme.titleBarHeight
    visible: window.visibility !== Window.FullScreen

    /* Borde inferior: hairline suave. */
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.hairlineSoft
    }

    DragHandler {
        target: null
        grabPermissions: PointerHandler.CanTakeOverFromAnything
        onActiveChanged: if (active) root.window.startSystemMove()
    }
    TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        enabled: !TilingDesktop
        onDoubleTapped: root.toggleMaximize()
    }

    Label {
        /* macOS deja 78 px a cada lado para los semáforos y centra el nombre. */
        anchors.verticalCenter: parent.verticalCenter
        x: root.platform === "mac" ? (parent.width - width) / 2 : 16
        text: "StartCode Panel"
        tone: 0.75
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
        font.letterSpacing: -0.2
    }

    /* ── Windows: botones de 46 px a todo el alto ──────────────────── */
    component WindowsButton: Item {
        id: wb
        property string iconName
        property bool danger: false
        signal activated()
        width: 46
        height: root.height - 1
        Rectangle {
            anchors.fill: parent
            /* Rojo de cierre de Windows 11: es el color del sistema, no del tema. */
            color: wbHover.hovered ? (wb.danger ? "#c42b1c" : Theme.tintHover) : "transparent"
        }
        Icon {
            anchors.centerIn: parent
            name: wb.iconName
            size: 14
            strokeWidth: 1
            color: wb.danger && wbHover.hovered ? "#ffffff" : Theme.ink(0.8)
        }
        HoverHandler { id: wbHover }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: wb.activated() }
    }

    Row {
        visible: root.platform === "windows"
        anchors.right: parent.right
        WindowsButton { iconName: "minimize"; onActivated: root.window.showMinimized() }
        WindowsButton { iconName: root.maximized ? "restore" : "maximize"; onActivated: root.toggleMaximize() }
        WindowsButton { iconName: "close"; danger: true; onActivated: root.window.close() }
    }

    /* ── Linux: botones redondos de 24 px, como los de GNOME ───────── */
    component LinuxButton: Rectangle {
        id: lb
        property string iconName
        signal activated()
        width: 24; height: 24; radius: 12
        color: lbHover.hovered ? Theme.hairlineStrong : Theme.tintActive
        Behavior on color { ColorAnimation { duration: Theme.moFast } }
        Icon {
            anchors.centerIn: parent
            name: lb.iconName
            size: 12
            strokeWidth: 2
            color: Theme.ink(lbHover.hovered ? 1 : 0.8)
        }
        HoverHandler { id: lbHover }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: lb.activated() }
    }

    Row {
        /* En un compositor en mosaico (Hyprland, Sway…) la ventana se maneja
           con atajos de teclado: la barra no lleva ningún botón. */
        visible: root.platform === "linux" && !TilingDesktop
        anchors.right: parent.right
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8
        LinuxButton { iconName: "minimize"; onActivated: root.window.showMinimized() }
        LinuxButton { iconName: root.maximized ? "restore" : "maximize"; onActivated: root.toggleMaximize() }
        LinuxButton { iconName: "close"; onActivated: root.window.close() }
    }
}
