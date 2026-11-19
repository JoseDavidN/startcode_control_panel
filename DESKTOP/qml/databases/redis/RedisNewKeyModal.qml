import QtQuick
import QtQuick.Layouts
import StartCode

/* Clave nueva en la base elegida, con su primer valor y caducidad opcional.
   Redis no guarda colecciones vacías: cada tipo pide lo mínimo para existir.

       RedisNewKeyModal { id: newKey; connectionId: …; sessionId: …; db: …
           onCreated: key => … }
       newKey.open() */
Modal {
    id: root

    property string connectionId: ""
    property string sessionId: ""
    property int db: 0

    /* La clave ya existe en Redis: quien lo usa la selecciona y refresca la lista. */
    signal created(string key)

    property string type: "string"
    property string first: ""
    property string second: ""
    property bool busy: false

    readonly property var needs: ({
        string: "El valor de texto.",
        hash: "Un primer campo con su valor; luego se agregan más.",
        list: "Un primer elemento; luego se agregan más.",
        set: "Un primer miembro; luego se agregan más.",
        zset: "Un primer miembro con su puntuación.",
        stream: "Una primera entrada: un campo=valor por línea."
    })
    readonly property bool pair: type === "hash" || type === "zset"
    readonly property bool multiline: type === "string" || type === "stream"
    /* Lo que el formulario original marcaba como obligatorio. */
    readonly property bool requiredOk: nameField.text !== ""
        && (type !== "hash" || first !== "")
        && (type !== "zset" || second !== "")
        && (type !== "stream" || first !== "")
    readonly property bool canSubmit: requiredOk && !busy && sessionId !== ""
    /* Nombre y tipo en una fila si caben; apilados en modales estrechos. */
    readonly property bool wide: bodyWidth >= 520

    title: "Nueva clave en db" + db
    size: "md"

    function reset() {
        nameField.text = ""
        first = ""
        second = ""
        ttlField.text = ""
    }

    function submit() {
        if (!canSubmit) return
        const key = nameField.text
        const input = { op: "create", key: key, type: type }
        if (ttlField.text.trim()) {
            const secs = Number(ttlField.text)
            if (!Number.isInteger(secs) || secs <= 0) {
                Toasts.error("Caducidad no válida", "Escribe los segundos, un número entero mayor que 0.")
                return
            }
            input.ttl = secs
        }
        switch (type) {
        case "string": input.value = first; break
        case "hash": input.field = first; input.value = second; break
        case "list": input.value = first; break
        case "set": input.member = first; break
        case "zset": {
            const score = Number(second.trim())
            if (second.trim() === "" || !Number.isFinite(score)) {
                Toasts.error("Puntuación no válida", "Debe ser un número.")
                return
            }
            input.member = first
            input.score = score
            break
        }
        case "stream": {
            const fields = util.parseStreamFields(first)
            if (!fields) {
                Toasts.error("Entrada no válida", "Escribe un campo=valor por línea.")
                return
            }
            input.fields = fields
            break
        }
        }

        busy = true
        const body = Object.assign({ sessionId: sessionId, db: db }, input)
        Api.request("POST", "/databases/" + encodeURIComponent(connectionId) + "/redis/edit", body, (ok, data, error) => {
            if (!root) return
            root.busy = false
            if (!ok) {
                Toasts.error("No se pudo crear", util.messageOf(error))
                return
            }
            Toasts.success("Clave creada", key)
            root.created(key)
            root.close()
        })
    }

    onOpened: nameField.forceFocus()
    onClosed: reset()

    RedisUtil { id: util }

    component FieldLabel: Label {
        tone: 0.6
        font.pixelSize: Theme.textXs
        font.weight: Font.Medium
    }

    GridLayout {
        width: root.bodyWidth
        columns: root.wide ? 2 : 1
        columnSpacing: 16
        rowSpacing: 16

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6
            FieldLabel { text: "Nombre *" }
            GlassField {
                id: nameField
                Layout.fillWidth: true
                mono: true
                placeholder: "user:15"
                maximumLength: 4096
                onAccepted: root.submit()
            }
        }
        ColumnLayout {
            Layout.fillWidth: !root.wide
            Layout.preferredWidth: 192
            spacing: 6
            FieldLabel { text: "Tipo" }
            Glass {
                Layout.fillWidth: true
                variant: "input"
                implicitHeight: 44
                Select {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    Accessible.name: "Tipo de clave"
                    value: root.type
                    options: util.keyTypes.map(t => ({ value: t, label: util.typeLabels[t] }))
                    onPicked: value => root.type = value
                }
            }
        }
    }

    Label {
        width: root.bodyWidth
        text: root.needs[root.type] || ""
        tone: 0.45
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }

    /* Hash y conjunto ordenado: dos campos. */
    RowLayout {
        visible: root.pair
        width: root.bodyWidth
        spacing: 16

        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            spacing: 6
            FieldLabel { text: root.type === "hash" ? "Campo *" : "Miembro" }
            GlassField {
                Layout.fillWidth: true
                mono: true
                text: root.first
                onTextChanged: root.first = text
                onAccepted: root.submit()
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            spacing: 6
            FieldLabel { text: root.type === "hash" ? "Valor" : "Puntuación *" }
            GlassField {
                Layout.fillWidth: true
                mono: true
                inputMethodHints: root.type === "zset" ? Qt.ImhFormattedNumbersOnly : Qt.ImhNone
                text: root.second
                onTextChanged: root.second = text
                onAccepted: root.submit()
            }
        }
    }

    /* Texto y stream: varias líneas. */
    Column {
        visible: root.multiline
        width: root.bodyWidth
        spacing: 6
        FieldLabel { text: root.type === "string" ? "Valor" : "Campos *" }
        GlassArea {
            width: parent.width
            implicitHeight: 148
            mono: true
            placeholder: root.type === "stream" ? "evento=login\nusuario=15" : ""
            text: root.first
            onTextChanged: root.first = text
        }
    }

    /* Lista y conjunto: un elemento. */
    Column {
        visible: !root.pair && !root.multiline
        width: root.bodyWidth
        spacing: 6
        FieldLabel { text: root.type === "list" ? "Primer elemento" : "Primer miembro" }
        GlassField {
            width: parent.width
            mono: true
            text: root.first
            onTextChanged: root.first = text
            onAccepted: root.submit()
        }
    }

    Column {
        width: root.bodyWidth
        spacing: 6
        FieldLabel { text: "Caduca en (segundos, opcional)" }
        GlassField {
            id: ttlField
            width: Math.min(192, parent.width)
            mono: true
            placeholder: "sin caducidad"
            inputMethodHints: Qt.ImhDigitsOnly
            onAccepted: root.submit()
        }
    }

    footer: Row {
        spacing: 8
        SecondaryButton { text: "Cancelar"; onClicked: root.close() }
        PrimaryButton {
            text: root.busy ? "Creando…" : "Crear clave"
            enabled: root.canSubmit
            onClicked: root.submit()
        }
    }
}
