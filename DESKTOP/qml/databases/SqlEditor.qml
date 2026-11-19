import QtQuick
import QtQuick.Templates as T
import StartCode

/* Editor SQL con filas numeradas, resaltado y predicción (SqlEditor.tsx).

       SqlEditor {
           value: consola.sql; dialect: "mysql"; completion: indice
           onChange: value => guardar(value)
           onRun: ejecutar(); onSave: …; onSaveAs: …
       }

   `value` manda: cada edición sale por `change(value)` y quien lo usa la
   devuelve en `value`. Lo que en React se leía del `ref` (el textarea) está
   aquí como `selectionStart`, `selectionEnd`, `selectedText` y `forceFocus()`. */
Glass {
    id: root

    property string value: ""
    /* Resaltado y mayúsculas según el motor (comillas, comentarios, `$$`): "mysql" o "postgresql". */
    property string dialect: "mysql"
    property bool disabled: false
    /* Índice de `SqlCompletion.buildCompletionIndex()`; sin él, el editor no sugiere nada. */
    property var completion: null

    signal change(string value)
    /* Ctrl/⌘ + Enter. */
    signal run()
    /* Ctrl/⌘ + S. */
    signal save()
    /* Ctrl/⌘ + Mayús + S. */
    signal saveAs()

    readonly property int selectionStart: edit.selectionStart
    readonly property int selectionEnd: edit.selectionEnd
    readonly property string selectedText: edit.selectedText
    readonly property int cursorPosition: edit.cursorPosition
    property alias edit: edit

    /** Lleva el foco al editor (el `focus()` del textarea). */
    function forceFocus() { edit.forceActiveFocus() }

    /** Escribe `text` en el cursor, sustituyendo la selección si la hay. */
    function insertText(text) {
        text = String(text)
        const start = edit.selectionStart
        const end = edit.selectionEnd
        closeSuggest()
        internal = true
        if (end > start) edit.remove(start, end)
        edit.insert(start, text)
        edit.cursorPosition = start + text.length
        internal = false
        commit()
    }

    function setSelectionRange(start, end) { edit.select(start, end) }
    function selectAll() { edit.selectAll() }

    /** Sentencia del cursor (`statementAt` de utils/sql.ts): `{ start, end, sql }` o null. */
    function statementAt(caret) {
        const found = highlighter.statementAt(edit.text, caret === undefined ? edit.selectionStart : caret)
        return found.sql === undefined ? null : found
    }

    /* ── Medidas: las de la caja del textarea original ─────────────── */
    readonly property int pad: 12
    /* Franja de las barras propias, reservada abajo. */
    readonly property int barStrip: 12
    /* Margen derecho que el texto nunca pisa; la barra vertical va dentro. */
    readonly property int edge: 20
    readonly property int lineBox: 24
    readonly property string indentUnit: "  "
    readonly property int popupW: 300
    readonly property int popupMaxH: 248
    readonly property int optionH: 28

    readonly property real charW: metrics.advanceWidth("M") || 8
    /* Alto real de la fila: el que haya dejado el maquetador del documento. */
    readonly property real lineH: edit.lineCount > 0 && edit.contentHeight > 0
                                  ? edit.contentHeight / edit.lineCount : lineBox
    /* Caja del cursor en la primera fila: dónde cae el texto dentro de su fila. */
    readonly property rect firstRect: {
        edit.contentHeight; root.lineH
        return edit.positionToRectangle(0)
    }

    /* Colores del resaltado. Salen de `Theme.sql`; la tabla de reserva repite
       los `--sql-*` de dark.css, aurora.css y solar.css por si el tema no los trae. */
    readonly property var sqlFallback: ({
        dark: {
            keyword: "#c084fc", fn: "#f472b6", type: "#a5b4fc", string: "#6ee7b7", number: "#fcd34d",
            identifier: "#7dd3fc", comment: Qt.rgba(1, 1, 1, 0.35), operator: Qt.rgba(1, 1, 1, 0.55)
        },
        aurora: {
            keyword: "#67e8f9", fn: "#93c5fd", type: "#c4b5fd", string: "#86efac", number: "#fcd34d",
            identifier: "#f9a8d4", comment: Qt.rgba(1, 1, 1, 0.35), operator: Qt.rgba(1, 1, 1, 0.55)
        },
        solar: {
            keyword: "#c2410c", fn: "#be185d", type: "#7c3aed", string: "#047857", number: "#1d4ed8",
            identifier: "#0369a1", comment: Qt.rgba(42 / 255, 26 / 255, 12 / 255, 0.45),
            operator: Qt.rgba(42 / 255, 26 / 255, 12 / 255, 0.6)
        }
    })
    readonly property var sqlColors: Theme.sql ? Theme.sql : (sqlFallback[Theme.name] || sqlFallback.dark)

    /* ── Estado ────────────────────────────────────────────────────── */
    /* Último texto conocido: para saber si se escribió o borró un solo carácter. */
    property string lastText: ""
    /* Cambios hechos desde aquí (mayúsculas, sangría, sugerencia): no son tecleo. */
    property bool internal: false
    /* Desplazamiento para seguir al cursor: no debe cerrar las sugerencias. */
    property bool autoScrolling: false

    property bool suggesting: false
    property var suggestItems: []
    property int suggestFrom: 0
    property int suggestCaret: 0
    property int suggestActive: 0

    variant: "input"
    radius: Theme.radiusXl
    focused: edit.activeFocus
    implicitWidth: 320
    implicitHeight: 200

    onValueChanged: syncFromValue()
    /* Sin índice (cambió la base), el menú abierto ya no vale. */
    onCompletionChanged: closeSuggest()
    onSuggestActiveChanged: {
        const top = suggestActive * optionH
        if (top < list.contentY) list.contentY = top
        else if (top + optionH > list.contentY + list.height) list.contentY = top + optionH - list.height
    }
    Component.onCompleted: syncFromValue()

    /* `value` cambiado desde fuera (otra consulta, doble clic en el árbol). */
    function syncFromValue() {
        if (root.value === edit.text) {
            lastText = root.value
            return
        }
        closeSuggest()
        internal = true
        edit.text = root.value
        internal = false
        lastText = root.value
    }

    function commit() {
        lastText = edit.text
        root.change(lastText)
    }

    /* ── Texto: mayúsculas y sangría (utils/sql.ts) ────────────────── */

    /* Recorre el texto hasta `pos` para saber si cae en cadena, identificador
       citado o comentario. En PostgreSQL `#` no comenta y existen las cadenas
       con dólar (`$$…$$`, `$tag$…$tag$`). */
    function isInsideLiteral(text, pos, dialect) {
        let quote = null
        let lineComment = false
        let blockComment = false
        const pg = dialect === "postgresql"

        for (let i = 0; i < pos; i++) {
            const c = text[i]
            const next = text[i + 1]
            if (lineComment) { if (c === "\n") lineComment = false; continue }
            if (blockComment) { if (c === "*" && next === "/") { blockComment = false; i++ } continue }
            if (quote) {
                if (quote.length > 1) {
                    if (text.startsWith(quote, i)) { i += quote.length - 1; quote = null }
                    continue
                }
                if (c === "\\" && quote !== "`" && !pg) { i++; continue }
                if (c === quote) quote = null
                continue
            }
            const dollar = pg && c === "$" ? /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i)) : null
            if (dollar) { quote = dollar[0]; i += dollar[0].length - 1 }
            else if (c === "'" || c === "\"" || (c === "`" && !pg)) quote = c
            else if ((c === "#" && !pg) || (c === "-" && next === "-")) lineComment = true
            else if (c === "/" && next === "*") { blockComment = true; i++ }
        }
        return quote !== null || lineComment || blockComment
    }

    /* `uppercaseKeywordBefore`: si justo antes de `pos` se acaba de cerrar una
       palabra reservada en minúsculas, devuelve su tramo `{ start, end, upper }`.
       Fuera de cadenas, identificadores citados y comentarios. La longitud no
       varía, así que el cursor queda donde estaba. */
    function keywordBefore(text, pos, dialect) {
        if (pos < 2 || !/[\s(),;]/.test(text[pos - 1])) return null

        let start = pos - 1
        while (start > 0 && /[A-Za-z_]/.test(text[start - 1])) start--
        const word = text.slice(start, pos - 1)
        /* Parte de un identificador más largo (`tbl.from`, `x1select`): no se toca. */
        if (!word || (start > 0 && /[\w.$`]/.test(text[start - 1]))) return null
        if (!highlighter.isReservedWord(word) || word === word.toUpperCase()) return null
        if (isInsideLiteral(text, start, dialect)) return null

        return { start: start, end: pos - 1, upper: word.toUpperCase() }
    }

    /* Sangría de la línea nueva al pulsar Enter en `caret`. Las consultas se
       separan por `;`: mientras la consulta siga, la línea nueva va un nivel
       más adentro que la primera línea de la consulta, o conserva la sangría
       actual si ya es mayor; tras un `(` abierto, un nivel más. Tras `;` o sin
       consulta empezada, vuelve al margen. */
    function newlineIndent(text, caret, unit) {
        const before = text.slice(0, caret)
        const trimmed = before.replace(/\s+$/, "")
        if (!trimmed || trimmed.endsWith(";")) return ""
        const indentOf = pos => {
            const start = text.lastIndexOf("\n", pos - 1) + 1
            const m = /^[ \t]*/.exec(text.slice(start))
            return m ? m[0] : ""
        }
        /* Primera línea con texto de la consulta: la sangría base. */
        const stmtStart = trimmed.lastIndexOf(";") + 1
        const firstChar = stmtStart + before.slice(stmtStart).search(/\S/)
        const base = indentOf(firstChar) + unit
        const current = indentOf(caret)
        const level = current.length > base.length ? current : base
        return trimmed.endsWith("(") ? level + unit : level
    }

    /* Sustituye la palabra por su versión en mayúsculas. Va antes del cursor y
       mide lo mismo: el cursor no se mueve. */
    function applyUppercase(range) {
        if (!range) return
        edit.remove(range.start, range.end)
        edit.insert(range.start, range.upper)
    }

    /* Al cerrar una palabra reservada con espacio, salto de línea, paréntesis,
       coma o punto y coma, se pasa a mayúsculas. Solo al escribir un carácter:
       un texto pegado se respeta tal cual. */
    function handleEdited() {
        if (internal) return
        const next = edit.text
        if (next === lastText) return
        const prev = lastText
        const caret = edit.cursorPosition
        const collapsed = edit.selectionStart === edit.selectionEnd
        const typedOne = next.length === prev.length + 1 && collapsed
        if (typedOne) {
            internal = true
            applyUppercase(keywordBefore(next, caret, root.dialect))
            internal = false
        }
        commit()
        /* Se sugiere al escribir un carácter; al borrar uno con el menú abierto, se
           ajusta; pegar o borrar más cierra el menú. */
        const erasedOne = next.length === prev.length - 1 && collapsed
        if (typedOne || (erasedOne && suggesting)) openSuggest(lastText, caret, false)
        else closeSuggest()
    }

    /* Enter: sangría automática mientras siga la misma consulta (hasta el `;`). */
    function insertNewline() {
        const start = edit.selectionStart
        const end = edit.selectionEnd
        const text = edit.text
        const indent = newlineIndent(text, start, indentUnit)
        /* El salto de línea también cierra una palabra reservada: se pasa a mayúsculas como al escribirla. */
        const range = keywordBefore(text.slice(0, start) + "\n" + text.slice(end), start + 1, root.dialect)
        internal = true
        if (end > start) edit.remove(start, end)
        edit.insert(start, "\n" + indent)
        applyUppercase(range)
        edit.cursorPosition = start + 1 + indent.length
        internal = false
        commit()
    }

    /* ── Predicción ────────────────────────────────────────────────── */
    /* Se calcula al escribir (solo la sentencia del cursor, sin peticiones) y
       el menú flota en la posición del cursor, fuera del panel para no cortarse. */

    function openSuggest(text, caret, force) {
        const res = root.completion ? completer.completeSql(text, caret, root.completion, root.dialect, force) : null
        if (!res || !res.items.length) { closeSuggest(); return }
        suggestItems = res.items
        suggestFrom = res.from
        suggestCaret = caret
        suggestActive = 0
        list.contentY = 0
        placePopup()
        suggesting = true
        popup.open()
    }

    function closeSuggest() {
        if (!suggesting) return
        suggesting = false
        popup.close()
    }

    /* Bajo la línea del cursor, alineado con el inicio de la palabra a medias;
       sin sitio debajo, encima de la línea. */
    function placePopup() {
        const overlay = popup.parent
        if (!overlay) return
        const r = edit.positionToRectangle(suggestFrom)
        const lineTop = Math.floor((r.y + r.height / 2) / lineH) * lineH
        const p = edit.mapToItem(overlay, r.x, lineTop)
        const h = Math.min(suggestItems.length * optionH, popupMaxH - 8) + 8
        popup.x = Math.max(8, Math.min(p.x - 8, overlay.width - popupW - 8))
        const below = p.y + lineH + popupMaxH + 8 <= overlay.height
        popup.y = below ? p.y + lineH + 2 : p.y - 2 - h
    }

    function accept(item) {
        if (!suggesting || !item) return
        const from = suggestFrom
        const to = suggestCaret
        closeSuggest()
        internal = true
        if (to > from) edit.remove(from, to)
        edit.insert(from, item.insert)
        edit.cursorPosition = from + item.insert.length
        internal = false
        commit()
        edit.forceActiveFocus()
    }

    /* ── Teclado ───────────────────────────────────────────────────── */
    function handleKey(event) {
        const mods = event.modifiers
        const cmd = (mods & Qt.ControlModifier) !== 0 || (mods & Qt.MetaModifier) !== 0
        const enter = event.key === Qt.Key_Return || event.key === Qt.Key_Enter

        if (enter && cmd) {
            event.accepted = true
            closeSuggest()
            root.run()
            return
        }
        if (event.key === Qt.Key_S && cmd) {
            event.accepted = true
            closeSuggest()
            if (mods & Qt.ShiftModifier) root.saveAs()
            else root.save()
            return
        }
        /* Ctrl + Espacio: sugerencias aunque no haya nada escrito. */
        if (event.key === Qt.Key_Space && cmd) {
            event.accepted = true
            openSuggest(edit.text, edit.selectionStart, true)
            return
        }
        if (suggesting) {
            const n = suggestItems.length
            if (event.key === Qt.Key_Down || event.key === Qt.Key_Up) {
                event.accepted = true
                suggestActive = (suggestActive + (event.key === Qt.Key_Down ? 1 : -1) + n) % n
                return
            }
            if (enter || event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
                event.accepted = true
                accept(suggestItems[suggestActive])
                return
            }
            /* Aceptado: Escape cierra el menú y no lo que haya alrededor. */
            if (event.key === Qt.Key_Escape) {
                event.accepted = true
                closeSuggest()
                return
            }
            if (event.key === Qt.Key_Left || event.key === Qt.Key_Right || event.key === Qt.Key_Home
                    || event.key === Qt.Key_End || event.key === Qt.Key_PageUp || event.key === Qt.Key_PageDown)
                closeSuggest()
        }
        if (enter && !(mods & Qt.AltModifier)) {
            event.accepted = true
            insertNewline()
            return
        }
        /* Tab indenta en vez de sacar el foco del editor. */
        if (event.key === Qt.Key_Tab && !(mods & Qt.ShiftModifier)) {
            event.accepted = true
            insertText(indentUnit)
            return
        }
        event.accepted = false
    }

    /* ── Desplazamiento ────────────────────────────────────────────── */
    /* Mueve la vista solo lo justo para que el cursor se vea: su fila entera
       en vertical, y en horizontal la columna entre el margen izquierdo y la
       franja de la barra. */
    function revealCursor() {
        const r = edit.cursorRectangle
        const top = pad + Math.floor((r.y + r.height / 2) / lineH) * lineH
        const maxY = Math.max(0, scroll.contentHeight - scroll.height)
        const maxX = Math.max(0, scroll.contentWidth - scroll.width)
        const cx = pad + r.x
        const y = Math.max(0, Math.min(maxY,
            Math.min(Math.max(scroll.contentY, top + lineH + pad + barStrip - scroll.height), top)))
        const x = Math.max(0, Math.min(maxX,
            Math.min(Math.max(scroll.contentX, cx + charW - (scroll.width - edge)), Math.max(0, cx - pad))))
        if (y === scroll.contentY && x === scroll.contentX) return
        autoScrolling = true
        scroll.contentY = y
        scroll.contentX = x
        autoScrolling = false
        /* El menú sigue a la palabra que se está escribiendo. */
        if (suggesting) placePopup()
    }

    SqlCompletion { id: completer }
    FontMetrics { id: metrics; font: edit.font }

    SqlHighlighter {
        id: highlighter
        textDocument: edit.textDocument
        dialect: root.dialect
        lineHeight: root.lineBox
        keywordColor: root.sqlColors.keyword
        functionColor: root.sqlColors.fn
        typeColor: root.sqlColors.type
        stringColor: root.sqlColors.string
        numberColor: root.sqlColors.number
        identifierColor: root.sqlColors.identifier
        commentColor: root.sqlColors.comment
        operatorColor: root.sqlColors.operator
    }

    HoverHandler { id: areaHover }

    /* ── Columna de números ────────────────────────────────────────── */
    /* Solo se crean las filas que caben: cada número se coloca donde el
       maquetador puso su fila, así que sigue al texto al desplazar. */
    Rectangle {
        id: gutter

        readonly property int firstLine: Math.max(0, Math.floor((scroll.contentY - root.pad) / root.lineH))

        x: 1; y: 1
        width: Math.ceil(root.pad * 2 + String(Math.max(1, edit.lineCount)).length * root.charW)
        height: parent.height - 2
        topLeftRadius: root.radius - 1
        bottomLeftRadius: root.radius - 1
        color: Theme.tintSunken
        clip: true

        Repeater {
            model: Math.max(1, Math.ceil(scroll.height / root.lineH) + 2)
            Label {
                required property int index
                readonly property int line: gutter.firstLine + index

                visible: line < edit.lineCount
                x: 0
                y: root.pad + root.firstRect.y + line * root.lineH - scroll.contentY
                width: gutter.width - root.pad
                height: root.firstRect.height
                text: line + 1
                tone: 0.25
                mono: true
                font.pixelSize: 13
                horizontalAlignment: Text.AlignRight
                verticalAlignment: Text.AlignVCenter
                elide: Text.ElideNone
            }
        }
    }
    Rectangle {
        x: gutter.x + gutter.width
        y: 1
        width: 1
        height: parent.height - 2
        color: Theme.line
    }

    /* ── Texto ─────────────────────────────────────────────────────── */
    ScrollArea {
        id: scroll

        x: gutter.x + gutter.width + 1
        y: 1
        width: parent.width - x - 1
        height: parent.height - 2
        opacity: root.disabled ? 0.5 : 1
        /* Sin ajuste de línea: el ancho es el de la fila más larga, más los márgenes. */
        contentWidth: Math.max(width, Math.ceil(edit.contentWidth) + root.pad + root.edge)
        contentHeight: Math.max(height, Math.ceil(edit.contentHeight) + root.pad * 2 + root.barStrip)

        /* Desplazar a mano cierra el menú: ya no estaría junto a su palabra. */
        onContentYChanged: if (!root.autoScrolling) root.closeSuggest()
        onContentXChanged: if (!root.autoScrolling) root.closeSuggest()

        /* Clic en los márgenes: el foco va al editor igualmente. */
        MouseArea {
            width: scroll.contentWidth
            height: scroll.contentHeight
            enabled: !root.disabled
            cursorShape: Qt.IBeamCursor
            onPressed: mouse => {
                root.closeSuggest()
                edit.forceActiveFocus()
                edit.cursorPosition = edit.positionAt(mouse.x - edit.x, mouse.y - edit.y)
            }
        }

        Label {
            x: root.pad
            y: root.pad + root.firstRect.y
            height: root.firstRect.height
            verticalAlignment: Text.AlignVCenter
            visible: edit.length === 0
            text: "SELECT * FROM tabla LIMIT 100;"
            tone: 0.25
            mono: true
            font.pixelSize: 13
            elide: Text.ElideNone
        }

        TextEdit {
            id: edit

            x: root.pad
            y: root.pad
            width: scroll.contentWidth - root.pad - root.edge
            height: scroll.contentHeight - root.pad * 2 - root.barStrip
            enabled: !root.disabled
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.3)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: 13
            renderType: TextEdit.QtRendering
            textFormat: TextEdit.PlainText
            wrapMode: TextEdit.NoWrap
            tabStopDistance: root.charW * 8
            selectByMouse: true
            activeFocusOnTab: true
            inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText

            Accessible.name: "Editor SQL"

            Keys.onPressed: event => root.handleKey(event)
            onTextChanged: root.handleEdited()
            onCursorRectangleChanged: root.revealCursor()
            /* Al salir del editor el menú se cierra, salvo que el clic sea en el propio menú. */
            onActiveFocusChanged: if (!activeFocus && !popupHover.hovered) root.closeSuggest()
        }

        /* Barra horizontal, con el mismo aspecto que la vertical de `ScrollArea`. */
        T.ScrollBar.horizontal: T.ScrollBar {
            id: hbar
            parent: scroll
            anchors.left: scroll.left
            anchors.right: scroll.right
            anchors.bottom: scroll.bottom
            implicitHeight: 12
            minimumSize: 0.08
            visible: scroll.contentWidth > scroll.width
            opacity: areaHover.hovered || scroll.moving || hbar.pressed || hbar.hovered ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: 180 } }
            hoverEnabled: true

            contentItem: Item {
                implicitHeight: 12
                Rectangle {
                    id: hthumb
                    readonly property bool strong: hbar.hovered || hbar.pressed
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: strong ? 1 : 2
                    width: parent.width
                    height: strong ? 10 : 6
                    radius: height / 2
                    color: strong ? "transparent" : Theme.ink(0.3)
                    border.width: strong ? 1 : 0
                    border.color: Theme.hairlineStrong
                    Behavior on height { NumberAnimation { duration: Theme.moFast } }
                    BrandFill {
                        anchors.fill: parent
                        visible: hthumb.strong
                        radius: hthumb.radius
                        strength: 0.85
                    }
                }
                HoverHandler { cursorShape: hbar.pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor }
            }
        }
    }

    /* ── Sugerencias ───────────────────────────────────────────────── */
    T.Popup {
        id: popup

        parent: T.Overlay.overlay
        width: root.popupW
        height: list.height + 8
        padding: 4
        modal: false
        /* El foco se queda en el editor: se sigue escribiendo con el menú abierto. */
        focus: false
        /* Un clic fuera (también en el propio editor) lo cierra y sigue su camino. */
        closePolicy: T.Popup.CloseOnPressOutside
        onClosed: root.suggesting = false

        enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }

        background: Glass {
            variant: "float"
            radius: Theme.radiusXl
        }

        contentItem: Item {
            Accessible.role: Accessible.List
            Accessible.name: "Sugerencias"

            HoverHandler { id: popupHover }

            ScrollArea {
                id: list
                width: parent.width
                height: Math.min(contentHeight, root.popupMaxH - 8)
                contentHeight: column.height

                Column {
                    id: column
                    width: list.width

                    Repeater {
                        model: root.suggestItems
                        Rectangle {
                            id: option

                            required property var modelData
                            required property int index
                            readonly property bool current: index === root.suggestActive
                            readonly property string kind: modelData.kind
                            /* Tabla, vista, columna y alias: cada una con su familia de color. */
                            readonly property var kindTone: Theme.tone(kind === "table" ? "sky" : kind === "view" ? "teal"
                                                                     : kind === "column" ? "violet" : "amber")

                            width: column.width
                            height: root.optionH
                            radius: Theme.radiusLg
                            color: current ? Theme.tintHover : "transparent"
                            Behavior on color { ColorAnimation { duration: Theme.moFast } }

                            Accessible.role: Accessible.ListItem
                            Accessible.name: modelData.label
                            Accessible.selected: current

                            Rectangle {
                                id: kindBox
                                x: 8
                                anchors.verticalCenter: parent.verticalCenter
                                width: 16; height: 16
                                radius: 4
                                color: Qt.alpha(option.kindTone.base, 0.15)
                                Label {
                                    anchors.centerIn: parent
                                    text: option.kind === "table" ? "T" : option.kind === "view" ? "V"
                                        : option.kind === "column" ? "C" : "A"
                                    color: option.kindTone.text
                                    font.pixelSize: 9
                                    font.bold: true
                                    elide: Text.ElideNone
                                }
                            }
                            Label {
                                id: detailLabel
                                anchors.right: parent.right
                                anchors.rightMargin: 8
                                anchors.verticalCenter: parent.verticalCenter
                                width: Math.min(implicitWidth, option.width * 0.45)
                                visible: text !== ""
                                text: option.modelData.detail || ""
                                tone: 0.35
                                mono: true
                                font.pixelSize: Theme.textCaption
                            }
                            Label {
                                x: 32
                                anchors.verticalCenter: parent.verticalCenter
                                width: (detailLabel.visible ? detailLabel.x - 8 : option.width - 8) - x
                                text: option.modelData.label
                                tone: option.current ? 1 : 0.75
                                mono: true
                                font.pixelSize: Theme.textXs
                            }

                            HoverHandler {
                                cursorShape: Qt.PointingHandCursor
                                onHoveredChanged: if (hovered) root.suggestActive = option.index
                            }
                            TapHandler {
                                gesturePolicy: TapHandler.ReleaseWithinBounds
                                onTapped: root.accept(option.modelData)
                            }
                        }
                    }
                }
            }
        }
    }
}
