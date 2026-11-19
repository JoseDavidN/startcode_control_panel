import QtQuick
import QtQuick.Effects
import StartCode

/* Texto con el gradiente claro de marca (`.text-grad-brand`): el texto hace
   de máscara de un relleno a 135°. El gradiente abarca la caja del elemento,
   así que conviene que mida lo que el texto (no más ancho). */
Item {
    id: root

    property alias text: label.text
    property alias font: label.font
    property alias wrapMode: label.wrapMode
    property alias horizontalAlignment: label.horizontalAlignment

    implicitWidth: label.implicitWidth
    implicitHeight: label.implicitHeight

    Accessible.role: Accessible.StaticText
    Accessible.name: label.text

    Text {
        id: label
        anchors.fill: parent
        visible: false
        layer.enabled: true
        /* Solo cuenta su alfa: es la máscara. */
        color: Theme.onBrand
        font.family: Theme.fontUi
        font.pixelSize: Theme.textSm
        renderType: Text.QtRendering
    }
    BrandFill {
        id: fill
        anchors.fill: parent
        radius: 0
        from: Theme.brandLight1
        to: Theme.brandLight2
        visible: false
        layer.enabled: true
    }
    MultiEffect {
        anchors.fill: parent
        source: fill
        maskEnabled: true
        maskSource: label
    }
}
