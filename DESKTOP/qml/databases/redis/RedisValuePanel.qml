import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import QtQuick.Templates as T
import StartCode

/* Valor de una clave de Redis con su editor según el tipo, más caducidad,
   renombrar y borrar. Lo que se muestra es lo último leído: cada cambio vuelve
   a pedirlo. Al cambiar de clave, de base o de sesión empieza de cero.

       RedisValuePanel { connectionId: …; sessionId: …; db: …; keyName: …
           onGone: renamedTo => …      // "" = borrada o inexistente
           onChanged: …                // hubo un cambio: refrescar la lista
       } */
Item {
    id: root

    property string connectionId: ""
    property string sessionId: ""
    property int db: 0
    property string keyName: ""

    /* La clave ya no existe (borrada aquí o renombrada): la vista vuelve a la
       lista. `renamedTo` trae el nombre nuevo, o "" si no lo hay. */
    signal gone(string renamedTo)
    /* Se escribió algo en Redis: la lista de claves y el recuento pueden haber cambiado. */
    signal changed()

    /* Último `RedisKeyDetail` leído. */
    property var detail: null
    property bool loading: false
    property bool refreshing: false
    property bool failed: false
    property string errorText: ""
    /* Hay una edición en curso. */
    property bool busy: false
    property bool removing: false
    /* Formulario abierto en la cabecera: "" | "ttl" | "rename". */
    property string mode: ""
    /* Cada clave nueva invalida las respuestas que sigan en camino. */
    property int gen: 0
    /* Texto leído con el que se compara el borrador (tal como lo devuelve el editor). */
    property string stringBase: ""
    property string stringSig: ""

    readonly property string queryKey: connectionId + "\u0000" + sessionId + "\u0000" + db + "\u0000" + keyName
    readonly property string vtype: detail ? String(detail.type) : ""
    readonly property bool isCollection: ["hash", "list", "set", "zset", "stream"].indexOf(vtype) >= 0
    readonly property bool hasData: detail !== null && !failed && !loading
    /* En paneles estrechos, renombrar y borrar quedan en solo icono. */
    readonly property bool compact: width < 560

    readonly property var heads: ({
        hash: ["Campo", "Valor"], list: ["#", "Valor"], set: ["Miembro", ""],
        zset: ["Puntuación", "Miembro"], stream: ["Id", "Campos"]
    })
    /* Columnas de la tabla: 12 px de margen a cada lado, 24 entre columnas y 40 para quitar. */
    readonly property real usable: Math.max(0, table.width - 40 - 24)
    readonly property real col1: vtype === "hash" ? Math.max(0, (usable - 24) / 3)
                               : vtype === "list" ? 48
                               : vtype === "set" ? usable
                               : vtype === "zset" ? Math.min(160, usable * 0.4)
                               : Math.min(192, usable * 0.45)
    readonly property real col2x: 12 + col1 + 24
    readonly property real col2: Math.max(0, usable - col1 - 24)

    /* ── Interfaz hacia fuera ──────────────────────────────────────── */
    /* Vuelve a leer la clave (p. ej. tras un comando de la consola). */
    function refresh() { load() }

    /* ── Datos ─────────────────────────────────────────────────────── */
    function base() { return "/databases/" + encodeURIComponent(connectionId) + "/redis" }

    function reset() {
        gen += 1
        detail = null
        failed = false
        errorText = ""
        loading = false
        refreshing = false
        busy = false
        removing = false
        mode = ""
        stringSig = ""
        stringBase = ""
        stringArea.text = ""
        addA.text = ""
        addB.text = ""
        streamArea.text = ""
        rows.clear()
        deleteModal.close()
        load()
    }

    function load() {
        if (connectionId === "" || sessionId === "" || keyName === "") return
        const g = gen
        if (!detail) loading = true
        refreshing = true
        Api.request("POST", base() + "/key", { sessionId: sessionId, db: db, key: keyName }, (ok, data, error) => {
            if (!root || g !== root.gen) return
            root.loading = false
            root.refreshing = false
            if (ok && data) {
                root.failed = false
                root.applyDetail(data)
            } else {
                root.failed = true
                root.errorText = util.messageOf(error)
            }
        })
    }

    function applyDetail(d) {
        detail = d
        if (d.type === "string") {
            /* Al leer otro valor (otra clave o un cambio desde la consola) el borrador vuelve a empezar. */
            const sig = d.key + "\u0000" + d.value
            if (sig !== stringSig) {
                stringSig = sig
                stringArea.text = String(d.value === null || d.value === undefined ? "" : d.value)
                stringBase = stringArea.text
            }
        }
        syncRows(d)
    }

    /* Filas de la colección en el modelo, actualizadas en el sitio para que la
       tabla no pierda la posición tras cada cambio. */
    function syncRows(d) {
        const list = []
        const v = d.type === "string" || !d.value ? [] : Array.from(d.value)
        switch (d.type) {
        case "hash": v.forEach(r => list.push({ a: String(r.field), b: String(r.value) })); break
        case "list": v.forEach((x, i) => list.push({ a: String(i), b: String(x) })); break
        case "set": v.forEach(x => list.push({ a: String(x), b: "" })); break
        case "zset": v.forEach(r => list.push({ a: String(r.score), b: String(r.member) })); break
        case "stream":
            v.forEach(e => list.push({ a: String(e.id), b: JSON.stringify(Array.from(e.fields || []).map(f => Array.from(f))) }))
            break
        }
        for (let i = 0; i < list.length; i++) {
            if (i < rows.count) rows.set(i, list[i])
            else rows.append(list[i])
        }
        while (rows.count > list.length) rows.remove(rows.count - 1)
    }

    /* Edición sobre la clave abierta. `done(ok)` se llama al terminar. */
    function apply(input, okText, done) {
        if (sessionId === "") {
            Toasts.error("No se pudo guardar", "La vista todavía no está conectada")
            if (done) done(false)
            return
        }
        const g = gen
        const body = Object.assign({ sessionId: sessionId, db: db }, input, { key: keyName })
        busy = true
        Api.request("POST", base() + "/edit", body, (ok, data, error) => {
            if (!root) return
            if (g === root.gen) root.busy = false
            if (!ok) {
                Toasts.error("No se pudo guardar", util.messageOf(error))
                if (done) done(false)
                return
            }
            /* Un cambio puede tocar la lista (tipo, caducidad, nombre), el valor y el recuento. */
            root.changed()
            if (input.op !== "rename" && g === root.gen) root.load()
            Toasts.success(okText)
            if (done) done(true)
        })
    }

    function doDelete() {
        if (sessionId === "") {
            Toasts.error("No se pudo borrar", "La vista todavía no está conectada")
            return
        }
        const g = gen
        removing = true
        Api.request("POST", base() + "/delete", { sessionId: sessionId, db: db, keys: [keyName] }, (ok, data, error) => {
            if (!root) return
            if (g === root.gen) root.removing = false
            /* Queda en la auditoría salga bien o mal, y la lista se vuelve a pedir. */
            root.changed()
            if (!ok) {
                Toasts.error("No se pudo borrar", util.messageOf(error))
                if (g === root.gen) root.load()
                return
            }
            Toasts.success("Clave borrada")
            deleteModal.close()
            if (g === root.gen) root.gone("")
        })
    }

    /* ── Cabecera: caducidad y nombre ──────────────────────────────── */
    function openMode(m) {
        mode = m
        draftField.text = m === "rename" ? String(detail.key) : detail.ttl > 0 ? String(Math.ceil(detail.ttl / 1000)) : ""
        Qt.callLater(() => { if (root) draftField.forceFocus() })
    }
    function saveMode() {
        if (mode === "rename") {
            const next = draftField.text
            if (!next || next === detail.key) { mode = ""; return }
            apply({ op: "rename", newKey: next }, "Clave renombrada", ok => {
                if (!ok) return
                root.mode = ""
                root.gone(next)
            })
        } else if (mode === "ttl") {
            const secs = Number(draftField.text)
            if (!Number.isInteger(secs) || secs <= 0) {
                Toasts.error("Caducidad no válida", "Escribe los segundos, un número entero mayor que 0.")
                return
            }
            apply({ op: "expire", ttl: secs }, "Caducidad actualizada", ok => { if (ok) root.mode = "" })
        }
    }
    function sizeText() {
        if (!detail) return ""
        return vtype === "string" ? Format.bytes(detail.length)
             : util.num(detail.length) + " " + (vtype === "stream" ? "entradas" : "elementos")
    }
    function truncatedText() {
        if (!detail) return ""
        if (vtype === "string")
            return "Se muestran los primeros 256 KB de " + Format.bytes(detail.length)
                 + ": el texto no se puede editar desde aquí (usa la consola)."
        return "Se muestran " + (vtype === "stream" ? "las 200 entradas más recientes" : "los primeros 500 elementos")
             + " de " + util.num(detail.length) + "."
    }

    /* ── Texto ─────────────────────────────────────────────────────── */
    readonly property bool stringReadOnly: !!detail && !!detail.truncated
    readonly property bool stringDirty: stringArea.text !== stringBase
    readonly property var stringPretty: vtype === "string" ? prettyJson(stringArea.text) : null

    function prettyJson(text) {
        const t = String(text).trim()
        if (!t.startsWith("{") && !t.startsWith("[")) return null
        try {
            return JSON.stringify(JSON.parse(t), null, 2)
        } catch (e) {
            return null
        }
    }
    function saveString() {
        if (!stringDirty || stringReadOnly) return
        apply({ op: "set", value: stringArea.text }, "Valor guardado")
    }

    /* ── Colecciones ───────────────────────────────────────────────── */
    function toScore(text) {
        const t = String(text).trim()
        const n = Number(t)
        if (t === "" || !Number.isFinite(n)) {
            Toasts.error("Puntuación no válida", "Debe ser un número.")
            return null
        }
        return n
    }
    function pushList(op) {
        apply({ op: op, value: addB.text }, op === "lpush" ? "Agregado al inicio" : "Agregado al final",
              ok => { if (ok) addB.text = "" })
    }
    function addPrimary() {
        switch (vtype) {
        case "hash": {
            const field = addA.text
            if (!field) return
            const exists = Array.from(detail.value || []).some(r => r.field === field)
            apply({ op: "hset", field: field, value: addB.text }, exists ? "Campo actualizado" : "Campo agregado",
                  ok => { if (ok) { addA.text = ""; addB.text = "" } })
            break
        }
        case "list":
            pushList("rpush")
            break
        case "set": {
            const member = addB.text
            if (Array.from(detail.value || []).indexOf(member) >= 0) { Toasts.info("Ya está en el conjunto"); return }
            apply({ op: "sadd", member: member }, "Miembro agregado", ok => { if (ok) addB.text = "" })
            break
        }
        case "zset": {
            const n = toScore(addA.text)
            if (n === null) return
            apply({ op: "zadd", member: addB.text, score: n }, "Miembro guardado",
                  ok => { if (ok) { addA.text = ""; addB.text = "" } })
            break
        }
        case "stream": {
            const fields = util.parseStreamFields(streamArea.text)
            if (!fields) { Toasts.error("Entrada no válida", "Escribe un campo=valor por línea."); return }
            apply({ op: "xadd", fields: fields }, "Entrada agregada", ok => { if (ok) streamArea.text = "" })
            break
        }
        }
    }
    function removeRow(index, a, b) {
        switch (vtype) {
        case "hash": apply({ op: "hdel", field: a }, "Campo quitado"); break
        case "list": apply({ op: "lremIndex", index: index }, "Elemento quitado"); break
        case "set": apply({ op: "srem", member: a }, "Miembro quitado"); break
        case "zset": apply({ op: "zrem", member: b }, "Miembro quitado"); break
        case "stream": apply({ op: "xdel", id: a }, "Entrada quitada"); break
        }
    }
    /* Campos de una entrada de stream como texto con estilo (el contenido va escapado). */
    function escapeHtml(text) {
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
    }
    function chipText(pair) {
        return "<font color=\"" + Qt.alpha(Theme.brandLight1, 0.9) + "\">" + escapeHtml(pair[0]) + "</font>"
             + "<font color=\"" + Theme.ink(0.3) + "\">=</font>" + escapeHtml(pair[1])
    }

    onQueryKeyChanged: Qt.callLater(root.reset)
    Component.onCompleted: Qt.callLater(root.reset)

    RedisUtil { id: util }
    ListModel { id: rows }

    /* Celda con edición en línea: doble clic o el lápiz; Enter guarda, Escape cancela. */
    component EditableCell: Item {
        id: cell

        property string value: ""
        property bool busy: false
        property bool editing: false

        /* Se pidió guardar `text`; quien lo atiende llama a `close()` si salió bien. */
        signal save(string text)

        function begin() {
            cellField.text = value
            editing = true
            Qt.callLater(() => { if (cell) cellField.forceFocus() })
        }
        function close() { editing = false }
        function commit() {
            if (cellField.text === value) close()
            else save(cellField.text)
        }

        implicitHeight: editing ? 32 : Math.max(28, shown.implicitHeight + 12)
        height: implicitHeight

        HoverHandler { id: cellHover }

        Label {
            id: shown
            visible: !cell.editing
            y: 6
            width: Math.max(0, parent.width - 32)
            textFormat: Text.PlainText
            text: cell.value === "" ? "vacío" : cell.value
            tone: cell.value === "" ? 0.3 : 0.9
            font.italic: cell.value === ""
            mono: true
            font.pixelSize: Theme.textXs
            wrapMode: Text.WrapAnywhere
            elide: Text.ElideNone

            HoverHandler { cursorShape: Qt.PointingHandCursor }
            TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onDoubleTapped: cell.begin() }
        }
        IconButton {
            visible: !cell.editing
            opacity: cellHover.hovered || activeFocus ? 1 : 0
            anchors.right: parent.right
            size: 28
            iconSize: 14
            plain: true
            iconName: "edit"
            hint: "Editar"
            onClicked: cell.begin()
        }

        RowLayout {
            visible: cell.editing
            width: parent.width
            spacing: 4

            RedisField {
                id: cellField
                Layout.fillWidth: true
                onAccepted: cell.commit()
                onEscaped: cell.close()
            }
            IconButton {
                size: 28; iconSize: 14; plain: true
                iconName: "check"
                hint: "Guardar"
                enabled: !cell.busy
                onClicked: cell.commit()
            }
            IconButton {
                size: 28; iconSize: 14; plain: true
                iconName: "close"
                hint: "Cancelar"
                onClicked: cell.close()
            }
        }
    }

    component Dot: Label {
        text: "·"
        tone: 0.2
        font.pixelSize: 11
    }
    component Meta: Label {
        tone: 0.45
        font.pixelSize: 11
    }

    /* ── Cargando ── */
    Spinner {
        anchors.centerIn: parent
        visible: root.loading
        size: 32
        color: Theme.brandLight1
    }

    /* ── Error o clave inexistente ── */
    Column {
        visible: !root.loading && !root.hasData
        anchors.centerIn: parent
        width: Math.min(parent.width - 48, 420)
        spacing: 12

        Icon {
            anchors.horizontalCenter: parent.horizontalCenter
            name: "alertCircle"
            size: 32
            color: Qt.alpha(Theme.danger, 0.7)
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: root.failed && root.errorText !== "" ? root.errorText : "Error desconocido"
            tone: 0.6
            wrapMode: Text.Wrap
            elide: Text.ElideNone
        }
        RedisSmallButton {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Volver a la lista"
            onClicked: root.gone("")
        }
    }

    /* ── Valor ── */
    ColumnLayout {
        anchors.fill: parent
        visible: root.hasData
        spacing: 0

        /* Cabecera: nombre, tipo, tamaño, caducidad y acciones. */
        Item {
            Layout.fillWidth: true
            implicitHeight: headColumn.implicitHeight + 24

            Column {
                id: headColumn
                x: 16; y: 12
                width: parent.width - 32
                spacing: 8

                RowLayout {
                    width: parent.width
                    spacing: 8

                    RedisTypeBadge { type: root.vtype }
                    Label {
                        Layout.fillWidth: true
                        textFormat: Text.PlainText
                        text: root.detail ? String(root.detail.key) : ""
                        mono: true
                        font.weight: Font.DemiBold
                        HoverTip { text: root.detail ? String(root.detail.key) : "" }
                    }
                    IconButton {
                        size: 28; iconSize: 14; plain: true
                        iconName: "copy"
                        hint: "Copiar el nombre"
                        onClicked: {
                            App.copy(String(root.detail.key))
                            Toasts.success("Nombre copiado")
                        }
                    }
                    Item {
                        implicitWidth: 28; implicitHeight: 28
                        IconButton {
                            anchors.fill: parent
                            visible: !root.refreshing
                            size: 28; iconSize: 14; plain: true
                            iconName: "refresh"
                            hint: "Volver a leer"
                            onClicked: root.load()
                        }
                        Spinner { anchors.centerIn: parent; visible: root.refreshing; size: 14; color: Theme.ink(0.6) }
                    }
                    RedisSmallButton {
                        text: root.compact ? "" : "Renombrar"
                        hint: root.compact ? "Renombrar" : ""
                        iconName: "edit"
                        enabled: !root.busy
                        onClicked: root.openMode("rename")
                    }
                    RedisSmallButton {
                        text: root.compact ? "" : "Borrar"
                        hint: root.compact ? "Borrar" : ""
                        iconName: "trash"
                        danger: true
                        onClicked: deleteModal.open()
                    }
                }

                Flow {
                    width: parent.width
                    spacing: 8

                    Meta { text: util.typeLabel(root.vtype) }
                    Dot {}
                    Meta { text: root.sizeText() }
                    Dot { visible: memoryLabel.visible }
                    Meta {
                        id: memoryLabel
                        visible: !!root.detail && root.detail.memory !== null && root.detail.memory !== undefined
                        text: visible ? Format.bytes(root.detail.memory) + " en memoria" : ""
                        HoverTip { text: "Memoria que ocupa (MEMORY USAGE)" }
                    }
                    Dot {}
                    Item {
                        implicitWidth: ttlRow.implicitWidth
                        implicitHeight: ttlRow.implicitHeight
                        Accessible.role: Accessible.Button
                        Accessible.name: "Cambiar la caducidad"

                        Row {
                            id: ttlRow
                            spacing: 4
                            Meta {
                                anchors.verticalCenter: parent.verticalCenter
                                tone: ttlArea.containsMouse ? 1 : 0.45
                                text: !root.detail ? "" : root.detail.ttl < 0 ? "Sin caducidad"
                                    : "Caduca en " + util.formatTtl(root.detail.ttl)
                            }
                            Icon {
                                anchors.verticalCenter: parent.verticalCenter
                                name: "edit"
                                size: 12
                                color: Theme.ink(ttlArea.containsMouse ? 1 : 0.45)
                            }
                        }
                        MouseArea {
                            id: ttlArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.openMode("ttl")
                        }
                        HoverTip { text: "Cambiar la caducidad" }
                    }
                }

                RowLayout {
                    visible: root.mode !== ""
                    width: parent.width
                    spacing: 8

                    Label {
                        visible: !root.compact
                        text: root.mode === "rename" ? "Nombre nuevo" : "Caduca en (segundos)"
                        tone: 0.55
                        font.pixelSize: Theme.textXs
                    }
                    RedisField {
                        id: draftField
                        Layout.fillWidth: true
                        /* Sin sitio para la etiqueta, el propio campo dice qué se escribe. */
                        placeholder: root.mode === "ttl" ? (root.compact ? "Caduca en (segundos)" : "3600")
                                   : (root.compact ? "Nombre nuevo" : "")
                        inputMethodHints: root.mode === "ttl" ? Qt.ImhDigitsOnly : Qt.ImhNone
                        onAccepted: root.saveMode()
                        onEscaped: root.mode = ""
                    }
                    RedisSmallButton {
                        text: "Guardar"
                        enabled: !root.busy
                        onClicked: root.saveMode()
                    }
                    RedisSmallButton {
                        visible: root.mode === "ttl" && !!root.detail && root.detail.ttl >= 0
                        text: "Quitar caducidad"
                        enabled: !root.busy
                        onClicked: root.apply({ op: "expire", ttl: null }, "Caducidad quitada", ok => { if (ok) root.mode = "" })
                    }
                    IconButton {
                        size: 28; iconSize: 14; plain: true
                        iconName: "close"
                        hint: "Cancelar"
                        onClicked: root.mode = ""
                    }
                }
            }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
        }

        /* Aviso de lectura parcial. */
        Item {
            visible: !!root.detail && !!root.detail.truncated
            Layout.fillWidth: true
            implicitHeight: notice.height + 12

            Rectangle {
                id: notice
                x: 16; y: 12
                width: parent.width - 32
                height: noticeLabel.implicitHeight + 16
                radius: Theme.radiusLg
                color: Qt.alpha(Theme.warn, 0.12)
                border.width: 1
                border.color: Qt.alpha(Theme.warn, 0.25)

                Label {
                    id: noticeLabel
                    x: 12; y: 8
                    width: parent.width - 24
                    text: root.truncatedText()
                    color: Theme.warn
                    font.pixelSize: 11
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }

        /* Cuerpo según el tipo. */
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            /* ── Texto ── */
            ColumnLayout {
                visible: root.vtype === "string"
                anchors.fill: parent
                anchors.margins: 16
                spacing: 12

                GlassArea {
                    id: stringArea
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 96
                    mono: true
                    readOnly: root.stringReadOnly
                    Accessible.name: "Valor"
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    RedisSmallButton {
                        visible: root.stringPretty !== null && root.stringPretty !== stringArea.text && !root.stringReadOnly
                        text: "Formatear JSON"
                        hint: "Indenta el JSON (no se guarda hasta pulsar Guardar)"
                        onClicked: stringArea.text = root.stringPretty
                    }
                    Label {
                        Layout.fillWidth: true
                        text: root.stringReadOnly ? "Solo lectura" : "Ctrl + S guarda · la caducidad se conserva"
                        tone: 0.35
                        font.pixelSize: 11
                    }
                    RedisSmallButton {
                        visible: root.stringDirty && !root.stringReadOnly
                        text: "Descartar"
                        onClicked: stringArea.text = root.stringBase
                    }
                    PrimaryButton {
                        implicitHeight: 32
                        text: "Guardar"
                        enabled: root.stringDirty && !root.stringReadOnly && !root.busy
                        onClicked: root.saveString()
                    }
                }
                Shortcut {
                    sequences: [StandardKey.Save]
                    enabled: root.visible && root.vtype === "string" && stringArea.edit.activeFocus
                    onActivated: root.saveString()
                }
            }

            /* ── Colecciones: tabla y alta al pie ── */
            ColumnLayout {
                visible: root.isCollection
                anchors.fill: parent
                anchors.margins: 16
                spacing: 0

                /* Encabezado fijo. */
                Item {
                    Layout.fillWidth: true
                    implicitHeight: 32

                    Label {
                        x: 12
                        anchors.verticalCenter: parent.verticalCenter
                        width: root.col1
                        text: root.heads[root.vtype] ? root.heads[root.vtype][0] : ""
                        mono: true
                        tone: 0.6
                        font.pixelSize: Theme.textXs
                        font.weight: Font.DemiBold
                    }
                    Label {
                        x: root.col2x
                        anchors.verticalCenter: parent.verticalCenter
                        width: root.col2
                        visible: root.vtype !== "set"
                        text: root.heads[root.vtype] ? root.heads[root.vtype][1] : ""
                        mono: true
                        tone: 0.6
                        font.pixelSize: Theme.textXs
                        font.weight: Font.DemiBold
                    }
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                }

                ListView {
                    id: table
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    model: rows
                    T.ScrollBar.vertical: SftpScrollBar { flick: table }

                    delegate: Item {
                        id: row
                        required property int index
                        required property string a
                        required property string b

                        readonly property real tallest: Math.max(
                            aText.visible ? aText.implicitHeight + 16 : 0,
                            aCell.visible ? aCell.height + 4 : 0,
                            bCell.visible ? bCell.height + 4 : 0,
                            bText.visible ? bText.implicitHeight + 16 : 0,
                            chips.visible ? chips.implicitHeight + 12 : 0)

                        width: table.width
                        height: Math.max(32, tallest)

                        /* Primera columna: campo, posición, miembro o id. */
                        Label {
                            id: aText
                            visible: root.vtype !== "zset"
                            x: 12; y: 8
                            width: root.col1
                            textFormat: Text.PlainText
                            text: root.vtype === "set" && row.a === "" ? "vacío" : row.a
                            font.italic: root.vtype === "set" && row.a === ""
                            color: root.vtype === "hash" ? Qt.alpha(Theme.brandLight1, 0.9)
                                 : root.vtype === "list" ? Theme.ink(0.4)
                                 : root.vtype === "stream" ? Theme.ink(0.5)
                                 : Theme.ink(row.a === "" ? 0.3 : 0.9)
                            mono: true
                            font.pixelSize: Theme.textXs
                            wrapMode: root.vtype === "list" ? Text.NoWrap : Text.WrapAnywhere
                            elide: root.vtype === "list" ? Text.ElideRight : Text.ElideNone
                        }
                        /* Puntuación de un conjunto ordenado. */
                        EditableCell {
                            id: aCell
                            visible: root.vtype === "zset"
                            x: 12; y: 2
                            width: root.col1
                            value: row.a
                            busy: root.busy
                            onSave: text => {
                                const n = root.toScore(text)
                                if (n === null) return
                                const cell = aCell
                                root.apply({ op: "zadd", member: row.b, score: n }, "Puntuación actualizada",
                                           ok => { if (ok && cell) cell.close() })
                            }
                        }

                        /* Segunda columna: valor editable, miembro o campos. */
                        EditableCell {
                            id: bCell
                            visible: root.vtype === "hash" || root.vtype === "list"
                            x: root.col2x; y: 2
                            width: root.col2
                            value: row.b
                            busy: root.busy
                            onSave: text => {
                                const cell = bCell
                                const done = ok => { if (ok && cell) cell.close() }
                                if (root.vtype === "hash")
                                    root.apply({ op: "hset", field: row.a, value: text }, "Campo actualizado", done)
                                else
                                    root.apply({ op: "lset", index: row.index, value: text }, "Elemento actualizado", done)
                            }
                        }
                        Label {
                            id: bText
                            visible: root.vtype === "zset"
                            x: root.col2x; y: 8
                            width: root.col2
                            textFormat: Text.PlainText
                            text: row.b
                            tone: 0.9
                            mono: true
                            font.pixelSize: Theme.textXs
                            wrapMode: Text.WrapAnywhere
                            elide: Text.ElideNone
                        }
                        Flow {
                            id: chips
                            visible: root.vtype === "stream"
                            x: root.col2x; y: 6
                            width: root.col2
                            spacing: 6

                            Repeater {
                                model: root.vtype === "stream" && row.b !== "" ? JSON.parse(row.b) : []
                                Rectangle {
                                    id: chip
                                    required property var modelData
                                    width: Math.min(chips.width, chipLabel.implicitWidth + 12)
                                    height: chipLabel.height + 4
                                    radius: Theme.radiusMd
                                    color: Theme.tintSunken
                                    border.width: 1
                                    border.color: Theme.hairlineSoft

                                    Label {
                                        id: chipLabel
                                        x: 6; y: 2
                                        width: Math.min(implicitWidth, Math.max(0, chips.width - 12))
                                        textFormat: Text.StyledText
                                        text: root.chipText(chip.modelData)
                                        tone: 0.9
                                        mono: true
                                        font.pixelSize: Theme.textXs
                                        wrapMode: Text.WrapAnywhere
                                        elide: Text.ElideNone
                                    }
                                }
                            }
                        }

                        IconButton {
                            anchors.right: parent.right
                            anchors.rightMargin: 6
                            y: 2
                            size: 28; iconSize: 14; plain: true
                            danger: true
                            iconName: "trash"
                            hint: root.vtype === "hash" ? "Quitar el campo" : root.vtype === "stream" ? "Quitar la entrada" : "Quitar"
                            enabled: !root.busy
                            onClicked: root.removeRow(row.index, row.a, row.b)
                        }
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.hairlineSoft }
                    }
                }

                /* Formulario de alta al pie de la colección. */
                Glass {
                    Layout.fillWidth: true
                    Layout.topMargin: 12
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusXl
                    implicitHeight: addRow.implicitHeight + 16

                    RowLayout {
                        id: addRow
                        x: 8; y: 8
                        width: parent.width - 16
                        spacing: 8

                        RedisField {
                            id: addA
                            visible: root.vtype === "hash" || root.vtype === "zset"
                            Layout.preferredWidth: root.vtype === "hash" ? Math.max(80, addRow.width / 3) : Math.min(128, addRow.width * 0.3)
                            placeholder: root.vtype === "hash" ? "campo" : "puntuación"
                            inputMethodHints: root.vtype === "zset" ? Qt.ImhFormattedNumbersOnly : Qt.ImhNone
                        }
                        RedisField {
                            id: addB
                            visible: root.vtype !== "stream"
                            Layout.fillWidth: true
                            placeholder: root.vtype === "set" || root.vtype === "zset" ? "miembro" : "valor"
                            onAccepted: root.addPrimary()
                        }
                        GlassArea {
                            id: streamArea
                            visible: root.vtype === "stream"
                            Layout.fillWidth: true
                            implicitHeight: 60
                            radius: Theme.radiusLg
                            mono: true
                            placeholder: "campo=valor (uno por línea)"
                            Accessible.name: "Campos de la entrada nueva"
                        }
                        RedisSmallButton {
                            visible: root.vtype === "list"
                            text: "Al inicio"
                            enabled: !root.busy
                            onClicked: root.pushList("lpush")
                        }
                        RedisSmallButton {
                            text: root.vtype === "list" ? "Al final" : root.vtype === "stream" ? "Agregar entrada" : "Agregar"
                            enabled: !root.busy
                                     && (root.vtype !== "hash" || addA.text !== "")
                                     && (root.vtype !== "stream" || streamArea.text.trim() !== "")
                            onClicked: root.addPrimary()
                        }
                    }
                }
            }

            /* ── Tipos de módulos ── */
            Item {
                id: moduleBox
                visible: root.hasData && root.vtype !== "string" && !root.isCollection
                x: 16; y: 16
                width: parent.width - 32
                height: moduleLabel.implicitHeight + 80

                Shape {
                    anchors.fill: parent
                    preferredRendererType: Shape.CurveRenderer
                    ShapePath {
                        strokeColor: Theme.edgeDashed
                        strokeWidth: 1
                        strokeStyle: ShapePath.DashLine
                        dashPattern: [4, 4]
                        fillColor: "transparent"
                        PathRectangle {
                            x: 0.5; y: 0.5
                            width: moduleBox.width - 1
                            height: moduleBox.height - 1
                            radius: Theme.radiusXl
                        }
                    }
                }
                Label {
                    id: moduleLabel
                    x: 24; y: 40
                    width: parent.width - 48
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.StyledText
                    text: "El tipo <font color=\"" + Theme.ink(0.8) + "\">" + root.escapeHtml(root.vtype)
                          + "</font> es de un módulo de Redis: su valor se lee y se cambia desde la consola."
                    tone: 0.55
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
    }

    /* ── Confirmación de borrado ── */
    Modal {
        id: deleteModal
        title: "Borrar clave"
        size: "sm"

        Label {
            width: deleteModal.bodyWidth
            text: "Se borrará la clave y todo su contenido. No se puede deshacer y queda en la auditoría de la conexión."
            tone: 0.75
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
        Rectangle {
            width: deleteModal.bodyWidth
            height: Math.min(128, deleteKeyText.implicitHeight + 24)
            radius: Theme.radiusLg
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairlineSoft

            ScrollArea {
                anchors.fill: parent
                anchors.margins: 1
                contentHeight: deleteKeyText.implicitHeight + 22
                Label {
                    id: deleteKeyText
                    x: 11; y: 11
                    width: parent.width - 22
                    textFormat: Text.PlainText
                    text: root.keyName
                    mono: true
                    tone: 0.8
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                }
            }
        }

        footer: Row {
            spacing: 8
            SecondaryButton { text: "Cancelar"; onClicked: deleteModal.close() }
            DangerButton {
                text: root.removing ? "Borrando…" : "Borrar"
                enabled: !root.removing
                onClicked: root.doDelete()
            }
        }
    }
}
