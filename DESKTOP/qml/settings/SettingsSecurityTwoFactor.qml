import QtQuick
import QtQuick.Dialogs
import StartCode

/* Verificación en dos pasos: activar (QR + secreto + código), desactivar,
   regenerar los códigos de respaldo y mostrarlos la única vez que existen
   en claro (el servidor solo guarda sus hashes). */
Column {
    id: root

    /* Tras activar, desactivar o regenerar cambia el usuario y sus sesiones:
       quien muestra la lista de sesiones la vuelve a pedir. */
    signal sessionsInvalidated()

    /* Estado real del usuario; se adelanta al resultado de cada acción. */
    property bool tf: Auth.user.twoFactorEnabled === true
    property bool lastSeenTf: Auth.user.twoFactorEnabled === true
    property var setupData: null
    property bool showDis: false
    property bool showRegen: false
    property string tfMsg: ""
    property string tfErr: ""
    /* Códigos de respaldo: se ven una única vez, al generarlos. */
    property var backupCodes: null

    property bool setupBusy: false
    property bool enableBusy: false
    property bool disableBusy: false
    property bool regenBusy: false

    readonly property int remaining: Number(Auth.user.backupCodesRemaining) || 0
    readonly property bool wide: width >= 520

    /* Trazo de «escudo tachado» (no está en el juego de iconos). */
    readonly property string shieldOffPath: "M2 2l20 20M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"

    spacing: 16

    /* Sincronizar cuando el usuario se recarga (solo si el dato cambió). */
    Connections {
        target: Auth
        function onUserChanged() {
            const now = Auth.user.twoFactorEnabled === true
            if (now === root.lastSeenTf) return
            root.lastSeenTf = now
            root.tf = now
        }
    }

    function errorText(error, fallback) {
        const m = error && typeof error.message === "string" ? error.message.trim() : ""
        return m !== "" ? error.message : fallback
    }

    function afterChange() {
        Auth.refreshUser()
        root.sessionsInvalidated()
    }

    function handleSetup() {
        if (setupBusy) return
        tfErr = ""; tfMsg = ""
        setupBusy = true
        Api.request("POST", "/auth/2fa/setup", null, (ok, data, error) => {
            root.setupBusy = false
            if (!ok) { root.tfErr = root.errorText(error, "Error al iniciar 2FA"); return }
            root.setupData = data
            enableCode.text = ""
        })
    }

    function handleEnable() {
        if (enableCode.text.length !== 6 || enableBusy) return
        tfErr = ""
        enableBusy = true
        Api.request("POST", "/auth/2fa/enable", { code: enableCode.text }, (ok, data, error) => {
            root.enableBusy = false
            if (!ok) { root.tfErr = root.errorText(error, "Código inválido"); return }
            root.tf = true
            root.setupData = null
            enableCode.text = ""
            root.backupCodes = data && data.backupCodes ? Array.from(data.backupCodes) : []
            root.tfMsg = "2FA activado correctamente"
            root.afterChange()
        })
    }

    function handleDisable() {
        if (disCode.text.length !== 6 || disPwd.text === "" || disableBusy) return
        tfErr = ""
        disableBusy = true
        Api.request("POST", "/auth/2fa/disable", { code: disCode.text, password: disPwd.text }, (ok, data, error) => {
            root.disableBusy = false
            if (!ok) { root.tfErr = root.errorText(error, "Contraseña o código inválidos"); return }
            root.tf = false
            root.showDis = false
            disCode.text = ""; disPwd.text = ""
            root.backupCodes = null
            root.tfMsg = "2FA desactivado correctamente"
            root.afterChange()
        })
    }

    function handleRegenerate() {
        if (regenCode.text.length !== 6 || regenPwd.text === "" || regenBusy) return
        tfErr = ""
        regenBusy = true
        Api.request("POST", "/auth/2fa/backup-codes/regenerate", { code: regenCode.text, password: regenPwd.text }, (ok, data, error) => {
            root.regenBusy = false
            if (!ok) { root.tfErr = root.errorText(error, "Contraseña o código inválidos"); return }
            root.backupCodes = data && data.backupCodes ? Array.from(data.backupCodes) : []
            root.showRegen = false
            regenCode.text = ""; regenPwd.text = ""
            root.tfMsg = "Códigos de respaldo regenerados"
            root.afterChange()
        })
    }

    function downloadCodes() {
        const folder = Transfers.downloadsDir()
        saveDialog.selectedFile = Transfers.urlFromLocalPath(Transfers.joinPath(folder, "startcode-codigos-respaldo.txt"))
        saveDialog.open()
    }

    FileDialog {
        id: saveDialog
        fileMode: FileDialog.SaveFile
        nameFilters: ["TXT (*.txt)"]
        defaultSuffix: "txt"
        onAccepted: {
            const codes = root.backupCodes
            if (!codes) return
            const dest = Transfers.localPathFromUrl(selectedFile)
            if (dest === "") {
                Toasts.error("No se pudieron guardar los códigos", "El destino elegido no es una carpeta local")
                return
            }
            const failure = App.writeTextFile(dest,
                "Códigos de respaldo — StartCode Panel\nCuenta: " + (Auth.user.email || "") + "\n\n" + codes.join("\n") + "\n")
            if (failure === "") Toasts.success("Códigos guardados", dest)
            else Toasts.error("No se pudieron guardar los códigos", failure)
        }
    }

    /* Cabecera de tarjeta: recuadro con icono, textos y una acción a la
       derecha, que baja a su propia línea cuando no cabe. */
    component HeadRow: Item {
        id: head
        property bool tileVisible: true
        property string iconName: ""
        property string iconPath: ""
        property string toneName: "emerald"
        property string title: ""
        property string desc: ""
        property string note: ""
        default property alias action: actionSlot.data

        readonly property bool stackedAction: width < 440
        readonly property real textX: tileVisible ? 56 : 0
        readonly property real topHeight: Math.max(tileVisible ? 44 : 0, textColumn.implicitHeight)

        implicitHeight: stackedAction ? topHeight + 12 + actionSlot.height : Math.max(topHeight, actionSlot.height)

        Rectangle {
            visible: head.tileVisible
            width: 44; height: 44
            y: head.stackedAction ? 0 : (head.height - height) / 2
            radius: Theme.radiusXl
            color: Qt.alpha(Theme.tone(head.toneName).base, 0.1)
            border.width: 1
            border.color: Qt.alpha(Theme.tone(head.toneName).base, 0.15)
            Icon {
                anchors.centerIn: parent
                size: 20
                name: head.iconName
                path: head.iconPath !== "" ? head.iconPath : (paths[name] ?? "")
                color: Theme.tone(head.toneName).text
            }
        }
        Column {
            id: textColumn
            x: head.textX
            y: head.stackedAction ? Math.max(0, (head.topHeight - implicitHeight) / 2) : (head.height - implicitHeight) / 2
            width: head.width - head.textX - (head.stackedAction ? 0 : actionSlot.width + 12)
            spacing: 2
            Label { width: parent.width; text: head.title; font.weight: Font.Medium }
            Label {
                width: parent.width
                text: head.desc
                tone: 0.55
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Label {
                visible: head.note !== ""
                width: parent.width
                text: head.note
                tone: 0.4
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
        Item {
            id: actionSlot
            width: childrenRect.width
            height: childrenRect.height
            x: head.stackedAction ? 0 : head.width - width
            y: head.stackedAction ? head.topHeight + 12 : (head.height - height) / 2
        }
    }

    /* Contraseña + código + botón de confirmar (desactivar y regenerar). */
    component ConfirmGrid: Grid {
        id: grid
        property alias password: passwordField
        property alias code: codeField
        default property alias button: buttonSlot.data
        signal submit()

        readonly property real cell: root.wide ? (width - spacing) / 2 : width

        columns: root.wide ? 2 : 1
        spacing: 8

        GlassField {
            id: passwordField
            width: grid.cell
            iconName: "key"
            password: true
            placeholder: "Contraseña actual"
            onAccepted: grid.submit()
        }
        Item {
            width: grid.cell
            height: Theme.fieldHeight
            SettingsSecurityCodeField {
                id: codeField
                width: parent.width - buttonSlot.width - 8
                onAccepted: grid.submit()
            }
            Item {
                id: buttonSlot
                anchors.right: parent.right
                width: childrenRect.width
                height: parent.height
            }
        }
    }

    component Divider: Rectangle {
        height: 1
        color: Theme.line
    }

    SettingsSectionTitle { width: root.width; text: "Autenticación de dos factores (2FA)" }

    /* Resultado de la última acción */
    SettingsSecurityCard {
        visible: root.tfMsg !== ""
        width: root.width
        pad: 12
        borderColor: Qt.alpha(Theme.ok, 0.2)
        Item {
            width: parent.width
            implicitHeight: Math.max(16, msgLabel.implicitHeight)
            height: implicitHeight
            Icon { anchors.verticalCenter: parent.verticalCenter; name: "check"; color: Theme.tone("emerald").text }
            Label {
                id: msgLabel
                x: 24
                width: parent.width - 24
                anchors.verticalCenter: parent.verticalCenter
                text: root.tfMsg
                color: Theme.tone("emerald").text
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }
    }
    SettingsSecurityCard {
        visible: root.tfErr !== ""
        width: root.width
        pad: 12
        borderColor: Qt.alpha(Theme.danger, 0.2)
        Label {
            width: parent.width
            text: root.tfErr
            color: Theme.tone("rose").text
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    /* ── Desactivado ─────────────────────────────────────────────── */
    SettingsSecurityCard {
        visible: !root.tf && !root.setupData
        width: root.width
        HeadRow {
            width: parent.width
            toneName: "amber"
            iconPath: root.shieldOffPath
            title: "2FA desactivado"
            desc: "Usa Google Authenticator, Authy o cualquier app TOTP"
            PrimaryButton {
                text: "Activar 2FA"
                loading: root.setupBusy
                enabled: !root.setupBusy
                onClicked: root.handleSetup()
            }
        }
    }

    /* ── Activación: QR, secreto y código ────────────────────────── */
    SettingsSecurityCard {
        visible: !root.tf && root.setupData !== null
        width: root.width
        pad: 20
        spacing: 16

        Label {
            width: parent.width
            textFormat: Text.StyledText
            text: "<b>Paso 1:</b> Escanea el QR con tu app autenticadora."
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Item {
            width: parent.width
            height: 176
            Image {
                id: qr
                anchors.centerIn: parent
                width: 176; height: 176
                source: root.setupData ? (root.setupData.qrCodeDataUrl || "") : ""
                fillMode: Image.PreserveAspectFit
                smooth: false
                Accessible.name: "QR 2FA"
            }
            Rectangle {
                anchors.fill: qr
                color: "transparent"
                border.width: 1
                border.color: Theme.hairline
            }
        }
        Rectangle {
            width: parent.width
            implicitHeight: Math.max(36, secretLabel.implicitHeight) + 24
            height: implicitHeight
            radius: Theme.radiusXl
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairline
            Label {
                id: secretLabel
                x: 12
                width: parent.width - 24 - 36 - 8
                anchors.verticalCenter: parent.verticalCenter
                text: root.setupData ? (root.setupData.secret || "") : ""
                mono: true
                color: Theme.tone("violet").text
                font.pixelSize: Theme.textXs
                wrapMode: Text.WrapAnywhere
                elide: Text.ElideNone
            }
            IconButton {
                anchors.right: parent.right
                anchors.rightMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                plain: true
                iconName: "copy"
                hint: "Copiar"
                onClicked: if (root.setupData) App.copy(root.setupData.secret)
            }
        }
        Label {
            width: parent.width
            textFormat: Text.StyledText
            text: "<b>Paso 2:</b> Ingresa el código de 6 dígitos que muestra la app."
            tone: 0.7
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Item {
            width: parent.width
            height: 48
            SettingsSecurityCodeField {
                id: enableCode
                large: true
                width: parent.width - enableButton.width - 8
                onAccepted: root.handleEnable()
            }
            PrimaryButton {
                id: enableButton
                anchors.right: parent.right
                implicitHeight: 48
                text: "Confirmar"
                loading: root.enableBusy
                enabled: enableCode.text.length === 6 && !root.enableBusy
                onClicked: root.handleEnable()
            }
        }
        GhostButton {
            implicitHeight: 32
            text: "Cancelar"
            onClicked: { root.setupData = null; enableCode.text = ""; root.tfErr = "" }
        }
    }

    /* ── Activado ────────────────────────────────────────────────── */
    SettingsSecurityCard {
        visible: root.tf
        width: root.width
        spacing: 16

        HeadRow {
            width: parent.width
            toneName: "emerald"
            iconName: "shield"
            title: "2FA activado"
            desc: "Tu cuenta está protegida con TOTP"
            note: "Tras verificar el código, este equipo no lo vuelve a pedir durante 7 días. Cambiar la contraseña o reactivar el 2FA lo pide de nuevo."
            DangerButton {
                text: "Desactivar"
                onClicked: {
                    root.showDis = !root.showDis
                    disCode.text = ""; disPwd.text = ""; root.tfErr = ""
                }
            }
        }

        /* Códigos de respaldo */
        Divider { width: parent.width }
        HeadRow {
            width: parent.width
            tileVisible: false
            title: "Códigos de respaldo"
            desc: root.remaining > 0
                  ? "Te quedan " + root.remaining + " de 10 sin usar."
                  : "No te quedan códigos: regenéralos para no perder el acceso."
            SecondaryButton {
                text: "Regenerar"
                onClicked: {
                    root.showRegen = !root.showRegen
                    regenCode.text = ""; regenPwd.text = ""; root.tfErr = ""
                }
            }
        }

        SettingsSecurityCard {
            visible: root.remaining > 0 && root.remaining <= 3
            width: parent.width
            pad: 12
            elevation: "flat"
            borderColor: Qt.alpha(Theme.warn, 0.2)
            Item {
                width: parent.width
                implicitHeight: Math.max(16, fewLabel.implicitHeight)
                height: implicitHeight
                Icon { anchors.verticalCenter: parent.verticalCenter; name: "alert"; color: Theme.tone("amber").text }
                Label {
                    id: fewLabel
                    x: 28
                    width: parent.width - 28
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Quedan pocos códigos de respaldo. Regenéralos y guárdalos en un sitio seguro."
                    color: Qt.alpha(Theme.tone("amber").text, 0.85)
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }

        /* Regenerar */
        Divider { visible: root.showRegen; width: parent.width }
        Column {
            visible: root.showRegen
            width: parent.width
            spacing: 12
            Label {
                width: parent.width
                text: "Los códigos actuales dejarán de servir. Confirma con tu contraseña y el código de la app:"
                tone: 0.7
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            ConfirmGrid {
                id: regenGrid
                width: parent.width
                onSubmit: root.handleRegenerate()
                PrimaryButton {
                    implicitHeight: Theme.fieldHeight
                    text: "Generar"
                    loading: root.regenBusy
                    enabled: regenCode.text.length === 6 && regenPwd.text !== "" && !root.regenBusy
                    onClicked: root.handleRegenerate()
                }
            }
        }

        /* Desactivar */
        Divider { visible: root.showDis; width: parent.width }
        Column {
            visible: root.showDis
            width: parent.width
            spacing: 12
            Label {
                width: parent.width
                text: "Desactivar exige contraseña y código: con el móvil robado, el código solo no basta."
                tone: 0.7
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            ConfirmGrid {
                id: disGrid
                width: parent.width
                onSubmit: root.handleDisable()
                DangerButton {
                    implicitHeight: Theme.fieldHeight
                    text: "Confirmar"
                    loading: root.disableBusy
                    enabled: disCode.text.length === 6 && disPwd.text !== "" && !root.disableBusy
                    onClicked: root.handleDisable()
                }
            }
        }
    }

    /* Accesos cortos a los campos de las dos confirmaciones. */
    readonly property var regenPwd: regenGrid.password
    readonly property var regenCode: regenGrid.code
    readonly property var disPwd: disGrid.password
    readonly property var disCode: disGrid.code

    /* ── Códigos recién generados ────────────────────────────────── */
    SettingsSecurityCard {
        visible: root.backupCodes !== null
        width: root.width
        pad: 20
        spacing: 16
        borderColor: Qt.alpha(Theme.warn, 0.25)

        Item {
            width: parent.width
            implicitHeight: saveText.implicitHeight
            height: implicitHeight
            Icon { y: 2; size: 20; name: "alert"; color: Theme.tone("amber").text }
            Column {
                id: saveText
                x: 32
                width: parent.width - 32
                spacing: 4
                Label { width: parent.width; text: "Guarda estos códigos ahora"; font.weight: Font.DemiBold }
                Label {
                    width: parent.width
                    text: "Es la única vez que se muestran. Cada uno sirve una sola vez y permite entrar si pierdes el acceso a la app autenticadora."
                    tone: 0.6
                    font.pixelSize: Theme.textXs
                    lineHeight: 1.3
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }

        Grid {
            id: codeGrid
            width: parent.width
            columns: width >= 420 ? 3 : 2
            spacing: 8
            Repeater {
                model: root.backupCodes || []
                Rectangle {
                    required property var modelData
                    width: (codeGrid.width - codeGrid.spacing * (codeGrid.columns - 1)) / codeGrid.columns
                    height: 36
                    radius: Theme.radiusLg
                    color: Theme.tintSunken
                    border.width: 1
                    border.color: Theme.hairline
                    Label {
                        anchors.centerIn: parent
                        width: parent.width - 8
                        horizontalAlignment: Text.AlignHCenter
                        text: parent.modelData
                        mono: true
                        color: Theme.tone("violet").text
                        font.letterSpacing: 0.7
                    }
                }
            }
        }

        Flow {
            width: parent.width
            spacing: 8
            SecondaryButton {
                text: "Copiar"
                onClicked: if (root.backupCodes) App.copy(root.backupCodes.join("\n"))
            }
            SecondaryButton {
                text: "Descargar"
                onClicked: root.downloadCodes()
            }
            PrimaryButton {
                text: "Ya los guardé"
                onClicked: root.backupCodes = null
            }
        }
    }
}
