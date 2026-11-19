import QtQuick
import StartCode

/* Pestaña Seguridad: verificación en dos pasos, tiempo de inactividad y
   caducidad de la contraseña, y sesiones abiertas. */
Column {
    id: root

    /* A diferencia del resto de pestañas, Seguridad NO guarda al vuelo: se
       edita un borrador y solo el botón lo envía. Cambiar el tiempo de
       inactividad sin querer cerraría la sesión en el acto. */
    property int savedTimeout: 0
    property int savedExpiration: 0
    property int secTimeout: 0
    property int secExpiration: 0
    property bool savingSec: false
    property bool savedSec: false

    readonly property bool secDirty: secTimeout !== savedTimeout || secExpiration !== savedExpiration
    readonly property bool wide: width >= 560
    readonly property real fieldWidth: wide ? (width - 16) / 2 : width

    /* Días completos desde el último cambio de contraseña; -1 si no se sabe. */
    readonly property int pwdAge: {
        const at = Auth.user.passwordChangedAt
        if (!at) return -1
        const ms = Date.parse(at)
        if (isNaN(ms)) return -1
        return Math.floor((Date.now() - ms) / 86400000)
    }
    readonly property bool pwdKnown: pwdAge >= 0
    readonly property bool pwdExpired: secExpiration > 0 && pwdKnown && pwdAge >= secExpiration
    readonly property bool pwdWarn: secExpiration > 0 && pwdKnown && pwdAge >= secExpiration * 0.85

    spacing: 32

    function plural(n, one, many) { return n + " " + (n === 1 ? one : many) }
    function agoDays(days) { return days === 0 ? "hoy" : "hace " + plural(days, "día", "días") }

    function readSaved() {
        const security = Auth.preferences.security || {}
        return {
            sessionTimeout: Math.max(0, Math.round(Number(security.sessionTimeout) || 0)),
            passwordExpiration: Math.max(0, Math.round(Number(security.passwordExpiration) || 0))
        }
    }

    /* Si llegan valores nuevos de la cuenta y no hay nada a medio editar, el
       borrador los adopta. */
    function adoptSaved() {
        const next = readSaved()
        if (next.sessionTimeout === savedTimeout && next.passwordExpiration === savedExpiration) return
        const wasDirty = secDirty
        savedTimeout = next.sessionTimeout
        savedExpiration = next.passwordExpiration
        if (!wasDirty) discard()
    }

    function discard() {
        secTimeout = savedTimeout
        secExpiration = savedExpiration
    }

    function handleSaveSecurity() {
        if (!secDirty || savingSec) return
        savingSec = true
        savedSec = false
        saveGuard.restart()
        Auth.patchPreferences("security", { sessionTimeout: secTimeout, passwordExpiration: secExpiration })
        Auth.flushPreferences()
    }

    Component.onCompleted: {
        const now = readSaved()
        savedTimeout = now.sessionTimeout
        savedExpiration = now.passwordExpiration
        discard()
    }

    Connections {
        target: Auth
        function onUserChanged() { root.adoptSaved() }
        function onPreferencesFlushed(ok) {
            if (!root.savingSec) return
            saveGuard.stop()
            root.savingSec = false
            root.savedSec = ok
            if (ok) savedTimer.restart()
        }
    }
    Timer { id: savedTimer; interval: 3000; onTriggered: root.savedSec = false }
    /* Si el envío no llega a confirmarse, el botón no se queda bloqueado. */
    Timer { id: saveGuard; interval: 35000; onTriggered: root.savingSec = false }

    /* Campo numérico + unidad + deslizador de una preferencia del borrador. */
    component NumberSetting: SettingsField {
        id: setting
        property int amount: 0
        property int sliderMax: 100
        property string unit: ""
        property string iconName: ""
        signal edited(int amount)

        onAmountChanged: {
            if ((parseInt(numberField.text, 10) || 0) !== amount) numberField.text = String(amount)
        }

        Column {
            width: parent.width
            spacing: 12
            Item {
                width: parent.width
                height: Theme.fieldHeight
                GlassField {
                    id: numberField
                    width: parent.width - unitLabel.implicitWidth - 12
                    iconName: setting.iconName
                    maximumLength: 5
                    inputMethodHints: Qt.ImhDigitsOnly
                    Component.onCompleted: text = String(setting.amount)
                    onTextChanged: {
                        const clean = text.replace(/\D/g, "")
                        if (clean !== text) { text = clean; return }
                        const n = clean === "" ? 0 : parseInt(clean, 10)
                        if (n !== setting.amount) setting.edited(n)
                    }
                }
                Label {
                    id: unitLabel
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    text: setting.unit
                    tone: 0.55
                }
            }
            RangeSlider {
                id: slider
                width: parent.width
                min: 0
                max: setting.sliderMax
                onChange: v => setting.edited(Math.round(v))
            }
            /* El deslizador puede escribir su propio `value` al arrastrar: se
               le vuelve a imponer el del borrador con cada cambio. */
            Binding { target: slider; property: "value"; value: setting.amount }
        }
    }

    /* ── 2FA ──────────────────────────────────────────────────────── */
    SettingsSecurityTwoFactor {
        width: root.width
        onSessionsInvalidated: sessionsBlock.load()
    }

    /* ── Sesión ───────────────────────────────────────────────────── */
    Column {
        width: root.width
        spacing: 16

        SettingsSectionTitle { width: parent.width; text: "Configuración de sesión" }

        Grid {
            width: parent.width
            columns: root.wide ? 2 : 1
            spacing: 16

            NumberSetting {
                width: root.fieldWidth
                label: "Tiempo de inactividad"
                hint: root.secTimeout === 0 ? "Desactivado (sin cierre automático)"
                                            : "Cierra sesión tras " + root.secTimeout + " min sin actividad"
                iconName: "clock"
                unit: "minutos"
                sliderMax: 120
                amount: root.secTimeout
                onEdited: amount => root.secTimeout = Math.max(0, amount)
            }
            NumberSetting {
                width: root.fieldWidth
                label: "Expiración de contraseña"
                hint: root.secExpiration === 0 ? "Sin expiración"
                                               : "Aviso tras " + root.secExpiration + " días sin cambiar"
                iconName: "key"
                unit: "días"
                sliderMax: 365
                amount: root.secExpiration
                onEdited: amount => root.secExpiration = Math.max(0, amount)
            }
        }

        /* Estado de contraseña */
        SettingsSecurityCard {
            id: pwdState
            visible: root.pwdKnown && root.secExpiration > 0
            width: parent.width
            pad: 12
            readonly property color tint: root.pwdExpired ? Theme.danger : root.pwdWarn ? Theme.warn : Theme.ok
            borderColor: Qt.alpha(tint, root.pwdExpired ? 0.25 : root.pwdWarn ? 0.2 : 0.15)
            Item {
                width: parent.width
                implicitHeight: Math.max(16, pwdLabel.implicitHeight)
                height: implicitHeight
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: root.pwdExpired || root.pwdWarn ? "alert" : "check"
                    color: root.pwdExpired ? Theme.tone("rose").text
                         : root.pwdWarn ? Theme.tone("amber").text : Theme.tone("emerald").text
                }
                Label {
                    id: pwdLabel
                    x: 28
                    width: parent.width - 28
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.pwdExpired
                          ? "Contraseña expirada — fue cambiada " + root.agoDays(root.pwdAge) + ". Cámbiala en la pestaña Perfil."
                          : root.pwdWarn
                          ? "La contraseña expirará en " + root.plural(root.secExpiration - root.pwdAge, "día", "días") + ". Cambiada " + root.agoDays(root.pwdAge) + "."
                          : "Contraseña al día — cambiada " + root.agoDays(root.pwdAge) + "; expira en " + root.plural(root.secExpiration - root.pwdAge, "día", "días") + "."
                    color: root.pwdExpired ? Qt.alpha(Theme.tone("rose").text, 0.85)
                         : root.pwdWarn ? Qt.alpha(Theme.tone("amber").text, 0.85) : Theme.ink(0.6)
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
    }

    /* ── Guardar el borrador ──────────────────────────────────────── */
    Item {
        width: root.width
        height: saveRow.height

        Row {
            visible: root.secDirty
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8
            Icon { anchors.verticalCenter: parent.verticalCenter; size: 14; name: "alert"; color: Theme.tone("amber").text }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, root.width - saveRow.width - 14 - 8 - 12)
                text: "Cambios sin guardar"
                color: Theme.tone("amber").text
                font.pixelSize: Theme.textXs
            }
        }
        Row {
            id: saveRow
            anchors.right: parent.right
            spacing: 12
            SecondaryButton {
                text: "Descartar"
                enabled: root.secDirty && !root.savingSec
                onClicked: root.discard()
            }
            PrimaryButton {
                text: root.savingSec ? "Guardando…" : root.savedSec ? "Guardado" : "Guardar cambios"
                loading: root.savingSec
                enabled: root.secDirty && !root.savingSec
                onClicked: root.handleSaveSecurity()
            }
        }
    }

    /* ── Sesiones activas ─────────────────────────────────────────── */
    SettingsSecuritySessions {
        id: sessionsBlock
        width: root.width
    }
}
