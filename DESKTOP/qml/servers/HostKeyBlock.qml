import QtQuick
import StartCode

/* Algoritmo y huella SHA256 de una clave de host, seleccionables para
   copiarlos. `tone: "danger"` marca la que no coincide con la guardada. */
Glass {
    id: root

    property string label: ""
    /* `{ algorithm, fingerprint }` */
    property var info: null
    property string tone: "muted"

    readonly property bool danger: tone === "danger"

    variant: "soft"
    elevation: "flat"
    radius: Theme.radiusXl
    borderColor: danger ? Qt.alpha(Theme.danger, 0.25) : Theme.hairlineSoft
    implicitHeight: column.implicitHeight + 24

    Column {
        id: column
        x: 12; y: 12
        width: root.width - 24

        Label {
            width: parent.width
            text: root.label
            tone: 0.4
            font.pixelSize: Theme.textXs
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.6
        }
        Item { width: 1; height: 6 }
        Label {
            width: parent.width
            text: root.info && root.info.algorithm ? root.info.algorithm : "algoritmo desconocido"
            mono: true
            tone: 0.55
            font.pixelSize: 11
        }
        /* Huella: se parte por cualquier carácter y se puede seleccionar. */
        TextEdit {
            width: parent.width
            text: root.info && root.info.fingerprint ? root.info.fingerprint : ""
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.WrapAnywhere
            color: root.danger ? Theme.tone("rose").text : Theme.ink(0.85)
            selectionColor: Theme.brand1(0.45)
            selectedTextColor: Theme.ink(1)
            font.family: Theme.fontMono
            font.pixelSize: Theme.textSm
        }
    }
}
