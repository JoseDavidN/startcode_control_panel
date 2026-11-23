import QtQuick
import StartCode

/* Texto de solo lectura que se puede seleccionar y copiar: arrastrando,
   con Ctrl+C o con el menú del clic derecho. Para mensajes de error y salidas
   técnicas, que el usuario suele necesitar pegar en otro sitio. */
TextEdit {
    id: root

    /* Opacidad de la tinta, como en `Label`. */
    property real tone: 1
    property bool mono: false

    readOnly: true
    selectByMouse: true
    activeFocusOnPress: true
    textFormat: TextEdit.PlainText
    wrapMode: TextEdit.Wrap
    color: Theme.ink(tone)
    selectionColor: Theme.brand1(0.45)
    selectedTextColor: Theme.ink(1)
    font.family: mono ? Theme.fontMono : Theme.fontUi
    font.pixelSize: Theme.textSm
    renderType: Text.QtRendering

    /* Al perder el foco la selección deja de tener sentido. */
    onActiveFocusChanged: if (!activeFocus && !menu.visible) deselect()

    function copyAll() {
        const start = selectionStart, end = selectionEnd
        selectAll()
        copy()
        select(start, end)
        Toasts.success("Texto copiado")
    }

    /* Solo el botón derecho: el izquierdo sigue seleccionando. */
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.RightButton
        cursorShape: Qt.IBeamCursor
        onClicked: mouse => menu.openAt(root, mouse.x, mouse.y, [
            { label: "Copiar", icon: "copy", enabled: root.selectedText.length > 0, action: () => root.copy() },
            { label: "Copiar todo", icon: "copy", action: () => root.copyAll() },
            { label: "Seleccionar todo", icon: "checkAll", separator: true, action: () => { root.forceActiveFocus(); root.selectAll() } }
        ])
    }

    FloatMenu { id: menu }
}
