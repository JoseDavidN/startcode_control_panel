import QtQuick
import QtQuick.Dialogs
import StartCode

/* Pestaña Sistema: versiones, estado del backend y de su base de datos,
   búsqueda de versiones nuevas, novedades y acciones de mantenimiento. */
Column {
    id: root

    /* `/health`: `{ status, version, environment, uptime, database: { status, name, engine } }`. */
    property var health: null
    property bool healthLoaded: false
    property double dataUpdatedAt: 0
    property bool showLogs: false

    readonly property bool isLoading: !healthLoaded
    readonly property string appVersion: AppVersion || "—"
    readonly property string appVersionText: appVersion !== "—" ? "v" + appVersion : "—"
    readonly property string lastChecked: dataUpdatedAt > 0 ? Qt.formatTime(new Date(dataUpdatedAt), "HH:mm:ss") : ""
    readonly property bool wide: width >= 640
    readonly property real halfWidth: wide ? (width - 20) / 2 : width

    readonly property string environment: health && health.environment ? health.environment : ""
    readonly property string envTone: environment === "production" ? "emerald" : environment === "development" ? "amber" : "violet"
    readonly property string envLabel: environment === "production" ? "Producción"
                                     : environment === "development" ? "Desarrollo" : environment || "—"
    readonly property bool dbConnected: !!health && !!health.database && health.database.status === "connected"

    /* Temas claros: el logo para fondo claro; el resto, el de fondo oscuro. */
    readonly property string logoSource: "qrc:/qt/qml/StartCode/assets/img/"
                                         + (Theme.name === "solar" ? "logo-fondo-claro-1200.png" : "logo-fondo-oscuro-1200.png")

    /* Lo que el original borra del equipo al limpiar la caché. No entran la
       sesión, las preferencias, los editores y consultas SQL guardados ni el
       `/clear` del asistente: son trabajo del usuario, no caché. */
    readonly property var cacheKeys: ["remember_me", "cloud_pinned_folders", "cloud_connection", "native_security_alerts"]

    function loadHealth(retried) {
        Api.request("GET", "/health", null, (ok, data, error) => {
            if (ok && data && typeof data === "object") {
                root.health = data
                root.dataUpdatedAt = Date.now()
                root.healthLoaded = true
                return
            }
            /* Un reintento, como el original. */
            if (!retried) { root.loadHealth(true); return }
            root.healthLoaded = true
        })
    }

    function handleClearCache() {
        cacheKeys.forEach(key => App.storeRemove(key))
        /* Los datos en memoria de esta pantalla se vuelven a pedir. */
        loadHealth(false)
        releaseNotes.refetch()
        Toasts.success("Caché limpiado", "Se eliminaron todos los datos en caché de la aplicación")
    }

    function handleExportConfig() {
        if (exportDialog.visible) return
        const folder = Transfers.downloadsDir()
        const name = "startcode-config-" + new Date().toISOString().split("T")[0] + ".json"
        exportDialog.currentFolder = Transfers.urlFromLocalPath(folder)
        exportDialog.selectedFile = Transfers.urlFromLocalPath(Transfers.joinPath(folder, name))
        exportDialog.open()
    }
    function writeConfig(path) {
        const prefs = Auth.preferences || {}
        const config = {
            exportDate: new Date().toISOString(),
            appVersion: appVersion,
            backendVersion: health ? health.version : undefined,
            environment: health ? health.environment : undefined,
            security: prefs.security,
            notifications: prefs.notifications,
            monitoring: prefs.monitoring,
            appearance: prefs.appearance
        }
        const failure = App.writeTextFile(path, JSON.stringify(config, null, 2))
        if (failure === "") Toasts.success("Configuración exportada", path)
        else Toasts.error("No se pudo exportar la configuración", failure)
    }

    Component.onCompleted: {
        loadHealth(false)
        /* Al abrir la pestaña se mira en silencio si hay versión nueva. */
        updater.run(true)
    }

    Timer { interval: 60000; running: true; repeat: true; onTriggered: root.loadHealth(false) }

    SettingsSystemUpdater { id: updater }

    FileDialog {
        id: exportDialog
        fileMode: FileDialog.SaveFile
        nameFilters: ["JSON (*.json)"]
        onAccepted: {
            const path = Transfers.localPathFromUrl(selectedFile)
            if (path === "") Toasts.error("No se pudo exportar la configuración", "El destino elegido no es una carpeta local")
            else root.writeConfig(path)
        }
    }

    /* Insignia de estado de las filas de información. */
    component SBadge: Rectangle {
        id: sbadge
        property string text: ""
        property string tone: "violet"
        readonly property var colors: Theme.tone(tone)
        implicitWidth: sbadgeLabel.implicitWidth + 20
        implicitHeight: 24
        radius: Theme.radiusMd
        color: Qt.alpha(colors.base, 0.15)
        border.width: 1
        border.color: Qt.alpha(colors.base, 0.2)
        Label {
            id: sbadgeLabel
            anchors.centerIn: parent
            text: sbadge.text
            color: sbadge.colors.text
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
    }

    /* Fila «etiqueta — valor»: el valor es texto monoespaciado o una insignia. */
    component InfoRow: Item {
        id: infoRow
        property string label: ""
        property string value: ""
        property string badgeText: ""
        property string badgeTone: "violet"
        property bool divider: true
        width: parent ? parent.width : 0
        implicitHeight: 44
        Rectangle { visible: infoRow.divider; width: parent.width; height: 1; color: Theme.line }
        Label {
            id: infoLabel
            x: 16
            anchors.verticalCenter: parent.verticalCenter
            text: infoRow.label
            tone: 0.55
        }
        Label {
            visible: infoRow.badgeText === ""
            anchors.right: parent.right
            anchors.rightMargin: 16
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, parent.width - infoLabel.width - 48)
            text: infoRow.value
            tone: 0.9
            mono: true
        }
        SBadge {
            visible: infoRow.badgeText !== ""
            anchors.right: parent.right
            anchors.rightMargin: 16
            anchors.verticalCenter: parent.verticalCenter
            text: infoRow.badgeText
            tone: infoRow.badgeTone
        }
    }

    /* Caja del icono de una fila. */
    component IconBox: Rectangle {
        id: iconBox
        property string iconName: ""
        property bool brand: false
        property bool loading: false
        width: 44; height: 44
        radius: Theme.radiusXl
        color: brand ? Theme.brand1(0.1) : Theme.tintSunken
        border.width: 1
        border.color: brand ? Theme.brand1(0.2) : Theme.hairlineSoft
        Icon {
            visible: !iconBox.loading
            anchors.centerIn: parent
            name: iconBox.iconName
            size: 20
            color: iconBox.brand ? Theme.brandLight1 : Theme.ink(0.5)
        }
        Spinner { visible: iconBox.loading; anchors.centerIn: parent; size: 20; color: Theme.ink(0.5) }
    }

    spacing: 32

    /* ── Logo de la empresa ── */
    Glass {
        width: root.width
        implicitHeight: 160
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl

        Image {
            id: logo
            anchors.centerIn: parent
            width: Math.min(parent.width - 32, 224)
            height: 112
            fillMode: Image.PreserveAspectFit
            smooth: true
            mipmap: true
            source: root.logoSource
            Accessible.name: "StartCode"
        }
        /* Mientras el logo completo no esté entre los recursos, el icono de la app. */
        Image {
            visible: logo.status === Image.Error
            anchors.centerIn: parent
            width: 96; height: 96
            fillMode: Image.PreserveAspectFit
            smooth: true
            mipmap: true
            source: "qrc:/qt/qml/StartCode/assets/img/icono-oscuro-180.png"
        }
    }

    /* ── Sistema + base de datos en la misma fila ── */
    Grid {
        width: root.width
        columns: root.wide ? 2 : 1
        columnSpacing: 20
        rowSpacing: 20

        Column {
            width: root.halfWidth
            spacing: 16
            SettingsSectionTitle { width: parent.width; text: "Información del Sistema" }
            Glass {
                width: parent.width
                implicitHeight: systemRows.implicitHeight
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                Column {
                    id: systemRows
                    width: parent.width
                    InfoRow { label: "Versión app"; value: root.appVersionText; divider: false }
                    InfoRow {
                        label: "Versión backend"
                        value: root.isLoading ? "…" : root.health && root.health.version ? "v" + root.health.version : "—"
                    }
                    InfoRow {
                        label: "Entorno"
                        value: "…"
                        badgeText: root.isLoading ? "" : root.envLabel
                        badgeTone: root.envTone
                    }
                }
            }
        }

        Column {
            width: root.halfWidth
            spacing: 16
            SettingsSectionTitle { width: parent.width; text: "Base de Datos" }
            Glass {
                width: parent.width
                implicitHeight: dbRows.implicitHeight
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                Column {
                    id: dbRows
                    width: parent.width
                    InfoRow {
                        label: "Motor"
                        value: root.isLoading ? "…"
                             : root.health && root.health.database && root.health.database.engine ? root.health.database.engine : "PostgreSQL"
                        divider: false
                    }
                    InfoRow {
                        label: "Estado"
                        value: "…"
                        badgeText: root.isLoading ? "" : root.dbConnected ? "Conectada" : "Desconectada"
                        badgeTone: root.dbConnected ? "emerald" : "rose"
                    }
                    InfoRow {
                        label: "Base de datos"
                        value: root.isLoading ? "…"
                             : root.health && root.health.database && root.health.database.name ? root.health.database.name : "—"
                    }
                }
            }
        }
    }

    Rectangle { width: root.width; height: 1; color: Theme.line }

    /* ── Actualización ── */
    Column {
        width: root.width
        spacing: 16

        SettingsSectionTitle { width: parent.width; text: "Actualización" }

        Column {
            width: parent.width
            spacing: 12

            /* Versión instalada */
            Glass {
                width: parent.width
                implicitHeight: Math.max(76, installedTexts.implicitHeight + 32)
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl

                IconBox { id: installedIcon; x: 16; anchors.verticalCenter: parent.verticalCenter; iconName: "download"; brand: true }
                Column {
                    id: installedTexts
                    anchors.left: installedIcon.right
                    anchors.leftMargin: 16
                    anchors.right: installedState.left
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Label { width: parent.width; text: "Versión instalada"; font.weight: Font.Medium }
                    Label {
                        width: parent.width
                        text: root.appVersionText + (root.lastChecked !== "" ? "  · Actualizado " + root.lastChecked : "")
                        tone: 0.5
                        mono: true
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
                Item {
                    id: installedState
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    width: newBadge.visible ? newBadge.width : upToDate.visible ? upToDate.width : 0
                    height: 24
                    SBadge {
                        id: newBadge
                        visible: updater.available && updater.info !== null
                        text: updater.info ? "v" + updater.info.version + " disponible" : ""
                        tone: "violet"
                    }
                    Row {
                        id: upToDate
                        visible: !updater.available && !updater.checking && updater.info === null
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 6
                        Icon { anchors.verticalCenter: parent.verticalCenter; name: "checkCircle"; color: Theme.ok }
                        Label { anchors.verticalCenter: parent.verticalCenter; text: "Al día"; color: Theme.ok; font.pixelSize: Theme.textXs }
                    }
                }
            }

            /* Versión nueva: notas y enlace a las descargas */
            Glass {
                visible: updater.available && updater.info !== null
                width: parent.width
                implicitHeight: newBody.implicitHeight + 32
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                borderColor: Theme.brand1(0.15)

                Column {
                    id: newBody
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 12
                    Label {
                        width: parent.width
                        text: "Nueva versión disponible: v" + (updater.info ? updater.info.version : "")
                        color: Theme.brandLight1
                        font.weight: Font.Medium
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Label {
                        visible: !!updater.info && updater.info.body !== ""
                        width: parent.width
                        text: updater.info ? updater.info.body : ""
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                        lineHeight: 1.35
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Flow {
                        width: parent.width
                        spacing: 12
                        SettingsSystemButton {
                            kind: "brand"
                            compact: true
                            iconName: "download"
                            text: "Descargar actualización"
                            hint: updater.downloadsUrl
                            onClicked: updater.openDownloads()
                        }
                        Label {
                            height: 36
                            verticalAlignment: Text.AlignVCenter
                            text: "Se abre el sitio de versiones en el navegador."
                            tone: 0.5
                            font.pixelSize: Theme.textXs
                        }
                    }
                }
            }

            /* Error de la búsqueda */
            Glass {
                visible: updater.errorText !== ""
                width: parent.width
                implicitHeight: Math.max(40, updaterError.implicitHeight + 24)
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl
                borderColor: Qt.alpha(Theme.danger, 0.2)
                Icon { x: 12; anchors.verticalCenter: parent.verticalCenter; name: "alertCircle"; color: Theme.danger }
                Label {
                    id: updaterError
                    x: 36
                    width: parent.width - 48
                    anchors.verticalCenter: parent.verticalCenter
                    text: updater.errorText
                    color: Theme.danger
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }

            SettingsNotifRow {
                width: parent.width
                iconName: "bell"
                iconColor: Theme.tone("sky").text
                title: "Notificar nuevas versiones"
                desc: "Mostrar un aviso cuando haya una versión nueva"
                on: updater.prefs.notify
                onChange: value => updater.setPref("notify", value)
            }

            /* Comprobar actualizaciones */
            Glass {
                width: parent.width
                implicitHeight: Math.max(76, checkTexts.implicitHeight + 32)
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl

                IconBox { id: checkIcon; x: 16; anchors.verticalCenter: parent.verticalCenter; iconName: "refresh"; loading: updater.checking }
                Column {
                    id: checkTexts
                    anchors.left: checkIcon.right
                    anchors.leftMargin: 16
                    anchors.right: checkButton.left
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Label {
                        width: parent.width
                        text: "Comprobar actualizaciones"
                        font.weight: Font.Medium
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Label {
                        width: parent.width
                        text: updater.checking ? "Buscando actualizaciones…"
                            : updater.available ? "Hay una actualización disponible"
                            : "Se comprueba al abrir la app y cada 6 horas"
                        tone: 0.5
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
                SettingsSystemButton {
                    id: checkButton
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    kind: "brand"
                    compact: true
                    iconName: "refresh"
                    loading: updater.checking
                    text: updater.checking ? "Comprobando…" : "Comprobar"
                    enabled: !updater.checking
                    onClicked: updater.checkForUpdates()
                }
            }
        }
    }

    Rectangle { width: root.width; height: 1; color: Theme.line }

    /* ── Novedades ── */
    Column {
        width: root.width
        spacing: 16
        SettingsSectionTitle { width: parent.width; text: "Novedades" }
        ReleaseNotes { id: releaseNotes; width: parent.width; installedVersion: root.appVersion }
    }

    Rectangle { width: root.width; height: 1; color: Theme.line }

    /* ── Acciones del sistema ── */
    Column {
        width: root.width
        spacing: 16

        SettingsSectionTitle { width: parent.width; text: "Acciones del Sistema" }

        Flow {
            width: parent.width
            spacing: 12
            SettingsSystemButton { iconName: "refresh"; text: "Limpiar caché"; onClicked: root.handleClearCache() }
            SettingsSystemButton { iconName: "database"; text: "Exportar configuración"; onClicked: root.handleExportConfig() }
            SettingsSystemButton {
                kind: root.showLogs ? "active" : "soft"
                iconName: "terminal"
                text: root.showLogs ? "Ocultar estado" : "Ver estado"
                onClicked: root.showLogs = !root.showLogs
            }
        }

        /* Estado en tiempo real, con aspecto de consola */
        Rectangle {
            visible: root.showLogs && root.health !== null
            width: parent.width
            implicitHeight: 41 + logLines.implicitHeight + 32
            radius: Theme.radiusXl
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairline
            clip: true

            Item {
                id: logHead
                width: parent.width
                height: 40
                Rectangle {
                    id: logDot
                    x: 16
                    anchors.verticalCenter: parent.verticalCenter
                    width: 10; height: 10; radius: 5
                    color: Theme.ok
                }
                Label {
                    anchors.left: logDot.right
                    anchors.leftMargin: 8
                    anchors.right: logTime.left
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    text: "sistema — estado en tiempo real"
                    tone: 0.55
                    mono: true
                    font.pixelSize: Theme.textXs
                }
                Label {
                    id: logTime
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.lastChecked
                    tone: 0.3
                    mono: true
                    font.pixelSize: Theme.textXs
                }
            }
            Rectangle { y: 40; width: parent.width; height: 1; color: Theme.line }

            Column {
                id: logLines
                x: 16; y: 57
                width: parent.width - 32
                spacing: 6

                Repeater {
                    model: root.health ? [
                        { t: "INFO", msg: "Backend v" + root.health.version + " — " + root.health.environment },
                        { t: root.dbConnected ? "OK" : "ERR", msg: root.dbConnected ? "PostgreSQL conectado" : "PostgreSQL desconectado" }
                    ] : []
                    Item {
                        id: logLine
                        required property var modelData
                        width: logLines.width
                        implicitHeight: logMsg.implicitHeight
                        Label {
                            id: logTag
                            text: "[" + (logLine.modelData.t + "    ").slice(0, 4) + "]"
                            color: logLine.modelData.t === "OK" ? Theme.ok
                                 : logLine.modelData.t === "ERR" ? Theme.danger : Theme.brandLight1
                            mono: true
                            font.pixelSize: Theme.textXs
                        }
                        Label {
                            id: logMsg
                            anchors.left: logTag.right
                            anchors.leftMargin: 12
                            anchors.right: parent.right
                            text: logLine.modelData.msg
                            tone: 0.7
                            mono: true
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                        }
                    }
                }
            }
        }
    }
}
