import QtQuick
import StartCode

/* Edición de un servidor. `server` es el elemento de GET /servers; el
   formulario se rellena al abrir. La llave privada no se muestra nunca (el
   backend no la devuelve): solo se puede sustituir.

   `saved(server)` se emite con el servidor actualizado cuando todo se guardó;
   `listChanged()` si los datos se guardaron pero el cambio de llave falló. */
Modal {
    id: root

    property var server: null

    signal saved(var server)
    signal listChanged()

    title: "Editar " + (server && server.name ? server.name : "")
    size: "md"
    /* Con una petición en curso no se cierra: la respuesta llegaría a un modal ya cerrado. */
    dismissable: !busy

    /* ── Estado ────────────────────────────────────────────────────── */
    property bool busy: false
    property string error: ""
    property bool changingKey: false
    property string os: "ubuntu"
    /* '' es «sin etiqueta». */
    property string tag: ""

    readonly property bool wide: bodyWidth >= 520
    readonly property string newKey: logic.normalizeKey(keyArea.text)
    readonly property var keyState: changingKey && newKey !== "" ? logic.validateKey(newKey) : null

    ServerForms { id: logic }

    function fill() {
        if (!server) return
        nameField.text = server.name || ""
        hostField.text = server.host || ""
        portField.text = String(server.port || 22)
        userField.text = server.username || ""
        root.os = server.os || "ubuntu"
        root.tag = server.tag || ""
        descriptionArea.text = server.description || ""
        root.changingKey = false
        keyArea.text = ""
        root.error = ""
        root.busy = false
    }

    onServerChanged: fill()
    onAboutToShow: fill()
    onOpened: nameField.forceFocus()

    function cancelKeyChange() {
        root.changingKey = false
        keyArea.text = ""
        root.error = ""
    }

    function submit() {
        if (root.busy || !root.server) return
        root.error = ""

        const name = nameField.text.trim()
        const host = hostField.text.trim()
        const username = userField.text.trim()
        if (!name || !host || !username) {
            root.error = "Nombre, host y usuario son obligatorios."
            return
        }
        const port = Number(portField.text) || 22
        if (port < 1 || port > 65535) {
            root.error = "El puerto debe estar entre 1 y 65535."
            return
        }
        const withKey = root.changingKey
        const key = root.newKey
        if (withKey) {
            const check = logic.validateKey(key)
            if (!check.valid) { root.error = check.error || "Clave privada inválida"; return }
        }

        const id = root.server.id
        const previous = root.server
        root.busy = true
        Api.request("PATCH", "/servers/" + id, {
            name: name,
            host: host,
            port: port,
            username: username,
            os: root.os,
            tag: root.tag !== "" ? root.tag : null,
            description: descriptionArea.text.trim()
        }, (ok, data, failure) => {
            if (!ok) {
                root.busy = false
                root.error = (failure && failure.message) || "No se pudo actualizar el servidor"
                return
            }
            const updated = data && data.id ? data : previous
            if (!withKey) { finish(updated, name, false); return }

            /* La llave va por su propio endpoint: se guarda cifrada y nunca vuelve. */
            Api.request("PUT", "/servers/" + id + "/private-key", { privateKey: key }, (keyOk, keyData, keyFailure) => {
                if (!keyOk) {
                    root.busy = false
                    root.error = (keyFailure && keyFailure.message) || "No se pudo actualizar el servidor"
                    /* Los datos sí se guardaron: la lista ya no está al día. */
                    root.listChanged()
                    return
                }
                finish(updated, name, true)
            })
        })
    }

    function finish(updated, name, keyChanged) {
        root.busy = false
        Toasts.success("Servidor actualizado", keyChanged ? name + " · llave privada cambiada" : name)
        root.saved(updated)
        root.close()
    }

    footer: Row {
        spacing: 12
        SecondaryButton {
            text: "Cancelar"
            enabled: !root.busy
            onClicked: root.close()
        }
        PrimaryButton {
            text: root.busy ? "Guardando…" : "Guardar cambios"
            enabled: !root.busy
            onClicked: root.submit()
        }
    }

    /* ── Formulario ────────────────────────────────────────────────── */
    ServerField {
        width: root.bodyWidth
        label: "Nombre *"
        GlassField {
            id: nameField
            width: parent.width
            maximumLength: 100
            placeholder: "Servidor de producción"
            onAccepted: root.submit()
        }
    }

    Flow {
        id: hostRow
        width: root.bodyWidth
        spacing: 12
        readonly property real third: Math.floor((width - 12) / 3)

        ServerField {
            width: root.wide ? hostRow.width - 12 - hostRow.third : hostRow.width
            label: "Host o IP *"
            GlassField {
                id: hostField
                width: parent.width
                maximumLength: 253
                placeholder: "192.168.1.10"
                onAccepted: root.submit()
            }
        }
        ServerField {
            width: root.wide ? hostRow.third : hostRow.width
            label: "Puerto"
            GlassField {
                id: portField
                width: parent.width
                maximumLength: 5
                inputMethodHints: Qt.ImhDigitsOnly
                /* Solo cifras: el puerto es un entero entre 1 y 65535. */
                onTextChanged: {
                    const clean = text.replace(/[^0-9]/g, "")
                    if (clean !== text) text = clean
                }
                onAccepted: root.submit()
            }
        }
    }

    Flow {
        id: userRow
        width: root.bodyWidth
        spacing: 12
        readonly property real half: Math.floor((width - 12) / 2)

        ServerField {
            width: root.wide ? userRow.half : userRow.width
            label: "Usuario SSH *"
            GlassField {
                id: userField
                width: parent.width
                maximumLength: 64
                placeholder: "root"
                onAccepted: root.submit()
            }
        }
        ServerField {
            width: root.wide ? userRow.half : userRow.width
            label: "Sistema operativo"
            Glass {
                variant: "input"
                width: parent.width
                height: Theme.fieldHeight
                Select {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    value: root.os
                    options: logic.osOptions
                    onPicked: value => root.os = value
                    Accessible.name: "Sistema operativo"
                }
            }
        }
    }

    ServerField {
        width: root.bodyWidth
        label: "Etiqueta"
        Glass {
            variant: "input"
            width: parent.width
            height: Theme.fieldHeight
            Select {
                anchors.fill: parent
                anchors.leftMargin: 14
                anchors.rightMargin: 14
                value: root.tag
                options: logic.tagOptions
                onPicked: value => root.tag = value
                Accessible.name: "Etiqueta"
            }
        }
    }

    ServerField {
        width: root.bodyWidth
        label: "Descripción"
        GlassArea {
            id: descriptionArea
            width: parent.width
            height: 72
            placeholder: "Notas sobre este servidor"
        }
    }

    /* Llave privada: oculta tras un enlace; solo se sustituye, nunca se muestra la actual. */
    Label {
        visible: !root.changingKey
        text: "Cambiar llave privada"
        color: changeHover.hovered ? Theme.brandLight2 : Theme.brandLight1
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: text
        Keys.onReturnPressed: startKeyChange.trigger()
        Keys.onSpacePressed: startKeyChange.trigger()
        HoverHandler { id: changeHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: startKeyChange.trigger() }
        QtObject {
            id: startKeyChange
            function trigger() {
                root.changingKey = true
                keyArea.forceFocus()
            }
        }
    }

    Column {
        visible: root.changingKey
        width: root.bodyWidth
        spacing: 6

        Item {
            width: parent.width
            height: 20
            Label {
                anchors.left: parent.left
                anchors.right: keyTools.left
                anchors.rightMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                text: "Nueva llave privada *"
                tone: 0.55
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
            Row {
                id: keyTools
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Badge {
                    visible: root.keyState !== null
                    anchors.verticalCenter: parent.verticalCenter
                    pill: true
                    tone: root.keyState && root.keyState.valid ? "emerald" : "rose"
                    text: root.keyState && root.keyState.valid ? "Clave válida" : "Clave inválida"
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Cancelar"
                    tone: cancelHover.hovered ? 1 : 0.5
                    font.pixelSize: Theme.textXs
                    Accessible.role: Accessible.Button
                    Accessible.name: "Cancelar el cambio de llave"
                    HoverHandler { id: cancelHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.cancelKeyChange() }
                }
            }
        }

        GlassArea {
            id: keyArea
            width: parent.width
            height: 158
            mono: true
            placeholder: logic.keyPlaceholder
            /* El borde dice de un vistazo si la clave pegada sirve. */
            borderColor: root.keyState ? Qt.alpha(root.keyState.valid ? Theme.ok : Theme.danger, 0.4)
                       : focused ? Theme.brand1(0.5) : Theme.hairline
        }

        Label {
            width: parent.width
            text: "Sustituye a la actual al guardar. Se guarda cifrada y no se vuelve a mostrar."
            tone: 0.4
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    ServerNotice {
        visible: root.error !== ""
        width: root.bodyWidth
        pad: 12
        accent: Theme.danger
        Label {
            width: parent.width
            text: root.error
            color: Theme.tone("rose").text
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }
}
