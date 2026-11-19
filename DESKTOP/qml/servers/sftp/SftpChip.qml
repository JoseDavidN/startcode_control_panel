import QtQuick
import QtQuick.Templates as T
import StartCode

/* Botón compacto de las cabeceras y las colas del explorador: cristal suave
   (o solo texto con `plain`), letra de 11 px y, si se quiere, un icono. */
T.Button {
    id: root

    /* Icono de `SftpIcon` (download, upload…); vacío, sin icono. */
    property string iconKind: ""
    property int iconSize: 14
    /* Color del texto y del icono en reposo; al pasar por encima, tinta plena. */
    property color tint: Theme.ink(0.8)
    /* Sin cristal: solo el tinte al pasar por encima. */
    property bool plain: false
    /* Relleno suave de marca (opción activa). */
    property bool active: false
    property bool pill: false
    property string hint: ""
    property int fontSize: 11

    implicitHeight: 28
    implicitWidth: row.implicitWidth + (text === "" ? 0 : 20) + (text === "" ? implicitHeight - iconSize : 0)
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    Accessible.name: text !== "" ? text : hint

    background: Item {
        Glass {
            anchors.fill: parent
            visible: !root.plain && !root.active
            variant: "soft"
            elevation: "flat"
            radius: root.pill ? height / 2 : Theme.radiusLg
            highlighted: root.hovered
            borderColor: root.visualFocus ? Theme.focusRing : root.hovered ? Theme.hairlineHover : Theme.hairlineSoft
        }
        Rectangle {
            anchors.fill: parent
            visible: root.plain && !root.active
            radius: root.pill ? height / 2 : Theme.radiusLg
            color: root.hovered ? Theme.tintHover : "transparent"
            border.width: root.visualFocus ? 1 : 0
            border.color: Theme.focusRing
        }
        BrandFill {
            anchors.fill: parent
            visible: root.active
            radius: root.pill ? height / 2 : Theme.radiusLg
            strength: 0.28
        }
    }

    contentItem: Item {
        Row {
            id: row
            anchors.centerIn: parent
            spacing: 6
            SftpIcon {
                visible: root.iconKind !== ""
                anchors.verticalCenter: parent.verticalCenter
                kind: root.iconKind
                size: root.iconSize
                color: root.hovered || root.active ? Theme.ink(1) : root.tint
            }
            Label {
                visible: root.text !== ""
                anchors.verticalCenter: parent.verticalCenter
                text: root.text
                color: root.hovered || root.active ? Theme.ink(1) : root.tint
                font.pixelSize: root.fontSize
                font.weight: Font.Medium
            }
        }
    }

    HoverHandler { cursorShape: Qt.PointingHandCursor }
    HoverTip { text: root.hint }
}
