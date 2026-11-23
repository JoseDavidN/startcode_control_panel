import QtQuick
import QtQuick.Templates as T
import StartCode

/* Fila de navegación del sidebar: hueco fijo de 40 px para el icono y la
   etiqueta siempre en la misma posición. */
T.Button {
    id: root

    property string iconName
    property bool active: false
    property string badge: ""
    /* Riel: solo el icono; la etiqueta se desvanece sin mover nada. */
    property bool collapsed: false

    implicitHeight: 40
    hoverEnabled: true
    scale: down ? Theme.moPress : 1
    Behavior on scale { NumberAnimation { duration: Theme.moBase; easing.type: Easing.OutBack; easing.overshoot: 2 } }
    Accessible.name: badge !== "" ? text + ", " + badge + " sin leer" : text

    background: Item {
        /* Activo: gradiente de marca al 28 %, borde acentuado y sombra de marca. */
        Elevation {
            anchors.fill: parent
            visible: root.active
            radius: Theme.radiusXl
            level: "brand"
        }
        BrandFill {
            id: activeFill
            anchors.fill: parent
            visible: root.active
            strength: 0.28
            transformOrigin: Item.Center
            /* Pop de selección. */
            onVisibleChanged: if (visible) pop.restart()
            ParallelAnimation {
                id: pop
                NumberAnimation { target: activeFill; property: "opacity"; from: 0.2; to: 1; duration: Theme.moBase }
                NumberAnimation {
                    target: activeFill; property: "scale"; from: Theme.reducedMotion ? 1 : 0.86; to: 1; duration: Theme.moSlow
                    easing.type: Easing.OutBack; easing.overshoot: Theme.moOvershoot
                }
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusXl
            color: !root.active && root.hovered ? Theme.tintHover : "transparent"
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing
                        : root.active ? Theme.hairlineStrong : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
    }

    contentItem: Item {
        Item {
            id: slot
            width: 40; height: 40
            Icon {
                anchors.centerIn: parent
                name: root.iconName
                color: Theme.ink(root.active || root.hovered ? 1 : 0.65)
            }
            Rectangle {
                visible: root.collapsed && root.badge !== ""
                x: 28; y: 6
                width: 6; height: 6; radius: 3
                color: Theme.brandLight2
            }
        }
        Label {
            anchors.left: slot.right
            anchors.leftMargin: 4
            anchors.right: trail.visible ? trail.left : parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            text: root.text
            tone: root.active || root.hovered ? 1 : 0.65
            font.weight: Font.Medium
            opacity: root.collapsed ? 0 : 1
            Behavior on opacity { NumberAnimation { duration: Theme.moFast } }
        }
        Rectangle {
            id: trail
            visible: root.badge !== "" && !root.collapsed
            anchors.right: parent.right
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            width: badgeLabel.implicitWidth + 12
            height: 18
            radius: 4
            color: Theme.brand2(0.2)
            border.width: 1
            border.color: Theme.brand2(0.25)
            Label {
                id: badgeLabel
                anchors.centerIn: parent
                text: root.badge
                color: Theme.brandLight2
                font.pixelSize: Theme.textCaption
                font.weight: Font.DemiBold
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
