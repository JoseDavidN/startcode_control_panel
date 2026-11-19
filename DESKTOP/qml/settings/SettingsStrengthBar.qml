import QtQuick
import StartCode

/* Nivel de seguridad de una contraseña, con los colores de marca. */
Column {
    id: root

    property string pw: ""

    readonly property int score: (pw.length >= 8 ? 1 : 0) + (pw.length >= 12 ? 1 : 0) + (/[A-Z]/.test(pw) ? 1 : 0)
                               + (/[0-9]/.test(pw) ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0)
    readonly property string strengthLabel: pw === "" ? "" : score <= 1 ? "Muy débil" : score === 2 ? "Débil"
                                          : score === 3 ? "Media" : score === 4 ? "Fuerte" : "Muy fuerte"

    spacing: 6

    Item {
        width: root.width
        height: 16
        Label { text: "Nivel de seguridad"; tone: 0.45; font.pixelSize: Theme.textXs }
        Label {
            anchors.right: parent.right
            text: root.pw !== "" ? root.strengthLabel : "—"
            color: root.pw !== "" ? Theme.brandLight1 : Theme.ink(0.3)
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
    }
    Rectangle {
        width: root.width
        height: 8
        radius: 4
        color: Theme.track
        clip: true
        BrandFill {
            width: parent.width * (root.pw === "" ? 0 : root.score / 5)
            height: parent.height
            radius: 4
            Behavior on width { NumberAnimation { duration: 300 } }
        }
    }
}
