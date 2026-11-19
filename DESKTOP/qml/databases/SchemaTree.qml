import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
import StartCode

/* Árbol de la conexión: bases → secciones (tablas, vistas, triggers, índices,
   procedimientos) → objetos → columnas. Cada sección pide su contenido la
   primera vez que se despliega. Un clic despliega; doble clic en un objeto
   emite `pick` con la sentencia para consultarlo.

       SchemaTree {
           connectionId: conn.id; sessionId: …; dialect: "mysql"
           schemas: …; activeSchema: …; defaultExpanded: conn.database
           onSelectSchema: schema => …; onPick: (schema, sql) => …
       }

   Con miles de objetos va fluido porque solo existen las filas a la vista: el
   árbol se aplana en una lista y un `ListView` la recorre. Necesita un alto
   (`Layout.fillHeight` o `height`); sin él toma el de su contenido. */
Item {
    id: root

    property string connectionId: ""
    /* Sesión de la vista: todas las secciones se piden por esa conexión. */
    property string sessionId: ""
    /* "mysql" | "postgresql": comillas y sentencias del doble clic según el motor. */
    property string dialect: "mysql"
    /* `DatabaseSchema[]`: { name, system }. */
    property var schemas: []
    /* Base sobre la que corre el editor. */
    property var activeSchema: null
    /* Base que arranca desplegada: la que fija la conexión, si fija alguna. */
    property var defaultExpanded: null

    signal selectSchema(string schema)
    /* Doble clic en un objeto: carga en el editor la sentencia para consultarlo. */
    signal pick(string schema, string sql)

    /** Olvida lo cargado y vuelve a pedir las secciones desplegadas. */
    function reload() {
        generation++
        for (const key in sections) {
            const st = sections[key]
            st.data = null
            st.failed = false
            st.error = ""
            st.fetching = false
            st.fetchedAt = 0
        }
        fetchOpenSections()
        scheduleRebuild()
    }

    implicitWidth: 260
    implicitHeight: view.y + view.contentHeight

    /* ── Estado del árbol (se muta en sitio y se vuelve a aplanar) ──── */
    property string filterText: ""
    /* nombre de base → desplegada; sin entrada manda `defaultExpanded`. */
    property var openSchemas: ({})
    /* "base\u0001sección" → { schema, section, open, search, data, fetching, failed, error, fetchedAt } */
    property var sections: ({})
    /* "base\u0001sección\u0001esquema.tabla" → desplegada */
    property var openTables: ({})
    /* Filas a la vista, en el mismo orden que el modelo. */
    property var flat: []
    /* Cambia con la sesión o la conexión: descarta respuestas anteriores. */
    property int generation: 0

    readonly property int staleMs: 60000
    readonly property string sep: "\u0001"

    readonly property var sectionDefs: [
        { id: "tables", label: "Tablas", icon: "table", tone: "violet" },
        { id: "views", label: "Vistas", icon: "view", tone: "sky" },
        { id: "triggers", label: "Triggers", icon: "trigger", tone: "amber" },
        { id: "indexes", label: "Índices", icon: "index", tone: "emerald" },
        { id: "procedures", label: "Procedimientos", icon: "procedure", tone: "fuchsia" }
    ]

    /* Trazos de `components/databases/icons.tsx` (rejilla de 24). */
    readonly property var iconPaths: ({
        chevron: "M9 6l6 6-6 6",
        database: "M4 5a8 3 0 1 0 16 0a8 3 0 1 0 -16 0M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
        table: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 10h18M9 10v10",
        view: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        column: "M5 7h14M5 12h14M5 17h9",
        key: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3",
        trigger: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
        index: "M4 6h16M4 12h10M4 18h6M18 14v6M15 17h6",
        procedure: "M8 4H6a2 2 0 00-2 2v4l-2 2 2 2v4a2 2 0 002 2h2M16 4h2a2 2 0 012 2v4l2 2-2 2v4a2 2 0 01-2 2h-2"
    })

    /* ── SQL según el motor (equivale a `utils/sqlDialect.ts`) ──────── */
    /** Identificador citado: `nombre` en MySQL, "nombre" en PostgreSQL. */
    function quoteIdent(name) {
        const text = String(name)
        return dialect === "postgresql" ? "\"" + text.replace(/"/g, "\"\"") + "\""
                                        : "\x60" + text.replace(/\x60/g, "\x60\x60") + "\x60"
    }
    function literal(value) { return "'" + String(value).replace(/'/g, "''") + "'" }
    /** Nombre a mostrar: en PostgreSQL, con su esquema salvo que sea `public`. */
    function displayName(name, namespace) {
        return namespace && namespace !== "public" ? namespace + "." + name : String(name)
    }
    function qualified(name, namespace) {
        return dialect === "postgresql" && namespace ? quoteIdent(namespace) + "." + quoteIdent(name)
                                                     : quoteIdent(name)
    }
    function selectTableSql(name, namespace) {
        return "SELECT * FROM " + qualified(name, namespace) + " LIMIT 100;"
    }
    function triggerSql(t) {
        return dialect === "postgresql"
            ? "SELECT pg_get_triggerdef(tg.oid, true) AS definicion\n  FROM pg_trigger tg\n  JOIN pg_class c ON c.oid = tg.tgrelid\n  JOIN pg_namespace n ON n.oid = c.relnamespace\n WHERE tg.tgname = "
              + literal(t.name) + " AND c.relname = " + literal(t.table) + " AND n.nspname = " + literal(t.namespace || "public") + ";"
            : "SHOW CREATE TRIGGER " + quoteIdent(t.name) + ";"
    }
    function indexSql(ix) {
        return dialect === "postgresql"
            ? "SELECT indexname, indexdef\n  FROM pg_indexes\n WHERE schemaname = " + literal(ix.namespace || "public")
              + " AND tablename = " + literal(ix.table) + ";"
            : "SHOW INDEX FROM " + quoteIdent(ix.table) + ";"
    }
    function procedureSql(p) {
        return dialect === "postgresql"
            ? "SELECT pg_get_functiondef(p.oid) AS definicion\n  FROM pg_proc p\n  JOIN pg_namespace n ON n.oid = p.pronamespace\n WHERE p.proname = "
              + literal(p.name) + " AND n.nspname = " + literal(p.namespace || "public") + ";"
            : "SHOW CREATE PROCEDURE " + quoteIdent(p.name) + ";"
    }

    /* ── Datos ─────────────────────────────────────────────────────── */
    function toArray(value) {
        if (Array.isArray(value)) return value
        return value && typeof value === "object" && value.length !== undefined ? Array.from(value) : []
    }

    function sectionState(schema, sectionId) {
        const key = schema + sep + sectionId
        let st = sections[key]
        if (!st) {
            st = { schema: schema, section: sectionId, open: false, search: "",
                   data: null, fetching: false, failed: false, error: "", fetchedAt: 0 }
            sections[key] = st
        }
        return st
    }

    function isSchemaOpen(name) {
        const explicit = openSchemas[name]
        return explicit === undefined ? name === defaultExpanded : explicit
    }

    function fetchSection(st) {
        if (!sessionId || !connectionId || st.fetching) return
        st.fetching = true
        const gen = generation
        const path = "/databases/" + connectionId + "/schemas/" + encodeURIComponent(st.schema) + "/" + st.section
                     + "?session=" + encodeURIComponent(sessionId)
        Api.request("GET", path, null, (ok, data, error) => {
            if (gen !== root.generation) return
            st.fetching = false
            if (ok) {
                st.data = root.toArray(data)
                st.failed = false
                st.error = ""
                st.fetchedAt = Date.now()
            } else {
                st.failed = true
                st.error = error && error.message ? String(error.message) : "No se pudo cargar"
            }
            root.scheduleRebuild()
        })
    }

    /* Al desplegar: la primera vez, tras un fallo o si lo cargado tiene más de un minuto. */
    function ensureSection(st) {
        if (st.data === null || st.failed || Date.now() - st.fetchedAt > staleMs) fetchSection(st)
    }

    function fetchOpenSections() {
        for (const key in sections) {
            const st = sections[key]
            if (st.open && isSchemaOpen(st.schema)) ensureSection(st)
        }
    }

    function clearTables(prefix) {
        for (const key in openTables) if (key.indexOf(prefix) === 0) delete openTables[key]
    }

    /* ── Acciones de fila ──────────────────────────────────────────── */
    function activate(index) {
        const r = flat[index]
        if (!r) return
        if (r.rowKind === "schema") {
            const open = !isSchemaOpen(r.schemaName)
            openSchemas[r.schemaName] = open
            if (!open) {
                /* Al plegar una base, sus secciones vuelven a empezar plegadas. */
                for (let i = 0; i < sectionDefs.length; i++) {
                    const st = sections[r.schemaName + sep + sectionDefs[i].id]
                    if (st) { st.open = false; st.search = "" }
                }
                clearTables(r.schemaName + sep)
            }
            rebuild()
            root.selectSchema(r.schemaName)
        } else if (r.rowKind === "section") {
            const st = sections[r.parentKey]
            if (!st) return
            st.open = !st.open
            if (st.open) ensureSection(st)
            else clearTables(r.parentKey + sep)
            rebuild()
        } else if (r.rowKind === "table") {
            if (openTables[r.rowKey]) delete openTables[r.rowKey]
            else openTables[r.rowKey] = true
            rebuild()
        }
    }

    function pickRow(index) {
        const r = flat[index]
        if (r && (r.rowKind === "table" || r.rowKind === "leaf") && r.sql !== "") root.pick(r.schemaName, r.sql)
    }

    function setSectionSearch(sectionKey, text) {
        const st = sections[sectionKey]
        if (!st || st.search === text) return
        st.search = text
        scheduleRebuild()
    }

    /* ── Aplanado ──────────────────────────────────────────────────── */
    /* Todas las filas llevan los mismos campos: el modelo fija los tipos con la primera. */
    function makeRow(fields) {
        const r = {
            rowKey: "", rowKind: "", depth: 0, label: "", detail: "", tip: "", iconKey: "", toneKey: "",
            expandable: false, opened: false, activeRow: false, dimmed: false, failedRow: false,
            parentKey: "", schemaName: "", sql: "", sig: ""
        }
        for (const k in fields) r[k] = fields[k]
        r.sig = [r.rowKind, r.depth, r.label, r.detail, r.tip, r.iconKey, r.toneKey, r.expandable, r.opened,
                 r.activeRow, r.dimmed, r.failedRow, r.sql].join(sep)
        return r
    }

    function hintRow(key, depth, text, failed) {
        return makeRow({ rowKey: key, rowKind: "hint", depth: depth, label: text, failedRow: failed === true })
    }

    function pushSectionContent(out, schema, def, st, label, skey) {
        const items = st.data
        if (items === null && !st.failed) { out.push(hintRow(skey + sep + "#load", 2, "Cargando…")); return }
        if (st.failed) { out.push(hintRow(skey + sep + "#error", 2, st.error || "No se pudo cargar", true)); return }
        if (items.length === 0) { out.push(hintRow(skey + sep + "#empty", 2, "Sin " + label.toLowerCase())); return }

        const esLocale = Qt.locale("es_ES")
        if (def.id === "tables" || def.id === "views") {
            const term = st.search.trim().toLowerCase()
            if (def.id === "tables")
                out.push(makeRow({ rowKey: skey + sep + "#search", rowKind: "search", depth: 2, parentKey: skey,
                                   label: "Buscar tabla…" }))
            let shown = 0
            for (let i = 0; i < items.length; i++) {
                const t = items[i]
                const name = displayName(t.name, t.namespace)
                if (term && !name.toLowerCase().includes(term)) continue
                shown++
                const isView = t.type === "view"
                const tkey = skey + sep + (t.namespace || "") + "." + t.name
                const open = openTables[tkey] === true
                out.push(makeRow({
                    rowKey: tkey, rowKind: "table", depth: 2, label: name,
                    detail: t.rows !== null && t.rows !== undefined && !isView
                            ? Number(t.rows).toLocaleString(esLocale, "f", 0) : "",
                    tip: name + " · doble clic para consultarla",
                    iconKey: isView ? "view" : "table", toneKey: isView ? "sky" : "violet",
                    expandable: true, opened: open, schemaName: schema,
                    sql: selectTableSql(t.name, t.namespace)
                }))
                if (!open) continue
                const cols = toArray(t.columns)
                for (let c = 0; c < cols.length; c++) {
                    const col = cols[c]
                    const primary = col.key === "PRI"
                    out.push(makeRow({
                        rowKey: tkey + sep + col.name, rowKind: "column", depth: 3, label: String(col.name),
                        detail: String(col.type),
                        tip: col.name + " " + col.type + (col.nullable ? "" : " NOT NULL"),
                        iconKey: primary ? "key" : "column", toneKey: primary ? "amber" : ""
                    }))
                }
            }
            if (shown === 0) out.push(hintRow(skey + sep + "#nomatch", 2, "Ninguna tabla coincide"))
            return
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i]
            if (def.id === "triggers") {
                out.push(makeRow({
                    rowKey: skey + sep + (it.namespace || "") + "." + it.table + "." + it.name, rowKind: "leaf", depth: 2,
                    label: String(it.name),
                    detail: it.timing + " " + it.event + " · " + displayName(it.table, it.namespace),
                    tip: it.timing + " " + it.event + " ON " + it.table + " · doble clic para ver su definición",
                    iconKey: "trigger", toneKey: def.tone, schemaName: schema, sql: triggerSql(it)
                }))
            } else if (def.id === "indexes") {
                const columns = toArray(it.columns).join(", ")
                out.push(makeRow({
                    rowKey: skey + sep + (it.namespace || "") + "." + it.table + "." + it.name, rowKind: "leaf", depth: 2,
                    label: displayName(it.table, it.namespace) + "." + it.name,
                    detail: (it.unique ? "UNIQUE · " : "") + columns,
                    tip: it.name + " en " + it.table + " (" + columns + ") · " + it.type + (it.unique ? " · único" : "")
                         + " · doble clic para ver los índices de la tabla",
                    iconKey: "index", toneKey: def.tone, schemaName: schema, sql: indexSql(it)
                }))
            } else {
                const params = it.params ? String(it.params) : ""
                out.push(makeRow({
                    rowKey: skey + sep + (it.namespace || "") + "." + it.name + "(" + params + ")", rowKind: "leaf", depth: 2,
                    label: displayName(it.name, it.namespace),
                    detail: params ? "(" + params + ")" : "()",
                    tip: (it.kind === "function" ? "Función" : "Procedimiento") + " " + it.name + "(" + params + ")"
                         + (it.comment ? "\n" + it.comment : "") + "\nDoble clic para ver su definición",
                    iconKey: "procedure", toneKey: def.tone, schemaName: schema, sql: procedureSql(it)
                }))
            }
        }
    }

    function buildRows() {
        const out = []
        const term = filterText.trim().toLowerCase()
        const list = toArray(schemas)
        let shown = 0
        for (let i = 0; i < list.length; i++) {
            const s = list[i]
            const name = String(s.name)
            if (term && !name.toLowerCase().includes(term)) continue
            shown++
            const open = isSchemaOpen(name)
            out.push(makeRow({
                rowKey: "s" + sep + name, rowKind: "schema", depth: 0, label: name, iconKey: "database",
                expandable: true, opened: open, activeRow: activeSchema === name, dimmed: s.system === true,
                schemaName: name
            }))
            if (!open) continue
            for (let d = 0; d < sectionDefs.length; d++) {
                const def = sectionDefs[d]
                const skey = name + sep + def.id
                const st = sectionState(name, def.id)
                /* En PostgreSQL la sección reúne funciones y procedimientos. */
                const label = dialect === "postgresql" && def.id === "procedures" ? "Funciones y procedimientos" : def.label
                out.push(makeRow({
                    rowKey: skey, rowKind: "section", depth: 1, label: label,
                    detail: st.data !== null ? String(st.data.length) : "",
                    iconKey: def.icon, toneKey: def.tone, expandable: true, opened: st.open,
                    parentKey: skey, schemaName: name
                }))
                if (st.open) pushSectionContent(out, name, def, st, label, skey)
            }
        }
        if (shown === 0) out.unshift(hintRow("#none", 0, "Ninguna base coincide"))
        return out
    }

    /* Solo toca lo que cambió: plegar o desplegar inserta o quita un tramo y la
       lista no pierde su posición. */
    function rebuild() {
        const next = buildRows()
        const prev = flat
        const n0 = prev.length, n1 = next.length
        let head = 0
        while (head < n0 && head < n1 && prev[head].rowKey === next[head].rowKey) head++
        let tail = 0
        while (tail < n0 - head && tail < n1 - head && prev[n0 - 1 - tail].rowKey === next[n1 - 1 - tail].rowKey) tail++

        if (n0 - head - tail > 0) rows.remove(head, n0 - head - tail)
        for (let i = head; i < n1 - tail; i++) rows.insert(i, next[i])
        for (let i = 0; i < head; i++) if (prev[i].sig !== next[i].sig) rows.set(i, next[i])
        for (let k = 1; k <= tail; k++) if (prev[n0 - k].sig !== next[n1 - k].sig) rows.set(n1 - k, next[n1 - k])
        flat = next
    }

    function scheduleRebuild() { Qt.callLater(rebuild) }

    /* Sesión o conexión nuevas: lo cargado era de la anterior. Lo desplegado se conserva. */
    function resetData(forgetTree) {
        generation++
        if (forgetTree) {
            openSchemas = ({})
            sections = ({})
            openTables = ({})
            filterText = ""
            topSearch.text = ""
        } else {
            for (const key in sections) {
                const st = sections[key]
                st.data = null
                st.failed = false
                st.error = ""
                st.fetching = false
                st.fetchedAt = 0
            }
            fetchOpenSections()
        }
        scheduleRebuild()
    }

    onConnectionIdChanged: resetData(true)
    onSessionIdChanged: resetData(false)
    onSchemasChanged: scheduleRebuild()
    onActiveSchemaChanged: scheduleRebuild()
    onDefaultExpandedChanged: scheduleRebuild()
    onDialectChanged: scheduleRebuild()
    Component.onCompleted: rebuild()

    ListModel { id: rows }

    /* Buscador de bases: solo si hay más de una. */
    SchemaTreeSearch {
        id: topSearch
        visible: root.toArray(root.schemas).length > 1
        y: 4
        width: parent.width
        placeholder: "Buscar base de datos…"
        onEdited: text => {
            root.filterText = text
            root.scheduleRebuild()
        }
    }

    ListView {
        id: view
        y: topSearch.visible ? topSearch.y + topSearch.height + 8 : 4
        width: parent.width
        height: Math.max(0, parent.height - y)
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        model: rows
        reuseItems: true
        cacheBuffer: 320
        T.ScrollBar.vertical: SftpScrollBar { flick: view }

        delegate: Item {
            id: rowItem

            required property int index
            required property string rowKey
            required property string rowKind
            required property int depth
            required property string label
            required property string detail
            required property string tip
            required property string iconKey
            required property string toneKey
            required property bool expandable
            required property bool opened
            required property bool activeRow
            required property bool dimmed
            required property bool failedRow
            required property string parentKey

            readonly property bool isHint: rowKind === "hint"
            readonly property bool isSearch: rowKind === "search"
            readonly property bool isColumn: rowKind === "column"
            readonly property bool isSchema: rowKind === "schema"
            readonly property bool clickable: !isHint && !isSearch && !isColumn
            /* Cada nivel entra 22 px, con su línea guía a la izquierda. */
            readonly property real indent: depth * 22
            /* Las bases van separadas 2 px entre sí. */
            readonly property real topGap: isSchema ? 2 : 0
            readonly property real textTone: {
                if (activeRow) return 1
                if (isColumn) return 0.7
                if (isSchema) return dimmed ? (hover.hovered ? 0.8 : 0.4) : (hover.hovered ? 1 : 0.75)
                if (rowKind === "section") return hover.hovered ? 1 : 0.65
                return hover.hovered ? 1 : 0.7
            }

            width: ListView.view ? ListView.view.width : 0
            height: isHint ? hintLabel.implicitHeight + 12
                  : isSearch ? 40
                  : isColumn ? 28
                  : 32 + topGap

            Accessible.role: clickable ? Accessible.Button : Accessible.StaticText
            Accessible.name: label

            /* El campo de una fila reciclada enseña el texto de su sección. */
            function syncSearch() {
                if (!searchLoader.item) return
                const st = root.sections[parentKey]
                searchLoader.item.text = st ? st.search : ""
            }
            ListView.onReused: syncSearch()

            Repeater {
                model: rowItem.depth
                Rectangle {
                    required property int index
                    x: 18 + index * 22
                    width: 1
                    height: rowItem.height
                    color: Theme.line
                }
            }

            Rectangle {
                id: rowBg
                visible: rowItem.clickable
                x: rowItem.indent
                y: rowItem.topGap
                width: rowItem.width - rowItem.indent - 2
                height: rowItem.height - rowItem.topGap
                radius: Theme.radiusLg
                color: !rowItem.activeRow && hover.hovered ? Theme.tintHover : "transparent"
                /* Solo el color y breve: con cientos de filas, más transiciones se notan al desplazar. */
                Behavior on color { ColorAnimation { duration: 100 } }
            }
            Loader {
                active: rowItem.activeRow
                anchors.fill: rowBg
                sourceComponent: BrandFill { radius: Theme.radiusLg; strength: 0.18 }
            }

            RowLayout {
                visible: !rowItem.isHint && !rowItem.isSearch
                x: rowItem.indent + 8
                y: rowItem.topGap
                width: rowItem.width - rowItem.indent - 18
                height: rowItem.height - rowItem.topGap
                spacing: 6

                /* Hueco del triángulo: los objetos sin hijos se alinean con los que lo tienen. */
                Item {
                    visible: !rowItem.isColumn
                    implicitWidth: 14
                    implicitHeight: 14
                    Icon {
                        visible: rowItem.expandable
                        size: 14
                        path: root.iconPaths.chevron
                        color: Theme.ink(0.35)
                        rotation: rowItem.opened ? 90 : 0
                        Behavior on rotation { NumberAnimation { duration: Theme.moFast } }
                    }
                }
                Icon {
                    size: rowItem.isColumn ? 12 : 14
                    path: root.iconPaths[rowItem.iconKey] ?? ""
                    color: rowItem.isSchema ? (rowItem.activeRow ? Theme.brandLight1 : Theme.ink(0.45))
                         : rowItem.toneKey === "" ? Theme.ink(0.3)
                         : Theme.tone(rowItem.toneKey).text
                }
                Label {
                    Layout.fillWidth: true
                    text: rowItem.label
                    tone: rowItem.textTone
                    mono: rowItem.rowKind === "table" || rowItem.rowKind === "leaf" || rowItem.isColumn
                    font.pixelSize: rowItem.isSchema ? Theme.textSm : rowItem.isColumn ? Theme.textXs : 13
                    font.weight: rowItem.isSchema ? Font.Medium : Font.Normal
                    textFormat: Text.PlainText
                }
                Label {
                    visible: rowItem.detail !== ""
                    Layout.maximumWidth: rowItem.width * (rowItem.isColumn ? 0.5 : 0.45)
                    text: rowItem.detail
                    tone: rowItem.rowKind === "leaf" ? 0.35 : 0.3
                    mono: rowItem.isColumn
                    font.pixelSize: rowItem.isColumn ? Theme.textXs : Theme.textCaption
                    textFormat: Text.PlainText
                }
            }

            Label {
                id: hintLabel
                visible: rowItem.isHint
                x: rowItem.indent + 12
                y: 6
                width: rowItem.width - x - 14
                text: rowItem.isHint ? rowItem.label : ""
                color: rowItem.failedRow ? Theme.tone("rose").text : Theme.ink(0.35)
                font.pixelSize: Theme.textXs
                wrapMode: Text.Wrap
                elide: Text.ElideNone
                textFormat: Text.PlainText
            }

            Loader {
                id: searchLoader
                active: rowItem.isSearch
                x: rowItem.indent + 4
                y: 4
                width: rowItem.width - x - 6
                height: 32
                sourceComponent: SchemaTreeSearch {
                    placeholder: rowItem.label
                    onEdited: text => root.setSectionSearch(rowItem.parentKey, text)
                }
                onLoaded: rowItem.syncSearch()
            }

            HoverHandler {
                id: hover
                enabled: rowItem.clickable
                cursorShape: Qt.PointingHandCursor
            }
            TapHandler {
                enabled: rowItem.clickable
                gesturePolicy: TapHandler.ReleaseWithinBounds
                onTapped: root.activate(rowItem.index)
                onDoubleTapped: root.pickRow(rowItem.index)
            }
            Loader {
                active: rowItem.tip !== ""
                anchors.fill: parent
                sourceComponent: HoverTip { text: rowItem.tip }
            }
        }
    }
}
