import QtQuick
import QtQuick.Effects
import QtQuick.Templates as T
import StartCode

/* Botón principal del login: como `PrimaryButton`, pero de 48 px, con icono
   a la derecha del texto, texto propio mientras carga y un brillo que lo
   cruza al pasar el ratón. */
T.Button {
    id: root

    property bool loading: false
    /* Texto mientras `loading` (vacío = el normal). */
    property string loadingText: ""
    /* Trazo SVG (rejilla de 24) del icono final; vacío = sin icono. */
    property string iconPath: ""

    implicitHeight: 48
    implicitWidth: Math.max(120, row.implicitWidth + 32)
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    scale: down ? 0.98 : 1
    Behavior on scale { NumberAnimation { duration: Theme.moFast } }

    Accessible.name: loading && loadingText !== "" ? loadingText : text

    background: Item {
        Elevation {
            anchors.fill: parent
            radius: Theme.radiusXl
            level: root.hovered && root.enabled ? "brandHi" : "brand"
        }
        BrandFill { anchors.fill: parent }

        /* Brillo: solo existe mientras el ratón está encima. */
        Loader {
            anchors.fill: parent
            active: root.hovered && root.enabled && !Theme.reducedMotion
            sourceComponent: Item {
                Item {
                    id: sweep
                    anchors.fill: parent
                    clip: true
                    visible: false
                    layer.enabled: true
                    Rectangle {
                        width: parent.width
                        height: parent.height
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: Qt.alpha(Theme.onBrand, 0) }
                            GradientStop { position: 0.5; color: Qt.alpha(Theme.onBrand, 0.2) }
                            GradientStop { position: 1; color: Qt.alpha(Theme.onBrand, 0) }
                        }
                        NumberAnimation on x {
                            from: -root.width; to: root.width
                            duration: 700
                            easing.type: Easing.InOutQuad
                        }
                    }
                }
                Rectangle {
                    id: shape
                    anchors.fill: parent
                    radius: Theme.radiusXl
                    visible: false
                    layer.enabled: true
                }
                MultiEffect {
                    anchors.fill: parent
                    source: sweep
                    maskEnabled: true
                    maskSource: shape
                }
            }
        }

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
            spacing: 10
            Spinner {
                visible: root.loading
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.onBrand
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                text: root.loading && root.loadingText !== "" ? root.loadingText : root.text
                color: Theme.onBrand
                font.pixelSize: Theme.textBase
                font.weight: Font.DemiBold
                font.letterSpacing: 0.4
            }
            Icon {
                visible: root.iconPath !== "" && !root.loading
                anchors.verticalCenter: parent.verticalCenter
                path: root.iconPath
                size: 20
                strokeWidth: 1.6
                color: Theme.onBrand
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
