import QtQuick
import QtQuick.Layouts
import StartCode

/* Tarjeta de una unidad systemd en la pestaña «Servicios»: estado, arranque
   automático, PID, memoria y las acciones (iniciar, parar, reiniciar, journal
   y fijar). No ejecuta nada: pide cada cosa con una señal.

       ServiceCard {
           service: unidad            // { name, displayName, state, subState, enabled, pid, memory }
           pinned: true
           busy: …; running: "start"  // acción en curso sobre esta unidad
           onActionRequested: (name, action) => …
           onPinToggled: name => …
           onLogsRequested: name => …
       } */
Glass {
    id: root

    property var service: ({})
    property bool pinned: false
    /* Acción en curso sobre esta unidad ("" si no hay): pone el indicador en su botón. */
    property string running: ""
    /* Hay una acción en curso sobre esta unidad: bloquea sus botones. */
    property bool busy: false

    signal actionRequested(string serviceName, string action)
    signal pinToggled(string serviceName)
    signal logsRequested(string serviceName)

    readonly property string name: String(service.name || "")
    readonly property string unit: name.replace(/\.service$/, "")
    readonly property string unitState: String(service.state || "")
    readonly property bool unitEnabled: service.enabled === true
    /* Unidades que sostienen la conexión del panel: ni parar ni deshabilitar.
       El backend las rechaza igual; es para no ofrecer un botón que no va a funcionar. */
    readonly property bool protectedUnit: ["sshd", "ssh", "startcode-agent"].includes(unit)

    /* Trazos que no están en el juego de `Icon` (rejilla de 24). */
    readonly property string pathGlobe: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
    readonly property string pathBrackets: "M16 18l6-6-6-6M8 6l-6 6 6 6"
    readonly property string pathPin: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"
    readonly property string pathPlay: "M5 3l14 9-14 9V3z"
    readonly property string pathPause: "M6 4h4v16H6zM14 4h4v16h-4z"
    readonly property string pathRestart: "M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
    readonly property string pathLogs: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"

    /* Icono según la unidad; el resto lleva el de paquete. */
    readonly property var unitIcon: {
        if (unit === "nginx" || unit === "apache") return { path: pathGlobe }
        if (["mysql", "postgresql", "redis", "mongodb"].includes(unit)) return { name: "database" }
        if (unit === "wordpress") return { path: pathBrackets }
        if (unit === "nodejs") return { name: "terminal" }
        if (unit === "docker") return { name: "cube" }
        return { name: "box" }
    }

    /* Los textos de ayuda se crean al pasar por la tarjeta la primera vez:
       con hasta 200 tarjetas, un popup por botón desde el inicio pesa. */
    property bool tipsReady: false

    variant: "soft"
    elevation: "flat"
    radius: Theme.radiusXl
    highlighted: cardHover.hovered
    implicitHeight: body.implicitHeight + 32

    HoverHandler {
        id: cardHover
        onHoveredChanged: if (hovered) root.tipsReady = true
    }

    /* Texto de ayuda diferido. */
    component Tip: Loader {
        id: tip
        property string text: ""
        anchors.fill: parent
        active: root.tipsReady && tip.text !== ""
        sourceComponent: HoverTip { text: tip.text }
    }

    /* Botón con texto de color semántico (iniciar en verde, parar en rojo). */
    component ToneButton: Item {
        id: toneButton
        property string text
        property string family
        property string iconPath
        property bool loading: false
        property bool disabled: false
        property string hint: ""
        signal clicked()

        readonly property var colors: Theme.tone(family)

        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: 32
        opacity: disabled ? 0.4 : 1
        Accessible.role: Accessible.Button
        Accessible.name: text

        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            color: Qt.alpha(toneButton.colors.base, toneHover.hovered && !toneButton.disabled ? 0.25 : 0.15)
            border.width: 1
            border.color: Qt.alpha(toneButton.colors.base, 0.2)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Row {
            anchors.centerIn: parent
            spacing: 6
            Spinner { visible: toneButton.loading; anchors.verticalCenter: parent.verticalCenter; color: toneButton.colors.text }
            Icon { visible: !toneButton.loading; anchors.verticalCenter: parent.verticalCenter; path: toneButton.iconPath; color: toneButton.colors.text }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: toneButton.text
                color: toneButton.colors.text
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
        HoverHandler { id: toneHover; cursorShape: toneButton.disabled ? Qt.ArrowCursor : Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; enabled: !toneButton.disabled; onTapped: toneButton.clicked() }
        Tip { text: toneButton.hint }
    }

    /* Botón cuadrado de 32 con un trazo propio. */
    component SquareButton: Item {
        id: square
        property string iconPath
        property bool loading: false
        property bool disabled: false
        property string hint: ""
        property string label: ""
        signal clicked()

        implicitWidth: 32
        implicitHeight: 32
        opacity: disabled ? 0.4 : 1
        Accessible.role: Accessible.Button
        Accessible.name: label

        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusLg
            color: squareHover.hovered && !square.disabled ? Theme.tintActive : Theme.tintHover
            border.width: 1
            border.color: squareHover.hovered && !square.disabled ? Theme.hairlineHover : Theme.hairlineSoft
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Spinner { visible: square.loading; anchors.centerIn: parent; color: Theme.ink(0.55) }
        Icon {
            visible: !square.loading
            anchors.centerIn: parent
            path: square.iconPath
            color: Theme.ink(squareHover.hovered && !square.disabled ? 1 : 0.55)
        }
        HoverHandler { id: squareHover; cursorShape: square.disabled ? Qt.ArrowCursor : Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; enabled: !square.disabled; onTapped: square.clicked() }
        Tip { text: square.hint }
    }

    ColumnLayout {
        id: body
        x: 16; y: 16
        width: parent.width - 32
        spacing: 12

        /* ── Nombre, estado y fijado ───────────────────────────────── */
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Rectangle {
                Layout.preferredWidth: 36
                Layout.preferredHeight: 36
                Layout.alignment: Qt.AlignTop
                radius: Theme.radiusLg
                color: Theme.tintHover
                border.width: 1
                border.color: Theme.hairline
                Icon {
                    anchors.centerIn: parent
                    size: 20
                    name: root.unitIcon.name || ""
                    path: root.unitIcon.path || paths[name] || ""
                    color: Theme.ink(0.7)
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Label {
                    Layout.fillWidth: true
                    text: root.name
                    font.weight: Font.DemiBold
                    Tip { text: root.name }
                }
                Label {
                    Layout.fillWidth: true
                    text: root.service.displayName || root.service.subState || ""
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                    Tip { text: String(root.service.displayName || "") }
                }
            }

            RowLayout {
                Layout.alignment: Qt.AlignTop
                spacing: 6

                Badge {
                    Layout.alignment: Qt.AlignVCenter
                    tone: root.unitState === "active" ? "emerald" : root.unitState === "failed" ? "rose" : ""
                    text: root.unitState === "active" ? "Activo"
                        : root.unitState === "failed" ? "Fallido"
                        : root.unitState === "inactive" ? "Inactivo" : "Desconocido"
                }

                Item {
                    id: pin
                    Layout.preferredWidth: 28
                    Layout.preferredHeight: 28
                    Accessible.role: Accessible.Button
                    Accessible.name: root.pinned ? "Quitar " + root.name + " de fijados" : "Fijar " + root.name
                    Icon {
                        anchors.centerIn: parent
                        size: 14
                        path: root.pathPin
                        color: root.pinned ? Theme.tone("violet").text : Theme.ink(pinHover.hovered ? 0.75 : 0.35)
                        fill: root.pinned ? Theme.tone("violet").text : "transparent"
                    }
                    HoverHandler { id: pinHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.pinToggled(root.name) }
                    Tip { text: root.pinned ? "Quitar de fijados" : "Fijar arriba" }
                }
            }
        }

        /* ── Arranque automático, PID y memoria ────────────────────── */
        Flow {
            Layout.fillWidth: true
            spacing: 12

            Item {
                id: boot
                readonly property bool disabled: root.busy || (root.unitEnabled && root.protectedUnit)
                readonly property bool hot: bootHover.hovered && !disabled
                width: bootLabel.implicitWidth + 12
                height: 22
                opacity: disabled ? 0.4 : 1
                Accessible.role: Accessible.Button
                Accessible.name: bootLabel.text

                Rectangle {
                    anchors.fill: parent
                    radius: Theme.radiusMd
                    color: "transparent"
                    border.width: 1
                    border.color: root.unitEnabled || boot.hot ? Theme.hairline : "transparent"
                }
                Label {
                    id: bootLabel
                    anchors.centerIn: parent
                    text: root.running === "enable" || root.running === "disable" ? "Guardando…"
                        : root.unitEnabled ? "Habilitado al arranque" : "No habilitado"
                    tone: root.unitEnabled ? (boot.hot ? 1 : 0.6) : (boot.hot ? 0.7 : 0.35)
                    font.pixelSize: Theme.textXs
                }
                HoverHandler { id: bootHover; cursorShape: boot.disabled ? Qt.ArrowCursor : Qt.PointingHandCursor }
                TapHandler {
                    gesturePolicy: TapHandler.ReleaseWithinBounds
                    enabled: !boot.disabled
                    onTapped: root.actionRequested(root.name, root.unitEnabled ? "disable" : "enable")
                }
                Tip {
                    text: root.unitEnabled && root.protectedUnit
                        ? "El panel no deshabilita las unidades que sostienen su propia conexión"
                        : root.unitEnabled ? "Quitar del arranque automático" : "Arrancar junto al sistema"
                }
            }
            Label {
                visible: !!root.service.pid
                height: 22
                verticalAlignment: Text.AlignVCenter
                text: "PID " + root.service.pid
                mono: true
                tone: 0.45
                font.pixelSize: Theme.textXs
            }
            Label {
                visible: Number(root.service.memory) > 0
                height: 22
                verticalAlignment: Text.AlignVCenter
                text: Format.bytes(Number(root.service.memory) || 0)
                mono: true
                tone: 0.45
                font.pixelSize: Theme.textXs
            }
        }

        /* ── Acciones ──────────────────────────────────────────────── */
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            ToneButton {
                family: "emerald"
                iconPath: root.pathPlay
                loading: root.running === "start"
                text: loading ? "Iniciando…" : "Iniciar"
                disabled: root.busy || root.unitState === "active"
                onClicked: root.actionRequested(root.name, "start")
            }
            ToneButton {
                family: "rose"
                iconPath: root.pathPause
                loading: root.running === "stop"
                text: loading ? "Parando…" : "Parar"
                disabled: root.busy || root.unitState !== "active" || root.protectedUnit
                hint: root.protectedUnit ? "El panel controla el servidor por SSH: parar esta unidad lo dejaría incomunicado" : ""
                onClicked: root.actionRequested(root.name, "stop")
            }
            SquareButton {
                iconPath: root.pathRestart
                loading: root.running === "restart"
                disabled: root.busy
                hint: "Reiniciar"
                label: "Reiniciar " + root.name
                onClicked: root.actionRequested(root.name, "restart")
            }
            SquareButton {
                iconPath: root.pathLogs
                hint: "Ver el journal"
                label: "Ver el journal de " + root.name
                onClicked: root.logsRequested(root.name)
            }
        }
    }
}
