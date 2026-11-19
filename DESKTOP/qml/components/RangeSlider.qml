import QtQuick
import StartCode

/* Deslizador del sistema (DESIGN.md, «Slider (rango)»). Es controlado, como
   el de React: pinta `value` y pide el cambio con `change`; quien lo usa
   actualiza `value`.

       RangeSlider { width: parent.width; min: 10; max: 100; value: umbral
           onChange: v => umbral = v }

   `step` 0 = continuo. `buffered` (0–100) pinta lo ya cargado de un medio;
   `compact` lo adelgaza y muestra el tirador solo al pasar por encima o con
   foco; `tooltip` (función valor → texto) muestra el valor bajo el puntero.
   `commit` sale al soltar el tirador o la tecla. */
Item {
    id: root

    property real value: 0
    property real min: 0
    property real max: 100
    property real step: 1
    /* Sin franja de carga mientras sea negativo. */
    property real buffered: -1
    property bool compact: false
    property var tooltip: null
    /* Nombre accesible. */
    property string label: ""

    signal change(real value)
    signal commit(real value)

    readonly property real fraction: max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0
    readonly property int thumbSize: compact ? 14 : 18
    readonly property bool pressed: area.pressed
    readonly property bool engaged: area.containsMouse || area.pressed || activeFocus
    /* Posición del puntero (0–1) mientras hay `tooltip`; -1 fuera. */
    property real hoverAt: -1
    /* El anillo de foco solo sale al llegar con el teclado, no al hacer clic. */
    property bool keyFocus: false

    implicitWidth: 160
    implicitHeight: compact ? 16 : 24
    opacity: enabled ? 1 : 0.5
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider
    Accessible.name: label
    Accessible.focusable: true

    onActiveFocusChanged: keyFocus = activeFocus && !area.pressed

    /* Ajusta al rango y al paso; redondea para no arrastrar decimales binarios. */
    function snap(raw) {
        let next = Math.max(root.min, Math.min(root.max, raw))
        if (root.step > 0) next = Math.min(root.max, root.min + Math.round((next - root.min) / root.step) * root.step)
        return Math.round(next * 1e6) / 1e6
    }
    function propose(raw) {
        const next = snap(raw)
        if (next !== root.value) root.change(next)
    }
    function proposeAt(x) {
        if (root.max <= root.min || root.width <= 0) return
        propose(root.min + Math.max(0, Math.min(1, x / root.width)) * (root.max - root.min))
    }
    function isSliderKey(key) {
        return key === Qt.Key_Left || key === Qt.Key_Right || key === Qt.Key_Up || key === Qt.Key_Down
            || key === Qt.Key_Home || key === Qt.Key_End || key === Qt.Key_PageUp || key === Qt.Key_PageDown
    }

    Keys.onPressed: event => {
        if (!isSliderKey(event.key)) return
        const span = root.max - root.min
        const small = root.step > 0 ? root.step : span / 100
        const big = Math.max(small, span / 10)
        switch (event.key) {
        case Qt.Key_Left: case Qt.Key_Down: propose(root.value - small); break
        case Qt.Key_Right: case Qt.Key_Up: propose(root.value + small); break
        case Qt.Key_PageDown: propose(root.value - big); break
        case Qt.Key_PageUp: propose(root.value + big); break
        case Qt.Key_Home: propose(root.min); break
        case Qt.Key_End: propose(root.max); break
        }
        root.keyFocus = true
        event.accepted = true
    }
    Keys.onReleased: event => {
        if (!isSliderKey(event.key) || event.isAutoRepeat) return
        root.commit(root.value)
        event.accepted = true
    }

    /* ── Pista ─────────────────────────────────────────────────────── */
    Rectangle {
        id: track
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        height: root.compact ? (root.engaged ? 6 : 4) : 6
        radius: height / 2
        color: Theme.track
        Behavior on height { NumberAnimation { duration: Theme.moFast } }

        /* Lo ya cargado: la marca al 28 %. */
        Rectangle {
            visible: root.buffered >= 0
            width: parent.width * Math.max(0, Math.min(100, root.buffered)) / 100
            height: parent.height
            radius: height / 2
            color: Theme.brand1(0.28)
            Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 300 } }
        }
        /* Hasta donde apunta el ratón, más suave que lo recorrido. */
        Rectangle {
            visible: root.hoverAt > root.fraction
            x: parent.width * root.fraction
            width: parent.width * Math.max(0, root.hoverAt - root.fraction)
            height: parent.height
            radius: height / 2
            color: Theme.brand2(0.22)
        }
        /* Lo recorrido: el gradiente de marca abarca toda la pista, así que
           el color del extremo sigue a la posición. */
        Rectangle {
            width: parent.width * root.fraction
            height: parent.height
            radius: height / 2
            visible: width > 0
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.brandStart }
                GradientStop {
                    position: 1
                    color: Qt.rgba(Theme.brandStart.r + (Theme.brandEnd.r - Theme.brandStart.r) * root.fraction,
                                   Theme.brandStart.g + (Theme.brandEnd.g - Theme.brandStart.g) * root.fraction,
                                   Theme.brandStart.b + (Theme.brandEnd.b - Theme.brandStart.b) * root.fraction, 1)
                }
            }
        }
    }

    /* ── Tirador: gradiente claro de marca con halo ────────────────── */
    Item {
        id: thumb
        x: root.width * root.fraction - width / 2
        anchors.verticalCenter: parent.verticalCenter
        width: root.thumbSize
        height: root.thumbSize
        z: 1
        opacity: !root.compact || root.engaged ? 1 : 0
        scale: !root.compact || root.engaged ? 1 : 0.75
        Behavior on opacity { NumberAnimation { duration: Theme.moFast } }
        Behavior on scale { NumberAnimation { duration: Theme.moFast } }

        Elevation { anchors.fill: parent; level: "brandSm"; radius: parent.width / 2 }
        Rectangle {
            anchors.fill: parent
            anchors.margins: -4
            radius: width / 2
            color: Theme.brand1(0.22)
        }
        BrandFill {
            anchors.fill: parent
            radius: parent.width / 2
            from: Theme.brandLight1
            to: Theme.brandLight2
        }
        /* Foco de teclado. */
        Rectangle {
            visible: root.keyFocus
            anchors.fill: parent
            anchors.margins: -6
            radius: width / 2
            color: "transparent"
            border.width: 2
            border.color: Theme.focusRing
        }
    }

    /* ── Valor bajo el puntero ─────────────────────────────────────── */
    Glass {
        visible: root.hoverAt >= 0 && root.max > root.min && typeof root.tooltip === "function"
        variant: "float"
        radius: Theme.radiusMd
        z: 3
        width: tipLabel.implicitWidth + 16
        height: tipLabel.implicitHeight + 4
        x: root.width * Math.max(0, root.hoverAt) - width / 2
        y: -height - 8
        Label {
            id: tipLabel
            anchors.centerIn: parent
            text: parent.visible ? String(root.tooltip(root.min + root.hoverAt * (root.max - root.min))) : ""
            mono: true
            tone: 0.9
            font.pixelSize: 11
            elide: Text.ElideNone
        }
    }

    MouseArea {
        id: area
        anchors.fill: parent
        z: 2
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        /* Dentro de una zona con desplazamiento el arrastre es del deslizador. */
        preventStealing: true
        onPressed: mouse => {
            root.keyFocus = false
            root.forceActiveFocus(Qt.MouseFocusReason)
            root.proposeAt(mouse.x)
        }
        onPositionChanged: mouse => {
            if (typeof root.tooltip === "function" && root.width > 0)
                root.hoverAt = Math.max(0, Math.min(1, mouse.x / root.width))
            if (pressed) root.proposeAt(mouse.x)
        }
        onReleased: root.commit(root.value)
        onExited: root.hoverAt = -1
    }
}
