import QtQuick
import QtQuick.Templates as T
import StartCode

/* Configuración → Notificaciones: qué avisos se reciben. Los de la cuenta
   (preferencias `notifications`) salen dentro de la app; las alertas de
   seguridad pueden salir además como notificación del sistema, y ese ajuste
   se guarda solo en este equipo. */
Column {
    id: root

    readonly property var prefs: (Auth.preferences || {}).notifications || {}
    readonly property var thresholds: (Auth.preferences || {}).monitoring || {}

    /* Del equipo: activado mientras no se guarde otra cosa. */
    property bool securityAlerts: true
    /* `granted` o `denied`: aquí el sistema no pregunta, o hay servicio de notificaciones o no. */
    property string permission: "granted"

    readonly property string ramPath: "M4 7h16a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 7zM7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2"
    readonly property string diskPath: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 14h18M6 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
    readonly property string shieldCheckPath: "M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3zM9 12l2 2 4-4"

    /* La leyenda lleva las insignias dentro del párrafo: se compone palabra a palabra. */
    readonly property var legendTokens: "Las notificaciones @inapp aparecen como toasts dentro de la app. Las notificaciones @native usan el sistema operativo y se entregan incluso cuando la app está en segundo plano o minimizada.".split(" ")

    spacing: 32

    Component.onCompleted: {
        const saved = App.storeGet("native_security_alerts")
        if (typeof saved === "boolean") securityAlerts = saved
        refreshPermission()
    }

    function refreshPermission() {
        permission = App.notificationsAvailable() ? "granted" : "denied"
    }

    function setPref(key, value) {
        const next = Object.assign({}, root.prefs)
        next[key] = value
        Auth.patchPreferences("notifications", next)
    }

    function setSecurityAlerts(value) {
        securityAlerts = value
        App.storeSet("native_security_alerts", value)
    }

    function testToast(type) {
        const t = root.thresholds
        switch (type) {
        case "serverOffline":
            Toasts.error("prod-server-01 desconectado", "El servidor dejó de responder al agente.")
            break
        case "highCpuUsage":
            Toasts.warning("CPU alta en prod-server-01", `Uso de CPU: ${t.cpuThreshold + 5}% (umbral ${t.cpuThreshold}%)`)
            break
        case "highMemoryUsage":
            Toasts.warning("Memoria alta en prod-server-01", `Uso de RAM: ${t.memoryThreshold + 3}% (umbral ${t.memoryThreshold}%)`)
            break
        case "highDiskUsage":
            Toasts.warning("Disco crítico en prod-server-01", `Uso de disco: ${t.diskThreshold + 2}% (umbral ${t.diskThreshold}%)`)
            break
        case "weeklyReport":
            Toasts.info("Reporte semanal listo", "El resumen de actividad de la semana está disponible.")
            break
        case "productNews":
            Toasts.info("Nueva versión disponible", `StartCode Panel v${AppVersion} ya está lista para actualizar.`)
            break
        default:
            Toasts.info("Notificación de prueba", "El sistema de notificaciones funciona correctamente.")
        }
    }

    /* Si el sistema no la entrega, sale dentro de la app: la alerta no se pierde ni se duplica. */
    function testNative() {
        const title = "Alerta de seguridad — StartCode"
        const body = "Se detectó un intento de acceso no autorizado en prod-server-01 desde 203.0.113.45."
        const sent = App.notify(title, body)
        refreshPermission()
        if (!sent) Toasts.error(title, body + "\n(No se pudo mostrar como notificación del sistema.)")
    }

    /* ── Insignia de canal ─────────────────────────────────────────── */
    component ChannelBadge: Rectangle {
        id: badge
        /* `inapp` | `native` */
        property string type: "inapp"
        readonly property bool system: type === "native"
        readonly property color ink: system ? Theme.tone("amber").text : Theme.tone("violet").text

        implicitWidth: badgeRow.implicitWidth + 12
        implicitHeight: 17
        width: implicitWidth
        height: implicitHeight
        radius: 4
        color: system ? Qt.alpha(Theme.warn, 0.1) : Theme.brand1(0.1)
        border.width: 1
        border.color: system ? Qt.alpha(Theme.warn, 0.2) : Theme.brand1(0.2)

        Row {
            id: badgeRow
            anchors.centerIn: parent
            spacing: 4
            Icon {
                id: badgeIcon
                anchors.verticalCenter: parent.verticalCenter
                size: 12
                color: badge.ink
                path: badge.system ? "M4 3h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2zM8 21h8M12 17v4"
                                   : (badgeIcon.paths["bell"] ?? "")
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: badge.system ? "Sistema" : "In-app"
                color: badge.ink
                mono: true
                font.pixelSize: Theme.textCaption
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 0.5
                elide: Text.ElideNone
            }
        }
    }

    /* ── Botón pequeño de fila («Probar») ──────────────────────────── */
    component SmallButton: T.Button {
        id: small
        implicitHeight: 28
        implicitWidth: smallLabel.implicitWidth + 24
        hoverEnabled: true
        background: Glass {
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusLg
            highlighted: small.hovered
            borderColor: small.visualFocus ? Theme.focusRing
                       : small.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        contentItem: Item {
            Label {
                id: smallLabel
                anchors.centerIn: parent
                text: small.text
                tone: small.hovered ? 1 : 0.65
                font.pixelSize: Theme.textXs
                elide: Text.ElideNone
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
    }

    /* ── Fila de aviso: icono, título con su canal, descripción, prueba e interruptor ── */
    component NotifRowFull: Item {
        id: row
        property string iconName: ""
        /* Trazo propio cuando el icono no está en el juego. */
        property string iconPath: ""
        property color iconColor: Theme.ink(0.7)
        property string title: ""
        property string desc: ""
        property bool on: false
        property string channel: "inapp"
        /* Última de su grupo: sin línea inferior. */
        property bool last: false
        signal change(bool value)
        signal test()

        width: parent ? parent.width : 0
        implicitHeight: Math.max(texts.implicitHeight, controls.height) + 24
        height: implicitHeight

        Icon {
            id: rowIcon
            y: 14
            color: row.iconColor
            path: row.iconPath !== "" ? row.iconPath : (rowIcon.paths[row.iconName] ?? "")
        }
        Column {
            id: texts
            x: 32
            y: 12
            width: Math.max(0, row.width - 32 - 16 - controls.width)
            spacing: 4
            Flow {
                width: parent.width
                spacing: 8
                Label {
                    width: Math.min(implicitWidth, texts.width)
                    text: row.title
                    font.weight: Font.Medium
                }
                ChannelBadge { type: row.channel }
            }
            Label {
                width: parent.width
                text: row.desc
                tone: 0.5
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
        Row {
            id: controls
            anchors.right: parent.right
            y: 12
            height: 28
            spacing: 8
            SmallButton {
                anchors.verticalCenter: parent.verticalCenter
                visible: row.on
                text: "Probar"
                onClicked: row.test()
            }
            Toggle {
                id: rowToggle
                anchors.verticalCenter: parent.verticalCenter
                checked: row.on
                Accessible.name: row.title
                onToggled: {
                    /* El valor lo manda la preferencia: se repone el enlace que rompe el clic. */
                    const value = checked
                    checked = Qt.binding(() => row.on)
                    row.change(value)
                }
            }
        }
        Rectangle {
            visible: !row.last
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.line
        }
    }

    /* ── Leyenda ───────────────────────────────────────────────────── */
    Glass {
        width: root.width
        height: legend.implicitHeight + 32
        implicitHeight: height
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl

        Icon {
            x: 16; y: 18
            path: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8v4M12 16v.01"
            color: Theme.tone("violet").text
        }
        Flow {
            id: legend
            x: 44; y: 16
            width: parent.width - 60
            spacing: 3
            Repeater {
                model: root.legendTokens
                Item {
                    id: token
                    required property string modelData
                    readonly property bool chip: modelData.charAt(0) === "@"
                    width: chip ? tokenBadge.width : tokenWord.implicitWidth
                    height: 17
                    Label {
                        id: tokenWord
                        visible: !token.chip
                        anchors.verticalCenter: parent.verticalCenter
                        text: token.modelData
                        tone: 0.6
                        font.pixelSize: Theme.textXs
                        elide: Text.ElideNone
                    }
                    ChannelBadge {
                        id: tokenBadge
                        visible: token.chip
                        type: token.chip ? token.modelData.slice(1) : "inapp"
                    }
                }
            }
        }
    }

    SettingsGroup {
        width: root.width
        title: "Alertas de Servidores"

        NotifRowFull {
            iconName: "warn"
            iconColor: Theme.tone("rose").text
            title: "Servidor desconectado"
            desc: "Alerta cuando un servidor deje de responder al agente de monitoreo"
            on: !!root.prefs.serverOffline
            onChange: value => root.setPref("serverOffline", value)
            onTest: root.testToast("serverOffline")
        }
        NotifRowFull {
            iconName: "cpu"
            iconColor: Theme.tone("amber").text
            title: "Uso alto de CPU"
            desc: "Alerta cuando el uso de CPU supere el umbral configurado en Monitoreo"
            on: !!root.prefs.highCpuUsage
            onChange: value => root.setPref("highCpuUsage", value)
            onTest: root.testToast("highCpuUsage")
        }
        NotifRowFull {
            iconPath: root.ramPath
            iconColor: Theme.tone("sky").text
            title: "Uso alto de Memoria"
            desc: "Alerta cuando el uso de RAM supere el umbral configurado en Monitoreo"
            on: !!root.prefs.highMemoryUsage
            onChange: value => root.setPref("highMemoryUsage", value)
            onTest: root.testToast("highMemoryUsage")
        }
        NotifRowFull {
            iconPath: root.diskPath
            iconColor: Theme.tone("violet").text
            title: "Uso alto de Disco"
            desc: "Alerta cuando el espacio en disco supere el umbral configurado en Monitoreo"
            on: !!root.prefs.highDiskUsage
            last: true
            onChange: value => root.setPref("highDiskUsage", value)
            onTest: root.testToast("highDiskUsage")
        }
    }

    SettingsGroup {
        width: root.width
        title: "Alertas de Seguridad"

        NotifRowFull {
            iconPath: root.shieldCheckPath
            iconColor: Theme.tone("emerald").text
            title: "Alertas de seguridad"
            desc: "Intentos de acceso sospechosos y eventos críticos de seguridad. Se envían como notificación nativa del SO para garantizar visibilidad incluso fuera de la app."
            on: root.securityAlerts
            channel: "native"
            last: !root.securityAlerts
            onChange: value => root.setSecurityAlerts(value)
            onTest: root.testNative()
        }
        Item {
            visible: root.securityAlerts
            width: parent ? parent.width : 0
            height: permissionBox.height + 8
            implicitHeight: height

            Glass {
                id: permissionBox
                y: 8
                width: parent.width
                height: permissionText.implicitHeight + 24
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                borderColor: Qt.alpha(Theme.warn, 0.2)

                Icon {
                    x: 12
                    anchors.verticalCenter: parent.verticalCenter
                    path: "M12 9v4M12 17v.01M10.3 3.3L2 19a2 2 0 001.7 3h16.6A2 2 0 0022 19L13.7 3.3a2 2 0 00-3.4 0z"
                    color: Theme.tone("amber").text
                }
                Label {
                    id: permissionText
                    x: 40
                    width: parent.width - 52
                    anchors.verticalCenter: parent.verticalCenter
                    text: (root.permission === "granted"
                           ? "Activo en este equipo. El sistema tiene permiso para mostrar las alertas."
                           : "El sistema no permite notificaciones de StartCode Panel. Actívalas en los ajustes de notificaciones del sistema operativo; mientras tanto, las alertas salen dentro de la app.")
                          + " Este ajuste se guarda solo en este equipo."
                    color: Qt.alpha(Theme.tone("amber").text, 0.85)
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
    }

    SettingsGroup {
        width: root.width
        title: "Otros"

        NotifRowFull {
            iconName: "terminal"
            iconColor: Theme.tone("fuchsia").text
            title: "Reporte semanal"
            desc: "Resumen de actividad enviado cada lunes a las 9:00 AM"
            on: !!root.prefs.weeklyReport
            onChange: value => root.setPref("weeklyReport", value)
            onTest: root.testToast("weeklyReport")
        }
        NotifRowFull {
            iconName: "gear"
            iconColor: Theme.tone("fuchsia").text
            title: "Novedades del producto"
            desc: "Avisos sobre nuevas versiones y funciones de StartCode Panel"
            on: !!root.prefs.productNews
            last: true
            onChange: value => root.setPref("productNews", value)
            onTest: root.testToast("productNews")
        }
    }
}
