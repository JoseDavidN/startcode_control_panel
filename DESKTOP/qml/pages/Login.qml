import QtQuick
import QtQuick.Layouts
import StartCode

/* Inicio de sesión, igual que el de la app web: tarjeta-ventana con el
   escaparate a la izquierda (solo en ventanas anchas) y, a la derecha, uno de
   tres pasos: credenciales, código 2FA o cambio de contraseña caducada. El
   paso lo decide el backend (`Auth.step`). */
Item {
    id: root

    required property Item backdrop

    /* Cortes de la app web: `lg` (dos columnas), `md` («Online») y `xl` (titular grande). */
    readonly property bool wide: width >= 1024
    readonly property bool medium: width >= 768
    readonly property bool extraWide: width >= 1280

    /* Error visible: el del backend o el de la validación local. */
    property string error: ""
    /* En el paso 2FA: código de respaldo en vez del de la app. */
    property bool useBackup: false

    readonly property string serverPath: "M4.5 4h15a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 9.5v-4A1.5 1.5 0 014.5 4zM4.5 13h15a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5v-4A1.5 1.5 0 014.5 13zM7 7.5h.01M7 16.5h.01M15 7.5h3M15 16.5h3"
    readonly property string shieldPath: "M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"
    readonly property string shieldCheckPath: shieldPath + "M9 12l2 2 4-4"

    /* ── Envíos ────────────────────────────────────────────────────── */
    function submitLogin() {
        if (Auth.busy)
            return
        const mail = email.text.trim()
        /* Lo que en la web bloquea el propio formulario (`required`, `type="email"`). */
        if (mail === "") {
            error = "Escribe tu correo electrónico."
            email.forceFocus()
            return
        }
        if (!/^[^\s@]+@[^\s@]+$/.test(mail)) {
            error = "Escribe un correo electrónico válido."
            email.forceFocus()
            return
        }
        if (password.text === "") {
            error = "Escribe tu contraseña."
            password.forceFocus()
            return
        }
        error = ""
        Auth.login(mail, password.text, remember.checked)
    }

    readonly property bool codeReady: useBackup ? backup.text.trim().length >= 8 : codeBoxes.code.length === 6
    function submitTwoFactor() {
        if (Auth.busy || !codeReady)
            return
        error = ""
        Auth.verifyTwoFactor(useBackup ? backup.text.trim() : codeBoxes.code, useBackup)
    }
    function toggleBackup() {
        useBackup = !useBackup
        error = ""
        codeBoxes.clear()
        backup.text = ""
        Qt.callLater(() => { if (root.useBackup) backup.forceFocus(); else codeBoxes.focusFirst() })
    }

    /* Misma política que el backend: 8–72 caracteres con minúscula, mayúscula,
       número y un carácter que no sea letra ni número. */
    function strongPassword(pw) {
        if (pw.length < 8 || pw.length > 72)
            return false
        let lower = false, upper = false, digit = false, special = false
        for (const ch of pw) {
            if (/[0-9]/.test(ch))
                digit = true
            else if (ch.toLowerCase() !== ch.toUpperCase()) {
                if (ch === ch.toLowerCase()) lower = true
                else upper = true
            } else
                special = true
        }
        return lower && upper && digit && special
    }
    function submitPasswordChange() {
        if (Auth.busy || newPassword.text === "" || confirmPassword.text === "")
            return
        error = ""
        if (!strongPassword(newPassword.text)) {
            error = "La nueva contraseña debe tener entre 8 y 72 caracteres, con mayúscula, minúscula, número y un carácter especial."
            return
        }
        if (newPassword.text !== confirmPassword.text) {
            error = "Las contraseñas no coinciden."
            return
        }
        /* La contraseña actual es la que se acaba de escribir en el primer paso. */
        Auth.changeExpiredPassword(password.text, newPassword.text)
    }

    Connections {
        target: Auth
        function onErrorChanged() {
            root.error = Auth.error
            /* Código rechazado: se vacía para escribir el siguiente. */
            if (Auth.error !== "" && Auth.step === "twoFactor") {
                codeBoxes.clear()
                backup.text = ""
                if (!root.useBackup)
                    codeBoxes.focusFirst()
            }
        }
        function onStepChanged() {
            root.error = ""
            root.useBackup = false
            codeBoxes.clear()
            backup.text = ""
            /* El foco, cuando el paso nuevo ya es visible. */
            Qt.callLater(() => {
                if (Auth.step === "twoFactor") codeBoxes.focusFirst()
                else if (Auth.step === "passwordChange") newPassword.forceFocus()
            })
        }
    }
    Component.onCompleted: email.forceFocus()

    /* ── Piezas ────────────────────────────────────────────────────── */
    component FieldLabel: Label {
        tone: 0.55
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
    }

    /* Accesos alternativos: como en la web, todavía sin acción. */
    component SsoButton: Glass {
        id: sso
        property string caption: ""
        property string iconPath: ""

        variant: "soft"
        radius: Theme.radiusXl
        implicitHeight: 44
        highlighted: ssoHover.hovered
        Accessible.role: Accessible.Button
        Accessible.name: caption

        Row {
            anchors.centerIn: parent
            spacing: 8
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                path: sso.iconPath
                size: 16
                strokeWidth: 1.6
                color: Theme.ink(ssoHover.hovered ? 1 : 0.75)
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: sso.caption
                tone: ssoHover.hovered ? 1 : 0.75
                font.pixelSize: Theme.textXs
            }
        }
        HoverHandler { id: ssoHover }
    }

    component FooterLink: Item {
        id: link
        property string caption: ""
        implicitWidth: linkText.implicitWidth
        implicitHeight: linkText.implicitHeight
        Label {
            id: linkText
            text: link.caption
            tone: linkHover.hovered ? 0.7 : 0.4
            font.pixelSize: Theme.textCaption
        }
        HoverHandler { id: linkHover; cursorShape: Qt.PointingHandCursor }
    }

    /* ── Tarjeta-ventana ───────────────────────────────────────────── */
    Glass {
        id: card
        anchors.centerIn: parent
        width: Math.max(0, Math.min(root.width - 40, 1280))
        height: Math.max(0, Math.min(root.height - 40, 820))
        backdrop: root.backdrop

        /* Barra de la ventana. */
        Item {
            id: chrome
            width: card.width; height: 40

            Label {
                x: 20
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, parent.width - 40)
                text: "startcode://auth/login"
                mono: true
                tone: 0.45
                font.pixelSize: Theme.textXs
            }
            Row {
                visible: root.medium
                anchors.right: parent.right
                anchors.rightMargin: 20
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 6; height: 6
                    radius: 3
                    color: Theme.ok
                    SequentialAnimation on opacity {
                        running: root.medium && !Theme.reducedMotion
                        loops: Animation.Infinite
                        NumberAnimation { from: 1; to: 0.5; duration: 1000; easing.type: Easing.InOutQuad }
                        NumberAnimation { from: 0.5; to: 1; duration: 1000; easing.type: Easing.InOutQuad }
                    }
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Online"
                    mono: true
                    tone: 0.45
                    font.pixelSize: 11
                }
            }
        }
        Rectangle {
            y: 40
            width: card.width; height: 1
            color: Theme.line
        }

        /* Izquierda: escaparate (1,15 partes de 2,15). */
        Loader {
            id: showcase
            active: root.wide
            x: 0; y: 41
            width: root.wide ? Math.round(card.width * 1.15 / 2.15) : 0
            height: card.height - 41
            sourceComponent: LoginShowcase { large: root.extraWide }
        }
        Rectangle {
            visible: root.wide
            x: showcase.width - 1; y: 41
            width: 1; height: card.height - 41
            color: Theme.line
        }

        /* Derecha: el formulario del paso actual. */
        ScrollArea {
            id: pane

            readonly property int pad: root.wide ? 48 : 32
            readonly property real formWidth: Math.max(0, Math.min(420, width - pad * 2))

            x: showcase.width; y: 41
            width: card.width - showcase.width
            height: card.height - 41
            contentHeight: Math.max(height, steps.height + pad * 2)

            Item {
                id: sheet
                width: pane.width
                height: pane.contentHeight

                /* Versión de la app. */
                Row {
                    visible: root.wide && steps.y >= 64
                    anchors.right: parent.right
                    anchors.rightMargin: 40
                    y: 40
                    spacing: 6
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        path: "M13 2L4 14h6l-1 8 9-12h-6l1-8z"
                        size: 20
                        strokeWidth: 1.6
                        color: Theme.ink(0.4)
                    }
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        text: AppVersion
                        mono: true
                        tone: 0.4
                        font.pixelSize: Theme.textCaption
                        font.capitalization: Font.AllUppercase
                        font.letterSpacing: 0.5
                    }
                }

                Item {
                    id: steps
                    anchors.centerIn: parent
                    width: pane.formWidth
                    height: Auth.step === "twoFactor" ? twoFactorStep.implicitHeight
                          : Auth.step === "passwordChange" ? passwordStep.implicitHeight
                          : loginStep.implicitHeight

                    /* ── Paso 1: credenciales ──────────────────────── */
                    Column {
                        id: loginStep
                        visible: Auth.step !== "twoFactor" && Auth.step !== "passwordChange"
                        width: parent.width
                        spacing: 0

                        LoginBrandHeader {
                            width: parent.width
                            iconPath: root.serverPath
                            iconSize: 25
                            title: "StartCode"
                            subtitle: "Cloud Console · Acceso seguro"
                        }

                        Item { width: 1; height: 32 }

                        Column {
                            width: parent.width
                            spacing: 14

                            Column {
                                width: parent.width
                                spacing: 6
                                FieldLabel { text: "Correo Electrónico" }
                                LoginField {
                                    id: email
                                    width: parent.width
                                    label: "Correo Electrónico"
                                    iconPath: "M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 7l9 6 9-6"
                                    placeholder: "admin@servidor.com"
                                    inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
                                    onAccepted: root.submitLogin()
                                }
                            }

                            Column {
                                width: parent.width
                                spacing: 6
                                FieldLabel { text: "Contraseña" }
                                LoginField {
                                    id: password
                                    width: parent.width
                                    label: "Contraseña"
                                    iconPath: "M6 11h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2zM8 11V7a4 4 0 018 0v4"
                                    placeholder: "••••••••"
                                    password: true
                                    revealable: true
                                    onAccepted: root.submitLogin()
                                }
                            }

                            Item {
                                width: parent.width
                                height: 24
                                CheckBox {
                                    id: remember
                                    anchors.bottom: parent.bottom
                                    text: "Mantener sesión iniciada"
                                    checked: true
                                }
                                Row {
                                    visible: remember.width + width + 12 <= parent.width
                                    anchors.right: parent.right
                                    anchors.bottom: parent.bottom
                                    spacing: 6
                                    Icon {
                                        anchors.verticalCenter: parent.verticalCenter
                                        path: root.shieldPath
                                        size: 20
                                        strokeWidth: 1.6
                                        color: Theme.ink(0.45)
                                    }
                                    Label {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "TLS 1.3 · E2E"
                                        mono: true
                                        tone: 0.45
                                        font.pixelSize: Theme.textXs
                                    }
                                }
                            }

                            /* Por qué se cerró la sesión anterior. */
                            LoginMessage {
                                width: parent.width
                                visible: Auth.notice !== "" && root.error === ""
                                kind: "notice"
                                text: Auth.notice
                            }
                            LoginMessage {
                                width: parent.width
                                visible: root.error !== ""
                                text: root.error
                            }

                            LoginSubmitButton {
                                width: parent.width
                                text: "Iniciar sesión"
                                loadingText: "Autenticando..."
                                iconPath: "M5 12h14M13 6l6 6-6 6"
                                loading: Auth.busy
                                enabled: !Auth.busy
                                onClicked: root.submitLogin()
                            }

                            Item {
                                width: parent.width
                                height: 23
                                RowLayout {
                                    anchors.fill: parent
                                    spacing: 12
                                    Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
                                    Label {
                                        text: "o continúa con"
                                        tone: 0.4
                                        font.pixelSize: Theme.textCaption
                                        font.weight: Font.DemiBold
                                        font.capitalization: Font.AllUppercase
                                        font.letterSpacing: 0.5
                                    }
                                    Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
                                }
                            }

                            Row {
                                id: ssoRow
                                width: parent.width
                                spacing: 8
                                SsoButton {
                                    width: (ssoRow.width - 16) / 3
                                    height: implicitHeight
                                    caption: "SSO"
                                    iconPath: root.shieldPath
                                }
                                SsoButton {
                                    width: (ssoRow.width - 16) / 3
                                    height: implicitHeight
                                    caption: "GitHub"
                                    iconPath: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
                                }
                                SsoButton {
                                    width: (ssoRow.width - 16) / 3
                                    height: implicitHeight
                                    caption: "WebAuthn"
                                    iconPath: "M5 12a7 7 0 0114 0v2M9 12a3 3 0 016 0v3M12 12v6M9 18c0 .7-.2 1.4-.5 2M15 18c0 1 .2 2 .7 3"
                                }
                            }
                        }

                        Item { width: 1; height: 28 }

                        Flow {
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: Math.min(parent.width, access1.implicitWidth + access2.implicitWidth + spacing)
                            spacing: 4
                            Label {
                                id: access1
                                text: "¿No tienes acceso?"
                                tone: 0.45
                                font.pixelSize: Theme.textXs
                            }
                            Label {
                                id: access2
                                text: "Contacta al administrador"
                                color: Theme.brandLight1
                                font.pixelSize: Theme.textXs
                                font.weight: Font.Medium
                            }
                        }
                    }

                    /* ── Paso 2: verificación 2FA ──────────────────── */
                    Column {
                        id: twoFactorStep
                        visible: Auth.step === "twoFactor"
                        width: parent.width
                        spacing: 24

                        LoginBrandHeader {
                            width: parent.width
                            iconPath: root.shieldCheckPath
                            title: "Verificación 2FA"
                            subtitle: "Ingresa el código de tu app autenticadora"
                        }

                        Column {
                            width: parent.width
                            spacing: 12

                            FieldLabel {
                                width: parent.width
                                horizontalAlignment: Text.AlignHCenter
                                text: root.useBackup ? "Código de respaldo" : "Código de 6 dígitos"
                            }
                            LoginCodeBoxes {
                                id: codeBoxes
                                visible: !root.useBackup
                                width: parent.width
                                onAccepted: root.submitTwoFactor()
                            }
                            Column {
                                visible: root.useBackup
                                width: parent.width
                                spacing: 8
                                LoginField {
                                    id: backup
                                    width: parent.width
                                    implicitHeight: 56
                                    label: "Código de respaldo"
                                    placeholder: "XXXX-XXXX"
                                    centered: true
                                    upperCase: true
                                    inkTone: 1
                                    maximumLength: 12
                                    inputMethodHints: Qt.ImhNoPredictiveText | Qt.ImhPreferUppercase
                                    onAccepted: root.submitTwoFactor()
                                }
                                Label {
                                    width: parent.width
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "Cada código sirve una sola vez."
                                    tone: 0.35
                                    font.pixelSize: Theme.textXs
                                }
                            }
                        }

                        Item {
                            width: parent.width
                            height: 20
                            Accessible.role: Accessible.Button
                            Accessible.name: backupSwitch.text
                            Label {
                                id: backupSwitch
                                anchors.centerIn: parent
                                width: Math.min(implicitWidth, parent.width)
                                text: root.useBackup ? "Usar el código de la app"
                                                     : "¿No tienes el móvil? Usa un código de respaldo"
                                color: backupHover.hovered ? Qt.lighter(Theme.brandLight1, 1.15) : Theme.brandLight1
                            }
                            HoverHandler { id: backupHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler {
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: root.toggleBackup()
                            }
                        }

                        LoginMessage {
                            width: parent.width
                            visible: root.error !== ""
                            centered: true
                            text: root.error
                        }

                        LoginSubmitButton {
                            width: parent.width
                            text: "Verificar Código"
                            loadingText: "Verificando..."
                            loading: Auth.busy
                            enabled: !Auth.busy && root.codeReady
                            onClicked: root.submitTwoFactor()
                        }

                        Item {
                            width: parent.width
                            height: 20
                            Accessible.role: Accessible.Button
                            Accessible.name: "Volver al inicio de sesión"
                            Row {
                                anchors.centerIn: parent
                                spacing: 6
                                Icon {
                                    anchors.verticalCenter: parent.verticalCenter
                                    path: "M19 12H5M12 19l-7-7 7-7"
                                    size: 20
                                    strokeWidth: 1.6
                                    color: Theme.ink(backHover.hovered ? 0.75 : 0.45)
                                }
                                Label {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: "Volver al inicio de sesión"
                                    tone: backHover.hovered ? 0.75 : 0.45
                                }
                            }
                            HoverHandler { id: backHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler {
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: Auth.backToCredentials()
                            }
                        }
                    }

                    /* ── Paso 3: contraseña caducada ───────────────── */
                    Column {
                        id: passwordStep
                        visible: Auth.step === "passwordChange"
                        width: parent.width
                        spacing: 24

                        LoginBrandHeader {
                            width: parent.width
                            iconPath: root.shieldCheckPath
                            title: "Contraseña caducada"
                            subtitle: "Por política de seguridad debes cambiarla antes de entrar."
                        }

                        Column {
                            width: parent.width
                            spacing: 12

                            Column {
                                width: parent.width
                                spacing: 6
                                FieldLabel { text: "Nueva contraseña" }
                                LoginField {
                                    id: newPassword
                                    width: parent.width
                                    label: "Nueva contraseña"
                                    placeholder: "Mínimo 8 caracteres"
                                    password: true
                                    inkTone: 1
                                    onAccepted: root.submitPasswordChange()
                                }
                            }
                            Column {
                                width: parent.width
                                spacing: 6
                                FieldLabel { text: "Repite la nueva contraseña" }
                                LoginField {
                                    id: confirmPassword
                                    width: parent.width
                                    label: "Repite la nueva contraseña"
                                    placeholder: "Repite la contraseña"
                                    password: true
                                    inkTone: 1
                                    onAccepted: root.submitPasswordChange()
                                }
                            }
                        }

                        LoginMessage {
                            width: parent.width
                            visible: root.error !== ""
                            centered: true
                            text: root.error
                        }

                        LoginSubmitButton {
                            width: parent.width
                            text: "Cambiar y entrar"
                            enabled: !Auth.busy && newPassword.text !== "" && confirmPassword.text !== ""
                            onClicked: root.submitPasswordChange()
                        }

                        Label {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            wrapMode: Text.WordWrap
                            elide: Text.ElideNone
                            text: "Al cambiarla se cerrará cualquier otra sesión abierta."
                            tone: 0.35
                            font.pixelSize: Theme.textXs
                        }
                    }
                }

                /* Pie: enlaces sin destino todavía, como en la web. Se oculta
                   si el formulario llega hasta él. */
                Row {
                    visible: steps.y + steps.height + 16 <= y
                    anchors.horizontalCenter: parent.horizontalCenter
                    y: sheet.height - 32 - height
                    spacing: 16
                    FooterLink { caption: "Términos" }
                    Label { text: "·"; tone: 0.4; font.pixelSize: Theme.textCaption }
                    FooterLink { caption: "Privacidad" }
                    Label { text: "·"; tone: 0.4; font.pixelSize: Theme.textCaption }
                    FooterLink { caption: "Estado del servicio" }
                }
            }
        }
    }
}
