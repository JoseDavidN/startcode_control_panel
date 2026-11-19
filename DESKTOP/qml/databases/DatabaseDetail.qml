import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import StartCode

/* Gestión de una conexión a base de datos. Cabecera fija y el resto repartido
   en el alto disponible: arriba, bases (30 %) y editor (70 %); abajo, a todo el
   ancho, los resultados. Cada zona desplaza su propio contenido. En ventanas
   estrechas el árbol de bases se abre en el sitio del editor.

   La conexión a la base (la «sesión») vive mientras esta vista existe: se abre
   al cargar la conexión y se cierra al destruirse. Se instancia una vista por
   conexión (dentro de un `Loader`): `connectionId` no se cambia en caliente.

       DatabaseDetail { connectionId: "…"; onBack: … } */
Item {
    id: root

    property string connectionId: ""
    signal back()

    /* ── Constantes del dominio ────────────────────────────────────── */
    readonly property int maxConsoles: 6
    readonly property int maxConsoleName: 40
    readonly property var engineLabels: ({ mysql: "MySQL", mariadb: "MariaDB", postgresql: "PostgreSQL", redis: "Redis" })
    /* Motores que ya se pueden explorar y consultar desde el panel. */
    readonly property var manageableEngines: ["mysql", "mariadb", "postgresql", "redis"]
    /* Motores con editor SQL y árbol de bases (Redis tiene su explorador de claves). */
    readonly property var sqlEngines: ["mysql", "mariadb", "postgresql"]

    /* ── Conexión guardada ─────────────────────────────────────────── */
    property var conn: null
    property bool loading: true
    property bool failed: false
    readonly property bool manageable: conn !== null && manageableEngines.includes(conn.engine)
    readonly property bool sqlView: conn !== null && sqlEngines.includes(conn.engine)
    readonly property string engineLabel: conn ? (engineLabels[conn.engine] || String(conn.engine)) : ""
    readonly property string dialect: statements.engineDialect(conn ? conn.engine : "mysql")

    /* Mensaje del backend (los de validación pueden llegar como lista). Vacío si no hay error. */
    function errorMessage(err) {
        if (!err) return ""
        const msg = err.message
        if (msg && typeof msg === "object" && msg.length !== undefined) return Array.from(msg).join(". ")
        return msg || "Error desconocido"
    }
    /* El backend cerró la sesión (salida de otra ventana, inactividad, conexión editada). */
    function isSessionClosed(err) { return Boolean(err) && err.code === "DB_SESSION_CLOSED" }

    function loadConnection() {
        loading = true
        Api.request("GET", "/databases/" + connectionId, null, (ok, data) => {
            root.loading = false
            root.failed = !ok || !data
            if (ok && data) {
                root.conn = data
                root.openSession()
            }
        })
    }

    /* ── Sesión: estado de la conexión de esta vista (no de la guardada) ── */
    /* idle | connecting | open | error | closed */
    property string sessionStatus: "idle"
    /* Vacío mientras no hay sesión abierta. */
    property string sessionId: ""
    property string sessionError: ""
    /* Intento en curso: `{ cancelled, opened }`. Es un objeto suelto a propósito:
       la respuesta puede llegar con la vista ya destruida y solo puede tocar esto. */
    property var sessionToken: null

    function closeSessionRequest(sid) {
        Api.request("DELETE", "/databases/" + connectionId + "/sessions/" + sid, null, () => {})
    }
    function releaseSession() {
        if (!sessionToken) return
        sessionToken.cancelled = true
        if (sessionToken.opened) closeSessionRequest(sessionToken.opened)
        sessionToken = null
    }
    function openSession() {
        if (!conn || !manageable) return
        releaseSession()
        const token = { cancelled: false, opened: "" }
        sessionToken = token
        const api = Api, id = connectionId
        sessionStatus = "connecting"
        sessionId = ""
        sessionError = ""
        api.request("POST", "/databases/" + id + "/sessions", null, (ok, data, error) => {
            if (token.cancelled) {
                /* La vista se cerró (o se reintentó) mientras conectaba: no dejar la sesión huérfana. */
                if (ok && data && data.sessionId)
                    api.request("DELETE", "/databases/" + id + "/sessions/" + data.sessionId, null, () => {})
                return
            }
            if (!ok || !data || !data.sessionId) {
                root.sessionStatus = "error"
                root.sessionError = (error && error.message) || "No se pudo conectar"
                return
            }
            token.opened = data.sessionId
            root.sessionId = data.sessionId
            root.sessionStatus = "open"
            if (data.version && root.conn) root.conn = Object.assign({}, root.conn, { version: data.version })
        })
    }
    function reconnect() { openSession() }
    function markClosed() {
        sessionStatus = "closed"
        sessionId = ""
        sessionError = "La conexión de esta vista se cerró."
    }

    /* ── Bases de la conexión, por la sesión abierta ───────────────── */
    /* null: todavía sin lista para esta sesión. */
    property var schemas: null
    property bool schemasFetching: false
    property string schemasError: ""
    property int schemasSeq: 0
    /* Base elegida en el árbol; vacío si ninguna. */
    property string selectedSchema: ""
    /* Con base fija en la conexión, el editor siempre corre sobre ella. Vacío: sin base. */
    readonly property string activeSchema: conn && conn.database !== null && conn.database !== undefined
                                           ? String(conn.database) : selectedSchema
    /* Árbol de bases a la vista en ventanas estrechas (ocupa el sitio del editor). */
    property bool treeOpen: false

    function loadSchemas() {
        if (!sqlView || sessionId === "") return
        const seq = ++schemasSeq
        schemasFetching = true
        Api.request("GET", "/databases/" + connectionId + "/schemas?session=" + encodeURIComponent(sessionId), null, (ok, data, error) => {
            if (seq !== root.schemasSeq) return
            root.schemasFetching = false
            if (ok) {
                root.schemas = data ? Array.from(data) : []
                root.schemasError = ""
            } else {
                root.schemasError = root.errorMessage(error)
                /* Si el backend dice que la sesión ya no existe, la cabecera ofrece reconectar. */
                if (root.isSessionClosed(error)) root.markClosed()
            }
        })
    }
    /* Al reconectar, lo pedido con la sesión anterior se vuelve a pedir. */
    onSessionIdChanged: {
        schemasSeq++
        schemas = null
        schemasError = ""
        schemasFetching = false
        loadSchemas()
    }

    /* ── Predicción del editor: tablas, vistas y columnas de la base activa ── */
    /* Índice de `SqlCompletion.buildCompletionIndex()` o null. Las tablas se piden
       aparte de las del árbol (aquí no hay caché compartida entre piezas). */
    property var completion: null
    property var predictTables: null
    property var predictViews: null
    property int predictSeq: 0
    readonly property string predictKey: sqlView && activeSchema !== "" && sessionId !== "" ? sessionId + "\n" + activeSchema : ""
    onPredictKeyChanged: loadCompletion()

    SqlCompletion { id: sqlComplete }
    function loadCompletion() {
        const seq = ++predictSeq
        predictTables = null
        predictViews = null
        completion = null
        if (predictKey === "") return
        const base = "/databases/" + connectionId + "/schemas/" + encodeURIComponent(activeSchema) + "/"
        const tail = "?session=" + encodeURIComponent(sessionId)
        const fetchSection = section => Api.request("GET", base + section + tail, null, (ok, data) => {
            if (seq !== root.predictSeq || !ok) return
            const list = data ? Array.from(data) : []
            if (section === "tables") root.predictTables = list
            else root.predictViews = list
            root.completion = sqlComplete.buildCompletionIndex((root.predictTables || []).concat(root.predictViews || []))
        })
        fetchSection("tables")
        fetchSection("views")
    }

    /* ── Consolas: cada una con su SQL y su último resultado ───────── */
    /* Todas quedan montadas (editor y resultado) y solo se oculta la inactiva:
       al volver conservan texto, deshacer, desplazamiento y la tabla. El modelo
       solo lleva el id para que añadir o cerrar una no reconstruya las demás;
       el estado de cada una es un objeto propio. */
    component ConsoleState: QtObject {
        property int cid: 0
        /* «Editor n» */
        property int n: 1
        property string sql: ""
        /* Nombre puesto por el usuario; sin él, «Editor n». */
        property string name: ""
        /* Consulta guardada que tiene abierta; vacío si ninguna. */
        property string savedId: ""
        /* Última ejecución: resultado, error del API, en curso y `{ sql, schema, confirm? }`. */
        property var runData: null
        property var runError: null
        property bool running: false
        property var runVariables: null
        /* Cambió algo de lo que se guarda en el equipo. */
        signal touched()
        onSqlChanged: touched()
        onNameChanged: touched()
        onSavedIdChanged: touched()
    }
    Component { id: consoleFactory; ConsoleState {} }
    ListModel { id: consoleModel }
    /* id de consola → su `ConsoleState`. Se muta en sitio: nadie se enlaza al mapa. */
    property var consoleStates: ({})
    /* id de consola → su `SqlEditor`. */
    property var editorRefs: ({})
    property int consoleSeq: 0
    property int activeId: 0
    property var active: null
    readonly property int consoleCount: consoleModel.count
    readonly property string sql: active ? active.sql : ""
    readonly property bool activeRunning: active ? active.running : false
    property bool ready: false

    function stateOf(cid) { return consoleStates[cid] || null }
    function allStates() {
        const out = []
        for (let i = 0; i < consoleModel.count; i++) {
            const st = consoleStates[consoleModel.get(i).cid]
            if (st) out.push(st)
        }
        return out
    }
    function indexOfConsole(cid) {
        for (let i = 0; i < consoleModel.count; i++) if (consoleModel.get(i).cid === cid) return i
        return -1
    }
    function consoleName(st) { return st ? (st.name !== "" ? st.name : "Editor " + st.n) : "" }
    /* «Editor #»: el número libre más bajo, así al cerrar una se reutiliza. */
    function freeNumber() {
        const list = allStates()
        let n = 1
        while (list.some(c => c.n === n)) n++
        return n
    }
    function createConsole(n, text, name, savedId) {
        const cid = ++consoleSeq
        const st = consoleFactory.createObject(root, { cid: cid, n: n, sql: text || "", name: name || "", savedId: savedId || "" })
        st.touched.connect(root.scheduleSave)
        consoleStates[cid] = st
        consoleModel.append({ cid: cid })
        return st
    }
    function setActive(cid) {
        const st = stateOf(cid)
        if (!st) return
        active = st
        activeId = cid
        scheduleSave()
    }
    function addConsole() {
        if (consoleModel.count >= maxConsoles) return
        const st = createConsole(freeNumber(), "", "", "")
        setActive(st.cid)
        Qt.callLater(root.focusEditor, st.cid)
    }
    function closeConsole(cid) {
        if (consoleModel.count <= 1) return
        const i = indexOfConsole(cid)
        if (i < 0) return
        if (renamingId === cid) renamingId = 0
        const st = consoleStates[cid]
        consoleModel.remove(i)
        delete consoleStates[cid]
        if (cid === activeId) setActive(consoleModel.get(Math.min(i, consoleModel.count - 1)).cid)
        /* Con margen: sus delegados todavía pueden estar leyéndolo mientras se desmontan. */
        if (st) st.destroy(2000)
        scheduleSave()
    }
    /* Texto de una consola puesto desde código (árbol, consulta guardada, asistente). */
    function setConsoleSql(cid, text) {
        const st = stateOf(cid)
        if (!st) return
        st.sql = text
        const editor = editorRefs[cid]
        if (editor && editor.value !== text) editor.value = text
    }
    function focusEditor(cid) {
        const editor = editorRefs[cid === undefined ? activeId : cid]
        if (!editor) return
        if (typeof editor.forceFocus === "function") editor.forceFocus()
        else editor.forceActiveFocus()
    }

    /* Renombrar con doble clic: Enter o salir del campo guarda, Escape cancela; vacío vuelve a «Editor n». */
    property int renamingId: 0
    property string renamingValue: ""
    function startRename(cid) {
        const st = stateOf(cid)
        if (!st) return
        renamingValue = consoleName(st)
        renamingId = cid
    }
    function commitRename(cid, value) {
        if (renamingId !== cid) return
        renamingId = 0
        const st = stateOf(cid)
        if (st) st.name = String(value).trim().slice(0, maxConsoleName)
    }

    /* ── Guardado de las pestañas en el equipo ─────────────────────── */
    /* Medio segundo después del último cambio, para no escribir en cada tecla,
       y al destruirse la vista lo que quede pendiente. */
    SqlEditorStore { id: editorStore }
    DatabaseSqlStatements { id: statements }
    property bool savePending: false
    Timer { id: saveTimer; interval: 500; onTriggered: root.flushEditors() }
    function scheduleSave() {
        if (!ready) return
        savePending = true
        saveTimer.restart()
    }
    function persistedEditors() {
        const list = allStates()
        return {
            editors: list.map(c => {
                const editor = { n: c.n, sql: c.sql }
                if (c.name !== "") editor.name = c.name
                if (c.savedId !== "") editor.savedId = c.savedId
                return editor
            }),
            active: Math.max(0, list.findIndex(c => c.cid === activeId))
        }
    }
    function flushEditors() {
        if (!savePending) return
        savePending = false
        saveTimer.stop()
        editorStore.saveEditors(connectionId, persistedEditors())
    }

    /* ── Consultas guardadas ───────────────────────────────────────── */
    /* Una consola queda enlazada a la consulta que guardó o cargó: Guardar
       actualiza esa, y si el texto cambió la pestaña lo indica. */
    DatabaseSavedQueries { id: queryStore; connectionId: root.connectionId }
    readonly property var linked: active ? queryStore.byId(active.savedId) : null

    function saveActive() {
        if (!active || !sql.trim()) return
        if (!linked) { saveAsModal.open(); return }
        const name = linked.name
        if (linked.sql !== sql && queryStore.update(linked.id, sql, activeSchema || null))
            Toasts.success("Consulta guardada", name)
    }
    function openSaveAs() { if (sql.trim()) saveAsModal.open() }
    function saveAsNew(name) {
        if (!active) return
        const query = queryStore.saveAs(name, sql, activeSchema || null)
        if (!query) return
        active.savedId = query.id
        active.name = query.name.slice(0, maxConsoleName)
        saveAsModal.close()
        Toasts.success("Consulta guardada", query.name)
    }
    /* Vuelve a la base con la que se guardó (es de toda la vista, como al elegirla en el árbol). */
    function restoreSchema(query) {
        if ((conn && conn.database) || !query.schema || query.schema === activeSchema) return
        if (!schemas || schemas.some(s => s.name === query.schema)) selectedSchema = query.schema
        else Toasts.warning("La base de la consulta ya no está",
                            "Se guardó con " + query.schema + ". Sigue seleccionada " + (activeSchema || "ninguna") + ".")
    }
    function resetRun(st) {
        st.runData = null
        st.runError = null
        st.running = false
        st.runVariables = null
    }
    function showConsole(cid, query) {
        restoreSchema(query)
        setActive(cid)
        queriesModal.close()
        Qt.callLater(root.focusEditor, cid)
    }
    function loadInto(cid, query) {
        const st = stateOf(cid)
        if (!st) return
        setConsoleSql(cid, query.sql)
        st.savedId = query.id
        st.name = query.name.slice(0, maxConsoleName)
        resetRun(st)
        showConsole(cid, query)
    }
    function loadQuery(query) {
        if (!active) return
        /* Ya abierta: se va a esa pestaña, con sus cambios. */
        const open = allStates().find(c => c.savedId === query.id)
        if (open) {
            showConsole(open.cid, query)
        } else if (!sql.trim() && !active.running) {
            loadInto(active.cid, query)
        } else if (consoleModel.count < maxConsoles) {
            const st = createConsole(freeNumber(), query.sql, query.name.slice(0, maxConsoleName), query.id)
            showConsole(st.cid, query)
        }
    }
    function renameQuery(queryId, name) {
        if (!queryStore.rename(queryId, name)) return false
        /* La pestaña que la tiene abierta lleva su nombre. */
        for (const st of allStates()) if (st.savedId === queryId) st.name = String(name).trim().slice(0, maxConsoleName)
        return true
    }
    function removeQuery(queryId) {
        if (!queryStore.remove(queryId)) return
        /* Las pestañas conservan su texto, sin enlace: Guardar volverá a pedir nombre. */
        for (const st of allStates()) if (st.savedId === queryId) st.savedId = ""
    }

    /* ── Ejecución ─────────────────────────────────────────────────── */
    /* Sentencia que el backend marcó como peligrosa y espera confirmación:
       `{ consoleId, sql, schema, message, hint }`. */
    property var pending: null

    /* Cada consola guarda su propio resultado; puede haber varias ejecutando a la vez.
       Si la consola se cerró mientras corría, el resultado se descarta. */
    function execute(cid, vars) {
        const st = stateOf(cid)
        if (!st) return
        st.running = true
        st.runError = null
        if (sessionId === "") {
            st.running = false
            st.runData = null
            st.runError = { message: "La vista todavía no está conectada" }
            st.runVariables = vars
            return
        }
        const body = { sessionId: sessionId, sql: vars.sql }
        if (vars.schema) body.schema = vars.schema
        if (vars.confirm) body.confirm = true
        /* El backend corta la consulta a los 30 s: se le deja contestar a él. */
        Api.request("POST", "/databases/" + connectionId + "/query", body, (ok, data, error) => {
            const target = root.stateOf(cid)
            /* Una confirmada deja fila en la auditoría, salga bien o mal. */
            if (vars.confirm && auditModal.visible) auditModal.load()
            if (ok) {
                if (!target) return
                target.runData = data
                target.runError = null
                target.running = false
                target.runVariables = vars
                return
            }
            if (root.isSessionClosed(error)) root.markClosed()
            /* No es un error de SQL: el backend pide confirmación y no ejecutó nada. */
            const danger = Boolean(error) && error.code === "DANGEROUS_QUERY"
            if (target) {
                target.running = false
                if (!danger) {
                    target.runData = null
                    target.runError = error || { message: "Error desconocido" }
                    target.runVariables = vars
                }
            }
            if (danger) {
                root.pending = {
                    consoleId: cid, sql: vars.sql, schema: vars.schema,
                    message: error.message || "Consulta peligrosa", hint: error.hint || ""
                }
                dangerModal.open()
            }
        }, 40000)
    }

    /* Selección del editor, como en un área de texto: sin selección, inicio y fin son el cursor. */
    function editorSelection(editor, text) {
        const fallback = { start: text.length, end: text.length }
        if (!editor) return fallback
        let source = editor
        if (source.selectionStart === undefined) source = editor.edit || editor.input || editor.textEdit || null
        if (!source || source.selectionStart === undefined) return fallback
        return { start: source.selectionStart, end: source.selectionEnd }
    }
    function run() {
        if (!active) return
        const text = active.sql
        const editor = editorRefs[active.cid]
        const selection = editorSelection(editor, text)
        /* Con texto seleccionado se ejecuta solo la selección; si no, la sentencia
           donde está el cursor (varias en el editor, separadas por `;`). */
        let statement = ""
        if (selection.end > selection.start) statement = text.slice(selection.start, selection.end).trim()
        else {
            /* El corte del propio editor (el mismo de su resaltado); si no lo trae, el de aquí. */
            const found = editor && typeof editor.statementAt === "function"
                        ? editor.statementAt(selection.start)
                        : statements.statementAt(text, selection.start, dialect)
            statement = found ? found.sql : ""
        }
        if (!statement || active.running) return
        execute(active.cid, { sql: statement, schema: activeSchema || null })
    }
    /* Misma consulta otra vez (tras crear una fila desde los resultados). */
    function rerun(cid) {
        const st = stateOf(cid)
        const last = st ? st.runVariables : null
        if (last) execute(cid, { sql: last.sql, schema: last.schema })
    }
    function confirmPending() {
        const query = pending
        if (!query) return
        dangerModal.close()
        execute(query.consoleId, { sql: query.sql, schema: query.schema, confirm: true })
    }
    /* Doble clic en el árbol: la sentencia del objeto, sobre su base. */
    function pickFromTree(schema, statement) {
        selectedSchema = schema
        setConsoleSql(activeId, statement)
        treeOpen = false
        Qt.callLater(root.focusEditor, activeId)
    }

    /* `startcode-db_mercadeo-20261009-1745`: conexión, base y fecha local. */
    function exportName(connection, schema) {
        const slug = s => {
            let text = String(s)
            if (typeof text.normalize === "function") text = text.normalize("NFD").replace(/[̀-ͯ]/g, "")
            return text.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
        }
        const d = new Date()
        const p = n => (n < 10 ? "0" : "") + n
        const stamp = "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes())
        return [slug(connection), schema ? slug(schema) : "", stamp].filter(Boolean).join("-")
    }

    /* ── Enganche del asistente ────────────────────────────────────── */
    /* El asistente puede leer el editor y dejar SQL en él, nunca ejecutarlo. */
    function activeSql() { return sql }
    function setActiveSql(text) {
        setConsoleSql(activeId, String(text))
        focusEditor()
    }
    /* Se añade debajo de lo que haya: no se pierde lo que el usuario escribía. */
    function appendSql(text) {
        const previous = sql
        setActiveSql(previous.trim() ? previous.replace(/\s+$/, "") + "\n\n" + text : text)
    }
    /* Lo que el asistente lee como «Editor SQL»; vacío si no hay nada escrito. */
    function assistantEditorText() {
        return sql.trim() ? "Base activa: " + (activeSchema || "ninguna") + "\n" + sql : ""
    }
    /* Lo que el asistente lee como «Estructura». */
    function assistantSchemaText() {
        if (!conn) return ""
        return [
            "Motor: " + engineLabel + (conn.version ? " v" + conn.version : "") + " · " + conn.host + ":" + conn.port + " · usuario " + (conn.username || "—"),
            "Bases: " + ((schemas || []).filter(s => !s.system).map(s => s.name).join(", ") || "—"),
            "Base activa: " + (activeSchema || "ninguna")
        ].join("\n")
    }

    /* Resultado como texto tabulado para el asistente, con las columnas de
       secretos tapadas (contraseñas, tokens, claves); los correos sí salen. */
    function assistantResultText() {
        const st = active
        const result = st ? st.runData : null
        if (!result) return ""
        const sqlText = st.runVariables ? st.runVariables.sql : ""
        const head = sqlText ? "Consulta: " + sqlText + "\n" : ""
        if (!result.columns)
            return head + "Sin filas. Filas afectadas: " + (result.affectedRows || 0) + " · " + result.durationMs + " ms"
        const secret = result.columns.map(c => /pass|pwd|contrasen|secret|token|api_?key|private_?key|salt|hash|credential/i.test(String(c)))
        const cell = (v, i) => {
            if (v === null || v === undefined) return "NULL"
            if (secret[i]) return "••••••••"
            const text = typeof v === "object" ? JSON.stringify(v) : String(v)
            return text.length > 300 ? text.slice(0, 300) + "…" : text.replace(/[\t\n]/g, " ")
        }
        const rows = result.rows.slice(0, 100).map(r => r.map(cell).join("\t"))
        const more = result.rowCount > rows.length
            ? "\n… " + (result.rowCount - rows.length) + " filas más" + (result.truncated ? " (el resultado venía recortado a 1000)" : "") : ""
        return head + result.columns.join("\t") + "\n" + rows.join("\n") + more
             + "\n(" + result.rowCount + " filas · " + result.durationMs + " ms)"
    }

    /* El asistente lee el editor, el último resultado y la estructura; puede
       dejar SQL en el editor, nunca ejecutarlo. Solo con un motor SQL abierto. */
    readonly property bool assistantOn: conn !== null && sqlView
    onAssistantOnChanged: syncAssistant()
    function syncAssistant() {
        const base = connectionId
        const ids = ["sql-editor:" + base, "sql-result:" + base, "sql-schema:" + base]
        ids.forEach(id => AssistantBridge.unregisterSource(id))
        AssistantBridge.unregisterTarget(ids[0])
        if (!assistantOn) return
        const label = conn.name || "Base de datos"
        AssistantBridge.registerSource({ id: ids[0], type: "sql_editor", title: "Editor SQL · " + label,
                                         read: () => root.assistantEditorText(), database: () => null })
        AssistantBridge.registerSource({ id: ids[1], type: "sql_result", title: "Resultado SQL · " + label,
                                         read: () => root.assistantResultText(), database: () => null })
        AssistantBridge.registerSource({
            id: ids[2], type: "schema", title: "Estructura · " + label,
            read: () => root.assistantSchemaText(),
            database: () => root.conn ? { connectionId: root.conn.id, sessionId: root.sessionId || undefined,
                                          schema: root.activeSchema || undefined } : null
        })
        AssistantBridge.registerTarget({ id: ids[0], kind: "sql", label: "el editor SQL", paste: text => root.appendSql(text) })
    }

    /* ── Ciclo de vida ─────────────────────────────────────────────── */
    Component.onCompleted: {
        /* Arranca con las pestañas guardadas en el equipo para esta conexión. */
        const saved = editorStore.loadEditors(connectionId, maxConsoles)
        if (saved) {
            for (const e of saved.editors) createConsole(e.n, e.sql, e.name, e.savedId)
            setActive(consoleModel.get(saved.active).cid)
        } else {
            setActive(createConsole(1, "", "", "").cid)
        }
        ready = true
        loadConnection()
    }
    Component.onDestruction: {
        ["sql-editor:", "sql-result:", "sql-schema:"].forEach(p => AssistantBridge.unregisterSource(p + connectionId))
        AssistantBridge.unregisterTarget("sql-editor:" + connectionId)
        flushEditors()
        releaseSession()
    }

    /* ── Modales ───────────────────────────────────────────────────── */
    QueryAuditModal { id: auditModal; connectionId: root.connectionId }

    SaveQueryModal {
        id: saveAsModal
        queries: queryStore.queries
        initialName: root.active ? root.active.name : ""
        schema: root.activeSchema || null
        onSave: name => root.saveAsNew(name)
    }
    SavedQueriesModal {
        id: queriesModal
        queries: queryStore.queries
        dialect: root.dialect
        canAddEditor: root.consoleCount < root.maxConsoles
        activeEmpty: !root.sql.trim() && !root.activeRunning
        activeUnsaved: Boolean(root.sql.trim()) && (!root.linked || root.linked.sql !== root.sql)
        activeRunning: root.activeRunning
        canSaveCurrent: Boolean(root.sql.trim())
        onLoad: query => root.loadQuery(query)
        onReplace: query => root.loadInto(root.activeId, query)
        onSaveCurrent: { queriesModal.close(); saveAsModal.open() }
        onRename: (id, name) => root.renameQuery(id, name)
        onRemove: id => root.removeQuery(id)
    }

    Modal {
        id: dangerModal
        title: "Confirmar consulta peligrosa"
        size: "sm"
        onClosed: root.pending = null

        Item {
            width: dangerModal.bodyWidth
            height: Math.max(20, dangerText.implicitHeight)
            Icon {
                y: 2
                size: 20
                path: "M12 4L2 20h20L12 4zM12 10v5M12 18v.01"
                color: Theme.tone("rose").text
            }
            Column {
                id: dangerText
                x: 32
                width: parent.width - 32
                spacing: 4
                Label {
                    width: parent.width
                    text: root.pending ? root.pending.message : ""
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
                Label {
                    visible: text !== ""
                    width: parent.width
                    text: root.pending ? root.pending.hint : ""
                    tone: 0.55
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }
        }
        Rectangle {
            width: dangerModal.bodyWidth
            height: Math.min(192, dangerSql.implicitHeight + 24)
            radius: Theme.radiusLg
            color: Theme.tintSunken
            border.width: 1
            border.color: Theme.hairlineSoft
            ScrollArea {
                anchors.fill: parent
                anchors.margins: 1
                contentHeight: dangerSql.implicitHeight + 24
                Label {
                    id: dangerSql
                    x: 12; y: 12
                    width: parent.width - 24
                    text: root.pending ? root.pending.sql : ""
                    mono: true
                    tone: 0.8
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WrapAnywhere
                    elide: Text.ElideNone
                    textFormat: Text.PlainText
                }
            }
        }
        Row {
            spacing: 4
            Label { text: "Base:"; tone: 0.45; font.pixelSize: Theme.textXs }
            Label {
                width: Math.min(implicitWidth, dangerModal.bodyWidth - 48)
                text: root.pending && root.pending.schema ? root.pending.schema : "sin base seleccionada"
                mono: true
                tone: 0.7
                font.pixelSize: Theme.textXs
            }
        }

        footer: Row {
            spacing: 8
            SecondaryButton { text: "Cancelar"; onClicked: dangerModal.close() }
            DangerButton { text: "Ejecutar igualmente"; onClicked: root.confirmPending() }
        }
    }

    /* ── Piezas ────────────────────────────────────────────────────── */
    /* Los componentes en línea no ven los `id` de fuera: todo les llega por propiedades. */

    /* Botón de barra: cristal suave, icono y texto; `compact` deja solo el icono. */
    component ToolButton: SecondaryButton {
        id: tool
        property string iconName: ""
        /* Trazo propio para un icono que no está en el juego. */
        property string iconPath: ""
        property string hint: ""
        property string counter: ""
        property bool compact: false
        implicitHeight: 32
        implicitWidth: toolRow.implicitWidth + (compact ? 18 : 24)
        /* Sin foco: pulsarlo no debe quitarle la selección al editor. */
        focusPolicy: Qt.NoFocus
        Accessible.name: text
        contentItem: Item {
            Row {
                id: toolRow
                anchors.centerIn: parent
                spacing: 6
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: tool.iconPath === "" && tool.iconName !== ""
                    name: tool.iconName
                    size: 14
                    color: Theme.ink(tool.hovered ? 1 : 0.7)
                }
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: tool.iconPath !== ""
                    path: tool.iconPath
                    size: 14
                    color: Theme.ink(tool.hovered ? 1 : 0.7)
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !tool.compact
                    text: tool.text
                    tone: tool.hovered ? 1 : 0.7
                    font.pixelSize: Theme.textXs
                    font.weight: Font.Medium
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !tool.compact && tool.counter !== ""
                    text: tool.counter
                    tone: 0.4
                    font.pixelSize: Theme.textXs
                }
            }
        }
        HoverTip { text: tool.hint }
    }

    component RunButton: PrimaryButton {
        id: runButton
        property bool busy: false
        property bool compact: false
        implicitHeight: 32
        implicitWidth: runRow.implicitWidth + 28
        focusPolicy: Qt.NoFocus
        Accessible.name: text
        contentItem: Item {
            Row {
                id: runRow
                anchors.centerIn: parent
                spacing: 8
                Spinner { anchors.verticalCenter: parent.verticalCenter; visible: runButton.busy; size: 14; color: Theme.onBrand }
                Icon { anchors.verticalCenter: parent.verticalCenter; visible: !runButton.busy; name: "play"; size: 14; color: Theme.onBrand }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !runButton.compact
                    text: runButton.text
                    color: Theme.onBrand
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                }
            }
        }
    }

    component SectionTitle: Label {
        tone: 0.4
        font.pixelSize: Theme.textXs
        font.weight: Font.DemiBold
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 0.6
    }

    /* Nota del panel de bases (conectando, sin conexión, error). */
    component TreeNote: Label {
        property bool failed: false
        width: parent ? parent.width - 16 : 0
        x: 8
        topPadding: 8
        bottomPadding: 8
        color: failed ? Theme.tone("rose").text : Theme.ink(0.4)
        font.pixelSize: Theme.textXs
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
    }

    /* Pestaña de una consola. */
    component ConsoleTab: Item {
        id: tab
        property string name: ""
        property string placeholder: ""
        property bool current: false
        property bool running: false
        /* Enlazada a una consulta guardada y con el texto cambiado. */
        property bool changed: false
        property bool closable: false
        property bool renaming: false
        property string renameValue: ""
        property int maxName: 40
        signal activated()
        signal renameRequested()
        signal renameCommitted(string value)
        signal renameCancelled()
        signal closeRequested()

        implicitHeight: 32
        implicitWidth: 144

        Rectangle {
            anchors.fill: parent
            visible: !tab.current
            radius: Theme.radiusLg
            color: tabHover.hovered ? Theme.tintHover : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        BrandFill { anchors.fill: parent; visible: tab.current; radius: Theme.radiusLg; strength: 0.28 }
        Rectangle {
            anchors.fill: parent
            visible: tab.current
            radius: Theme.radiusLg
            color: "transparent"
            border.width: 1
            border.color: Theme.hairlineStrong
        }
        HoverHandler { id: tabHover }

        Item {
            id: face
            visible: !tab.renaming
            anchors.left: parent.left
            anchors.right: closeButton.visible ? closeButton.left : parent.right
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            Accessible.role: Accessible.PageTab
            Accessible.name: tab.name
            Accessible.selected: tab.current

            Item {
                id: mark
                x: 10
                anchors.verticalCenter: parent.verticalCenter
                width: 12; height: 12
                Spinner { anchors.centerIn: parent; visible: tab.running; size: 12 }
                Icon { anchors.centerIn: parent; visible: !tab.running; name: "play"; size: 12; color: Theme.ink(0.35) }
            }
            Label {
                id: tabName
                anchors.left: mark.right
                anchors.leftMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(implicitWidth, face.width - 30 - 4 - (dot.visible ? 14 : 0))
                text: tab.name
                tone: tab.current || tabHover.hovered ? 1 : 0.6
                font.pixelSize: Theme.textXs
                font.weight: Font.Medium
            }
            Rectangle {
                id: dot
                visible: tab.changed
                anchors.left: tabName.right
                anchors.leftMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                width: 6; height: 6; radius: 3
                color: Theme.warn
                HoverTip { text: "Cambios sin guardar" }
            }

            HoverHandler { cursorShape: Qt.PointingHandCursor }
            TapHandler {
                gesturePolicy: TapHandler.ReleaseWithinBounds
                onTapped: tab.activated()
                onDoubleTapped: tab.renameRequested()
            }
            HoverTip { text: tab.name + " · doble clic para renombrar" }
        }

        Loader {
            active: tab.renaming
            anchors.left: parent.left
            anchors.leftMargin: 4
            anchors.right: closeButton.visible ? closeButton.left : parent.right
            anchors.rightMargin: closeButton.visible ? 2 : 4
            anchors.verticalCenter: parent.verticalCenter
            height: 24
            sourceComponent: Glass {
                variant: "input"
                radius: Theme.radiusMd
                focused: renameInput.activeFocus
                Label {
                    anchors.fill: renameInput
                    verticalAlignment: Text.AlignVCenter
                    visible: renameInput.text.length === 0
                    text: tab.placeholder
                    tone: 0.3
                    font.pixelSize: Theme.textXs
                }
                TextInput {
                    id: renameInput
                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 6
                    verticalAlignment: TextInput.AlignVCenter
                    clip: true
                    color: Theme.ink(1)
                    selectionColor: Theme.brand1(0.45)
                    selectedTextColor: Theme.ink(1)
                    font.family: Theme.fontUi
                    font.pixelSize: Theme.textXs
                    font.weight: Font.Medium
                    maximumLength: tab.maxName
                    selectByMouse: true
                    Accessible.name: "Nombre del editor"
                    Component.onCompleted: {
                        text = tab.renameValue
                        forceActiveFocus()
                        selectAll()
                    }
                    onAccepted: tab.renameCommitted(text)
                    Keys.onEscapePressed: tab.renameCancelled()
                    /* Salir del campo guarda. */
                    onActiveFocusChanged: if (!activeFocus) tab.renameCommitted(text)
                }
            }
        }

        IconButton {
            id: closeButton
            visible: tab.closable
            anchors.right: parent.right
            anchors.rightMargin: 4
            anchors.verticalCenter: parent.verticalCenter
            size: 24
            iconSize: 12
            plain: true
            focusPolicy: Qt.NoFocus
            iconName: "close"
            hint: "Cerrar editor"
            Accessible.name: "Cerrar " + tab.name
            onClicked: tab.closeRequested()
        }
    }

    /* ── Página ────────────────────────────────────────────────────── */
    Spinner {
        anchors.centerIn: parent
        visible: root.loading
        size: 40
        color: Theme.brandLight1
    }

    Glass {
        visible: !root.loading && (root.failed || root.conn === null)
        width: parent.width
        implicitHeight: missingColumn.implicitHeight + 64
        height: implicitHeight
        Column {
            id: missingColumn
            y: 32
            width: parent.width
            spacing: 16
            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "No se encontró la conexión"
                tone: 0.55
            }
            SecondaryButton {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "Volver a Bases de Datos"
                onClicked: root.back()
            }
        }
    }

    Loader {
        anchors.fill: parent
        active: !root.loading && !root.failed && root.conn !== null
        sourceComponent: ColumnLayout {
            spacing: 20

            /* Cabecera */
            Glass {
                Layout.fillWidth: true
                elevation: "raised"
                implicitHeight: 80

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 20
                    anchors.rightMargin: 20
                    spacing: root.width >= 560 ? 16 : 10

                    IconButton {
                        iconName: "chevronLeft"
                        iconSize: 20
                        hint: "Volver"
                        Accessible.name: "Volver a Bases de Datos"
                        onClicked: root.back()
                    }
                    EngineBadge {
                        visible: root.width >= 420
                        engine: root.conn.engine
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.preferredWidth: 100
                        Layout.minimumWidth: 0
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8
                            Label {
                                Layout.fillWidth: true
                                Layout.maximumWidth: Math.ceil(implicitWidth) + 1
                                text: root.conn.name
                                font.pixelSize: 18
                                font.weight: Font.Bold
                                font.letterSpacing: -0.3
                            }
                            /* Estado de la conexión de esta vista. */
                            Badge {
                                visible: root.manageable
                                text: root.sessionStatus === "open" ? "Conectada"
                                    : root.sessionStatus === "connecting" || root.sessionStatus === "idle" ? "Conectando…"
                                    : "Sin conexión"
                                tone: root.sessionStatus === "open" ? "emerald"
                                    : root.sessionStatus === "connecting" || root.sessionStatus === "idle" ? "" : "rose"
                            }
                            Item { Layout.fillWidth: true }
                        }
                        Flow {
                            Layout.fillWidth: true
                            /* Una sola línea: lo que no quepa se recorta en vez de crecer la cabecera. */
                            Layout.maximumHeight: 22
                            clip: true
                            spacing: 8
                            Row {
                                Label { text: root.engineLabel; tone: 0.55 }
                                Label { visible: Boolean(root.conn.version); text: " · v" + (root.conn.version || ""); mono: true; tone: 0.4 }
                            }
                            Label { text: "·"; tone: 0.2 }
                            Row {
                                Label { text: root.conn.host; mono: true; tone: 0.55 }
                                Label { text: ":" + root.conn.port; mono: true; tone: 0.4 }
                            }
                            Label { visible: Boolean(root.conn.username); text: "·"; tone: 0.2 }
                            Label { visible: Boolean(root.conn.username); text: root.conn.username || ""; mono: true; tone: 0.45 }
                        }
                    }

                    Label {
                        id: sessionErrorLabel
                        visible: reconnectButton.visible && root.width >= 760
                        Layout.maximumWidth: root.width * 0.3
                        text: root.sessionError
                        color: Theme.tone("rose").text
                        font.pixelSize: Theme.textXs
                        HoverTip { text: root.sessionError }
                    }
                    ToolButton {
                        id: reconnectButton
                        visible: root.manageable && (root.sessionStatus === "error" || root.sessionStatus === "closed")
                        implicitHeight: 36
                        compact: root.width < 520
                        iconName: "refresh"
                        text: "Reconectar"
                        hint: sessionErrorLabel.visible ? "" : root.sessionError
                        onClicked: root.reconnect()
                    }
                }
            }

            /* Motor sin gestión todavía */
            Item {
                id: soon
                visible: !root.manageable
                Layout.fillWidth: true
                Layout.fillHeight: true
                Glass { anchors.fill: parent; elevation: "flat"; borderColor: "transparent" }
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
                            width: soon.width - 1
                            height: soon.height - 1
                            radius: Theme.radius2xl
                        }
                    }
                }
                Column {
                    anchors.centerIn: parent
                    width: Math.min(320, parent.width - 48)
                    spacing: 12
                    Icon { anchors.horizontalCenter: parent.horizontalCenter; name: "database"; size: 40; color: Theme.ink(0.2) }
                    Label {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        text: "La gestión de " + root.engineLabel + " llega pronto"
                        tone: 0.6
                        font.weight: Font.Medium
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                    Label {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        text: "Por ahora se pueden explorar y consultar conexiones MySQL, MariaDB, PostgreSQL y Redis."
                        tone: 0.35
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }
            }

            /* Redis tiene su propio explorador: sin árbol de bases, editor SQL ni predicción. */
            Loader {
                visible: active
                active: root.manageable && !root.sqlView
                Layout.fillWidth: true
                Layout.fillHeight: true
                sourceComponent: RedisBrowser {
                    conn: root.conn
                    sessionId: root.sessionId
                    onSessionClosed: root.markClosed()
                }
            }

            /* Espacio de trabajo SQL */
            Loader {
                visible: active
                active: root.sqlView
                Layout.fillWidth: true
                Layout.fillHeight: true
                sourceComponent: sqlWorkspace
            }
        }
    }

    Component {
        id: sqlWorkspace

        Item {
            id: work

            /* Por debajo de este ancho el árbol no cabe al lado del editor. */
            readonly property bool wide: width >= 860
            readonly property real gap: 20
            readonly property real topHeight: Math.round((height - gap) / 2)
            readonly property real treeWidth: Math.round((width - gap) * 0.3)
            readonly property bool treeShown: wide || root.treeOpen
            readonly property bool sessionDown: root.sessionStatus === "error" || root.sessionStatus === "closed"

            /* ── Bases de datos ── */
            Glass {
                id: treeCard
                visible: work.treeShown
                width: work.wide ? work.treeWidth : work.width
                height: work.topHeight

                Item {
                    id: treeHeader
                    width: parent.width
                    height: 44
                    SectionTitle {
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 32 - treeActions.width - 8
                        text: "Bases de datos"
                    }
                    Row {
                        id: treeActions
                        anchors.right: parent.right
                        anchors.rightMargin: 10
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 4
                        Item {
                            width: 28; height: 28
                            IconButton {
                                anchors.fill: parent
                                visible: !root.schemasFetching
                                size: 28
                                iconSize: 14
                                plain: true
                                iconName: "refresh"
                                hint: "Recargar"
                                Accessible.name: "Recargar bases"
                                onClicked: root.loadSchemas()
                            }
                            Spinner { anchors.centerIn: parent; visible: root.schemasFetching; size: 14 }
                        }
                        IconButton {
                            visible: !work.wide
                            size: 28
                            iconSize: 14
                            plain: true
                            iconName: "close"
                            hint: "Volver al editor"
                            onClicked: root.treeOpen = false
                        }
                    }
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                }

                Column {
                    id: treeNotes
                    anchors.top: treeHeader.bottom
                    width: parent.width
                    TreeNote { visible: root.sessionStatus === "connecting"; text: "Conectando…" }
                    TreeNote { visible: work.sessionDown; text: "Sin conexión. Usa «Reconectar» en la cabecera." }
                    TreeNote { visible: root.schemasFetching && root.schemas === null; text: "Cargando bases…" }
                    TreeNote { visible: root.schemasError !== ""; failed: true; text: root.schemasError }
                }

                /* El árbol trae su propio desplazamiento: solo existen las filas a la vista. */
                Loader {
                    anchors.top: treeNotes.bottom
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.margins: 8
                    active: root.schemas !== null && root.sessionId !== ""
                    sourceComponent: SchemaTree {
                        connectionId: root.connectionId
                        sessionId: root.sessionId
                        dialect: root.dialect
                        schemas: root.schemas || []
                        activeSchema: root.activeSchema || null
                        defaultExpanded: root.conn && root.conn.database ? String(root.conn.database) : null
                        onSelectSchema: schema => root.selectedSchema = schema
                        onPick: (schema, sql) => root.pickFromTree(schema, sql)
                    }
                }
            }

            /* ── Editor SQL ── */
            Glass {
                id: editorCard
                visible: work.wide || !root.treeOpen
                x: work.wide ? work.treeWidth + work.gap : 0
                width: work.wide ? work.width - work.treeWidth - work.gap : work.width
                height: work.topHeight

                /* Sin sitio para los textos, los botones quedan en su icono. */
                readonly property bool compact: width < 780
                readonly property bool sideTabs: width >= 560

                Item {
                    id: editorHeader
                    width: parent.width
                    height: 44

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: editorCard.width >= 480 ? 16 : 10
                        anchors.rightMargin: editorCard.width >= 480 ? 16 : 10
                        spacing: editorCard.width >= 480 ? 12 : 6

                        ToolButton {
                            visible: !work.wide
                            compact: true
                            iconName: "database"
                            text: "Bases de datos"
                            hint: "Ver las bases de datos"
                            onClicked: root.treeOpen = true
                        }
                        SectionTitle {
                            visible: editorCard.width >= 640
                            text: "Editor SQL"
                        }
                        /* Base sobre la que corre el editor */
                        Item {
                            id: chip
                            readonly property bool on: root.activeSchema !== ""
                            /* Se encoge hasta el mínimo si la barra no da para más. */
                            Layout.preferredWidth: Math.min(240, chipLabel.implicitWidth + 34)
                            Layout.minimumWidth: 48
                            implicitHeight: 22
                            BrandFill { anchors.fill: parent; visible: chip.on; radius: Theme.radiusMd; strength: 0.18 }
                            Rectangle {
                                anchors.fill: parent
                                radius: Theme.radiusMd
                                color: chip.on ? "transparent" : Theme.tintActive
                                border.width: 1
                                border.color: Theme.hairline
                            }
                            Icon {
                                id: chipIcon
                                x: 8
                                anchors.verticalCenter: parent.verticalCenter
                                name: "database"
                                size: 12
                                color: Theme.ink(chip.on ? 0.85 : 0.45)
                            }
                            Label {
                                id: chipLabel
                                anchors.left: chipIcon.right
                                anchors.leftMargin: 6
                                anchors.right: parent.right
                                anchors.rightMargin: 8
                                anchors.verticalCenter: parent.verticalCenter
                                text: chip.on ? root.activeSchema : "Sin base seleccionada"
                                mono: true
                                tone: chip.on ? 0.85 : 0.45
                                font.pixelSize: Theme.textXs
                            }
                            HoverTip { text: chipLabel.truncated ? chipLabel.text : "" }
                        }
                        Label {
                            id: shortcutHint
                            visible: editorCard.width >= 1080
                            Layout.fillWidth: true
                            Layout.preferredWidth: 100
                            horizontalAlignment: Text.AlignRight
                            text: "Ctrl + Enter ejecuta la consulta del cursor (o la selección) · Ctrl + Espacio sugiere"
                            tone: 0.35
                            font.pixelSize: 11
                            HoverTip { text: shortcutHint.text }
                        }
                        Item { visible: !shortcutHint.visible; Layout.fillWidth: true; Layout.preferredWidth: 0 }

                        ToolButton {
                            compact: editorCard.compact
                            iconPath: "M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM7 3v6h8V3M7 21v-7h10v7"
                            text: "Guardar"
                            enabled: Boolean(root.sql.trim()) && !(root.linked && root.linked.sql === root.sql)
                            hint: root.linked
                                  ? (root.linked.sql === root.sql ? "«" + root.linked.name + "» está guardada"
                                                                  : "Guardar los cambios en «" + root.linked.name + "» (Ctrl + S)")
                                  : "Guardar esta consulta con un nombre (Ctrl + S)"
                            onClicked: root.saveActive()
                        }
                        ToolButton {
                            compact: editorCard.compact
                            iconName: "folder"
                            text: "Consultas"
                            counter: queryStore.queries.length > 0 ? String(queryStore.queries.length) : ""
                            hint: "Ver y cargar las consultas guardadas de esta conexión"
                            onClicked: queriesModal.open()
                        }
                        ToolButton {
                            compact: editorCard.compact
                            iconName: "shield"
                            text: "Auditoría"
                            hint: "Consultas peligrosas confirmadas sobre esta conexión"
                            onClicked: auditModal.open()
                        }
                        RunButton {
                            compact: editorCard.width < 420
                            text: "Ejecutar"
                            busy: root.activeRunning
                            enabled: !root.activeRunning && Boolean(root.sql.trim()) && root.sessionStatus === "open"
                            onClicked: root.run()
                        }
                    }
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                }

                Item {
                    id: editorBody
                    anchors.top: editorHeader.bottom
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom

                    /* Pestaña de una consola, igual en la columna lateral y en la tira superior. */
                    Component {
                        id: tabDelegate
                        ConsoleTab {
                            id: consoleTab
                            required property int cid
                            readonly property var st: root.stateOf(cid)
                            readonly property var savedQuery: st ? queryStore.byId(st.savedId) : null
                            width: editorCard.sideTabs ? 128 : 132
                            name: root.consoleName(st)
                            placeholder: st ? "Editor " + st.n : ""
                            current: cid === root.activeId
                            running: st ? st.running : false
                            changed: Boolean(savedQuery) && st !== null && savedQuery.sql !== st.sql
                            closable: root.consoleCount > 1
                            renaming: root.renamingId === cid
                            renameValue: root.renamingValue
                            maxName: root.maxConsoleName
                            onActivated: { root.setActive(cid); root.focusEditor(cid) }
                            onRenameRequested: root.startRename(cid)
                            onRenameCommitted: value => root.commitRename(cid, value)
                            onRenameCancelled: root.renamingId = 0
                            onCloseRequested: root.closeConsole(cid)
                        }
                    }

                    /* Consolas a la derecha del editor */
                    Item {
                        id: sideTabsBox
                        visible: editorCard.sideTabs
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.bottom: parent.bottom
                        width: 144
                        Accessible.name: "Editores SQL"
                        Rectangle { width: 1; height: parent.height; color: Theme.line }

                        ScrollArea {
                            id: sideScroll
                            x: 8; y: 8
                            width: 128
                            height: parent.height - 16 - 32 - 4
                            contentHeight: sideColumn.implicitHeight
                            Column {
                                id: sideColumn
                                width: sideScroll.width
                                spacing: 4
                                Repeater {
                                    model: editorCard.sideTabs ? consoleModel : null
                                    delegate: tabDelegate
                                }
                            }
                        }
                        ToolButton {
                            x: 8
                            anchors.bottom: parent.bottom
                            anchors.bottomMargin: 8
                            width: 128
                            iconName: "plus"
                            text: "Agregar editor"
                            enabled: root.consoleCount < root.maxConsoles
                            hint: root.consoleCount >= root.maxConsoles ? "Máximo " + root.maxConsoles + " editores" : "Agregar editor"
                            onClicked: root.addConsole()
                        }
                    }

                    /* En estrecho, las consolas van en una tira sobre el editor */
                    Item {
                        id: topTabsBox
                        visible: !editorCard.sideTabs
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        height: 44
                        Accessible.name: "Editores SQL"

                        Flickable {
                            id: topFlick
                            x: 8; y: 6
                            width: parent.width - 16 - 32 - 6
                            height: 32
                            clip: true
                            boundsBehavior: Flickable.StopAtBounds
                            flickableDirection: Flickable.HorizontalFlick
                            contentWidth: topRow.implicitWidth
                            contentHeight: height
                            Row {
                                id: topRow
                                spacing: 4
                                Repeater {
                                    model: editorCard.sideTabs ? null : consoleModel
                                    delegate: tabDelegate
                                }
                            }
                        }
                        IconButton {
                            anchors.right: parent.right
                            anchors.rightMargin: 8
                            y: 6
                            size: 32
                            iconName: "plus"
                            focusPolicy: Qt.NoFocus
                            enabled: root.consoleCount < root.maxConsoles
                            hint: root.consoleCount >= root.maxConsoles ? "Máximo " + root.maxConsoles + " editores" : "Agregar editor"
                            onClicked: root.addConsole()
                        }
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                    }

                    Item {
                        id: editorsBox
                        anchors.left: parent.left
                        anchors.right: editorCard.sideTabs ? sideTabsBox.left : parent.right
                        anchors.top: editorCard.sideTabs ? parent.top : topTabsBox.bottom
                        anchors.bottom: parent.bottom

                        Repeater {
                            model: consoleModel
                            delegate: Item {
                                id: editorSlot
                                required property int cid
                                readonly property var st: root.stateOf(cid)
                                anchors.fill: parent
                                anchors.margins: 12
                                visible: cid === root.activeId

                                SqlEditor {
                                    id: editor
                                    anchors.fill: parent
                                    dialect: root.dialect
                                    completion: root.completion
                                    /* El texto se pasa a mano en los dos sentidos: el editor
                                       es el dueño de lo que se teclea y la consola, de lo demás. */
                                    onChange: value => {
                                        const text = value === undefined ? editor.value : value
                                        if (editorSlot.st) editorSlot.st.sql = text
                                        if (editor.value !== text) editor.value = text
                                    }
                                    onRun: root.run()
                                    onSave: root.saveActive()
                                    onSaveAs: root.openSaveAs()
                                    Component.onCompleted: {
                                        value = editorSlot.st ? editorSlot.st.sql : ""
                                        root.editorRefs[editorSlot.cid] = editor
                                    }
                                }
                            }
                            onItemRemoved: (index, item) => { delete root.editorRefs[item.cid] }
                        }
                    }
                }
            }

            /* ── Resultados, a todo el ancho ── */
            Glass {
                id: resultsCard
                y: work.topHeight + work.gap
                width: work.width
                height: Math.max(0, work.height - work.topHeight - work.gap)

                Repeater {
                    model: consoleModel
                    delegate: Item {
                        id: resultSlot
                        required property int cid
                        readonly property var st: root.stateOf(cid)
                        anchors.fill: parent
                        visible: cid === root.activeId

                        QueryResults {
                            anchors.fill: parent
                            result: resultSlot.st ? resultSlot.st.runData : null
                            error: resultSlot.st ? root.errorMessage(resultSlot.st.runError) : ""
                            running: resultSlot.st ? resultSlot.st.running : false
                            connectionId: root.connectionId
                            sessionId: root.sessionId
                            /* La fecha del nombre es la del resultado, no la de cuando se abrió la vista. */
                            fileName: {
                                if (resultSlot.st) resultSlot.st.runData
                                return root.exportName(root.conn ? root.conn.name : "", root.activeSchema)
                            }
                            query: resultSlot.st ? resultSlot.st.runVariables : null
                            onRerun: root.rerun(resultSlot.cid)
                        }
                    }
                }
            }
        }
    }
}
