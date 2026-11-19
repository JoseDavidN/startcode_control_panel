import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import StartCode

/* Consultas guardadas de la conexión: buscar, ver, cargar, renombrar y
   eliminar. Las dos acciones que pierden algo piden un segundo clic.

       SavedQueriesModal {
           queries: …; dialect: "mysql"
           canAddEditor: …; activeEmpty: …; activeUnsaved: …; activeRunning: …; canSaveCurrent: …
           onLoad: query => …; onReplace: query => …; onSaveCurrent: …
           onRename: (id, name) => …; onRemove: id => …
       }

   `rename` no puede devolver un valor como en React: tras emitirla se mira si
   `queries` trae ya el nombre nuevo; si no, se da por rechazado. */
Modal {
    id: root

    /* `SavedQuery[]`: { id, name, sql, schema, updatedAt }. */
    property var queries: []
    /* "mysql" | "postgresql": resaltado de la vista previa. */
    property string dialect: "mysql"
    /* Queda sitio para otro editor. */
    property bool canAddEditor: true
    property bool activeEmpty: true
    /* El editor activo tiene texto que no está guardado en ninguna consulta. */
    property bool activeUnsaved: false
    property bool activeRunning: false
    property bool canSaveCurrent: false

    /* En el editor activo si está vacío; si no, en uno nuevo o en el que ya la tenga abierta. */
    signal load(var query)
    signal replace(var query)
    signal saveCurrent()
    signal rename(string id, string name)
    signal remove(string id)

    property string selectedId: ""
    property bool renaming: false
    property bool renameError: false
    /* "" | "delete" | "replace" */
    property string confirming: ""
    /* Tras cancelar el nombre con Escape, la tecla no debe cerrar además el modal. */
    property bool escapeGuard: false

    readonly property var filtered: {
        const list = root.queries || []
        const needle = searchField.text.trim().toLocaleLowerCase()
        const out = []
        for (let i = 0; i < list.length; i++) {
            const q = list[i]
            if (!needle || String(q.name).toLocaleLowerCase().includes(needle)
                || String(q.sql).toLocaleLowerCase().includes(needle)) out.push(q)
        }
        return out
    }
    readonly property var selected: {
        const list = root.filtered
        for (let i = 0; i < list.length; i++) if (list[i].id === root.selectedId) return list[i]
        return list.length > 0 ? list[0] : null
    }
    readonly property string currentId: selected ? selected.id : ""
    readonly property bool canLoad: activeEmpty || canAddEditor
    readonly property string previewHtml: selected ? highlight(String(selected.sql), dialect, Theme.sql) : ""

    function pick(id) {
        selectedId = id
        renaming = false
        renameError = false
        confirming = ""
    }

    function startRename() {
        if (!selected) return
        renameField.text = selected.name
        renameError = false
        renaming = true
        renameField.forceFocus()
        renameField.input.selectAll()
    }

    function cancelRename() {
        escapeGuard = true
        escapeTimer.restart()
        renaming = false
        renameError = false
    }

    function commitRename() {
        if (!selected || !renaming) return
        const name = renameField.text.trim()
        if (!name || name === selected.name) { renaming = false; renameError = false; return }
        const id = selected.id
        const list = root.queries || []
        for (let i = 0; i < list.length; i++) {
            if (list[i].id !== id && store.sameName(list[i].name, name)) { renameError = true; return }
        }
        root.rename(id, name)
        /* Quien guarda reasigna `queries` en el mismo manejador: si el nombre no cambió, no se pudo. */
        const after = root.queries || []
        let done = false
        for (let i = 0; i < after.length; i++) if (after[i].id === id) done = after[i].name === name.slice(0, store.maxQueryName)
        if (done) { renaming = false; renameError = false }
        else renameError = true
    }

    function replaceActive() {
        if (!selected) return
        if (activeUnsaved && confirming !== "replace") { confirming = "replace"; return }
        root.replace(selected)
    }

    function removeSelected() {
        if (!selected) return
        if (confirming !== "delete") { confirming = "delete"; return }
        root.remove(selected.id)
        confirming = ""
    }

    /* ── Resaltado de la vista previa (mismas reglas que el editor) ──── */
    function wordSet(words) {
        const set = {}
        const list = words.split(" ")
        for (let i = 0; i < list.length; i++) set[list[i]] = true
        return set
    }
    readonly property var sqlKeywords: wordSet(
        "select from where and or not in is null like between exists "
        + "join inner left right outer cross natural on using as "
        + "order group by having limit offset asc desc distinct "
        + "union all case when then else end with recursive "
        + "insert into values update set delete replace ignore duplicate "
        + "create alter drop truncate rename table database schema view index "
        + "add column modify change primary foreign key references unique "
        + "default constraint check auto_increment if cascade "
        + "show databases tables columns describe explain use "
        + "begin commit rollback transaction "
        + "true false count sum avg min max "
        + "ilike returning lateral conflict")
    readonly property var highlightOnlyKeywords: wordSet(
        "interval regexp rlike escape xor div mod unsigned zerofill "
        + "engine charset collate character after first returning over partition "
        + "window procedure function trigger declare return returns call grant "
        + "revoke privileges to of for lock unlock read write start "
        + "similar only materialized concurrently nulls vacuum analyze extension "
        + "sequence role owner language do nothing excluded filter perform")
    readonly property var sqlTypes: wordSet(
        "int integer tinyint smallint mediumint bigint decimal numeric float "
        + "double real bit bool boolean char varchar binary varbinary text "
        + "tinytext mediumtext longtext blob tinyblob mediumblob longblob enum "
        + "json date datetime timestamp time year uuid serial "
        + "jsonb timestamptz timetz bigserial smallserial bytea inet cidr macaddr "
        + "interval money citext tsvector xml int2 int4 int8 float4 float8 oid regclass")
    /* Reservadas que, seguidas de `(`, son funciones. */
    readonly property var callableKeywords: wordSet("count sum avg min max if replace left right insert")

    /* Grupos: comentario, cadena, identificador, número, palabra, operador.
       En PostgreSQL la cadena lleva dentro el grupo de la etiqueta `$tag$`. */
    readonly property string mysqlTokens:
        "(--[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))"
        + "|('(?:\\\\.|''|[^'\\\\])*(?:'|$)|\"(?:\\\\.|\"\"|[^\"\\\\])*(?:\"|$))"
        + "|(\\x60(?:\\x60\\x60|[^\\x60])*(?:\\x60|$))"
        + "|(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|\\b0x[0-9a-f]+\\b)"
        + "|([A-Za-z_][\\w$]*)"
        + "|([=<>!]=?|<>|[-+*/%,;().]|\\|\\||&&)"
    readonly property string postgresTokens:
        "(--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))"
        + "|((?:[eE])?'(?:\\\\.|''|[^'\\\\])*(?:'|$)|\\$([A-Za-z_][A-Za-z0-9_]*)?\\$[\\s\\S]*?(?:\\$\\3\\$|$))"
        + "|(\"(?:\"\"|[^\"])*(?:\"|$))"
        + "|(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b)"
        + "|([A-Za-z_][\\w$]*)"
        + "|(::|[=<>!]=?|<>|->>?|[-+*/%,;().#~|&^@]|\\|\\|)"

    /** Divide el SQL en `{ type, text }`; concatenar los `text` devuelve el original. */
    function tokenizeSql(text, dialectName) {
        const pg = dialectName === "postgresql"
        const re = new RegExp(pg ? postgresTokens : mysqlTokens, "gi")
        /* Posición de cada grupo según el motor. */
        const gIdent = pg ? 4 : 3, gNumber = pg ? 5 : 4, gWord = pg ? 6 : 5, gOperator = pg ? 7 : 6
        const tokens = []
        let last = 0
        let m
        while ((m = re.exec(text)) !== null) {
            const value = m[0]
            if (value.length === 0) { re.lastIndex++; continue }
            const index = m.index
            if (index > last) tokens.push({ type: "text", text: text.slice(last, index) })

            let type = "text"
            if (m[1]) type = "comment"
            else if (m[2]) type = "string"
            else if (m[gIdent]) type = "identifier"
            else if (m[gNumber]) type = "number"
            else if (m[gOperator]) type = "operator"
            else if (m[gWord]) {
                const lower = value.toLowerCase()
                /* Detrás de un punto es un nombre (`tbl.from`, `db.date`). */
                const afterDot = index > 0 && text[index - 1] === "."
                const call = text[index + value.length] === "("
                if (afterDot) type = "text"
                /* `INT(11)` es un tipo; `COUNT(`, `IF(` o `NOW(` son llamadas. */
                else if (sqlTypes[lower] === true) type = "type"
                else if (call && (sqlKeywords[lower] !== true || callableKeywords[lower] === true)) type = "function"
                else if (sqlKeywords[lower] === true || highlightOnlyKeywords[lower] === true) type = "keyword"
            }
            tokens.push({ type: type, text: value })
            last = index + value.length
        }
        if (last < text.length) tokens.push({ type: "text", text: text.slice(last) })
        return tokens
    }

    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    /** SQL como texto enriquecido: cada token con el color del tema (`Theme.sql`). */
    function highlight(sql, dialectName, palette) {
        const colors = {
            keyword: palette.keyword, "function": palette.fn, type: palette.type, string: palette.string,
            number: palette.number, identifier: palette.identifier, comment: palette.comment, operator: palette.operator
        }
        const tokens = tokenizeSql(sql, dialectName)
        let html = "<pre style=\"margin:0; font-family:'" + Theme.fontMono + "'\">"
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i]
            const body = escapeHtml(t.text)
            if (t.type === "text") html += body
            else if (t.type === "comment") html += "<font color=\"" + colors.comment + "\"><i>" + body + "</i></font>"
            else html += "<font color=\"" + colors[t.type] + "\">" + body + "</font>"
        }
        return html + "</pre>"
    }

    title: "Consultas guardadas"
    size: "xl"
    tall: true
    /* Mientras se edita el nombre, Escape solo cancela el nombre. */
    closePolicy: renaming || escapeGuard ? T.Popup.CloseOnPressOutside
                                         : T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside

    onAboutToShow: {
        searchField.text = ""
        renaming = false
        renameError = false
        confirming = ""
    }
    onCurrentIdChanged: {
        preview.contentX = 0
        preview.contentY = 0
    }

    SqlQueryStore { id: store }
    Timer { id: escapeTimer; interval: 300; onTriggered: root.escapeGuard = false }

    /* Botón de cristal suave con icono y color de texto propios. */
    component SoftAction: T.Button {
        id: act

        property string iconPath: ""
        property color inkColor: Theme.ink(0.85)
        property string hint: ""
        /* Tope de ancho: el texto se recorta en ventanas estrechas. */
        property real maxWidth: 10000

        implicitHeight: Theme.controlHeight
        implicitWidth: Math.min(maxWidth, actRow.implicitWidth + 32)
        hoverEnabled: true
        opacity: enabled ? 1 : 0.5

        background: Glass {
            variant: "soft"
            radius: Theme.radiusXl
            highlighted: act.hovered
            borderColor: act.visualFocus ? Theme.focusRing
                       : act.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        contentItem: Item {
            Row {
                id: actRow
                anchors.centerIn: parent
                spacing: 8
                Icon {
                    id: actIcon
                    visible: act.iconPath !== ""
                    anchors.verticalCenter: parent.verticalCenter
                    path: act.iconPath
                    color: act.inkColor
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.min(implicitWidth, act.maxWidth - 32 - (actIcon.visible ? 24 : 0))
                    text: act.text
                    color: act.inkColor
                    font.weight: Font.Medium
                }
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        HoverTip { text: act.hint }
    }

    Item {
        id: body
        width: root.bodyWidth
        /* El modal es alto: el cuerpo ocupa lo que queda bajo la cabecera. */
        height: Math.max(360, root.height - 64 - root.bodyPadding * 2)

        /* En ventanas estrechas la lista va encima del detalle. */
        readonly property bool narrow: width < 640

        GridLayout {
            id: topBar
            width: parent.width
            columns: body.narrow ? 1 : 2
            columnSpacing: 8
            rowSpacing: 8

            GlassField {
                id: searchField
                Layout.fillWidth: true
                Layout.preferredHeight: 40
                iconName: "search"
                placeholder: "Buscar por nombre o por texto de la consulta"
            }
            SoftAction {
                Layout.fillWidth: body.narrow
                text: "Guardar editor como nueva"
                iconPath: "M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM7 3v6h8V3M7 21v-7h10v7"
                hint: "Guarda el texto del editor activo como una consulta nueva"
                enabled: root.canSaveCurrent
                onClicked: root.saveCurrent()
            }
        }

        /* ── Lista ─────────────────────────────────────────────────── */
        Glass {
            id: listPane
            y: topBar.height + 16
            width: body.narrow ? parent.width : 320
            height: body.narrow ? Math.round((parent.height - y - 16) * 0.38) : parent.height - y
            variant: "soft"
            radius: Theme.radiusXl

            Label {
                visible: root.filtered.length === 0
                anchors.centerIn: parent
                width: parent.width - 32
                horizontalAlignment: Text.AlignHCenter
                text: (root.queries || []).length === 0 ? "Aún no hay consultas guardadas"
                                                        : "Ninguna coincide con la búsqueda"
                tone: 0.45
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }

            ListView {
                id: listView
                anchors.fill: parent
                anchors.margins: 1
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                model: root.filtered
                T.ScrollBar.vertical: SftpScrollBar { flick: listView }

                delegate: Item {
                    id: entry
                    required property var modelData
                    required property int index

                    readonly property bool current: modelData.id === root.currentId

                    width: ListView.view.width
                    height: 56
                    Accessible.name: modelData.name

                    Rectangle {
                        anchors.fill: parent
                        radius: Theme.radiusLg
                        color: entry.current ? Theme.tintActive : entryHover.hovered ? Theme.tintHover : "transparent"
                        Behavior on color { ColorAnimation { duration: Theme.moFast } }
                    }
                    Label {
                        id: entryName
                        x: 14; y: 10
                        width: parent.width - 28
                        text: entry.modelData.name
                    }
                    Label {
                        id: entrySchema
                        visible: !!entry.modelData.schema
                        x: 14
                        anchors.top: entryName.bottom
                        anchors.topMargin: 2
                        width: Math.min(implicitWidth, (parent.width - 28) * 0.6)
                        text: entry.modelData.schema ? entry.modelData.schema + " · " : ""
                        tone: 0.4
                        mono: true
                        font.pixelSize: 11
                        elide: Text.ElideMiddle
                    }
                    Label {
                        x: 14 + (entrySchema.visible ? entrySchema.width : 0)
                        anchors.top: entryName.bottom
                        anchors.topMargin: 2
                        width: parent.width - 14 - x
                        text: Format.timeAgo(entry.modelData.updatedAt)
                        tone: 0.4
                        font.pixelSize: 11
                    }
                    Rectangle {
                        visible: entry.index < listView.count - 1
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: 1
                        color: Theme.line
                    }

                    HoverHandler { id: entryHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: root.pick(entry.modelData.id)
                        onDoubleTapped: if (root.canLoad) root.load(entry.modelData)
                    }
                    HoverTip { text: "Doble clic para cargar" }
                }
            }
        }

        /* ── Detalle ───────────────────────────────────────────────── */
        Glass {
            id: detailPane
            x: body.narrow ? 0 : listPane.width + 16
            y: body.narrow ? listPane.y + listPane.height + 16 : listPane.y
            width: parent.width - x
            height: parent.height - y
            variant: "soft"
            radius: Theme.radiusXl

            Column {
                visible: root.selected === null
                anchors.centerIn: parent
                width: parent.width - 48
                spacing: 8
                Icon {
                    anchors.horizontalCenter: parent.horizontalCenter
                    name: "folder"
                    size: 28
                    color: Theme.ink(0.25)
                }
                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: "Aquí verás la consulta que elijas"
                    tone: 0.55
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: "Para guardar una, escríbela en el editor y pulsa Guardar o Ctrl + S"
                    tone: 0.35
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }

            Item {
                id: detail
                visible: root.selected !== null
                anchors.fill: parent

                /* Nombre, o el campo para cambiarlo. */
                Item {
                    id: detailHead
                    width: parent.width
                    height: Math.max(48, (root.renaming ? renameColumn.implicitHeight : 32) + 16)

                    Label {
                        visible: !root.renaming
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 32 - 40
                        text: root.selected ? root.selected.name : ""
                        font.weight: Font.DemiBold
                        HoverTip { text: root.selected ? root.selected.name : "" }
                    }
                    IconButton {
                        visible: !root.renaming
                        anchors.right: parent.right
                        anchors.rightMargin: 16
                        anchors.verticalCenter: parent.verticalCenter
                        size: 32
                        iconSize: 14
                        plain: true
                        iconName: "edit"
                        hint: "Cambiar nombre"
                        onClicked: root.startRename()
                    }

                    Column {
                        id: renameColumn
                        visible: root.renaming
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 32
                        spacing: 4

                        GlassField {
                            id: renameField
                            width: parent.width
                            height: 32
                            radius: Theme.radiusLg
                            maximumLength: store.maxQueryName
                            Accessible.name: "Nombre de la consulta"
                            onAccepted: root.commitRename()
                            onTextChanged: if (root.renaming) root.renameError = false
                            /* Solo cancela el nombre, no cierra el modal. */
                            Keys.onEscapePressed: event => {
                                event.accepted = true
                                root.cancelRename()
                            }
                        }
                        Label {
                            visible: root.renameError
                            width: parent.width
                            text: "Ya hay otra consulta con ese nombre"
                            color: Theme.tone("rose").text
                            font.pixelSize: Theme.textXs
                        }
                    }
                    /* Al salir del campo se guarda el nombre, como al pulsar Enter. */
                    Connections {
                        target: renameField.input
                        function onActiveFocusChanged() {
                            if (!renameField.input.activeFocus && root.renaming) root.commitRename()
                        }
                    }

                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                }

                /* Vista previa con resaltado; se desplaza en las dos direcciones. */
                Flickable {
                    id: preview
                    anchors.top: detailHead.bottom
                    anchors.bottom: detailFoot.top
                    width: parent.width
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    contentWidth: Math.max(width, code.implicitWidth + 32)
                    contentHeight: Math.max(height, code.implicitHeight + 32)
                    T.ScrollBar.vertical: SftpScrollBar { flick: preview }

                    TextEdit {
                        id: code
                        x: 16; y: 16
                        readOnly: true
                        selectByMouse: true
                        textFormat: TextEdit.RichText
                        wrapMode: TextEdit.NoWrap
                        text: root.previewHtml
                        color: Theme.ink(0.9)
                        selectionColor: Theme.brand1(0.45)
                        selectedTextColor: Theme.ink(1)
                        font.family: Theme.fontMono
                        font.pixelSize: 13
                    }
                }

                Item {
                    id: detailFoot
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: actions.implicitHeight + 24

                    Rectangle { width: parent.width; height: 1; color: Theme.line }

                    /* De derecha a izquierda: la base queda al otro extremo y los
                       botones bajan de línea si no caben. */
                    Flow {
                        id: actions
                        x: 16; y: 12
                        width: parent.width - 32
                        spacing: 8
                        layoutDirection: Qt.RightToLeft

                        readonly property real buttonsWidth: loadBox.width + 8 + removeButton.width
                                                             + (replaceButton.visible ? replaceButton.width + 8 : 0)

                        Item {
                            id: loadBox
                            width: loadButton.width
                            height: loadButton.height
                            PrimaryButton {
                                id: loadButton
                                width: Math.min(implicitWidth, actions.width)
                                text: root.activeEmpty ? "Cargar" : "Cargar en un editor nuevo"
                                enabled: root.canLoad
                                onClicked: if (root.selected) root.load(root.selected)
                            }
                            /* Fuera del botón: desactivado no recibe el ratón. */
                            HoverTip { text: root.canLoad ? "" : "No caben más editores: cierra uno o reemplaza el actual" }
                        }
                        SoftAction {
                            id: replaceButton
                            visible: !root.activeEmpty && !root.activeRunning
                            maxWidth: actions.width
                            text: root.confirming === "replace" ? "Se perderá el texto actual: pulsa otra vez"
                                                                : "Reemplazar editor actual"
                            inkColor: root.confirming === "replace" ? Theme.tone("amber").text : Theme.ink(0.85)
                            hint: "Pone esta consulta en el editor activo, en lugar de lo que tiene"
                            onClicked: root.replaceActive()
                            onActiveFocusChanged: if (!activeFocus && root.confirming === "replace") root.confirming = ""
                        }
                        SoftAction {
                            id: removeButton
                            maxWidth: actions.width
                            text: root.confirming === "delete" ? "Pulsa otra vez para eliminar" : "Eliminar"
                            inkColor: Theme.tone("rose").text
                            onClicked: root.removeSelected()
                            onActiveFocusChanged: if (!activeFocus && root.confirming === "delete") root.confirming = ""
                        }
                        Item {
                            id: baseBox
                            readonly property real natural: baseTitle.implicitWidth + baseName.implicitWidth
                            readonly property real spare: actions.width - actions.buttonsWidth - 8
                            readonly property bool sameLine: spare >= Math.min(natural, 120)
                            width: sameLine ? spare : actions.width
                            height: sameLine ? Theme.controlHeight : baseTitle.implicitHeight

                            Label {
                                id: baseTitle
                                anchors.verticalCenter: parent.verticalCenter
                                text: "Base: "
                                tone: 0.45
                                font.pixelSize: Theme.textXs
                            }
                            Label {
                                id: baseName
                                anchors.left: baseTitle.right
                                anchors.baseline: baseTitle.baseline
                                width: parent.width - baseTitle.width
                                text: root.selected && root.selected.schema ? root.selected.schema : "sin base"
                                tone: 0.7
                                mono: true
                                font.pixelSize: Theme.textXs
                            }
                        }
                    }
                }
            }
        }
    }
}
