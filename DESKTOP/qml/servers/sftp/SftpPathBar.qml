import QtQuick
import QtQuick.Templates as T
import StartCode

/* Ruta editable con sugerencias: al escribir, se listan las carpetas que hay
   en ese punto de la ruta. Elegir una la añade y muestra las suyas, así la
   ruta se construye carpeta a carpeta sin salir del campo. Debajo, la ruta
   actual en migas. */
Item {
    id: root

    property string cwd: ""
    property bool busy: false
    /* Lista una carpeta sin entrar en ella: `peek(ruta, (fallo, { entries }) => …)`. */
    property var peek: null

    signal navigate(string path)
    signal up()
    signal refresh()
    signal newFolder()

    property bool listOpen: false
    property var suggestions: []
    property int active: -1
    /* carpeta → sus subcarpetas; vale solo mientras no se recarga. */
    property var cache: ({})
    /* Descarta la respuesta de una búsqueda que ya no es la última. */
    property int lookup: 0
    /* La lista se cierra sola al quedarse sin opciones: eso no es salir del campo. */
    property bool closingSelf: false

    readonly property bool showList: listOpen && suggestions.length > 0
    readonly property var crumbs: cwd.split("/").filter(part => part !== "")

    implicitHeight: 40 + 8 + crumbRow.height

    function isDir(entry) { return entry.type === "dir" || entry.linkType === "dir" }

    /* «/var/ww» → carpeta «/var» y lo escrito «ww». */
    function splitDraft(draft) {
        const slash = draft.lastIndexOf("/")
        return { parent: slash <= 0 ? "/" : draft.slice(0, slash), prefix: draft.slice(slash + 1) }
    }

    function complete(entry) {
        if (!entry) return
        const parent = splitDraft(input.text).parent
        input.text = (parent === "/" ? "" : parent) + "/" + entry.name + "/"
        listOpen = true
        search.restart()
    }

    function go(path) {
        listOpen = false
        const clean = path.trim().replace(/(.)\/+$/, "$1")
        if (clean !== "") navigate(clean)
    }

    function suggest() {
        if (!listOpen || !peek) return
        const parts = splitDraft(input.text)
        const ticket = ++lookup
        const show = dirs => {
            if (ticket !== root.lookup) return
            const needle = parts.prefix.toLowerCase()
            root.suggestions = dirs
                .filter(d => needle.startsWith(".") || !d.name.startsWith("."))
                .filter(d => d.name.toLowerCase().startsWith(needle))
                .slice(0, 200)
            root.active = -1
        }
        const cached = cache[parts.parent]
        if (cached) return show(cached)
        peek(parts.parent, (failure, result) => {
            if (failure) {
                if (ticket === root.lookup) root.suggestions = []
                return
            }
            const dirs = result.entries.filter(root.isDir)
            root.cache[parts.parent] = dirs
            show(dirs)
        })
    }

    /* La ruta cambia también al navegar desde la lista: el campo la sigue. */
    onCwdChanged: {
        input.text = cwd
        listOpen = false
    }
    /* Lo que hay en disco cambia al subir o crear carpetas. */
    onBusyChanged: cache = ({})
    onListOpenChanged: {
        if (listOpen) search.restart()
        else {
            search.stop()
            lookup++
        }
    }
    onShowListChanged: {
        if (showList) return dropdown.open()
        closingSelf = true
        dropdown.close()
        closingSelf = false
    }
    /* La opción resaltada con el teclado siempre a la vista. */
    onActiveChanged: if (active >= 0) options.positionViewAtIndex(active, ListView.Contain)

    /* Botón cuadrado de la barra, en la medida del campo. */
    component BarButton: T.Button {
        id: barButton
        property string kind
        property string hint
        implicitWidth: 40
        implicitHeight: 40
        hoverEnabled: true
        opacity: enabled ? 1 : 0.4
        Accessible.name: hint
        background: Glass {
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            highlighted: barButton.hovered
            borderColor: barButton.visualFocus ? Theme.focusRing
                       : barButton.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        contentItem: Item {
            SftpIcon {
                anchors.centerIn: parent
                kind: barButton.kind
                size: 16
                color: Theme.ink(barButton.hovered ? 1 : 0.7)
            }
        }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        HoverTip { text: barButton.hint }
    }

    component Crumb: Rectangle {
        id: crumb
        property string text
        property bool current: false
        signal picked()
        width: crumbLabel.implicitWidth + 12
        height: 22
        radius: Theme.radiusMd
        color: crumbHover.hovered ? Theme.tintHover : "transparent"
        Label {
            id: crumbLabel
            anchors.centerIn: parent
            text: crumb.text
            mono: true
            tone: crumb.current || crumbHover.hovered ? 1 : 0.45
            font.pixelSize: Theme.textXs
        }
        HoverHandler { id: crumbHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: crumb.picked() }
    }

    Timer { id: search; interval: 120; onTriggered: root.suggest() }

    Glass {
        id: field
        width: parent.width - (buttons.width + 8)
        height: 40
        variant: "input"
        focused: input.activeFocus

        Label {
            x: 14
            width: parent.width - 28
            anchors.verticalCenter: parent.verticalCenter
            visible: input.text.length === 0
            text: "/ruta/en/el/servidor"
            mono: true
            tone: 0.3
        }
        TextInput {
            id: input
            x: 14
            width: parent.width - 28
            height: parent.height
            clip: true
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.ink(0.9)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: Theme.textSm
            selectByMouse: true
            activeFocusOnTab: true
            inputMethodHints: Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase
            Accessible.name: "Ruta en el servidor"

            onTextEdited: {
                root.listOpen = true
                search.restart()
            }
            onActiveFocusChanged: root.listOpen = activeFocus

            Keys.onDownPressed: event => {
                if (root.suggestions.length === 0) { event.accepted = false; return }
                root.listOpen = true
                root.active = Math.min(root.suggestions.length - 1, root.active + 1)
            }
            Keys.onUpPressed: event => {
                if (root.suggestions.length === 0) { event.accepted = false; return }
                root.active = Math.max(0, root.active - 1)
            }
            Keys.onTabPressed: event => {
                if (!root.showList) { event.accepted = false; return }
                root.complete(root.suggestions[Math.max(0, root.active)])
            }
            Keys.onReturnPressed: submit()
            Keys.onEnterPressed: submit()
            Keys.onEscapePressed: event => {
                /* Solo cierra las sugerencias, no el modal. */
                if (!root.listOpen) { event.accepted = false; return }
                root.listOpen = false
                input.text = root.cwd
            }

            function submit() {
                if (root.showList && root.active >= 0) root.complete(root.suggestions[root.active])
                else root.go(input.text)
            }
        }

        TapHandler {
            gesturePolicy: TapHandler.ReleaseWithinBounds
            onTapped: input.forceActiveFocus()
        }
        HoverHandler { cursorShape: Qt.IBeamCursor }

        T.Popup {
            id: dropdown
            y: field.height + 6
            width: field.width
            height: Math.min(288, options.contentHeight + 8)
            padding: 4
            /* El foco se queda en el campo: se sigue escribiendo con la lista abierta. */
            focus: false
            closePolicy: T.Popup.CloseOnPressOutsideParent
            /* Un clic fuera del campo y de la lista equivale a salir del campo. */
            onAboutToHide: if (!root.closingSelf) root.listOpen = false

            enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
            background: Glass { variant: "float"; radius: Theme.radiusXl }

            contentItem: ListView {
                id: options
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                model: root.suggestions
                T.ScrollBar.vertical: SftpScrollBar { flick: options }

                delegate: Rectangle {
                    id: option
                    required property var modelData
                    required property int index
                    width: options.width
                    height: 32
                    radius: Theme.radiusLg
                    color: index === root.active ? Theme.tintHover : "transparent"
                    Accessible.role: Accessible.ListItem
                    Accessible.name: modelData.name

                    SftpIcon {
                        id: glyph
                        x: 10
                        anchors.verticalCenter: parent.verticalCenter
                        kind: "folder"
                        color: Theme.tone("violet").text
                    }
                    Label {
                        x: 36
                        width: parent.width - 46
                        anchors.verticalCenter: parent.verticalCenter
                        text: option.modelData.name
                        mono: true
                        tone: option.index === root.active ? 1 : 0.75
                    }
                    HoverHandler {
                        cursorShape: Qt.PointingHandCursor
                        onHoveredChanged: if (hovered) root.active = option.index
                    }
                    TapHandler {
                        gesturePolicy: TapHandler.ReleaseWithinBounds
                        onTapped: root.complete(option.modelData)
                        onDoubleTapped: root.go(option.modelData.path)
                    }
                }
            }
        }
    }

    Row {
        id: buttons
        anchors.right: parent.right
        spacing: 8

        BarButton { kind: "arrowUp"; hint: "Subir un nivel"; enabled: root.cwd !== "/" && !root.busy; onClicked: root.up() }
        BarButton { kind: "refresh"; hint: "Recargar"; enabled: !root.busy; onClicked: root.refresh() }
        BarButton { kind: "folderPlus"; hint: "Nueva carpeta"; enabled: !root.busy; onClicked: root.newFolder() }
    }

    /* Migas: lo que no cabe se corta por la derecha. */
    Item {
        id: crumbRow
        y: 48
        width: parent.width
        height: 22
        clip: true

        Row {
            spacing: 4
            Crumb { text: "/"; onPicked: root.navigate("/") }
            Repeater {
                model: root.crumbs
                Row {
                    id: step
                    required property string modelData
                    required property int index
                    spacing: 4
                    Label {
                        anchors.verticalCenter: parent.verticalCenter
                        text: "/"
                        mono: true
                        tone: 0.25
                        font.pixelSize: Theme.textXs
                    }
                    Crumb {
                        text: step.modelData
                        current: step.index === root.crumbs.length - 1
                        onPicked: root.navigate("/" + root.crumbs.slice(0, step.index + 1).join("/"))
                    }
                }
            }
        }
    }
}
