import QtQuick
import StartCode

/* Novedades por versión, agrupadas por tipo de salto (mayor, menor, parche).
   La copia incluida en la app cubre hasta la versión instalada y funciona sin
   red; la del sitio de versiones añade las posteriores. Si el sitio no
   responde, se queda la incluida. Las versiones posteriores a la instalada
   se marcan como disponibles. */
Column {
    id: root

    /* Versión instalada; "—" si no se conoce. */
    property string installedVersion: "—"

    /* Lo que daba el hook `useReleaseNotes`. */
    readonly property var versions: merge(localVersions, remoteVersions)
    property bool remoteError: false
    property bool isFetching: false
    function refetch() { loadRemote() }

    readonly property string releasesUrl: "https://releases.startcode.com.co"
    readonly property string versionsUrl: releasesUrl + "/startcode-panel/versions.json"
    readonly property string bundledPath: "/qt/qml/StartCode/assets/release/versions.json"

    property var localVersions: []
    property var remoteVersions: []
    property string filter: "all"
    property bool expanded: false

    readonly property int collapsedCount: 4
    readonly property var filtered: versions.filter(v => filter === "all" || v.type === filter)
    readonly property var shown: expanded ? filtered : filtered.slice(0, collapsedCount)

    readonly property var typeMeta: ({
        major: { label: "Mayor", tone: "rose" },
        minor: { label: "Menor", tone: "violet" },
        patch: { label: "Parche", tone: "sky" }
    })
    readonly property var sections: [
        { id: "added", label: "Novedades", dot: Theme.tone("emerald").base },
        { id: "changed", label: "Cambios", dot: Theme.tone("sky").base },
        { id: "fixed", label: "Correcciones", dot: Theme.tone("amber").base },
        { id: "removed", label: "Eliminado", dot: Theme.ink(0.4) },
        { id: "security", label: "Seguridad", dot: Theme.tone("rose").base }
    ]
    readonly property var filters: [
        { id: "all", label: "Todas" },
        { id: "major", label: "Mayores" },
        { id: "minor", label: "Menores" },
        { id: "patch", label: "Parches" }
    ]

    function parseVersion(v) { return String(v).split(".").map(n => Number(n) || 0) }
    /* Positivo si a > b. */
    function compareVersions(a, b) {
        const x = parseVersion(a), y = parseVersion(b)
        for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
        return 0
    }
    /* La entrada del sitio gana a la incluida de la misma versión. */
    function merge(local, remote) {
        const byVersion = {}
        local.concat(remote).forEach(v => { if (v && v.version) byVersion[v.version] = v })
        return Object.keys(byVersion).map(k => byVersion[k]).sort((a, b) => compareVersions(b.version, a.version))
    }
    function versionsOf(text) {
        try {
            const catalog = JSON.parse(text)
            return catalog && Array.isArray(catalog.versions) ? catalog.versions : []
        } catch (e) { return null }
    }
    function fmtDate(date) {
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date))
        if (!parts) return String(date)
        const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
        if (isNaN(d.getTime())) return String(date)
        return d.toLocaleDateString(Qt.locale("es_CO"), "dd MMM yyyy").replace(/\./g, "")
    }

    function loadBundled() {
        const direct = versionsOf(Transfers.readTextFile(":" + bundledPath, 0))
        if (direct && direct.length) { localVersions = direct; return }
        /* Respaldo: el mismo recurso leído por URL. */
        const xhr = new XMLHttpRequest()
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            const parsed = versionsOf(xhr.responseText)
            if (parsed) root.localVersions = parsed
        }
        xhr.open("GET", "qrc:" + bundledPath)
        xhr.send()
    }
    function loadRemote() {
        if (isFetching) return
        isFetching = true
        App.httpGet(versionsUrl, (ok, text, status) => {
            root.isFetching = false
            const parsed = ok ? root.versionsOf(text) : null
            root.remoteError = parsed === null
            if (parsed !== null) root.remoteVersions = parsed
        })
    }

    Component.onCompleted: { loadBundled(); loadRemote() }

    spacing: 12

    /* ── Filtros ── */
    Flow {
        width: root.width
        spacing: 8

        Repeater {
            model: root.filters
            Item {
                id: chip
                required property var modelData
                readonly property bool on: root.filter === modelData.id
                width: chipLabel.implicitWidth + 24
                height: 32
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: modelData.label
                Keys.onReturnPressed: root.filter = modelData.id
                Keys.onSpacePressed: root.filter = modelData.id

                Glass {
                    anchors.fill: parent
                    visible: !chip.on
                    variant: "soft"
                    elevation: "flat"
                    radius: Theme.radiusLg
                    highlighted: chipHover.hovered
                    borderColor: chip.activeFocus ? Theme.focusRing : chipHover.hovered ? Theme.hairlineHover : Theme.hairlineSoft
                }
                BrandFill { anchors.fill: parent; visible: chip.on; radius: Theme.radiusLg; strength: 0.28 }
                Rectangle {
                    anchors.fill: parent
                    visible: chip.on
                    radius: Theme.radiusLg
                    color: "transparent"
                    border.width: 1
                    border.color: chip.activeFocus ? Theme.focusRing : Theme.hairline
                }
                Label {
                    id: chipLabel
                    anchors.centerIn: parent
                    text: chip.modelData.label
                    tone: chip.on || chipHover.hovered ? 1 : 0.6
                    font.pixelSize: Theme.textXs
                    font.weight: Font.Medium
                }
                HoverHandler { id: chipHover; cursorShape: Qt.PointingHandCursor }
                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.filter = chip.modelData.id }
            }
        }
    }
    Label {
        visible: root.remoteError
        width: root.width
        text: "Sin conexión con el sitio de versiones: se muestran las incluidas en la app"
        tone: 0.35
        font.pixelSize: 11
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
        HoverTip { text: "No se pudo leer el sitio de releases" }
    }

    /* ── Sin versiones del tipo elegido ── */
    Rectangle {
        visible: root.shown.length === 0
        width: root.width
        height: 84
        radius: Theme.radiusXl
        color: "transparent"
        border.width: 1
        border.color: Theme.edgeDashed
        Label {
            anchors.centerIn: parent
            width: parent.width - 32
            horizontalAlignment: Text.AlignHCenter
            text: "No hay versiones de este tipo."
            tone: 0.45
        }
    }

    /* ── Versiones ── */
    Repeater {
        model: root.shown
        Glass {
            id: release
            required property var modelData
            readonly property var entry: modelData
            readonly property bool isInstalled: entry.version === root.installedVersion
            readonly property bool isNewer: root.installedVersion !== "—"
                                            && root.compareVersions(entry.version, root.installedVersion) > 0
            readonly property var meta: root.typeMeta[entry.type] || root.typeMeta.patch
            readonly property var present: root.sections.filter(s => entry.changes && entry.changes[s.id] && entry.changes[s.id].length)

            width: root.width
            implicitHeight: releaseBody.implicitHeight + 32
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            borderColor: isNewer ? Theme.brand1(0.25) : Theme.hairlineSoft

            Column {
                id: releaseBody
                x: 16; y: 16
                width: parent.width - 32
                spacing: 12

                Column {
                    width: parent.width
                    spacing: 4
                    Item {
                        width: parent.width
                        implicitHeight: Math.max(tags.implicitHeight, dateLabel.implicitHeight)
                        Flow {
                            id: tags
                            width: parent.width - dateLabel.implicitWidth - 12
                            spacing: 8
                            Label {
                                height: 20
                                verticalAlignment: Text.AlignVCenter
                                text: "v" + release.entry.version
                                mono: true
                                font.weight: Font.DemiBold
                            }
                            Badge { text: release.meta.label; tone: release.meta.tone }
                            Badge { visible: release.isInstalled; text: "Instalada"; tone: "emerald" }
                            Badge { visible: release.isNewer; text: "Disponible"; tone: "violet" }
                        }
                        Label {
                            id: dateLabel
                            anchors.right: parent.right
                            height: 20
                            verticalAlignment: Text.AlignVCenter
                            text: root.fmtDate(release.entry.date)
                            tone: 0.4
                            font.pixelSize: Theme.textXs
                        }
                    }
                    Label {
                        visible: !!release.entry.title
                        width: parent.width
                        text: release.entry.title || ""
                        tone: 0.8
                        wrapMode: Text.WordWrap
                        elide: Text.ElideNone
                    }
                }

                Repeater {
                    model: release.present
                    Column {
                        id: sectionBlock
                        required property var modelData
                        width: releaseBody.width
                        spacing: 6
                        Label {
                            width: parent.width
                            text: sectionBlock.modelData.label
                            tone: 0.45
                            font.pixelSize: Theme.textCaption
                            font.capitalization: Font.AllUppercase
                            font.letterSpacing: 0.5
                        }
                        Column {
                            width: parent.width
                            spacing: 4
                            Repeater {
                                model: release.entry.changes[sectionBlock.modelData.id]
                                Item {
                                    id: change
                                    required property var modelData
                                    width: sectionBlock.width
                                    implicitHeight: changeLabel.implicitHeight
                                    Rectangle {
                                        y: 7
                                        width: 6; height: 6; radius: 3
                                        color: sectionBlock.modelData.dot
                                    }
                                    Label {
                                        id: changeLabel
                                        x: 14
                                        width: parent.width - 14
                                        text: change.modelData
                                        tone: 0.7
                                        font.pixelSize: Theme.textXs
                                        lineHeight: 1.35
                                        wrapMode: Text.WordWrap
                                        elide: Text.ElideNone
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    SettingsSystemButton {
        visible: root.filtered.length > root.collapsedCount
        compact: true
        text: root.expanded ? "Ver menos" : "Ver todas (" + root.filtered.length + ")"
        onClicked: root.expanded = !root.expanded
    }
}
