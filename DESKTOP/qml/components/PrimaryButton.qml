import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón primario: gradiente de marca y sombra de marca. */
T.Button {
    id: root

    property bool loading: false

    implicitHeight: Theme.controlHeight
    implicitWidth: Math.max(88, row.implicitWidth + 32)
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    scale: !enabled ? 1 : down ? Theme.moPress : hovered ? Theme.moHover : 1
    Behavior on scale { NumberAnimation { duration: Theme.moBase; easing.type: Easing.OutBack; easing.overshoot: 2 } }

    background: Item {
        Elevation {
            anchors.fill: parent
            radius: Theme.radiusXl
            level: root.hovered && root.enabled ? "brandHi" : "brand"
        }
        BrandFill { anchors.fill: parent }
        Rectangle {
            visible: root.visualFocus
            anchors.fill: parent
            anchors.margins: -3
            radius: Theme.radiusXl + 3
            color: "transparent"
            border.width: 2
            border.color: Theme.focusRing
        }
    }

    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 8
            Spinner {
                visible: root.loading
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.onBrand
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: root.text
                color: Theme.onBrand
                font.weight: Font.DemiBold
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
