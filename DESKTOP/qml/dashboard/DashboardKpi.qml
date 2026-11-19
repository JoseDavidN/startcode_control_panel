import QtQuick
import StartCode

/* Indicador del panel: cifra grande, texto de apoyo y, si procede, una barra
   con la marca del umbral. Toda la tarjeta es un botón.

       DashboardKpi { label: "CPU"; value: "42"; suffix: "%"; bar: 42; marker: 80
                      status: "ok"; iconName: "cpu"; tone: "blue"; onClicked: … } */
Glass {
    id: root

    property string label: ""
    property string value: "—"
    /* Texto pequeño pegado a la cifra (`%`, `/5`). */
    property string suffix: ""
    property string sub: ""
    property string iconName: ""
    /* Familia de color del icono. */
    property string tone: "violet"
    /* Porcentaje de la barra; negativo = sin barra. */
    property real bar: -1
    /* Marca de referencia sobre la barra (el umbral del usuario); negativo = sin marca. */
    property real marker: -1
    /* `ok`, `warn`, `danger` o vacío: color de la barra y del punto de estado. */
    property string status: ""
    property bool loading: false
    signal clicked()

    readonly property var colors: Theme.tone(tone)
    readonly property color statusColor: status === "danger" ? Theme.danger : status === "warn" ? Theme.warn
                                       : status === "ok" ? Theme.ok : Theme.ink(0.3)
    readonly property var barTones: status === "danger" ? ["rose", "orange"] : status === "warn" ? ["amber", "orange"]
                                  : status === "ok" ? ["emerald", "teal"] : ["violet", "fuchsia"]

    elevation: "raised"
    highlighted: hover.hovered
    borderColor: activeFocus ? Theme.focusRing : highlighted ? Theme.hairlineHover : Theme.hairline
    implicitHeight: 132
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: label + ": " + value + suffix + (sub !== "" ? ", " + sub : "")
    Keys.onReturnPressed: root.clicked()
    Keys.onSpacePressed: root.clicked()

    HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.clicked() }

    Rectangle {
        id: chip
        x: 16; y: 14
        width: 28; height: 28
        radius: Theme.radiusLg
        border.width: 1
        border.color: Qt.alpha(root.colors.base, 0.2)
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.alpha(root.colors.base, 0.25) }
            GradientStop { position: 1; color: Qt.alpha(root.colors.base, 0.05) }
        }
        Icon { anchors.centerIn: parent; name: root.iconName; color: root.colors.text }
    }
    Label {
        anchors.left: chip.right
        anchors.leftMargin: 10
        anchors.right: arrow.left
        anchors.rightMargin: 4
        anchors.verticalCenter: chip.verticalCenter
        text: root.label
        tone: 0.55
        font.pixelSize: 11
        font.weight: Font.Medium
        font.capitalization: Font.AllUppercase
        font.letterSpacing: 0.5
    }
    Icon {
        id: arrow
        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.verticalCenter: chip.verticalCenter
        name: "chevronRight"
        size: 14
        color: Theme.ink(hover.hovered ? 0.8 : 0.25)
    }

    /* Cifra */
    Label {
        id: figure
        visible: !root.loading
        x: 16; y: 50
        width: Math.min(implicitWidth, root.width - 32 - (unit.visible ? unit.implicitWidth + 3 : 0))
        text: root.value
        font.pixelSize: 28
        font.weight: Font.Bold
        font.letterSpacing: -0.5
        font.features: { "tnum": 1 }
    }
    Label {
        id: unit
        visible: !root.loading && root.suffix !== ""
        anchors.left: figure.right
        anchors.leftMargin: 3
        anchors.baseline: figure.baseline
        text: root.suffix
        tone: 0.45
        font.pixelSize: Theme.textSm
        font.weight: Font.DemiBold
    }
    /* Esqueleto mientras llega el primer dato. */
    Rectangle {
        visible: root.loading
        x: 16; y: 58
        width: 72; height: 22
        radius: Theme.radiusMd
        color: Theme.tintActive
        SequentialAnimation on opacity {
            running: root.loading && !Theme.reducedMotion
            loops: Animation.Infinite
            NumberAnimation { from: 1; to: 0.4; duration: 800; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 0.4; to: 1; duration: 800; easing.type: Easing.InOutQuad }
        }
    }

    /* Texto de apoyo con el punto de estado. */
    Rectangle {
        id: dot
        visible: root.status !== "" && !root.loading
        x: 16
        anchors.verticalCenter: support.verticalCenter
        width: 6; height: 6; radius: 3
        color: root.statusColor
    }
    Label {
        id: support
        x: dot.visible ? 28 : 16
        y: 90
        width: root.width - x - 16
        text: root.loading ? "Cargando…" : root.sub
        tone: 0.5
        font.pixelSize: Theme.textXs
    }

    /* Barra con la marca del umbral. */
    Rectangle {
        id: track
        visible: root.bar >= 0 && !root.loading
        x: 16
        y: root.height - 16
        width: root.width - 32
        height: 4
        radius: 2
        color: Theme.track
        Rectangle {
            width: parent.width * Math.max(0, Math.min(100, root.bar)) / 100
            height: parent.height
            radius: 2
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.tone(root.barTones[0]).base }
                GradientStop { position: 1; color: Theme.tone(root.barTones[1]).base }
            }
            Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 700; easing.type: Easing.OutCubic } }
        }
        Rectangle {
            visible: root.marker >= 0 && root.marker <= 100
            x: Math.round(parent.width * root.marker / 100) - 1
            y: -3
            width: 2; height: 10
            radius: 1
            color: Theme.ink(0.55)
        }
    }
}
