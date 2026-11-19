import QtQuick
import StartCode

/* Sesiones abiertas de la cuenta (hasta 3): cuál es la actual, desde dónde
   se abrió cada una y revocar las demás. */
Column {
    id: root

    property var sessions: []
    property bool sessionsLoading: true
    property bool revoking: false

    spacing: 16

    Component.onCompleted: load()

    /* Vuelve a pedir la lista (tras revocar, o al cambiar el 2FA). */
    function load() {
        if (!Auth.authenticated) { sessionsLoading = false; return }
        Api.request("GET", "/auth/sessions", null, (ok, data) => {
            root.sessionsLoading = false
            if (ok) root.sessions = Array.isArray(data) ? data : Array.from(data || [])
        })
    }

    function revoke(id) {
        if (revoking) return
        revoking = true
        Api.request("DELETE", "/auth/sessions/" + encodeURIComponent(id), null, ok => {
            root.revoking = false
            if (ok) root.load()
        })
    }

    /* `app`: sesión de la app de escritorio, marcada con `StartCodePanel/<versión>`. */
    function parseUserAgent(ua) {
        const desktop = /StartCodePanel\/([\w.+-]+)/.exec(ua)
        const browser = desktop ? "App de escritorio v" + desktop[1]
                      : /Edg\//.test(ua) ? "Edge"
                      : /Chrome\//.test(ua) ? "Chrome"
                      : /Firefox\//.test(ua) ? "Firefox"
                      : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : "Navegador"
        /* Móviles antes: el UA de iOS dice «Mac OS X» y el de Android, «Linux». */
        const os = /iPhone|iPad/.test(ua) ? "iOS"
                 : /Android/.test(ua) ? "Android"
                 : /Mac OS X/.test(ua) ? "macOS"
                 : /Windows NT/.test(ua) ? "Windows"
                 : /Linux/.test(ua) ? "Linux" : "SO desconocido"
        return { browser: desktop ? browser : browser + " (web)", os: os, app: Boolean(desktop) }
    }

    /* Sesiones guardadas antes de normalizar la IP en el backend: `::ffff:1.2.3.4` → `1.2.3.4`. */
    function displayIp(ip) {
        return ip === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, "$1")
    }

    /* Título y «Cerrar sesión» */
    Item {
        width: root.width
        height: Math.max(sectionTitle.implicitHeight, logoutLink.height)
        SettingsSectionTitle {
            id: sectionTitle
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - logoutLink.width - 12
            text: "Sesiones activas"
        }
        Row {
            id: logoutLink
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            height: 24
            spacing: 6
            Accessible.role: Accessible.Button
            Accessible.name: "Cerrar sesión"
            readonly property color tint: logoutHover.hovered ? Theme.danger : Theme.tone("rose").text
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                size: 14
                path: "M2 2l20 20M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"
                color: logoutLink.tint
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: "Cerrar sesión"
                color: logoutLink.tint
                font.pixelSize: Theme.textXs
            }
            HoverHandler { id: logoutHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: Auth.logout() }
        }
    }

    Column {
        width: root.width
        spacing: 10

        SettingsSecurityCard {
            visible: root.sessionsLoading
            width: parent.width
            Row {
                spacing: 12
                Spinner { anchors.verticalCenter: parent.verticalCenter; color: Theme.ink(0.45) }
                Label { anchors.verticalCenter: parent.verticalCenter; text: "Cargando sesiones…"; tone: 0.45 }
            }
        }

        Repeater {
            model: root.sessionsLoading ? [] : root.sessions
            SettingsSecurityCard {
                id: row
                required property var modelData
                readonly property var ua: root.parseUserAgent(modelData.userAgent || "")
                readonly property bool current: modelData.current === true
                /* Con poco ancho, la insignia o el botón bajan a su propia línea. */
                readonly property bool stackedAction: width < 420

                width: parent.width

                Item {
                    width: parent.width
                    implicitHeight: row.stackedAction ? info.height + 12 + trailing.height : Math.max(info.height, trailing.height)
                    height: implicitHeight

                    Item {
                        id: info
                        width: parent.width - (row.stackedAction ? 0 : trailing.width + 16)
                        height: Math.max(40, infoText.implicitHeight)
                        y: row.stackedAction ? 0 : (parent.height - height) / 2

                        Rectangle {
                            width: 40; height: 40
                            anchors.verticalCenter: parent.verticalCenter
                            radius: Theme.radiusLg
                            color: row.current ? Qt.alpha(Theme.tone("emerald").base, 0.1) : Theme.tintSunken
                            border.width: 1
                            border.color: row.current ? Qt.alpha(Theme.tone("emerald").base, 0.15) : Theme.hairlineSoft
                            Icon {
                                anchors.centerIn: parent
                                size: 20
                                name: row.ua.app ? "monitor" : "globe"
                                color: row.current ? Theme.tone("emerald").text : Theme.ink(0.5)
                            }
                        }
                        Column {
                            id: infoText
                            x: 56
                            width: parent.width - 56
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 2
                            Label {
                                width: parent.width
                                text: row.ua.os + " · " + row.ua.browser
                                font.weight: Font.Medium
                            }
                            Row {
                                width: parent.width
                                Label {
                                    id: ipLabel
                                    text: row.modelData.ip ? "IP " + root.displayIp(String(row.modelData.ip)) : "IP desconocida"
                                    mono: Boolean(row.modelData.ip)
                                    tone: 0.55
                                    font.pixelSize: Theme.textXs
                                    width: Math.min(implicitWidth, parent.width)
                                    HoverTip { text: row.modelData.ip ? "IP desde la que se inició la sesión" : "" }
                                }
                                Label {
                                    width: Math.max(0, parent.width - ipLabel.width)
                                    text: " · activa " + Format.timeAgo(row.modelData.lastUsed)
                                    tone: 0.55
                                    font.pixelSize: Theme.textXs
                                }
                            }
                        }
                    }

                    Item {
                        id: trailing
                        width: row.current ? currentBadge.width : revokeButton.width
                        height: row.current ? currentBadge.height : revokeButton.height
                        x: row.stackedAction ? 0 : parent.width - width
                        y: row.stackedAction ? info.height + 12 : (parent.height - height) / 2

                        Rectangle {
                            id: currentBadge
                            visible: row.current
                            width: badgeLabel.implicitWidth + 20
                            height: 24
                            radius: Theme.radiusMd
                            color: Qt.alpha(Theme.tone("emerald").base, 0.15)
                            border.width: 1
                            border.color: Qt.alpha(Theme.tone("emerald").base, 0.2)
                            Label {
                                id: badgeLabel
                                anchors.centerIn: parent
                                text: "Sesión actual"
                                color: Theme.tone("emerald").text
                                font.pixelSize: Theme.textXs
                                font.weight: Font.Medium
                            }
                        }
                        DangerButton {
                            id: revokeButton
                            visible: !row.current
                            implicitHeight: 36
                            text: "Revocar"
                            enabled: !root.revoking
                            onClicked: root.revoke(row.modelData.id)
                        }
                    }
                }
            }
        }

        SettingsSecurityCard {
            visible: !root.sessionsLoading && root.sessions.length === 0
            width: parent.width
            Label { width: parent.width; text: "No hay sesiones registradas."; tone: 0.45 }
        }
    }

    Label {
        width: root.width
        text: "Puede haber hasta 3 sesiones abiertas por cuenta: al entrar desde un cuarto equipo, se cierra la que lleva más tiempo sin usarse. Cerrar sesión revoca sus tokens en el servidor, no solo en este equipo."
        tone: 0.35
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }
}
