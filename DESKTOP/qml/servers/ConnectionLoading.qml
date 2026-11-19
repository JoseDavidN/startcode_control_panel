import QtQuick
import StartCode

/* Pantalla de proceso: una sola actividad a la vista, la que está pasando.

   Una lista con todos los pasos a la vez no se lee —parece que no avanza
   nada—, así que se enseña la actividad en curso, la anterior ya resuelta en
   pequeño, y cuánto falta. Los estados los manda quien la usa: aquí no se
   inventa progreso con temporizadores.

       ConnectionLoading { width: …; status: "running"
           activities: [{ id, label, status, detail }]
           onComplete: … }   // un momento después del éxito
*/
Item {
    id: root

    /* 'running' mientras se trabaja, 'success' al terminar, 'error' si algo falló. */
    property string status: "running"
    /* `[{ id, label, status: pending|running|done|failed|skipped, detail? }]` */
    property var activities: []
    property string title: ""
    property string subtitle: ""
    property string successTitle: "Listo"
    property string successSubtitle: ""

    /* Se dispara un momento después del éxito, para que se vea el visto bueno. */
    signal complete()

    readonly property var items: Array.from(activities || [])
    readonly property int doneCount: items.filter(a => a.status === "done").length
    readonly property var failed: items.find(a => a.status === "failed") || null
    readonly property var active: items.find(a => a.status === "running") || null
    /* Qué se enseña en grande: lo que falló, lo que está pasando, o el final. */
    readonly property var current: failed || active || (items.length > 0 ? items[items.length - 1] : null)
    readonly property var previous: {
        if (!current) return null
        const index = items.findIndex(a => a.id === current.id)
        for (let i = index - 1; i >= 0; i--) {
            if (items[i].status === "done") return items[i]
        }
        return null
    }
    readonly property bool isError: status === "error" || failed !== null
    readonly property bool isDone: status === "success"
    readonly property real percent: (doneCount / Math.max(1, items.length)) * 100
    readonly property string shownSubtitle: isDone ? successSubtitle : subtitle

    implicitWidth: 384
    implicitHeight: card.height

    /* Tiempo que se mantiene el estado final antes de avisar. */
    Timer { id: hold; interval: 1200; onTriggered: root.complete() }
    onStatusChanged: { if (status === "success") hold.restart(); else hold.stop() }
    Component.onCompleted: if (status === "success") hold.restart()

    Glass {
        id: card
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(384, root.width)
        height: column.implicitHeight + 56
        variant: "soft"
        elevation: "raised"
        radius: Theme.radius2xl

        Column {
            id: column
            x: 28; y: 28
            width: card.width - 56

            /* Indicador */
            Item {
                width: parent.width
                height: 64 + 20
                Item {
                    width: 64; height: 64
                    anchors.horizontalCenter: parent.horizontalCenter
                    Rectangle {
                        anchors.fill: parent
                        radius: 32
                        color: "transparent"
                        border.width: 2
                        border.color: root.isDone ? Qt.alpha(Theme.ok, 0.6)
                                    : root.isError ? Qt.alpha(Theme.danger, 0.6) : Theme.hairline
                    }
                    Spinner {
                        visible: !root.isDone && !root.isError
                        size: 64
                        color: Theme.brandLight1
                    }
                    Icon {
                        anchors.centerIn: parent
                        size: 28
                        name: root.isDone ? "check" : root.isError ? "close" : "server"
                        strokeWidth: root.isDone || root.isError ? 2 : 1.75
                        color: root.isDone ? Theme.tone("emerald").text
                             : root.isError ? Theme.tone("rose").text : Theme.ink(0.6)
                    }
                }
            }

            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: root.isDone ? root.successTitle : (root.title !== "" ? root.title : "Trabajando en el servidor")
                font.pixelSize: Theme.textBase
                font.weight: Font.DemiBold
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Item { width: 1; height: 4 }
            Item {
                visible: root.shownSubtitle !== ""
                width: parent.width
                height: subtitleLabel.implicitHeight + 20
                Label {
                    id: subtitleLabel
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: root.shownSubtitle
                    tone: 0.45
                    font.pixelSize: Theme.textXs
                    wrapMode: Text.WordWrap
                    elide: Text.ElideNone
                }
            }

            /* Actividad en curso: una sola, la que importa ahora */
            Item {
                visible: !root.isDone && root.current !== null
                width: parent.width
                height: currentBox.height + 12

                Item {
                    id: currentBox
                    width: parent.width
                    height: currentColumn.implicitHeight + 28

                    Glass {
                        anchors.fill: parent
                        visible: !root.isError
                        variant: "soft"
                        elevation: "flat"
                        radius: Theme.radiusXl
                        borderColor: Theme.brand1(0.25)
                    }
                    Rectangle {
                        anchors.fill: parent
                        visible: root.isError
                        radius: Theme.radiusXl
                        color: Qt.alpha(Theme.danger, 0.07)
                        border.width: 1
                        border.color: Qt.alpha(Theme.danger, 0.25)
                    }

                    Column {
                        id: currentColumn
                        x: 14; y: 14
                        width: parent.width - 28
                        spacing: 6

                        Item {
                            width: parent.width
                            height: Math.max(14, currentLabel.implicitHeight)
                            Rectangle {
                                visible: root.isError
                                x: 3
                                anchors.verticalCenter: parent.verticalCenter
                                width: 8; height: 8; radius: 4
                                color: Theme.danger
                            }
                            Spinner {
                                visible: !root.isError
                                anchors.verticalCenter: parent.verticalCenter
                                size: 14
                                color: Theme.brandLight1
                            }
                            Label {
                                id: currentLabel
                                x: 26
                                width: parent.width - 26
                                anchors.verticalCenter: parent.verticalCenter
                                text: root.current ? root.current.label : ""
                                color: root.isError ? Theme.tone("rose").text : Theme.ink(1)
                                font.weight: Font.Medium
                            }
                        }
                        Label {
                            visible: text !== ""
                            x: 26
                            width: parent.width - 26
                            text: root.current && root.current.detail ? root.current.detail : ""
                            mono: true
                            tone: 0.45
                            font.pixelSize: 11
                            HoverTip { text: parent.text }
                        }
                    }
                }
            }

            /* La anterior, ya resuelta: da la sensación de avance sin llenar la caja */
            Item {
                visible: !root.isDone && root.previous !== null
                width: parent.width
                height: 16 + 16
                Icon {
                    id: previousIcon
                    x: 4
                    name: "check"
                    size: 14
                    strokeWidth: 2
                    color: Qt.alpha(Theme.tone("emerald").text, 0.8)
                }
                Label {
                    x: 4 + 14 + 8
                    width: parent.width - x
                    anchors.verticalCenter: previousIcon.verticalCenter
                    text: root.previous ? root.previous.label : ""
                    color: Qt.alpha(Theme.tone("emerald").text, 0.8)
                    font.pixelSize: Theme.textXs
                }
            }

            /* Progreso */
            Rectangle {
                id: track
                width: parent.width
                height: 6
                radius: 3
                color: Theme.track
                clip: true

                Item {
                    height: parent.height
                    width: track.width * Math.max(root.isError ? 0 : 4, root.percent) / 100
                    Behavior on width { NumberAnimation { duration: 500; easing.type: Easing.OutCubic } }
                    BrandFill {
                        anchors.fill: parent
                        visible: !root.isError
                        radius: 3
                    }
                    Rectangle {
                        anchors.fill: parent
                        visible: root.isError
                        radius: 3
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: Theme.danger }
                            GradientStop { position: 1; color: Theme.tone("orange").base }
                        }
                    }
                }
            }

            Item { width: 1; height: 12 }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: (root.isDone ? root.items.length : root.doneCount) + " de " + root.items.length + " completadas"
                tone: 0.3
                font.pixelSize: Theme.textCaption
            }
        }
    }
}
