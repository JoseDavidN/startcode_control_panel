import QtQuick
import QtQuick.Templates as T
import StartCode

/* Cola de descargas: mismo aspecto que la de subidas, con su propio
   desplazamiento. Un .zip no sabe cuánto medirá hasta terminar: de una
   carpeta solo se enseña lo que lleva. */
Glass {
    id: root

    /* El `SftpDownloads` con la cola. */
    required property var downloads

    variant: "soft"
    radius: Theme.radiusXl

    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
        return bytes + " B"
    }

    function phaseColor(phase) {
        return phase === "downloading" ? Theme.ink(1)
             : phase === "done" ? Theme.tone("emerald").text
             : phase === "error" ? Theme.tone("rose").text
             : phase === "canceled" ? Theme.ink(0.4) : Theme.ink(0.45)
    }

    function phaseLabel(phase, loaded, total) {
        return phase === "done" ? "Listo"
             : phase === "error" ? "Error"
             : phase === "canceled" ? "Cancelado"
             : phase === "queued" ? "En cola"
             : total > 0 ? Math.min(100, loaded / total * 100).toFixed(0) + " %" : formatSize(loaded)
    }

    Item {
        id: head
        width: parent.width
        height: 40
        Label {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            text: "Descargas"
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
        SftpChip {
            visible: root.downloads.finished
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: 24
            plain: true
            tint: Theme.ink(0.55)
            text: "Limpiar terminados"
            onClicked: root.downloads.clearFinished()
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    ListView {
        id: list
        x: 8
        y: head.height + 8
        width: parent.width - 16
        height: Math.max(0, parent.height - y - 8)
        clip: true
        spacing: 6
        boundsBehavior: Flickable.StopAtBounds
        model: root.downloads.model
        T.ScrollBar.vertical: SftpScrollBar { flick: list }

        delegate: Glass {
            id: card
            required property string uid
            required property string remotePath
            required property string fileName
            required property string dest
            required property real loaded
            required property real total
            required property string phase
            required property string errorText

            width: list.width
            height: cardColumn.implicitHeight + 16
            variant: "soft"
            elevation: "flat"
            radius: Theme.radiusLg

            Column {
                id: cardColumn
                x: 10
                y: 8
                width: parent.width - 20
                spacing: 6

                Item {
                    width: parent.width
                    height: 24
                    Label {
                        width: Math.max(0, tail.x - 8)
                        anchors.verticalCenter: parent.verticalCenter
                        text: card.fileName
                        mono: true
                        tone: 0.75
                        font.pixelSize: Theme.textXs
                        elide: Text.ElideMiddle
                        HoverTip { text: card.remotePath + " → " + card.dest }
                    }
                    Row {
                        id: tail
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 8
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.phaseLabel(card.phase, card.loaded, card.total)
                            color: root.phaseColor(card.phase)
                            font.pixelSize: 11
                        }
                        IconButton {
                            visible: card.phase === "downloading" || card.phase === "queued"
                            anchors.verticalCenter: parent.verticalCenter
                            size: 24
                            iconSize: 12
                            iconName: "close"
                            hint: "Cancelar"
                            onClicked: root.downloads.cancel(card.uid)
                        }
                        SftpChip {
                            visible: card.phase === "error"
                            anchors.verticalCenter: parent.verticalCenter
                            implicitHeight: 24
                            tint: Theme.ink(0.7)
                            text: "Reintentar"
                            onClicked: root.downloads.retry(card.uid)
                        }
                        SftpChip {
                            visible: card.phase === "done"
                            anchors.verticalCenter: parent.verticalCenter
                            implicitHeight: 24
                            tint: Theme.ink(0.7)
                            text: "Mostrar"
                            /* Abre la carpeta donde quedó el archivo. */
                            onClicked: App.openExternal(Transfers.parentDir(card.dest))
                        }
                    }
                }
                Rectangle {
                    visible: card.phase === "downloading"
                    width: parent.width
                    height: 4
                    radius: 2
                    color: Theme.track
                    BrandFill {
                        id: bar
                        readonly property bool known: card.total > 0
                        width: known ? parent.width * Math.min(100, card.loaded / card.total * 100) / 100 : parent.width
                        height: parent.height
                        radius: 2
                        visible: width > 0
                        /* Sin tamaño conocido, la barra entera late. */
                        SequentialAnimation on opacity {
                            running: card.phase === "downloading" && !bar.known && !Theme.reducedMotion
                            loops: Animation.Infinite
                            alwaysRunToEnd: true
                            NumberAnimation { to: 0.5; duration: 1000; easing.type: Easing.InOutQuad }
                            NumberAnimation { to: 1; duration: 1000; easing.type: Easing.InOutQuad }
                        }
                    }
                }
                Label {
                    visible: card.errorText !== "" && card.phase === "error"
                    width: parent.width
                    text: card.errorText
                    color: Qt.alpha(Theme.tone("rose").text, 0.8)
                    font.pixelSize: 11
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                }
            }
        }
    }
}
