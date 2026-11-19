import QtQuick
import QtQuick.Templates as T
import StartCode

/* Cola de subidas: ocupa el alto que le deja la columna y desplaza dentro.
   Arriba, el total; debajo, un archivo por fila con su progreso, su error y
   lo que se puede hacer con él (cancelar, reintentar, sobrescribir). */
Glass {
    id: root

    /* El `SftpUploads` con la cola. */
    required property var uploads

    readonly property var totals: uploads.totals
    readonly property real globalPct: totals.bytes > 0 ? totals.loaded / totals.bytes * 100 : 0

    variant: "soft"
    radius: Theme.radiusXl

    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
        if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
        return bytes + " B"
    }

    function phaseColor(phase) {
        return phase === "uploading" ? Theme.ink(1)
             : phase === "done" ? Theme.tone("emerald").text
             : phase === "error" ? Theme.tone("rose").text
             : phase === "conflict" ? Theme.tone("amber").text
             : phase === "canceled" ? Theme.ink(0.4) : Theme.ink(0.45)
    }

    function phaseLabel(phase, pct) {
        return phase === "done" ? "Listo"
             : phase === "conflict" ? "Ya existe"
             : phase === "error" ? "Error"
             : phase === "canceled" ? "Cancelado"
             : phase === "queued" ? "En cola" : pct.toFixed(0) + " %"
    }

    Item {
        id: head
        width: parent.width
        height: 40
        Label {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            text: "Subidas"
            tone: 0.4
            font.pixelSize: Theme.textCaption
            font.weight: Font.DemiBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.5
        }
        SftpChip {
            visible: root.uploads.finished > 0
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: 24
            plain: true
            tint: Theme.ink(0.55)
            text: "Limpiar terminados"
            onClicked: root.uploads.clearFinished()
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Sin subidas ───────────────────────────────────────────────── */
    Column {
        visible: root.totals.files === 0
        anchors.centerIn: parent
        anchors.verticalCenterOffset: head.height / 2
        width: parent.width - 48
        spacing: 8
        SftpIcon {
            anchors.horizontalCenter: parent.horizontalCenter
            kind: "upload"
            size: 24
            color: Theme.ink(0.25)
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
            text: "Lo que subas aparecerá aquí, con su progreso"
            tone: 0.45
            font.pixelSize: Theme.textXs
        }
    }

    /* ── Total ─────────────────────────────────────────────────────── */
    Item {
        id: summary
        visible: root.totals.files > 0
        y: head.height
        width: parent.width
        height: visible ? summaryColumn.implicitHeight + 24 : 0

        Column {
            id: summaryColumn
            x: 12
            y: 12
            width: parent.width - 24
            spacing: 8

            Item {
                width: parent.width
                height: 20
                Label {
                    id: doneLabel
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.totals.done + " de " + root.totals.files
                    font.weight: Font.DemiBold
                }
                Label {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: Math.min(implicitWidth, parent.width - doneLabel.width - 12)
                    horizontalAlignment: Text.AlignRight
                    text: root.formatSize(root.totals.loaded) + " / " + root.formatSize(root.totals.bytes)
                    mono: true
                    tone: 0.45
                    font.pixelSize: 11
                }
            }
            Rectangle {
                width: parent.width
                height: 6
                radius: 3
                color: Theme.track
                BrandFill {
                    width: parent.width * Math.min(100, root.globalPct) / 100
                    height: parent.height
                    radius: 3
                    visible: width > 0
                    Behavior on width { NumberAnimation { duration: Theme.reducedMotion ? 1 : 500 } }
                }
            }
            Flow {
                visible: root.totals.conflicts > 0 || root.totals.failed > 0
                width: parent.width
                spacing: 8
                SftpChip {
                    visible: root.totals.failed > 0
                    tint: Theme.tone("rose").text
                    text: "Reintentar fallidos (" + root.totals.failed + ")"
                    onClicked: root.uploads.retryAllFailed()
                }
                SftpChip {
                    visible: root.totals.conflicts > 0
                    tint: Theme.tone("amber").text
                    text: "Sobrescribir todos (" + root.totals.conflicts + ")"
                    onClicked: root.uploads.retryAllConflicts()
                }
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    }

    /* ── Archivos ──────────────────────────────────────────────────── */
    ListView {
        id: list
        visible: root.totals.files > 0
        x: 8
        y: summary.y + summary.height + 8
        width: parent.width - 16
        height: Math.max(0, parent.height - y - 8)
        clip: true
        spacing: 6
        boundsBehavior: Flickable.StopAtBounds
        model: root.uploads.model
        T.ScrollBar.vertical: SftpScrollBar { flick: list }

        delegate: Glass {
            id: card
            required property string uid
            required property string relPath
            required property real bytes
            required property real loaded
            required property string phase
            required property string errorText
            required property string destDir

            /* El progreso mide bytes entregados a la red, no escritos por SFTP:
               se topa en 99 % hasta que el servidor confirma. */
            readonly property real pct: phase === "done" ? 100
                                      : bytes > 0 ? Math.min(99, loaded / bytes * 100) : 0

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
                        text: card.relPath
                        mono: true
                        tone: 0.75
                        font.pixelSize: Theme.textXs
                        elide: Text.ElideMiddle
                        HoverTip { text: card.destDir + "/" + card.relPath }
                    }
                    Row {
                        id: tail
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 8
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.phaseLabel(card.phase, card.pct)
                            color: root.phaseColor(card.phase)
                            font.pixelSize: 11
                        }
                        IconButton {
                            visible: card.phase === "uploading" || card.phase === "queued"
                            anchors.verticalCenter: parent.verticalCenter
                            size: 24
                            iconSize: 12
                            iconName: "close"
                            hint: "Cancelar"
                            onClicked: root.uploads.cancel(card.uid)
                        }
                        SftpChip {
                            visible: card.phase === "error" || card.phase === "conflict"
                            anchors.verticalCenter: parent.verticalCenter
                            implicitHeight: 24
                            tint: Theme.ink(0.7)
                            text: card.phase === "conflict" ? "Sobrescribir" : "Reintentar"
                            onClicked: root.uploads.retry(card.uid, card.phase === "conflict")
                        }
                    }
                }
                Rectangle {
                    visible: card.phase === "uploading"
                    width: parent.width
                    height: 4
                    radius: 2
                    color: Theme.track
                    BrandFill {
                        width: parent.width * card.pct / 100
                        height: parent.height
                        radius: 2
                        visible: width > 0
                    }
                }
                Label {
                    visible: card.errorText !== "" && card.phase !== "canceled"
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
