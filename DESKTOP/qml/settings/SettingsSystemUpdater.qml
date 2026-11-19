import QtQuick
import StartCode

/* Buscador de versiones nuevas de la app nativa. No descarga ni instala:
   compara la versión instalada con la última del catálogo del sitio de
   versiones y, si hay una posterior, la ofrece con sus notas y un enlace a
   las descargas.

   Las preferencias viven en el equipo (`startcode:updates`), no en la
   cuenta: son de esta instalación. Con `inBackground` busca 15 s después de
   crearse y luego cada 6 h, y avisa una vez por versión si `notify` está
   activo; así se monta una sola vez para toda la app. Sin él solo busca
   cuando se le pide. */
Item {
    id: root

    property bool inBackground: false

    property bool checking: false
    property bool available: false
    /* `{ version, body, entry }`; null si no hay versión nueva. */
    property var info: null
    property string errorText: ""
    property var prefs: ({ auto: true, notify: true })

    readonly property string prefsKey: "startcode:updates"
    readonly property string releasesUrl: "https://releases.startcode.com.co"
    readonly property string versionsUrl: releasesUrl + "/startcode-panel/versions.json"
    /* Página desde la que se descarga el instalador. */
    readonly property string downloadsUrl: releasesUrl
    /* Una versión de desarrollo (sin número) no se compara con nada. */
    readonly property bool comparable: /^\d+(\.\d+)*/.test(AppVersion)

    /* Versión ya avisada: un aviso por versión, no uno cada 6 h. */
    property string notified: ""

    readonly property var sectionLabels: [
        ["added", "Novedades"], ["changed", "Cambios"], ["fixed", "Correcciones"],
        ["removed", "Eliminado"], ["security", "Seguridad"]
    ]

    visible: false

    function loadPrefs() {
        const saved = App.storeGet(prefsKey)
        prefs = Object.assign({ auto: true, notify: true }, saved && typeof saved === "object" ? saved : {})
    }
    function setPref(key, value) {
        const next = Object.assign({}, prefs)
        next[key] = value
        prefs = next
        App.storeSet(prefsKey, next)
    }
    function checkForUpdates() { run(false) }
    function openDownloads() { App.openExternal(downloadsUrl) }

    function parseVersion(v) { return String(v).split(".").map(n => Number(n) || 0) }
    function compareVersions(a, b) {
        const x = parseVersion(a), y = parseVersion(b)
        for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
        return 0
    }
    /* Las notas de la versión como texto: título y cambios por sección. */
    function bodyOf(entry) {
        const lines = []
        if (entry.title) lines.push(entry.title)
        sectionLabels.forEach(pair => {
            const items = entry.changes && entry.changes[pair[0]]
            if (!items || !items.length) return
            if (lines.length) lines.push("")
            lines.push(pair[1] + ":")
            items.forEach(item => lines.push("• " + item))
        })
        return lines.join("\n")
    }

    /* `silent`: sin errores a la vista (búsqueda que no pidió el usuario). */
    function run(silent) {
        if (checking) return
        checking = true
        if (!silent) errorText = ""

        App.httpGet(versionsUrl, (ok, text, status) => {
            root.checking = false
            let list = null
            if (ok) {
                try {
                    const catalog = JSON.parse(text)
                    list = catalog && Array.isArray(catalog.versions) ? catalog.versions : []
                } catch (e) { list = null }
            }
            if (list === null) {
                if (!silent) root.errorText = !ok
                    ? (status ? "No se pudo consultar el sitio de versiones (HTTP " + status + ")"
                              : "No se pudo conectar con el sitio de versiones")
                    : "El sitio de versiones devolvió una respuesta no válida"
                return
            }

            let newest = null
            if (root.comparable) list.forEach(v => {
                if (!v || !v.version || root.compareVersions(v.version, AppVersion) <= 0) return
                if (!newest || root.compareVersions(v.version, newest.version) > 0) newest = v
            })
            if (!newest) {
                root.available = false
                root.info = null
                return
            }

            root.available = true
            root.info = { version: newest.version, body: root.bodyOf(newest), entry: newest }

            /* Las preferencias pudo cambiarlas la pestaña de Sistema. */
            root.loadPrefs()
            if (root.inBackground && silent && root.prefs.notify) root.announce(newest.version)
        })
    }

    function announce(version) {
        if (notified === version) return
        notified = version
        Toasts.info("StartCode Panel v" + version + " disponible", "Descárgala desde Configuración → Sistema.")
    }

    Component.onCompleted: loadPrefs()

    Timer { interval: 15000; running: root.inBackground; onTriggered: root.run(true) }
    Timer { interval: 6 * 60 * 60000; running: root.inBackground; repeat: true; onTriggered: root.run(true) }
}
