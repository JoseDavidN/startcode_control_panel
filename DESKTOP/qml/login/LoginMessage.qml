import QtQuick
import StartCode

/* Aviso en caja del login: error (rosa) o motivo del cierre de la sesión
   anterior (ámbar). */
Glass {
    id: root

    property string text: ""
    /* `error` o `notice`. */
    property string kind: "error"
    property bool centered: false

    readonly property bool isError: kind === "error"

    variant: "soft"
    radius: Theme.radiusXl
    borderColor: Qt.alpha(isError ? Theme.danger : Theme.warn, 0.2)
    implicitHeight: label.implicitHeight + 24

    Accessible.role: isError ? Accessible.AlertMessage : Accessible.StaticText
    Accessible.name: text

    Label {
        id: label
        x: 12; y: 12
        width: root.width - 24
        text: root.text
        color: Theme.tone(root.isError ? "rose" : "amber").text
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
        horizontalAlignment: root.centered ? Text.AlignHCenter : Text.AlignLeft
    }
}
