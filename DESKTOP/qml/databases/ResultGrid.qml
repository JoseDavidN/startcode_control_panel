import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import StartCode

/* Tabla de resultados con selección de filas para copiar y edición en línea.
   Con cada `result` nuevo arranca sin selección, sin columnas reveladas y sin
   cambios pendientes.

   - Clic en `#`: todas las filas. Clic en un número: esa fila (Ctrl/⌘ suma,
     Mayús elige un rango). Ctrl/⌘ + C o «Copiar» las copian como TSV.
   - Clic en una celda la marca; Ctrl/⌘ + C copia su valor tal cual. Las
     flechas la mueven y Enter la edita.
   - Doble clic en una celda editable la edita; la fila muestra guardar y
     cancelar, y guardar hace un UPDATE por clave primaria de esa fila.

   Los valores viven aquí (copia local de las filas, cambios pendientes,
   columnas ocultas, filas nuevas); `ResultModel` solo da la forma a los tres
   `TableView` sincronizados (cuerpo, cabecera fija y numeración fija), que
   crean únicamente las celdas a la vista. */
Item {
    id: grid

    /* Resultado de `POST /databases/:id/query` (con columnas y filas). */
    property var result: null
    property string connectionId: ""
    /* Sesión de la vista: el UPDATE va por la misma conexión. */
    property string sessionId: ""
    /* Nombre base del archivo exportado, sin extensión. */
    property string fileName: ""
    /* Consulta que dio el resultado (`{ sql, schema }`): al exportar se repite para traer todas las filas. */
    property var query: null
    /* Resumen de la consulta (filas, truncado) para la barra. */
    property Component status: null
    /* Vuelve a ejecutar la consulta (tras insertar o borrar filas, para verlas). */
    signal rerun()

    /* ── Filas alternas (`--row-stripe-1/2` de cada tema) ── */
    readonly property var stripes: ({
        dark: [Qt.rgba(168 / 255, 85 / 255, 247 / 255, 0.07), Qt.rgba(0, 0, 0, 0.18)],
        aurora: [Qt.rgba(34 / 255, 211 / 255, 238 / 255, 0.06), Qt.rgba(0, 0, 0, 0.18)],
        solar: [Qt.rgba(1, 1, 1, 0.65), Qt.rgba(249 / 255, 115 / 255, 22 / 255, 0.07)]
    })
    readonly property color stripe1: (stripes[Theme.name] || stripes.dark)[0]
    readonly property color stripe2: (stripes[Theme.name] || stripes.dark)[1]
    /* `.sticky-cell`: el fondo casi opaco de lo que flota, sin desenfoque. */
    readonly property color stickyColor: Theme.surface(Theme.glassAlpha.float)

    readonly property int rowH: 32
    readonly property int headH: 36
    readonly property real charW: Math.max(1, charMetrics.advanceWidth)
    readonly property bool compact: width < 760

    /* ── Estado ── */
    property bool ready: false
    /* Cambia con cada resultado: las respuestas de uno anterior se descartan. */
    property int generation: 0
    property var columns: []
    property var meta: []
    property var sensitive: []
    /* Copia local: las filas guardadas se actualizan aquí sin volver a consultar. */
    property var rows: []
    property var revealed: ({})
    property var selected: ({})
    property int selectedCount: 0
    property int anchorRow: -1
    /* Celda marcada con un clic: la que copia Ctrl + C. Excluye la selección de filas. */
    property var active: null
    /* Celda en edición: `{ kind: "row", r, c, draft }` o `{ kind: "draft", id, c, draft, canDefault }`. */
    property var edit: null
    /* Cada edición lleva un número: el editor no se reinicia si solo cambia su fila. */
    property int editSeq: 0
    /* Celdas cambiadas y sin guardar: fila → columna → valor nuevo. */
    property var pending: ({})
    property var saving: ({})
    property var rowErrors: ({})
    property string flash: ""
    /* Filas nuevas sin guardar: `{ id, cells: { c: { mode, value } }, saving, error }`. */
    property var drafts: []
    property int draftSeq: 0
    property var deleting: null

    property int bodyHoverRow: -1
    property int gutterHoverRow: -1
    readonly property int hoverRow: bodyHoverRow >= 0 ? bodyHoverRow : gutterHoverRow

    /* Columnas de la tabla de origen, para las filas nuevas. */
    property var insertSources: []
    property var insertRef: null
    property var tableCols: null
    property bool colsLoading: false
    property bool colsError: false

    /* Largo del texto más ancho de cada columna (en caracteres). */
    property var baseLens: []

    readonly property int pendingRows: Object.keys(pending).length
    readonly property int errorCount: Object.keys(rowErrors).length
    readonly property bool allSelected: rows.length > 0 && selectedCount === rows.length
    readonly property int hiddenCount: {
        let n = 0
        for (let c = 0; c < sensitive.length; c++) if (sensitive[c] && !revealed[c]) n++
        return n
    }
    readonly property bool canDelete: result && result.tableKeys ? Object.keys(result.tableKeys).length > 0 : false

    /* Columna de la tabla que corresponde a cada columna del resultado (las calculadas, ninguna). */
    readonly property var colAt: {
        const list = tableCols || []
        const source = insertSources.length > 0 ? insertSources[0] : null
        const out = []
        for (let c = 0; c < columns.length; c++) {
            const m = meta[c]
            let found = null
            if (m && m.source === source && m.column)
                for (let i = 0; i < list.length; i++)
                    if (list[i].name === m.column) { found = list[i]; break }
            out.push(found)
        }
        return out
    }
    readonly property var missingCols: {
        const list = tableCols || []
        const out = []
        for (let i = 0; i < list.length; i++) {
            let present = false
            for (let c = 0; c < colAt.length; c++)
                if (colAt[c] && colAt[c].name === list[i].name) { present = true; break }
            if (!present) out.push(list[i].name)
        }
        return out
    }
    /* Solo con una consulta de una sola tabla (sin JOIN) que traiga todas sus
       columnas: así cada celda de la fila nueva es una columna de la tabla. */
    readonly property string insertBlock:
        insertSources.length > 1 ? "Solo se agregan filas en consultas de una sola tabla: esta trae columnas de varias (JOIN)"
        : !insertRef ? "El resultado no sale directamente de una tabla"
        : colsError ? "No se pudieron leer las columnas de la tabla"
        : missingCols.length > 0 ? "La consulta no trae todas las columnas de " + insertRef.table
                                   + " (faltan " + missingCols.join(", ") + "): usa SELECT * para agregar filas"
        : ""
    readonly property bool canInsert: insertRef !== null && tableCols !== null && insertBlock === ""

    /* ── Medidas ── */
    readonly property real numberW: Math.ceil(String(Math.max(1, rows.length)).length * charW) + 24
    readonly property real gutterW: {
        let w = numberW
        if (pendingRows > 0 || errorCount > 0) w = numberW + 56
        if (drafts.length > 0) w = Math.max(w, 110)
        return w
    }
    readonly property var colWidths: {
        const out = []
        let total = 0
        const hasDrafts = drafts.length > 0
        for (let c = 0; c < columns.length; c++) {
            let chars = baseLens[c] || 0
            if (sensitive[c]) chars = Math.max(chars, 14)
            if (hasDrafts) chars = Math.max(chars, draftChars(c))
            const content = Math.min(320, Math.ceil(chars * charW) + 2)
            const m = meta[c]
            const head = Math.ceil(String(columns[c]).length * charW) + 2
                       + (m && m.editable ? 18 : 0) + (sensitive[c] ? 30 : 0)
            const w = Math.max(content, head) + 24
            out.push(w)
            total += w
        }
        /* `min-w-full`: si sobra sitio, la tabla ocupa todo el ancho. */
        const avail = body.width - body.rightMargin
        if (total > 0 && total < avail) {
            let used = 0
            for (let c = 0; c < out.length; c++) {
                out[c] = c === out.length - 1 ? avail - used : Math.floor(out[c] * avail / total)
                used += out[c]
            }
        }
        return out
    }
    readonly property var colX: {
        const out = []
        let x = 0
        for (let c = 0; c < colWidths.length; c++) { out.push(x); x += colWidths[c] }
        return out
    }
    onColWidthsChanged: Qt.callLater(grid.relayout)
    onGutterWChanged: Qt.callLater(grid.relayout)

    function relayout() {
        body.forceLayout()
        gutterView.forceLayout()
    }

    TextMetrics {
        id: charMetrics
        font.family: Theme.fontMono
        font.pixelSize: Theme.textXs
        text: "0"
    }

    /* ── Texto de los valores ── */
    function display(value) {
        return value === null || value === undefined ? ""
             : typeof value === "object" ? JSON.stringify(value) : String(value)
    }
    /* Una celda es una sola línea: los saltos y tabuladores se ven como un espacio. */
    function oneLine(text) {
        const cut = text.length > 400 ? text.slice(0, 400) : text
        return cut.replace(/\s+/g, " ")
    }
    /* TSV como lo pega Excel: con tabulador, salto o comillas, entre comillas. */
    function tsvCell(value) {
        if (value === null || value === undefined) return "NULL"
        const text = display(value)
        return /[\t\n\r"]/.test(text) ? "\"" + text.replace(/"/g, "\"\"") + "\"" : text
    }
    function errorText(error) {
        return error && error.message ? error.message : "No se pudo guardar"
    }
    function localeCount(n) { return Number(n).toLocaleString(Qt.locale(), "f", 0) }
    function toList(x) { return x ? Array.from(x) : [] }

    /* ── Columnas sensibles: se reconocen por el nombre y se muestran
       enmascaradas hasta que el usuario las revela. Es una protección de
       pantalla, no de transporte: el backend envía los valores. ── */
    readonly property var dictionary: ({
        secret: {
            words: ["pass", "pwd", "pw", "psw", "passw", "pin", "otp", "hash", "salt", "secret", "token",
                    "clave", "apikey", "cvv", "cvc", "nip"],
            fragments: ["password", "passwd", "passphrase", "contrasena", "contrasenia", "secreto",
                        "apikey", "api_key", "access_key", "secret_key", "private_key", "privatekey",
                        "client_secret", "refresh_token", "access_token", "auth_token", "session_token",
                        "credential", "credencial", "pwdhash", "password_hash", "totp", "mfa_secret"]
        },
        email: {
            words: ["mail", "correo", "email", "emails"],
            fragments: ["email", "e_mail", "correo_electronico", "correoelectronico", "mail_address", "emailaddress"]
        }
    })
    /* `UserPassword`, `user-password`, `Contraseña` → `user_password`, `contrasena`. */
    function normalizeName(name) {
        return String(name).normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
    }
    /* Tipo de dato sensible que sugiere el nombre de la columna, o null. */
    function sensitiveKind(column) {
        const norm = normalizeName(column)
        const words = norm.split("_")
        const compactName = norm.replace(/_/g, "")
        const kinds = ["secret", "email"]
        /* Secreto antes que correo: `email_password` es una contraseña. */
        for (let k = 0; k < kinds.length; k++) {
            const entry = dictionary[kinds[k]]
            if (entry.words.some(x => words.indexOf(x) >= 0)) return kinds[k]
            if (entry.fragments.some(f => norm.indexOf(f) >= 0 || compactName.indexOf(f.replace(/_/g, "")) >= 0))
                return kinds[k]
        }
        return null
    }
    /* Los secretos se tapan enteros y con largo fijo; los correos conservan la
       primera letra y el dominio de primer nivel: `j•••@g•••.com`. */
    function maskValue(kind, value) {
        if (value === null || value === undefined) return ""
        if (kind === "email") {
            const m = /^([^@\s])[^@\s]*@([^@\s])[^@\s]*?(\.[a-z0-9-]+)?$/i.exec(String(value).trim())
            if (m) return m[1] + "•••@" + m[2] + "•••" + (m[3] || "")
        }
        return "••••••••"
    }

    function isHidden(c) { return Boolean(sensitive[c]) && !revealed[c] }
    function canEdit(c) { return Boolean(meta[c] && meta[c].editable) && !isHidden(c) }
    function valueAt(r, c) {
        const changed = pending[r]
        return changed !== undefined && c in changed ? changed[c] : rows[r][c]
    }
    /* Lo que se ve: con las columnas ocultas, enmascarado. */
    function shownAt(r, c) {
        const v = valueAt(r, c)
        const kind = sensitive[c]
        return kind && isHidden(c) && v !== null && v !== undefined ? maskValue(kind, v) : v
    }

    /* ── Filas nuevas (borradores) ── */
    /* Tipos donde un texto vacío es un valor válido. */
    function isTextType(type) {
        return /char|text|json|uuid|enum|set|xml|inet|cidr|bytea|blob|binary/i.test(String(type))
    }
    /* Cómo empieza cada celda: por defecto si la columna lo tiene, NULL si lo admite; si no, hay que escribirla. */
    function initialDraftCell(col) {
        return col.auto || col.defaultValue !== null ? { mode: "default", value: "" }
             : col.nullable ? { mode: "null", value: "" }
             : { mode: "value", value: "" }
    }
    function defaultText(col) {
        const shown = col.defaultValue !== null && col.defaultValue !== undefined ? col.defaultValue : col.autoLabel
        return "Por defecto" + (shown !== null && shown !== undefined ? " (" + (shown === "" ? "texto vacío" : shown) + ")" : "")
    }
    function draftChars(c) {
        const col = colAt[c]
        if (!col || col.generated) return 8
        return Math.max(13, defaultText(col).length)
    }
    function draftIndex(id) {
        for (let i = 0; i < drafts.length; i++) if (drafts[i].id === id) return i
        return -1
    }

    /* ── Lo que pinta cada celda: `{ kind, text, dirty }` ── */
    function cellInfo(row, c) {
        const nd = drafts.length
        if (row < nd) {
            const d = drafts[row]
            const col = colAt[c]
            const cell = d ? d.cells[c] : undefined
            if (!col || !cell) return { kind: "muted", text: col && col.generated ? "generada" : "—", dirty: false }
            if (cell.mode === "default") return { kind: "default", text: oneLine(defaultText(col)), dirty: false }
            if (cell.mode === "null") return { kind: "null", text: "NULL", dirty: false }
            if (cell.value === "")
                return { kind: "required", text: isTextType(col.type) ? "(texto vacío)" : "(obligatoria)", dirty: true }
            return { kind: "draft", text: oneLine(cell.value), dirty: true }
        }
        const r = row - nd
        const data = rows[r]
        if (!data) return { kind: "value", text: "", dirty: false }
        const changed = pending[r]
        const dirty = changed !== undefined && c in changed
        const v = dirty ? changed[c] : data[c]
        if (v === null || v === undefined) return { kind: "null", text: "NULL", dirty: dirty }
        if (sensitive[c] && !revealed[c]) return { kind: "masked", text: maskValue(sensitive[c], v), dirty: dirty }
        return { kind: "value", text: oneLine(display(v)), dirty: dirty }
    }
    function isEditingCell(row, c) {
        if (!edit || edit.c !== c) return false
        const nd = drafts.length
        return edit.kind === "row" ? row === edit.r + nd : row < nd && drafts[row].id === edit.id
    }

    function say(text) {
        flash = text
        flashTimer.restart()
    }
    Timer { id: flashTimer; interval: 2200; onTriggered: grid.flash = "" }

    function takeFocus() { body.forceActiveFocus() }

    /* ── Resultado nuevo ── */
    function reset() {
        generation++
        const res = result || {}
        hideTip(0)
        edit = null
        columns = toList(res.columns)
        meta = toList(res.columnMeta)
        sensitive = columns.map(c => sensitiveKind(c))
        rows = toList(res.rows)
        revealed = ({})
        selected = ({})
        selectedCount = 0
        anchorRow = -1
        active = null
        pending = ({})
        saving = ({})
        rowErrors = ({})
        flash = ""
        drafts = []
        deleting = null
        bodyHoverRow = -1
        gutterHoverRow = -1

        const sources = []
        for (let i = 0; i < meta.length; i++) {
            const s = meta[i] ? meta[i].source : null
            if (s && sources.indexOf(s) < 0) sources.push(s)
        }
        insertSources = sources
        let ref = null
        if (sources.length === 1) {
            let m = null
            for (let i = 0; i < meta.length; i++) if (meta[i] && meta[i].source === sources[0]) { m = meta[i]; break }
            if (m && m.schema && m.table) {
                ref = { schema: m.schema, table: m.table }
                if (m.namespace) ref.namespace = m.namespace
            }
        }
        insertRef = ref
        tableCols = null
        colsError = false
        colsLoading = false

        measure()
        bodyModel.resize(rows.length, columns.length)
        headerModel.resize(columns.length > 0 ? 1 : 0, columns.length)
        gutterModel.resize(rows.length, 1)
        body.contentX = 0
        body.contentY = 0
        loadColumns()
    }
    function measure() {
        const n = columns.length
        const limit = Math.ceil(320 / charW) + 1
        const lens = []
        for (let c = 0; c < n; c++) lens.push(0)
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r]
            for (let c = 0; c < n; c++) {
                if (lens[c] >= limit) continue
                const v = row[c]
                const len = v === null || v === undefined ? 4 : typeof v === "string" ? v.length : display(v).length
                if (len > lens[c]) lens[c] = len
            }
        }
        baseLens = lens
    }
    /* Filas del modelo: primero las nuevas, luego las del resultado. */
    function syncShape() {
        const total = drafts.length + rows.length
        bodyModel.rowTotal = total
        gutterModel.rowTotal = total
    }
    function loadColumns() {
        if (!insertRef || !sessionId || colsLoading) return
        const gen = generation
        const payload = { schema: insertRef.schema, table: insertRef.table, sessionId: sessionId }
        if (insertRef.namespace) payload.namespace = insertRef.namespace
        colsLoading = true
        colsError = false
        Api.request("POST", "/databases/" + connectionId + "/tables/columns", payload, (ok, data) => {
            if (gen !== grid.generation) return
            grid.colsLoading = false
            if (!ok) { grid.colsError = true; return }
            grid.tableCols = grid.toList(data)
        })
    }

    onResultChanged: if (ready) reset()
    onSessionIdChanged: if (ready && tableCols === null && !colsError) loadColumns()
    Component.onCompleted: { ready = true; reset() }

    /* ── Selección ── */
    function setSelected(indices) {
        const next = {}
        for (let i = 0; i < indices.length; i++) next[indices[i]] = true
        selected = next
        selectedCount = Object.keys(next).length
    }
    function selectedIndices() {
        return Object.keys(selected).map(Number).sort((a, b) => a - b)
    }
    function allIndices() {
        const all = []
        for (let i = 0; i < rows.length; i++) all.push(i)
        return all
    }
    function selectAll() {
        setSelected(allSelected ? [] : allIndices())
        anchorRow = -1
        active = null
    }
    function selectRow(r, modifiers) {
        active = null
        if ((modifiers & Qt.ShiftModifier) && anchorRow >= 0) {
            const a = Math.min(anchorRow, r)
            const b = Math.max(anchorRow, r)
            const range = []
            for (let i = a; i <= b; i++) range.push(i)
            setSelected(range)
            return
        }
        if ((modifiers & Qt.ControlModifier) || (modifiers & Qt.MetaModifier)) {
            const next = selectedIndices().filter(i => i !== r)
            if (!selected[r]) next.push(r)
            setSelected(next)
        } else {
            setSelected(selectedCount === 1 && selected[r] ? [] : [r])
        }
        anchorRow = r
    }
    function copySelection() {
        if (selectedCount === 0) return
        const indices = selectedIndices()
        const lines = indices.map(r => columns.map((_, c) => tsvCell(shownAt(r, c))).join("\t"))
        /* Con todo seleccionado va la cabecera: pegado en una hoja queda la tabla entera. */
        if (allSelected) lines.unshift(columns.map(c => tsvCell(c)).join("\t"))
        App.copy(lines.join("\n"))
        say(indices.length === 1 ? "Fila copiada" : indices.length + " filas copiadas")
    }
    function selectCell(r, c) {
        active = { r: r, c: c }
        if (selectedCount > 0) setSelected([])
        anchorRow = -1
    }
    /* El valor tal cual (sin comillas de TSV). Una columna oculta no se copia
       enmascarada: hay que mostrarla antes. */
    function copyCell(cell) {
        if (!cell || !rows[cell.r]) return
        if (isHidden(cell.c)) { say("Muestra la columna con el ojo para copiar su valor"); return }
        const value = valueAt(cell.r, cell.c)
        if (value === null || value === undefined) { say("La celda es NULL: no hay nada que copiar"); return }
        App.copy(display(value))
        say("Valor copiado")
    }
    /* Flechas: mueven la celda marcada y la mantienen a la vista. */
    function moveCell(dr, dc) {
        if (!active) return
        const r = Math.min(rows.length - 1, Math.max(0, active.r + dr))
        const c = Math.min(columns.length - 1, Math.max(0, active.c + dc))
        active = { r: r, c: c }
        body.positionViewAtCell(Qt.point(c, r + drafts.length), TableView.Contain)
    }
    function keyPressed(event) {
        if (edit) return
        const ctrl = (event.modifiers & Qt.ControlModifier) || (event.modifiers & Qt.MetaModifier)
        const arrow = event.key === Qt.Key_Up ? [-1, 0] : event.key === Qt.Key_Down ? [1, 0]
                    : event.key === Qt.Key_Left ? [0, -1] : event.key === Qt.Key_Right ? [0, 1] : null
        if (active && arrow) {
            event.accepted = true
            moveCell(arrow[0], arrow[1])
        } else if (active && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) {
            event.accepted = true
            startEdit(active.r, active.c)
        } else if (ctrl && event.key === Qt.Key_C && active) {
            event.accepted = true
            copyCell(active)
        } else if (ctrl && event.key === Qt.Key_C && selectedCount > 0) {
            event.accepted = true
            copySelection()
        } else if (ctrl && event.key === Qt.Key_A) {
            event.accepted = true
            active = null
            setSelected(allIndices())
        } else if (event.key === Qt.Key_Escape) {
            setSelected([])
            active = null
        }
    }

    /* ── Edición ── */
    function startEdit(r, c) {
        if (saving[r] || !rows[r]) return
        if (!canEdit(c)) {
            const m = meta[c]
            /* Resultado sin metadatos: viene de un backend anterior a la edición o de
               una consulta lanzada antes de actualizarlo. Basta con repetirla. */
            if (!result || !result.columnMeta) say("Vuelve a ejecutar la consulta para poder editar este resultado")
            else if (isHidden(c) && m && m.editable) say("Muestra la columna con el ojo para editarla")
            else if (result.readOnlyReason) say(result.readOnlyReason)
            else if (!m || !m.editable) say("Esta columna no se puede editar: es un cálculo o su tabla no tiene la clave primaria en el resultado")
            return
        }
        editSeq++
        edit = { kind: "row", token: editSeq, r: r, c: c, draft: display(valueAt(r, c)), canDefault: false }
    }
    function startDraftEdit(row, c) {
        const d = drafts[row]
        const col = colAt[c]
        const cell = d ? d.cells[c] : undefined
        if (!d || !col || !cell || d.saving) return
        editSeq++
        edit = {
            kind: "draft", token: editSeq, id: d.id, c: c,
            draft: cell.mode === "value" ? cell.value : (col.defaultValue !== null && col.defaultValue !== undefined ? col.defaultValue : ""),
            canDefault: Boolean(col.auto) || col.defaultValue !== null
        }
    }
    /* `value` null deja la celda en NULL. */
    function commitEdit(value) {
        const e = edit
        if (!e) return
        edit = null
        if (e.kind === "draft") {
            setDraftCell(e.id, e.c, value === null ? { mode: "null", value: "" } : { mode: "value", value: value })
        } else if (rows[e.r]) {
            const original = rows[e.r][e.c]
            const row = Object.assign({}, pending[e.r] || {})
            /* Volver al valor original no es un cambio. */
            const same = value === null ? original === null
                                        : original !== null && original !== undefined && display(original) === value
            if (same) delete row[e.c]; else row[e.c] = value
            const next = Object.assign({}, pending)
            if (Object.keys(row).length > 0) next[e.r] = row; else delete next[e.r]
            pending = next
        }
        takeFocus()
    }
    /* Solo en filas nuevas con valor por defecto: volver a «Por defecto». */
    function defaultEdit() {
        const e = edit
        if (!e) return
        edit = null
        if (e.kind === "draft") setDraftCell(e.id, e.c, { mode: "default", value: "" })
        takeFocus()
    }
    function cancelEdit() {
        if (!edit) return
        edit = null
        takeFocus()
    }
    function without(obj, key) {
        const next = Object.assign({}, obj)
        delete next[key]
        return next
    }
    function withKey(obj, key, value) {
        const next = Object.assign({}, obj)
        next[key] = value
        return next
    }
    function cancelRow(r) {
        pending = without(pending, r)
        rowErrors = without(rowErrors, r)
    }

    /* Un UPDATE por tabla de origen (en un JOIN la fila puede tocar varias),
       con la clave primaria de los valores originales de la fila. */
    function saveRow(r) {
        const changes = pending[r]
        if (!changes || !rows[r]) return
        const gen = generation
        saving = withKey(saving, r, true)
        rowErrors = without(rowErrors, r)

        const groups = []
        Object.keys(changes).map(Number).forEach(c => {
            const source = meta[c] ? meta[c].source : null
            if (!source) return
            let group = null
            for (let i = 0; i < groups.length; i++) if (groups[i].source === source) group = groups[i]
            if (!group) { group = { source: source, cols: [] }; groups.push(group) }
            group.cols.push(c)
        })
        const original = rows[r]
        const saved = []

        const finish = failure => {
            if (gen !== grid.generation) return
            if (failure === null) Toasts.success("Fila " + (r + 1) + " guardada")
            else grid.rowErrors = grid.withKey(grid.rowErrors, r, failure)
            if (saved.length > 0) {
                const next = grid.rows.slice()
                next[r] = Array.from(next[r]).map((v, c) => (saved.indexOf(c) >= 0 ? changes[c] : v))
                grid.rows = next
                const left = Object.assign({}, grid.pending[r] || {})
                saved.forEach(c => { delete left[c] })
                grid.pending = Object.keys(left).length > 0 ? grid.withKey(grid.pending, r, left) : grid.without(grid.pending, r)
            }
            grid.saving = grid.without(grid.saving, r)
        }
        const step = i => {
            if (i >= groups.length) { finish(null); return }
            const cols = groups[i].cols
            const keyIdx = grid.toList((grid.result.tableKeys || {})[groups[i].source])
            const first = grid.meta[cols[0]]
            const payload = { schema: first.schema || "", table: first.table || "", key: {}, changes: {}, sessionId: grid.sessionId }
            if (first.namespace) payload.namespace = first.namespace
            keyIdx.forEach(k => { payload.key[grid.meta[k].column || ""] = original[k] })
            cols.forEach(c => { payload.changes[grid.meta[c].column || ""] = changes[c] })
            Api.request("POST", "/databases/" + grid.connectionId + "/rows/update", payload, (ok, data, error) => {
                if (gen !== grid.generation) return
                if (!ok) { finish(grid.errorText(error)); return }
                cols.forEach(c => saved.push(c))
                step(i + 1)
            })
        }
        step(0)
    }

    /* Si la vista está recortada, el backend repite la consulta y trae todas las
       filas; las columnas ocultas se enmascaran igual que en la tabla.
       `done(source, mensajeDeError)`. */
    function exportTable(done) {
        const cols = columns.slice()
        if (!result.truncated || !query || !query.sql) {
            const table = { columns: cols, rows: rows.map((_, r) => cols.map((__, c) => shownAt(r, c))) }
            done({ table: table, total: rows.length, complete: !result.truncated }, null)
            return
        }
        const payload = { sessionId: sessionId, sql: query.sql }
        if (query.schema) payload.schema = query.schema
        const kinds = sensitive.slice()
        const hidden = cols.map((_, c) => isHidden(c))
        /* Muchas filas tardan en llegar: más margen que el resto de llamadas. */
        Api.request("POST", "/databases/" + connectionId + "/query/export", payload, (ok, data, error) => {
            if (!ok) {
                const list = error && error.data ? error.data.message : null
                done(null, list && typeof list !== "string" && list.length > 0 ? Array.from(list).join(". ")
                           : error && error.message ? error.message : "")
                return
            }
            const full = Array.from(data.rows || [])
            const table = {
                columns: cols,
                rows: full.map(row => cols.map((_, c) => {
                    const v = row[c]
                    return kinds[c] && hidden[c] && v !== null && v !== undefined ? grid.maskValue(kinds[c], v)
                         : v === undefined ? null : v
                }))
            }
            done({ table: table, total: data.rowCount, complete: !data.truncated }, null)
        }, 120000)
    }

    function toggleReveal(c) {
        revealed = revealed[c] ? without(revealed, c) : withKey(revealed, c, true)
    }

    /* ── Filas nuevas en línea ── */
    function addDraft() {
        if (!canInsert) return
        const cells = {}
        for (let c = 0; c < colAt.length; c++) {
            const col = colAt[c]
            if (col && !col.generated) cells[c] = initialDraftCell(col)
        }
        draftSeq++
        /* La fila nueva entra arriba: la celda en edición de otro borrador sigue a su `id`. */
        drafts = [{ id: draftSeq, cells: cells, saving: false, error: null }].concat(drafts)
        syncShape()
        body.contentY = 0
    }
    function patchDraft(id, patch) {
        drafts = drafts.map(d => (d.id === id ? Object.assign({}, d, patch) : d))
    }
    function setDraftCell(id, c, cell) {
        drafts = drafts.map(d => {
            if (d.id !== id) return d
            const cells = Object.assign({}, d.cells)
            cells[c] = cell
            return Object.assign({}, d, { cells: cells, error: null })
        })
    }
    function removeDraft(id) {
        if (edit && edit.kind === "draft" && edit.id === id) edit = null
        drafts = drafts.filter(d => d.id !== id)
        syncShape()
    }
    /* Una fila nueva arriba desplaza los índices de todo lo que va por fila. */
    function shiftRowState() {
        const shiftKeys = o => {
            const next = {}
            Object.keys(o).forEach(k => { next[Number(k) + 1] = o[k] })
            return next
        }
        pending = shiftKeys(pending)
        rowErrors = shiftKeys(rowErrors)
        saving = shiftKeys(saving)
        selected = shiftKeys(selected)
        if (anchorRow >= 0) anchorRow = anchorRow + 1
        if (edit && edit.kind === "row") edit = Object.assign({}, edit, { r: edit.r + 1 })
    }
    function saveDraft(id) {
        const index = draftIndex(id)
        if (index < 0 || !insertRef) return
        const d = drafts[index]
        if (d.saving) return
        const cols = colAt
        const missing = []
        for (let c = 0; c < cols.length; c++) {
            const col = cols[c]
            const cell = d.cells[c]
            if (!col || !cell || col.nullable || col.auto || col.defaultValue !== null) continue
            if (cell.mode !== "value" || (cell.value === "" && !isTextType(col.type))) missing.push(col.name)
        }
        if (missing.length > 0) { patchDraft(id, { error: "Falta un valor para " + missing.join(", ") }); return }
        const values = {}
        for (let c = 0; c < cols.length; c++) {
            const col = cols[c]
            const cell = d.cells[c]
            if (!col || !cell || cell.mode === "default") continue
            values[col.name] = cell.mode === "null" ? null : cell.value
        }
        const gen = generation
        const payload = Object.assign({}, insertRef, { values: values, sessionId: sessionId })
        patchDraft(id, { saving: true, error: null })
        Api.request("POST", "/databases/" + connectionId + "/rows/insert", payload, (ok, data, error) => {
            if (gen !== grid.generation) return
            if (!ok) { grid.patchDraft(id, { saving: false, error: grid.errorText(error) }); return }
            if (grid.edit && grid.edit.kind === "draft" && grid.edit.id === id) grid.edit = null
            grid.drafts = grid.drafts.filter(x => x.id !== id)
            const inserted = data ? data.row : null
            if (inserted) {
                grid.shiftRowState()
                const fresh = grid.columns.map((_, c) => {
                    const col = cols[c]
                    const v = col ? inserted[col.name] : null
                    return v === undefined ? null : v
                })
                grid.rows = [fresh].concat(grid.rows)
                grid.syncShape()
                Toasts.success("Fila creada")
            } else {
                /* Sin clave para leerla de vuelta: se repite la consulta. */
                grid.syncShape()
                Toasts.success("Fila creada")
                grid.rerun()
            }
        })
    }

    /* Borrar las filas seleccionadas: en cada tabla con su clave primaria en el resultado,
       la clave de cada fila sale de sus valores (los guardados, no los cambios pendientes). */
    function deleteTargets() {
        const indices = selectedIndices()
        const keysBySource = result && result.tableKeys ? result.tableKeys : {}
        const out = []
        Object.keys(keysBySource).forEach(source => {
            const keyIdx = toList(keysBySource[source])
            const first = meta[keyIdx[0]]
            if (!first || !first.schema || !first.table || keyIdx.some(k => !meta[k] || !meta[k].column)) return
            const ref = { schema: first.schema, table: first.table }
            if (first.namespace) ref.namespace = first.namespace
            out.push({
                id: source,
                ref: ref,
                keys: indices.map(r => {
                    const key = {}
                    keyIdx.forEach(k => { key[meta[k].column] = rows[r][k] })
                    return key
                })
            })
        })
        return out
    }
    function askDelete() {
        const targets = deleteTargets()
        if (targets.length === 0) return
        deleting = targets
        deleteModal.open()
    }
    function deleteRows(target) {
        const gen = generation
        const payload = Object.assign({}, target.ref, { keys: target.keys, sessionId: sessionId })
        Api.request("POST", "/databases/" + connectionId + "/rows/delete", payload, (ok, data, error) => {
            if (!ok) {
                deleteModal.fail(error && error.message ? error.message : "No se pudieron borrar las filas")
                return
            }
            deleteModal.close()
            const affected = data ? data.affectedRows : 0
            Toasts.success(affected === 1 ? "Fila eliminada" : affected + " filas eliminadas",
                           affected < target.keys.length ? (target.keys.length - affected) + " ya no existían." : undefined)
            if (gen !== grid.generation) return
            grid.setSelected([])
            grid.rerun()
        })
    }

    DeleteRowsModal {
        id: deleteModal
        targets: grid.deleting || []
        pendingRows: grid.pendingRows
        onConfirm: target => grid.deleteRows(target)
        onClosed: grid.deleting = null
    }

    /* ── Globo compartido: el valor completo de una celda cortada (…) y los
       textos de ayuda de las celdas y botones de la tabla. Uno para toda la
       tabla; sale tras un instante y se queda mientras el ratón está en su
       origen o en el propio globo (para leerlo, desplazarlo o copiar). ── */
    property var tipKey: null
    property Item tipItem: null
    property string tipText: ""
    property bool tipMono: false

    function trackTip(key, item, text, mono, delay) {
        if (key === tipKey) { hideTimer.stop(); return }
        if (!text) {
            showTimer.stop()
            if (tipKey !== null && !hideTimer.running) hideTip(120)
            return
        }
        hideTimer.stop()
        tipPopup.close()
        tipKey = key
        tipItem = item
        tipText = text
        tipMono = mono
        showTimer.interval = delay
        showTimer.restart()
    }
    function untrackTip(key) { if (tipKey === key) hideTip(120) }
    function hideTip(delay) {
        showTimer.stop()
        if (delay <= 0) {
            hideTimer.stop()
            tipKey = null
            tipItem = null
            tipPopup.close()
            return
        }
        hideTimer.interval = delay
        hideTimer.restart()
    }
    /* Ayuda de un botón pequeño de la tabla. */
    function buttonHint(item, on) {
        if (on) trackTip(item, item, item.tip, false, 500)
        else untrackTip(item)
    }
    /* Texto del globo de una celda del cuerpo, o "" si no lleva. */
    function cellTip(row, c, item) {
        const nd = drafts.length
        if (row < nd) {
            const col = colAt[c]
            const cell = drafts[row] ? drafts[row].cells[c] : undefined
            if (!col || !cell) return col && col.generated ? "Columna generada: la calcula la base" : "Columna calculada: no se escribe"
            return col.name + " · " + col.type + (!col.nullable && !col.auto && col.defaultValue === null ? " · obligatoria" : "")
        }
        const r = row - nd
        if (!rows[r]) return ""
        const v = valueAt(r, c)
        if (isHidden(c)) return v === null || v === undefined ? "" : "Oculto por seguridad: usa el ojo de la cabecera para verlo"
        if (!item || !item.clipped) return ""
        const text = display(v)
        return text.length > 20000 ? text.slice(0, 20000) + "…" : text
    }
    function updateBodyHover() {
        if (tipHover.hovered) return
        if (!bodyHover.hovered) {
            bodyHoverRow = -1
            if (typeof tipKey === "string" && !hideTimer.running) hideTip(120)
            return
        }
        const p = body.contentItem.mapFromItem(body, bodyHover.point.position.x, bodyHover.point.position.y)
        const cell = body.cellAtPosition(p.x, p.y)
        bodyHoverRow = cell.y
        if (cell.x < 0 || cell.y < 0 || isEditingCell(cell.y, cell.x)) {
            if (typeof tipKey === "string" && !hideTimer.running) hideTip(120)
            return
        }
        const key = "c:" + cell.y + ":" + cell.x
        if (key === tipKey) { hideTimer.stop(); return }
        const item = body.itemAtCell(Qt.point(cell.x, cell.y))
        const text = cellTip(cell.y, cell.x, item)
        const plain = cell.y < drafts.length || isHidden(cell.x)
        if (text === "" && typeof tipKey !== "string") return
        trackTip(key, item, text, !plain, plain ? 500 : 350)
    }

    Timer { id: showTimer; onTriggered: if (grid.tipItem && grid.tipKey !== null) tipPopup.open() }
    Timer {
        id: hideTimer
        onTriggered: {
            grid.tipKey = null
            grid.tipItem = null
            tipPopup.close()
        }
    }
    /* Ancho natural del texto del globo. */
    Text {
        id: tipMeasure
        visible: false
        text: grid.tipText.length > 2000 ? grid.tipText.slice(0, 2000) : grid.tipText
        font.family: grid.tipMono ? Theme.fontMono : Theme.fontUi
        font.pixelSize: Theme.textXs
    }
    T.Popup {
        id: tipPopup
        parent: T.Overlay.overlay
        padding: 0
        modal: false
        focus: false
        closePolicy: T.Popup.NoAutoClose
        height: Math.min(320, tipEdit.implicitHeight + 24)
        onAboutToShow: {
            const overlay = T.Overlay.overlay
            const item = grid.tipItem
            if (!overlay || !item) return
            const maxW = Math.min(560, overlay.width - 16)
            width = Math.max(40, Math.min(maxW, Math.ceil(tipMeasure.implicitWidth) + 26))
            const origin = item.mapToItem(overlay, 0, 0)
            x = Math.max(8, Math.min(origin.x - 4, overlay.width - width - 8))
            /* Debajo si cabe; si no, encima. */
            const below = overlay.height - (origin.y + item.height) > Math.min(240, height + 14)
            y = below ? origin.y + item.height + 6 : Math.max(8, origin.y - 6 - height)
        }
        enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
        background: Glass { variant: "float"; radius: Theme.radiusXl }
        contentItem: Item {
            HoverHandler {
                id: tipHover
                onHoveredChanged: {
                    if (hovered) hideTimer.stop()
                    else if (grid.tipKey !== null) grid.hideTip(120)
                }
            }
            ScrollArea {
                anchors.fill: parent
                anchors.margins: 12
                contentHeight: tipEdit.implicitHeight
                TextEdit {
                    id: tipEdit
                    width: parent.width
                    text: grid.tipText
                    readOnly: true
                    selectByMouse: true
                    wrapMode: TextEdit.Wrap
                    color: Theme.ink(0.85)
                    selectionColor: Theme.brand1(0.35)
                    selectedTextColor: Theme.ink(1)
                    font.family: grid.tipMono ? Theme.fontMono : Theme.fontUi
                    font.pixelSize: Theme.textXs
                }
            }
        }
    }

    /* ── Piezas ── */
    /* Botón de la barra: `soft` (cristal), `brand` (gradiente suave) o `danger`. */
    component BarButton: Item {
        id: bar
        property string label: ""
        property string iconName: ""
        property string kind: "soft"
        property bool usable: true
        property bool compact: false
        property string tip: ""
        signal clicked()

        readonly property color inkColor: kind === "danger" ? Theme.tone("rose").text
                                        : Theme.ink(barHover.hovered && usable ? 1 : kind === "brand" ? 0.85 : 0.75)

        implicitHeight: 28
        implicitWidth: barRow.implicitWidth + 20
        opacity: usable ? 1 : 0.4
        Accessible.role: Accessible.Button
        Accessible.name: label

        Glass {
            visible: bar.kind === "soft"
            anchors.fill: parent
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusLg
            highlighted: barHover.hovered && bar.usable
        }
        Rectangle {
            visible: bar.kind === "brand"
            anchors.fill: parent
            radius: Theme.radiusLg
            border.width: 1
            border.color: Theme.hairline
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.brand1(0.18) }
                GradientStop { position: 1; color: Theme.brand2(0.18) }
            }
        }
        Rectangle {
            visible: bar.kind === "danger"
            anchors.fill: parent
            radius: Theme.radiusLg
            color: Qt.alpha(Theme.tone("rose").base, barHover.hovered ? 0.2 : 0.1)
            border.width: 1
            border.color: Qt.alpha(Theme.tone("rose").base, 0.2)
        }
        Row {
            id: barRow
            anchors.centerIn: parent
            spacing: 6
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: bar.iconName
                size: 14
                color: bar.inkColor
            }
            Label {
                visible: !bar.compact
                anchors.verticalCenter: parent.verticalCenter
                text: bar.label
                color: bar.inkColor
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
        }
        HoverHandler { id: barHover; cursorShape: bar.usable ? Qt.PointingHandCursor : Qt.ArrowCursor }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            enabled: bar.usable
            onTapped: bar.clicked()
        }
        HoverTip { text: bar.tip }
    }

    /* Botón de 24 px dentro de la tabla (guardar, descartar, ojo). */
    component MiniButton: Item {
        id: mini
        property string iconName: ""
        property color tint: Theme.ink(0.45)
        property color hoverTint: Theme.ink(1)
        property color hoverFill: Theme.tintHover
        property bool usable: true
        property bool spinning: false
        property string tip: ""
        signal clicked()
        signal hint(var item, bool on)

        width: 24
        height: 24
        opacity: usable ? 1 : 0.4
        Accessible.role: Accessible.Button
        Accessible.name: tip

        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusMd
            color: miniHover.hovered && mini.usable ? mini.hoverFill : "transparent"
        }
        Spinner { visible: mini.spinning; anchors.centerIn: parent; size: 12 }
        Icon {
            visible: !mini.spinning
            anchors.centerIn: parent
            name: mini.iconName
            size: 14
            color: miniHover.hovered && mini.usable ? mini.hoverTint : mini.tint
        }
        HoverHandler {
            id: miniHover
            cursorShape: mini.usable ? Qt.PointingHandCursor : Qt.ArrowCursor
            onHoveredChanged: mini.hint(mini, hovered)
        }
        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            enabled: mini.usable
            onTapped: mini.clicked()
        }
    }

    /* Barra de desplazamiento como la de `ScrollArea`, en los dos sentidos. */
    component GridBar: T.ScrollBar {
        id: scroller
        property bool shown: false

        implicitWidth: 12
        implicitHeight: 12
        minimumSize: 0.08
        hoverEnabled: true
        opacity: shown || pressed || hovered ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 180 } }

        contentItem: Item {
            implicitWidth: 12
            implicitHeight: 12
            Rectangle {
                id: thumb
                readonly property bool strong: scroller.hovered || scroller.pressed
                readonly property real thick: strong ? 10 : 6
                x: scroller.vertical ? parent.width - thick - (strong ? 1 : 2) : 0
                y: scroller.vertical ? 0 : parent.height - thick - (strong ? 1 : 2)
                width: scroller.vertical ? thick : parent.width
                height: scroller.vertical ? parent.height : thick
                radius: thick / 2
                color: strong ? "transparent" : Theme.ink(0.3)
                border.width: strong ? 1 : 0
                border.color: Theme.hairlineStrong
                BrandFill {
                    anchors.fill: parent
                    visible: thumb.strong
                    radius: thumb.radius
                    strength: 0.85
                }
            }
            HoverHandler { cursorShape: scroller.pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor }
        }
    }

    ResultModel { id: bodyModel }
    ResultModel { id: headerModel }
    ResultModel { id: gutterModel }

    /* ── Barra ── */
    Item {
        id: toolbar
        width: parent.width
        height: 44

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                Layout.fillHeight: true
                clip: true
                spacing: 12

                Label {
                    visible: grid.width >= 520
                    Layout.minimumWidth: implicitWidth
                    text: "RESULTADOS"
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                    font.letterSpacing: 0.6
                }
                Loader {
                    Layout.minimumWidth: implicitWidth
                    Layout.alignment: Qt.AlignVCenter
                    sourceComponent: grid.status
                }
                Label {
                    id: reasonLabel
                    readonly property string reason: grid.result && grid.result.readOnlyReason ? String(grid.result.readOnlyReason) : ""
                    visible: reason !== ""
                    Layout.minimumWidth: 0
                    Layout.maximumWidth: Math.ceil(implicitWidth)
                    Layout.fillWidth: true
                    text: "· " + reason
                    tone: 0.35
                    font.pixelSize: Theme.textXs
                    HoverTip { text: reasonLabel.reason }
                }
                Label {
                    visible: grid.pendingRows > 0
                    Layout.minimumWidth: implicitWidth
                    text: "· " + grid.pendingRows + " " + (grid.pendingRows === 1 ? "fila con cambios" : "filas con cambios") + " sin guardar"
                    color: Theme.tone("amber").text
                    font.pixelSize: Theme.textXs
                }
                Label {
                    visible: grid.errorCount > 0
                    Layout.minimumWidth: implicitWidth
                    text: "· " + grid.errorCount + " con error"
                    color: Theme.tone("rose").text
                    font.pixelSize: Theme.textXs
                }
                Label {
                    visible: grid.flash !== ""
                    Layout.minimumWidth: implicitWidth
                    text: "· " + grid.flash
                    color: Theme.tone("emerald").text
                    font.pixelSize: Theme.textXs
                }
                Item { Layout.fillWidth: true }
            }

            Row {
                Layout.alignment: Qt.AlignVCenter
                spacing: grid.compact ? 8 : 12

                BarButton {
                    visible: grid.selectedCount > 0 && grid.canDelete
                    anchors.verticalCenter: parent.verticalCenter
                    kind: "danger"
                    iconName: "trash"
                    compact: grid.compact
                    label: "Eliminar " + grid.selectedCount + " " + (grid.selectedCount === 1 ? "fila" : "filas")
                    tip: "Eliminar las filas seleccionadas de su tabla"
                    onClicked: { grid.takeFocus(); grid.askDelete() }
                }
                BarButton {
                    visible: grid.selectedCount > 0
                    anchors.verticalCenter: parent.verticalCenter
                    kind: "brand"
                    iconName: "copy"
                    compact: grid.compact
                    label: "Copiar " + grid.selectedCount + " " + (grid.selectedCount === 1 ? "fila" : "filas")
                    tip: "Copiar las filas seleccionadas (Ctrl + C)"
                    onClicked: { grid.takeFocus(); grid.copySelection() }
                }
                BarButton {
                    visible: grid.active !== null && grid.rows[grid.active.r] !== undefined
                    anchors.verticalCenter: parent.verticalCenter
                    kind: "brand"
                    iconName: "copy"
                    compact: grid.compact
                    label: "Copiar valor"
                    tip: grid.active ? "Copiar el valor de " + grid.columns[grid.active.c] + ", fila " + (grid.active.r + 1) + " (Ctrl + C)" : ""
                    onClicked: { grid.takeFocus(); grid.copyCell(grid.active) }
                }
                BarButton {
                    visible: grid.insertRef !== null
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "plus"
                    compact: grid.compact
                    usable: grid.canInsert
                    label: "Nueva fila"
                    tip: grid.insertBlock !== "" ? grid.insertBlock
                       : grid.colsLoading ? "Leyendo las columnas de la tabla…"
                       : grid.insertRef ? "Agregar una fila en " + grid.insertRef.table : ""
                    onClicked: { grid.takeFocus(); grid.addDraft() }
                }
                Label {
                    visible: !grid.compact
                    anchors.verticalCenter: parent.verticalCenter
                    text: (grid.result ? grid.result.durationMs : 0) + " ms"
                    mono: true
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
                ExportMenu {
                    anchors.verticalCenter: parent.verticalCenter
                    result: grid.result
                    fileName: grid.fileName
                    hiddenCount: grid.hiddenCount
                    compact: grid.width < 460
                    getTable: done => grid.exportTable(done)
                }
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Tabla ── */
    Item {
        id: tableArea
        anchors.top: toolbar.bottom
        anchors.bottom: parent.bottom
        width: parent.width
        clip: true

        HoverHandler { id: areaHover }

        /* Cuerpo: solo existen las celdas a la vista. */
        TableView {
            id: body
            x: grid.gutterW
            y: grid.headH
            width: parent.width - x
            height: parent.height - y
            clip: true
            model: bodyModel
            reuseItems: true
            boundsBehavior: Flickable.StopAtBounds
            /* El ratón no arrastra el contenido: la rueda y las barras desplazan. */
            acceptedButtons: Qt.NoButton
            keyNavigationEnabled: false
            pointerNavigationEnabled: false
            editTriggers: TableView.NoEditTriggers
            /* Los 12 px de la franja de las barras, para que no tapen la última
               fila ni la última columna. */
            rightMargin: 12
            bottomMargin: 12
            columnWidthProvider: column => grid.colWidths[column] || 80
            rowHeightProvider: () => grid.rowH
            activeFocusOnTab: true
            Accessible.name: "Resultados de la consulta"

            Keys.onPressed: event => grid.keyPressed(event)
            onContentYChanged: { if (grid.tipKey !== null) grid.hideTip(0); grid.updateBodyHover() }
            onContentXChanged: { if (grid.tipKey !== null) grid.hideTip(0) }

            T.ScrollBar.vertical: GridBar {
                parent: body
                anchors.top: body.top
                anchors.bottom: body.bottom
                anchors.right: body.right
                visible: body.contentHeight + body.bottomMargin > body.height
                shown: areaHover.hovered || body.moving
            }
            T.ScrollBar.horizontal: GridBar {
                parent: body
                anchors.left: body.left
                anchors.right: body.right
                anchors.bottom: body.bottom
                visible: body.contentWidth + body.rightMargin > body.width
                shown: areaHover.hovered || body.moving
            }

            HoverHandler {
                id: bodyHover
                cursorShape: Qt.PointingHandCursor
                onHoveredChanged: grid.updateBodyHover()
                onPointChanged: grid.updateBodyHover()
            }
            TapHandler {
                id: bodyTap
                gesturePolicy: TapHandler.ReleaseWithinBounds
                onTapped: (eventPoint, button) => {
                    /* Quita el foco del editor abierto: eso confirma su valor. */
                    grid.takeFocus()
                    const p = body.contentItem.mapFromItem(body, eventPoint.position.x, eventPoint.position.y)
                    const cell = body.cellAtPosition(p.x, p.y)
                    if (cell.x < 0 || cell.y < 0) return
                    const nd = grid.drafts.length
                    if (cell.y < nd) {
                        if (bodyTap.tapCount === 2) grid.startDraftEdit(cell.y, cell.x)
                        return
                    }
                    grid.selectCell(cell.y - nd, cell.x)
                    if (bodyTap.tapCount === 2) grid.startEdit(cell.y - nd, cell.x)
                }
            }

            delegate: Item {
                id: cell
                required property int row
                required property int column

                readonly property bool draftRow: row < grid.drafts.length
                readonly property int r: row - grid.drafts.length
                readonly property var info: grid.cellInfo(row, column)
                readonly property bool editingHere: grid.edit !== null && grid.isEditingCell(row, column)
                readonly property bool activeHere: !draftRow && grid.active !== null && grid.active.r === r
                                                   && grid.active.c === column && !editingHere
                /* El texto no cabe: el globo muestra el valor entero. */
                readonly property bool clipped: cellLabel.truncated

                implicitWidth: 80
                implicitHeight: grid.rowH

                Rectangle {
                    anchors.fill: parent
                    color: cell.activeHere ? Theme.brand1(0.12)
                         : cell.info.dirty ? Qt.alpha(Theme.warn, 0.16)
                         : cell.draftRow ? Theme.brand2(0.10)
                         : grid.selected[cell.r] === true ? Theme.brand1(0.16)
                         : grid.hoverRow === cell.row ? Theme.tintHover
                         : cell.row % 2 === 0 ? grid.stripe1 : grid.stripe2
                    border.width: cell.activeHere ? 2 : cell.info.dirty ? 1 : 0
                    border.color: cell.activeHere ? Theme.brand1(0.7) : Qt.alpha(Theme.warn, 0.45)
                }
                Rectangle {
                    visible: !cell.activeHere && !cell.info.dirty
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: 1
                    color: Theme.line
                }
                Label {
                    id: cellLabel
                    visible: !cell.editingHere
                    x: 12
                    width: Math.min(320, parent.width - 24)
                    anchors.verticalCenter: parent.verticalCenter
                    text: cell.info.text
                    mono: true
                    font.pixelSize: Theme.textXs
                    font.italic: cell.info.kind !== "value" && cell.info.kind !== "draft" && cell.info.kind !== "masked"
                    font.letterSpacing: cell.info.kind === "masked" ? 0.6 : 0
                    color: cell.info.kind === "value" ? Theme.ink(0.8)
                         : cell.info.kind === "draft" ? Theme.ink(0.85)
                         : cell.info.kind === "masked" || cell.info.kind === "default" ? Theme.ink(0.4)
                         : cell.info.kind === "required" ? Qt.alpha(Theme.tone("rose").text, 0.7)
                         : Theme.ink(0.3)
                }
            }

            /* ── Editor de una celda: uno para toda la tabla, sobre la celda
               que se edita. Enter confirma, Escape cancela y perder el foco
               confirma; «NULL» deja la celda nula. ── */
            Item {
                id: editor
                readonly property var target: grid.edit
                readonly property int modelRow: !target ? -1
                    : target.kind === "row" ? target.r + grid.drafts.length : grid.draftIndex(target.id)
                readonly property real cellW: target ? (grid.colWidths[target.c] || 0) : 0
                /* Enter, Escape y «NULL» ya resolvieron: el foco que se pierde detrás no debe volver a confirmar. */
                property bool done: false
                property int shownToken: -1

                function finish(action) {
                    if (done) return
                    done = true
                    action()
                }

                visible: target !== null && modelRow >= 0
                z: 10
                width: Math.max(cellW, target && target.canDefault ? 280 : 208)
                height: grid.rowH
                x: target ? Math.max(0, Math.min(grid.colX[target.c] || 0,
                                                 Math.max(body.contentWidth, body.width - body.rightMargin) - width)) : 0
                y: Math.max(0, modelRow) * grid.rowH

                onTargetChanged: {
                    if (!target) { shownToken = -1; return }
                    if (target.token === shownToken) return
                    shownToken = target.token
                    done = false
                    editInput.text = target.draft
                    /* Cuando ya es visible: un elemento oculto no recibe el foco. */
                    Qt.callLater(editor.grab)
                }
                function grab() {
                    if (!grid.edit) return
                    editInput.forceActiveFocus()
                    editInput.selectAll()
                }

                Rectangle {
                    anchors.fill: parent
                    color: grid.stickyColor
                    border.width: 1
                    border.color: Theme.line
                }
                Row {
                    x: 12
                    width: parent.width - 24
                    height: 24
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 4

                    Rectangle {
                        width: parent.width - nullButton.width - 4 - (defaultButton.visible ? defaultButton.width + 4 : 0)
                        height: 24
                        radius: 4
                        color: Theme.tintSunken
                        border.width: 1
                        border.color: Qt.alpha(Theme.brandLight1, 0.6)
                        TextInput {
                            id: editInput
                            anchors.fill: parent
                            anchors.leftMargin: 6
                            anchors.rightMargin: 6
                            verticalAlignment: TextInput.AlignVCenter
                            clip: true
                            selectByMouse: true
                            color: Theme.ink(1)
                            selectionColor: Theme.brand1(0.35)
                            selectedTextColor: Theme.ink(1)
                            font.family: Theme.fontMono
                            font.pixelSize: Theme.textXs
                            Keys.onPressed: event => {
                                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                                    event.accepted = true
                                    editor.finish(() => grid.commitEdit(editInput.text))
                                } else if (event.key === Qt.Key_Escape) {
                                    event.accepted = true
                                    editor.finish(() => grid.cancelEdit())
                                }
                            }
                            onActiveFocusChanged: {
                                if (!activeFocus && grid.edit !== null)
                                    editor.finish(() => grid.commitEdit(editInput.text))
                            }
                        }
                    }
                    Rectangle {
                        id: nullButton
                        width: nullLabel.implicitWidth + 12
                        height: 24
                        radius: 4
                        color: nullHover.hovered ? Theme.tintHover : "transparent"
                        Label {
                            id: nullLabel
                            anchors.centerIn: parent
                            text: "NULL"
                            tone: nullHover.hovered ? 1 : 0.5
                            font.pixelSize: Theme.textCaption
                            font.weight: Font.DemiBold
                        }
                        HoverHandler { id: nullHover; cursorShape: Qt.PointingHandCursor }
                        TapHandler {
                            gesturePolicy: TapHandler.ReleaseWithinBounds
                            onTapped: editor.finish(() => grid.commitEdit(null))
                        }
                        HoverTip { text: "Dejar en NULL" }
                    }
                    Rectangle {
                        id: defaultButton
                        visible: editor.target !== null && editor.target.canDefault === true
                        width: defaultLabel.implicitWidth + 12
                        height: 24
                        radius: 4
                        color: defaultHover.hovered ? Theme.tintHover : "transparent"
                        Label {
                            id: defaultLabel
                            anchors.centerIn: parent
                            text: "DEFECTO"
                            tone: defaultHover.hovered ? 1 : 0.5
                            font.pixelSize: Theme.textCaption
                            font.weight: Font.DemiBold
                        }
                        HoverHandler { id: defaultHover; cursorShape: Qt.PointingHandCursor }
                        TapHandler {
                            gesturePolicy: TapHandler.ReleaseWithinBounds
                            onTapped: editor.finish(() => grid.defaultEdit())
                        }
                        HoverTip { text: "Dejar que la base ponga su valor por defecto" }
                    }
                }
            }
        }

        /* Cabecera fija: sigue al cuerpo en horizontal. */
        TableView {
            id: headerView
            x: grid.gutterW
            width: body.width
            height: grid.headH
            clip: true
            model: headerModel
            syncView: body
            syncDirection: Qt.Horizontal
            interactive: false
            reuseItems: true
            keyNavigationEnabled: false
            pointerNavigationEnabled: false
            editTriggers: TableView.NoEditTriggers
            rowHeightProvider: () => grid.headH

            delegate: Item {
                id: head
                required property int column

                readonly property string kind: grid.sensitive[column] || ""
                readonly property bool hiddenColumn: kind !== "" && !grid.revealed[column]
                readonly property bool editable: Boolean(grid.meta[column] && grid.meta[column].editable)
                readonly property string name: column < grid.columns.length ? String(grid.columns[column]) : ""

                implicitWidth: 80
                implicitHeight: grid.headH

                Rectangle { anchors.fill: parent; color: grid.stickyColor }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                Row {
                    x: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 6
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(implicitWidth, head.width - 24 - (head.editable ? 18 : 0) - (head.kind !== "" ? 30 : 0))
                        text: head.name
                        mono: true
                        tone: 0.7
                        font.pixelSize: Theme.textXs
                        font.weight: Font.DemiBold
                    }
                    Item {
                        id: editMark
                        readonly property string tip: "Editable: doble clic en una celda"
                        visible: head.editable
                        anchors.verticalCenter: parent.verticalCenter
                        width: 12
                        height: 12
                        Icon { anchors.centerIn: parent; name: "edit"; size: 12; color: Theme.ink(0.25) }
                        HoverHandler { onHoveredChanged: grid.buttonHint(editMark, hovered) }
                    }
                    MiniButton {
                        visible: head.kind !== ""
                        anchors.verticalCenter: parent.verticalCenter
                        iconName: head.hiddenColumn ? "eyeOff" : "eye"
                        tint: head.hiddenColumn ? Theme.tone("amber").text : Theme.ink(0.45)
                        hoverTint: head.hiddenColumn ? Theme.tone("amber").text : Theme.ink(1)
                        tip: head.hiddenColumn
                             ? "Mostrar " + (head.kind === "email" ? "los correos" : "los valores") + " (oculto por seguridad)"
                             : "Ocultar de nuevo"
                        Accessible.name: (head.hiddenColumn ? "Mostrar " : "Ocultar ") + head.name
                        onHint: (item, on) => grid.buttonHint(item, on)
                        onClicked: { grid.takeFocus(); grid.hideTip(0); grid.toggleReveal(head.column) }
                    }
                }
            }
        }

        /* Numeración fija: sigue al cuerpo en vertical. */
        TableView {
            id: gutterView
            y: grid.headH
            width: grid.gutterW
            height: body.height
            clip: true
            model: gutterModel
            syncView: body
            syncDirection: Qt.Vertical
            interactive: false
            reuseItems: true
            keyNavigationEnabled: false
            pointerNavigationEnabled: false
            editTriggers: TableView.NoEditTriggers
            columnWidthProvider: () => grid.gutterW

            HoverHandler {
                id: gutterHover
                function refresh() {
                    if (!hovered) { grid.gutterHoverRow = -1; return }
                    const p = gutterView.contentItem.mapFromItem(gutterView, point.position.x, point.position.y)
                    grid.gutterHoverRow = gutterView.cellAtPosition(p.x, p.y).y
                }
                onHoveredChanged: refresh()
                onPointChanged: refresh()
            }
            /* La rueda sobre la numeración desplaza el cuerpo. */
            WheelHandler {
                acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
                onWheel: event => {
                    const limit = Math.max(0, body.contentHeight + body.bottomMargin - body.height)
                    body.contentY = Math.max(0, Math.min(limit, body.contentY - event.angleDelta.y))
                }
            }

            delegate: Item {
                id: gut
                required property int row

                readonly property bool draftRow: row < grid.drafts.length
                readonly property int r: row - grid.drafts.length
                readonly property var draft: draftRow ? grid.drafts[row] : null
                readonly property bool dirty: !draftRow && grid.pending[r] !== undefined
                readonly property string failure: draftRow ? (draft && draft.error ? String(draft.error) : "")
                                                 : grid.rowErrors[r] !== undefined ? String(grid.rowErrors[r]) : ""
                readonly property bool busy: draftRow ? Boolean(draft && draft.saving) : grid.saving[r] === true
                readonly property bool chosen: !draftRow && grid.selected[r] === true
                readonly property bool actions: draftRow || dirty || failure !== ""

                implicitWidth: grid.gutterW
                implicitHeight: grid.rowH

                Rectangle { anchors.fill: parent; color: grid.stickyColor }
                Rectangle {
                    anchors.fill: parent
                    color: gut.draftRow ? Theme.brand2(0.16)
                         : gut.chosen ? Theme.brand1(0.22)
                         : grid.hoverRow === gut.row ? Theme.tintHover
                         : gut.row % 2 === 0 ? grid.stripe1 : grid.stripe2
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }

                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: gut.draftRow ? 8 : 0
                    height: parent.height
                    spacing: 2

                    MiniButton {
                        visible: gut.actions
                        anchors.verticalCenter: parent.verticalCenter
                        iconName: gut.failure !== "" ? "alert" : "check"
                        tint: gut.failure !== "" ? Theme.tone("rose").text : Theme.tone("emerald").text
                        hoverTint: tint
                        hoverFill: Qt.alpha(gut.failure !== "" ? Theme.tone("rose").base : Theme.tone("emerald").base, 0.15)
                        spinning: gut.busy
                        usable: gut.draftRow ? !gut.busy : !gut.busy && gut.dirty
                        tip: gut.failure !== "" ? "Error: " + gut.failure + ". Reintentar"
                           : gut.draftRow ? "Guardar la fila nueva" : "Guardar los cambios de esta fila"
                        onHint: (item, on) => grid.buttonHint(item, on)
                        onClicked: {
                            grid.takeFocus()
                            grid.hideTip(0)
                            if (gut.draftRow) grid.saveDraft(gut.draft.id); else grid.saveRow(gut.r)
                        }
                    }
                    MiniButton {
                        visible: gut.actions
                        anchors.verticalCenter: parent.verticalCenter
                        iconName: "close"
                        usable: !gut.busy
                        tip: gut.draftRow ? "Descartar la fila nueva" : "Descartar los cambios de esta fila"
                        onHint: (item, on) => grid.buttonHint(item, on)
                        onClicked: {
                            grid.takeFocus()
                            grid.hideTip(0)
                            if (gut.draftRow) grid.removeDraft(gut.draft.id); else grid.cancelRow(gut.r)
                        }
                    }
                    Item {
                        id: newMark
                        readonly property string tip: gut.failure !== "" ? gut.failure : "Fila nueva sin guardar"
                        visible: gut.draftRow
                        anchors.verticalCenter: parent.verticalCenter
                        width: newLabel.implicitWidth + 4
                        height: 24
                        Label {
                            id: newLabel
                            x: 4
                            anchors.verticalCenter: parent.verticalCenter
                            text: "NUEVA"
                            color: Theme.tone("violet").text
                            font.pixelSize: Theme.textCaption
                            font.weight: Font.DemiBold
                            font.letterSpacing: 0.5
                        }
                        HoverHandler { onHoveredChanged: grid.buttonHint(newMark, hovered) }
                    }
                    Item {
                        id: numberCell
                        readonly property string tip: "Seleccionar la fila (Ctrl/⌘ suma, Mayús elige un rango)"
                        visible: !gut.draftRow
                        width: grid.numberW
                        height: parent.height
                        Label {
                            anchors.right: parent.right
                            anchors.rightMargin: 12
                            anchors.verticalCenter: parent.verticalCenter
                            text: String(gut.r + 1)
                            mono: true
                            font.pixelSize: Theme.textXs
                            color: gut.chosen ? Theme.tone("violet").text : Theme.ink(numberArea.containsMouse ? 1 : 0.25)
                        }
                        MouseArea {
                            id: numberArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onEntered: grid.buttonHint(numberCell, true)
                            onExited: grid.buttonHint(numberCell, false)
                            onClicked: mouse => {
                                grid.takeFocus()
                                grid.hideTip(0)
                                grid.selectRow(gut.r, mouse.modifiers)
                            }
                        }
                    }
                }
            }
        }

        /* Esquina: `#` selecciona todas las filas. */
        Item {
            id: corner
            readonly property string tip: grid.allSelected ? "Quitar la selección" : "Seleccionar todas las filas para copiarlas"
            width: grid.gutterW
            height: grid.headH
            Rectangle { anchors.fill: parent; color: grid.stickyColor }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
            Label {
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                text: "#"
                mono: true
                font.pixelSize: Theme.textXs
                color: grid.allSelected ? Theme.tone("violet").text : Theme.ink(cornerArea.containsMouse ? 1 : 0.3)
            }
            MouseArea {
                id: cornerArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: grid.buttonHint(corner, true)
                onExited: grid.buttonHint(corner, false)
                onClicked: { grid.takeFocus(); grid.hideTip(0); grid.selectAll() }
            }
        }
    }
}
