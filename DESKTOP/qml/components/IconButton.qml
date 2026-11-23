import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón cuadrado con un icono (cristal suave). `hint` es el texto de ayuda
   y el nombre accesible. `danger` lo tiñe de rojo al pasar por encima. */
T.Button {
    id: root

    property string iconName
    property int size: 36
    property int iconSize: size >= 40 ? 18 : 16
    property string hint: ""
    property bool danger: false
    /* Sin fondo: solo el icono (acciones dentro de filas). */
    property bool plain: false

    implicitWidth: size
    implicitHeight: size
    hoverEnabled: true
    opacity: enabled ? 1 : 0.4
    scale: !enabled || Theme.reducedMotion ? 1 : down ? 0.88 : hovered ? 1.08 : 1
    Behavior on scale { NumberAnimation { duration: Theme.moBase; easing.type: Easing.OutBack; easing.overshoot: 2 } }
    Accessible.name: hint

    background: Item {
        Glass {
            anchors.fill: parent
            visible: !root.plain
            variant: "soft"
            elevation: "flat"
            radius: root.size >= 36 ? Theme.radiusXl : Theme.radiusLg
            highlighted: root.hovered
            borderColor: root.visualFocus ? Theme.focusRing : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        Rectangle {
            anchors.fill: parent
            visible: root.plain
            radius: Theme.radiusLg
            color: root.hovered ? Theme.tintHover : "transparent"
        }
    }
    contentItem: Item {
        Icon {
            anchors.centerIn: parent
            name: root.iconName
            size: root.iconSize
            color: root.hovered ? (root.danger ? Theme.danger : Theme.ink(0.95)) : Theme.ink(0.6)
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
    HoverTip { text: root.hint }
}
