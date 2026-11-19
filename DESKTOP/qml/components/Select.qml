import QtQuick
import QtQuick.Templates as T
import StartCode

/* Desplegable del sistema. Es solo el disparador: el campo lo pone quien lo
   usa (normalmente un `Glass { variant: "input" }` de 44 px que lo rodea).

       Glass { variant: "input"; implicitHeight: 44
           Select { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14
               value: os; options: [{ value: "ubuntu", label: "Ubuntu", hint: "apt" }]
               onPicked: value => os = value } }
*/
Item {
    id: root

    /* `[{ value, label, hint? }]` */
    property var options: []
    property var value
    property string placeholder: "Seleccionar"
    signal picked(var value)

    readonly property var current: options.find(o => o.value === value)
    property int highlighted: -1

    implicitHeight: 44
    implicitWidth: 200
    activeFocusOnTab: true
    Accessible.role: Accessible.ComboBox

    function toggle() {
        if (!enabled) return
        if (list.visible) { list.close(); return }
        highlighted = options.findIndex(o => o.value === value)
        list.open()
    }
    function choose(index) {
        if (index < 0 || index >= options.length) return
        list.close()
        picked(options[index].value)
    }

    Keys.onPressed: event => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            if (list.visible) choose(highlighted); else toggle()
            event.accepted = true
        } else if (event.key === Qt.Key_Down) {
            if (!list.visible) toggle(); else highlighted = Math.min(options.length - 1, highlighted + 1)
            event.accepted = true
        } else if (event.key === Qt.Key_Up) {
            highlighted = Math.max(0, highlighted - 1)
            event.accepted = true
        } else if (event.key === Qt.Key_Home) { highlighted = 0; event.accepted = true }
        else if (event.key === Qt.Key_End) { highlighted = options.length - 1; event.accepted = true }
        else if (event.text.length === 1 && list.visible) {
            const index = options.findIndex(o => String(o.label).toLowerCase().startsWith(event.text.toLowerCase()))
            if (index >= 0) highlighted = index
        }
    }

    Label {
        anchors.left: parent.left
        anchors.right: chevron.left
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: root.current ? root.current.label : root.placeholder
        tone: root.current ? 0.9 : 0.3
        opacity: root.enabled ? 1 : 0.5
    }
    Icon {
        id: chevron
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        name: "chevronDown"
        color: Theme.ink(0.45)
        rotation: list.visible ? 180 : 0
        Behavior on rotation { NumberAnimation { duration: Theme.moFast } }
    }
    HoverHandler { cursorShape: root.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor }
    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: { root.forceActiveFocus(); root.toggle() } }

    T.Popup {
        id: list
        parent: T.Overlay.overlay
        padding: 6
        /* La lista se alinea con el campo que rodea al disparador. */
        readonly property Item field: root.parent && root.parent.variant === "input" ? root.parent : root
        width: Math.max(160, field.width)
        height: Math.min(280, column.implicitHeight + 12)
        closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutsideParent
        onAboutToShow: {
            const overlay = T.Overlay.overlay
            const below = field.mapToItem(overlay, 0, field.height + 6)
            x = Math.max(8, Math.min(below.x, overlay.width - width - 8))
            /* Hacia arriba si abajo no cabe. */
            y = below.y + height > overlay.height - 8 ? field.mapToItem(overlay, 0, -height - 6).y : below.y
        }
        enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.moFast } }
        background: Glass { variant: "float"; radius: Theme.radiusXl }
        contentItem: ScrollArea {
            contentHeight: column.implicitHeight
            Column {
                id: column
                width: parent.width
                Repeater {
                    model: root.options
                    Rectangle {
                        id: option
                        required property var modelData
                        required property int index
                        readonly property bool chosen: modelData.value === root.value
                        width: column.width
                        height: 34
                        radius: Theme.radiusLg
                        color: optionHover.hovered || root.highlighted === index ? Theme.tintHover : "transparent"
                        Label {
                            x: 10
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - 20 - (hint.visible ? hint.width + 8 : 0) - (check.visible ? 24 : 0)
                            text: option.modelData.label
                            tone: option.chosen ? 1 : 0.8
                            font.pixelSize: 13
                        }
                        Label {
                            id: hint
                            visible: !!option.modelData.hint
                            anchors.right: check.visible ? check.left : parent.right
                            anchors.rightMargin: 10
                            anchors.verticalCenter: parent.verticalCenter
                            text: option.modelData.hint || ""
                            mono: true
                            tone: 0.4
                            font.pixelSize: 11
                        }
                        Icon {
                            id: check
                            visible: option.chosen
                            anchors.right: parent.right
                            anchors.rightMargin: 10
                            anchors.verticalCenter: parent.verticalCenter
                            name: "check"
                            color: Theme.brandLight1
                        }
                        HoverHandler { id: optionHover; cursorShape: Qt.PointingHandCursor }
                        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.choose(option.index) }
                    }
                }
            }
        }
    }
}
