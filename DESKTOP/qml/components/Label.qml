import QtQuick
import StartCode

/* Texto de la interfaz: familia elegida por el usuario y tinta del tema. */
Text {
    /* Opacidad de la tinta: 1 principal, 0.65–0.45 secundario, 0.35 apagado. */
    property real tone: 1
    property bool mono: false

    color: Theme.ink(tone)
    font.family: mono ? Theme.fontMono : Theme.fontUi
    font.pixelSize: Theme.textSm
    elide: Text.ElideRight
    renderType: Text.QtRendering
}
