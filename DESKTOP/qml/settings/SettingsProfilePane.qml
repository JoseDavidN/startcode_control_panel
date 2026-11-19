import QtQuick
import QtQuick.Templates as T
import StartCode

/* Configuración → Perfil: cabecera con las iniciales, datos personales
   (`PATCH /auth/profile`) y cambio de contraseña (`POST /auth/change-password`). */
Column {
    id: root

    /* Dos columnas solo cuando caben dos campos cómodos. */
    readonly property bool wide: width >= 600
    readonly property real halfWidth: wide ? (width - 16) / 2 : width
    readonly property real pwColumnWidth: wide ? (width - 24) / 2 : width

    /* ── Formulario de perfil ──────────────────────────────────────── */
    readonly property string firstname: firstField.text
    readonly property string lastname: lastField.text
    readonly property string email: emailField.text
    property bool savingProfile: false
    /* null o { ok, text } */
    property var profileMsg: null

    /* ── Formulario de contraseña ──────────────────────────────────── */
    readonly property string currentPw: currentField.text
    readonly property string newPw: newField.text
    readonly property string confirmPw: confirmField.text
    property bool changingPw: false
    property var pwMsg: null

    /* Requisitos de la nueva contraseña, validados en vivo. */
    readonly property bool reqLength: newPw.length >= 8 && newPw.length <= 72
    readonly property bool reqLower: matches(rxLower, newPw, isLower)
    readonly property bool reqUpper: matches(rxUpper, newPw, isUpper)
    readonly property bool reqDigit: matches(rxDigit, newPw, isDigit)
    readonly property bool reqSpecial: matches(rxSpecial, newPw, c => !isLetter(c) && !isDigit(c))
    readonly property bool reqMatch: newPw !== "" && newPw === confirmPw
    readonly property bool reqsOk: reqLength && reqLower && reqUpper && reqDigit && reqSpecial && reqMatch

    /* Las clases Unicode (`\p{Ll}`) son las del backend; si el motor no las
       admite se compara carácter a carácter con las mayúsculas y minúsculas. */
    readonly property var rxLower: unicodeRx("\\p{Ll}")
    readonly property var rxUpper: unicodeRx("\\p{Lu}")
    readonly property var rxDigit: unicodeRx("\\p{Nd}")
    readonly property var rxSpecial: unicodeRx("[^\\p{L}\\p{Nd}]")

    function unicodeRx(source) {
        try {
            const rx = new RegExp(source, "u")
            rx.test("aA1")
            return rx
        } catch (e) {
            return null
        }
    }
    function isLower(c) { return c !== c.toUpperCase() && c === c.toLowerCase() }
    function isUpper(c) { return c !== c.toLowerCase() && c === c.toUpperCase() }
    function isLetter(c) { return c.toLowerCase() !== c.toUpperCase() }
    function isDigit(c) { return c >= "0" && c <= "9" }
    function matches(rx, value, perChar) {
        if (rx) return rx.test(value)
        return Array.from(value).some(perChar)
    }

    readonly property string role: Auth.user && Auth.user.role ? Auth.user.role : ""
    readonly property string roleLabel: role === "admin" ? "Administrador"
                                      : role === "user" ? "Usuario"
                                      : role === "viewer" ? "Observador" : role
    readonly property color roleColor: role === "admin" ? Theme.tone("violet").text
                                     : role === "user" ? Theme.tone("sky").text : Theme.ink(0.55)

    readonly property string initials: {
        const text = (firstname.charAt(0) + lastname.charAt(0)).toUpperCase()
        return text || "?"
    }

    function saveProfile() {
        if (savingProfile) return
        profileTimer.stop()
        profileMsg = null
        savingProfile = true
        const body = { firstname: firstname.trim(), lastname: lastname.trim(), email: email.trim() }
        Api.request("PATCH", "/auth/profile", body, (ok, data, error) => {
            savingProfile = false
            if (ok) {
                /* El resto de la app (riel, cabeceras) lee el usuario de la sesión. */
                Auth.refreshUser()
                profileMsg = { ok: true, text: "Perfil actualizado correctamente" }
            } else {
                profileMsg = { ok: false, text: (error && error.message) || "Error al actualizar el perfil" }
            }
            profileTimer.restart()
        })
    }

    function changePassword() {
        if (changingPw || currentPw === "" || !reqsOk) return
        pwTimer.stop()
        pwMsg = null
        if (newPw !== confirmPw) { pwMsg = { ok: false, text: "Las contraseñas no coinciden" }; return }
        if (!reqsOk) { pwMsg = { ok: false, text: "La nueva contraseña no cumple los requisitos" }; return }
        changingPw = true
        Api.request("POST", "/auth/change-password", { currentPassword: currentPw, newPassword: newPw }, (ok, data, error) => {
            changingPw = false
            if (ok) {
                currentField.text = ""
                newField.text = ""
                confirmField.text = ""
                /* `passwordChangedAt` viaja con el usuario: Seguridad cuenta los días desde ahí. */
                Auth.refreshUser()
                pwMsg = { ok: true, text: "Contraseña actualizada correctamente" }
            } else {
                pwMsg = { ok: false, text: (error && error.message) || "Error al cambiar la contraseña" }
            }
            pwTimer.restart()
        })
    }

    Component.onCompleted: {
        /* El formulario parte de la sesión y luego es independiente de ella. */
        const user = Auth.user || {}
        const parts = (user.name || "").split(" ")
        firstField.text = user.firstname !== undefined && user.firstname !== null ? user.firstname : (parts[0] || "")
        lastField.text = user.lastname !== undefined && user.lastname !== null ? user.lastname : parts.slice(1).join(" ")
        emailField.text = user.email || ""
    }

    Timer { id: profileTimer; interval: 4000; onTriggered: root.profileMsg = null }
    Timer { id: pwTimer; interval: 5000; onTriggered: root.pwMsg = null }

    /* Botón con icono: de marca (`primary`) o de cristal suave. */
    component ActionButton: T.Button {
        id: action

        property bool primary: false
        property bool loading: false
        property string iconName: ""
        readonly property color inkColor: primary ? Theme.onBrand : Theme.ink(0.85)

        implicitHeight: Theme.fieldHeight
        implicitWidth: actionRow.implicitWidth + 40
        hoverEnabled: true
        opacity: enabled ? 1 : (primary ? 0.5 : 0.4)
        scale: down ? 0.98 : 1
        Behavior on scale { NumberAnimation { duration: Theme.moFast } }

        background: Item {
            Elevation {
                anchors.fill: parent
                visible: action.primary
                radius: Theme.radiusXl
                level: action.hovered && action.enabled ? "brandHi" : "brand"
            }
            BrandFill { anchors.fill: parent; visible: action.primary }
            Glass {
                anchors.fill: parent
                visible: !action.primary
                variant: "soft"
                radius: Theme.radiusXl
                highlighted: action.hovered && action.enabled
            }
            Rectangle {
                visible: action.visualFocus
                anchors.fill: parent
                anchors.margins: -3
                radius: Theme.radiusXl + 3
                color: "transparent"
                border.width: 2
                border.color: Theme.focusRing
            }
        }

        contentItem: Item {
            Row {
                id: actionRow
                anchors.centerIn: parent
                spacing: 8
                Spinner {
                    visible: action.loading
                    anchors.verticalCenter: parent.verticalCenter
                    color: action.inkColor
                }
                Icon {
                    visible: !action.loading && action.iconName !== ""
                    anchors.verticalCenter: parent.verticalCenter
                    name: action.iconName
                    color: action.inkColor
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: action.text
                    color: action.inkColor
                    font.weight: Font.DemiBold
                }
            }
        }

        HoverHandler { cursorShape: Qt.PointingHandCursor }
    }

    spacing: 24

    /* ── Iniciales, nombre, correo y rol ───────────────────────────── */
    Item {
        width: root.width
        implicitHeight: 64
        height: implicitHeight

        Item {
            id: avatar
            width: 64; height: 64
            Elevation { anchors.fill: parent; level: "brand"; radius: Theme.radius2xl }
            BrandFill { anchors.fill: parent; radius: Theme.radius2xl }
            Label {
                anchors.centerIn: parent
                text: root.initials
                color: Theme.onBrand
                font.pixelSize: 24
                font.weight: Font.Bold
            }
        }
        Column {
            anchors.left: avatar.right
            anchors.leftMargin: 16
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2
            Label {
                width: parent.width
                text: root.firstname + " " + root.lastname
                font.pixelSize: 18
                font.weight: Font.DemiBold
            }
            Label { width: parent.width; text: root.email; mono: true; tone: 0.5 }
            Row {
                spacing: 6
                topPadding: 2
                Rectangle {
                    anchors.verticalCenter: roleText.verticalCenter
                    width: 6; height: 6; radius: 3
                    color: root.roleColor
                    opacity: 0.7
                }
                Label { id: roleText; text: root.roleLabel; color: root.roleColor; font.pixelSize: Theme.textXs }
            }
        }
    }

    Rectangle { width: root.width; height: 1; color: Theme.line }

    /* ── Información personal ──────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 20

        SettingsSectionTitle { text: "Información Personal" }

        Grid {
            width: root.width
            columns: root.wide ? 2 : 1
            spacing: 16

            SettingsField {
                width: root.halfWidth
                label: "Nombre *"
                GlassField { id: firstField; width: parent.width; placeholder: "Nombre" }
            }
            SettingsField {
                width: root.halfWidth
                label: "Apellido *"
                GlassField { id: lastField; width: parent.width; placeholder: "Apellido" }
            }
        }

        SettingsField {
            width: root.width
            label: "Correo Electrónico *"
            GlassField {
                id: emailField
                width: parent.width
                iconName: "mail"
                placeholder: "correo@ejemplo.com"
                inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
            }
        }

        SettingsFeedback {
            visible: root.profileMsg !== null
            width: root.width
            ok: root.profileMsg ? root.profileMsg.ok : true
            msg: root.profileMsg ? root.profileMsg.text : ""
        }

        Item {
            width: root.width
            implicitHeight: saveButton.implicitHeight
            height: implicitHeight
            ActionButton {
                id: saveButton
                anchors.right: parent.right
                primary: true
                iconName: "save"
                loading: root.savingProfile
                enabled: !root.savingProfile
                text: root.savingProfile ? "Guardando…" : "Guardar Perfil"
                onClicked: root.saveProfile()
            }
        }
    }

    Rectangle { width: root.width; height: 1; color: Theme.line }

    /* ── Cambiar contraseña ────────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 20

        SettingsSectionTitle { text: "Cambiar Contraseña" }

        Grid {
            width: root.width
            columns: root.wide ? 2 : 1
            spacing: 24

            /* Formulario */
            Column {
                width: root.pwColumnWidth
                spacing: 20

                SettingsField {
                    width: parent.width
                    label: "Contraseña Actual *"
                    GlassField {
                        id: currentField
                        width: parent.width
                        iconName: "key"
                        password: true
                        placeholder: "••••••••"
                    }
                }
                SettingsField {
                    width: parent.width
                    label: "Nueva Contraseña *"
                    GlassField {
                        id: newField
                        width: parent.width
                        iconName: "key"
                        password: true
                        placeholder: "Mínimo 8 caracteres"
                    }
                }
                SettingsField {
                    width: parent.width
                    label: "Confirmar Nueva Contraseña *"
                    GlassField {
                        id: confirmField
                        width: parent.width
                        iconName: "key"
                        password: true
                        placeholder: "Repite la nueva contraseña"
                        /* Aviso inmediato de que no coincide con la nueva. */
                        borderColor: root.confirmPw !== "" && root.newPw !== root.confirmPw ? Qt.alpha(Theme.danger, 0.4)
                                   : focused ? Theme.brand1(0.5) : Theme.hairline
                    }
                }

                SettingsFeedback {
                    visible: root.pwMsg !== null
                    width: parent.width
                    ok: root.pwMsg ? root.pwMsg.ok : true
                    msg: root.pwMsg ? root.pwMsg.text : ""
                }

                ActionButton {
                    width: parent.width
                    iconName: "shieldPlain"
                    loading: root.changingPw
                    enabled: !root.changingPw && root.currentPw !== "" && root.reqsOk
                    text: root.changingPw ? "Actualizando…" : "Cambiar Contraseña"
                    onClicked: root.changePassword()
                }
            }

            /* Requisitos y nivel de seguridad */
            Glass {
                width: root.pwColumnWidth
                implicitHeight: reqColumn.implicitHeight + 32
                height: implicitHeight
                variant: "soft"
                elevation: "flat"
                radius: Theme.radiusXl

                Column {
                    id: reqColumn
                    x: 16; y: 16
                    width: parent.width - 32
                    spacing: 16

                    Label {
                        width: parent.width
                        text: "Requisitos de la nueva contraseña"
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                        font.weight: Font.Medium
                    }
                    Column {
                        width: parent.width
                        spacing: 10
                        SettingsReqItem { ok: root.reqLength; text: "Entre 8 y 72 caracteres" }
                        SettingsReqItem { ok: root.reqLower; text: "Al menos una letra minúscula" }
                        SettingsReqItem { ok: root.reqUpper; text: "Al menos una letra mayúscula" }
                        SettingsReqItem { ok: root.reqDigit; text: "Al menos un número" }
                        SettingsReqItem { ok: root.reqSpecial; text: "Al menos un carácter especial" }
                        SettingsReqItem { ok: root.reqMatch; text: "Las contraseñas coinciden" }
                    }
                    Rectangle { width: parent.width; height: 1; color: Theme.line }
                    SettingsStrengthBar { width: parent.width; pw: root.newPw }
                }
            }
        }
    }
}
