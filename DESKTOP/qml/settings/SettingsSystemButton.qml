import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón con icono de las pestañas Asistente IA y Sistema. `kind` elige la
   receta: `soft` (cristal), `active` (conmutado), `danger` (rojo tenue),
   `dangerSolid` (confirmación destructiva) y `brand` (acción principal).
   Con `loading` el icono pasa a ser el indicador de carga. */
T.Button {
    id: root

    property string iconName: ""
    property string kind: "soft"
    property bool loading: false
    /* 36 px y texto pequeño (los botones dentro de filas). */
    property bool compact: false
    property string hint: ""

    readonly property color inkColor: kind === "danger" ? Theme.danger
                                    : kind === "dangerSolid" || kind === "brand" ? Theme.onBrand
                                    : kind === "active" ? Theme.brandLight1
                                    : Theme.ink(hovered ? 1 : 0.85)

    implicitHeight: compact ? 36 : Theme.controlHeight
    implicitWidth: row.implicitWidth + 32
    hoverEnabled: true
    opacity: enabled ? 1 : 0.45
    scale: down ? 0.98 : 1
    Accessible.name: text
    Behavior on scale { NumberAnimation { duration: Theme.moFast } }

    background: Item {
        Glass {
            anchors.fill: parent
            visible: root.kind === "soft"
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusXl
            highlighted: root.hovered
            borderColor: root.visualFocus ? Theme.focusRing : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        Rectangle {
            anchors.fill: parent
            visible: root.kind === "active"
            radius: Theme.radiusXl
            color: Theme.brand1(0.15)
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing : Theme.brand1(0.2)
        }
        Rectangle {
            anchors.fill: parent
            visible: root.kind === "danger" || root.kind === "dangerSolid"
            radius: Theme.radiusXl
            color: root.kind === "danger" ? Qt.alpha(Theme.danger, root.hovered ? 0.2 : 0.1)
                                          : Qt.alpha(Theme.danger, root.hovered ? 1 : 0.8)
            border.width: 1
            border.color: root.visualFocus ? Theme.focusRing : Qt.alpha(Theme.danger, 0.2)
            Behavior on color { ColorAnimation { duration: Theme.moFast } }
        }
        Elevation {
            anchors.fill: parent
            visible: root.kind === "brand"
            radius: Theme.radiusXl
            level: root.compact ? "brandSm" : root.hovered && root.enabled ? "brandHi" : "brand"
        }
        BrandFill { anchors.fill: parent; visible: root.kind === "brand" }
        Rectangle {
            visible: root.kind === "brand" && root.visualFocus
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
                size: root.compact ? 14 : 16
                color: root.inkColor
            }
            Icon {
                visible: !root.loading && root.iconName !== ""
                anchors.verticalCenter: parent.verticalCenter
                name: root.iconName
                size: root.compact ? 14 : 16
                color: root.inkColor
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: root.text
                color: root.inkColor
                font.pixelSize: root.compact ? Theme.textXs : Theme.textSm
                font.weight: root.kind === "brand" || root.kind === "dangerSolid" ? Font.DemiBold : Font.Medium
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
    HoverTip { text: root.hint }
}
