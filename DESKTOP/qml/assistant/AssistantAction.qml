import QtQuick
import QtQuick.Layouts
import StartCode

/* Tarjeta de un alta propuesta por el asistente (servidor o conexión). Solo
   muestra lo que vendría rellenado; crear es cosa del formulario de siempre,
   que se abre al pulsar «Revisar y crear». */
Item {
    id: root

    /* `{ kind: "server" | "database", data }` (ver `AssistantActions.parseAction`). */
    property var action: null
    signal review(var action)

    readonly property bool isServer: !!action && action.kind === "server"
    readonly property var d: (action && action.data) || ({})
    readonly property var rows: {
        const list = isServer ? [
            ["Nombre", d.name],
            ["Host", d.host && (d.host + ":" + (d.port !== undefined && d.port !== null ? d.port : 22))],
            ["Usuario", d.username],
            ["Sistema", d.os && logic.osLabel(d.os)],
            ["Etiqueta", d.tag ? logic.tagLabel(d.tag) : undefined],
            ["Descripción", d.description]
        ] : [
            ["Motor", d.engine && logic.engineLabels[d.engine]],
            ["Nombre", d.name],
            ["Host", d.host && (d.host + (d.port ? ":" + d.port : ""))],
            ["Usuario", d.username],
            ["Base", d.database],
            ["Etiqueta", d.tag ? logic.tagLabel(d.tag) : undefined]
        ]
        return list.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== "")
                   .map(r => ({ label: r[0], value: String(r[1]) }))
    }

    implicitHeight: column.implicitHeight
    implicitWidth: 320

    AssistantActions { id: logic }

    Glass {
        anchors.fill: parent
        variant: "soft"
        elevation: "flat"
        radius: Theme.radiusXl
        borderColor: Theme.hairline
    }

    ColumnLayout {
        id: column
        width: parent.width
        spacing: 0

        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 36

            Icon {
                id: kindIcon
                x: 12
                anchors.verticalCenter: parent.verticalCenter
                name: root.isServer ? "server" : "database"
                size: 16
                color: Theme.brandLight1
            }
            Label {
                anchors.left: kindIcon.right
                anchors.leftMargin: 8
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                text: root.isServer ? "Nuevo servidor propuesto" : "Nueva conexión propuesta"
                tone: 0.9
                font.pixelSize: Theme.textXs
                font.weight: Font.DemiBold
            }
            Rectangle {
                anchors.bottom: parent.bottom
                x: 1
                width: parent.width - 2
                height: 1
                color: Theme.line
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.margins: 12
            Layout.topMargin: 10
            Layout.bottomMargin: 10
            spacing: 4

            Repeater {
                model: root.rows.length
                delegate: RowLayout {
                    id: rowItem
                    required property int index
                    readonly property var entry: root.rows[index] || ({ label: "", value: "" })
                    Layout.fillWidth: true
                    spacing: 12

                    Label {
                        Layout.preferredWidth: 80
                        Layout.alignment: Qt.AlignTop
                        text: rowItem.entry.label
                        tone: 0.4
                        font.pixelSize: Theme.textXs
                    }
                    Label {
                        Layout.fillWidth: true
                        text: rowItem.entry.value
                        textFormat: Text.PlainText
                        mono: true
                        tone: 0.85
                        font.pixelSize: Theme.textXs
                        wrapMode: Text.WrapAnywhere
                        elide: Text.ElideNone
                    }
                }
            }
            Label {
                Layout.fillWidth: true
                visible: Object.keys(root.d).length === 0
                text: "Sin datos: completa el formulario."
                tone: 0.45
                font.pixelSize: Theme.textXs
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            Layout.bottomMargin: 12
            spacing: 8

            Icon {
                Layout.alignment: Qt.AlignVCenter
                name: "lock"
                size: 12
                color: Theme.ink(0.4)
            }
            Label {
                Layout.fillWidth: true
                text: root.isServer ? "La llave SSH la pegas tú en el formulario." : "La contraseña la escribes tú en el formulario."
                tone: 0.4
                font.pixelSize: Theme.textCaption
                wrapMode: Text.WordWrap
                elide: Text.ElideNone
            }
            Item {
                id: reviewButton
                Layout.preferredWidth: reviewLabel.implicitWidth + 24
                Layout.preferredHeight: 32
                Layout.alignment: Qt.AlignVCenter
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: reviewLabel.text
                Keys.onReturnPressed: root.review(root.action)
                Keys.onEnterPressed: root.review(root.action)
                Keys.onSpacePressed: root.review(root.action)

                Elevation { anchors.fill: parent; level: "brandSm"; radius: Theme.radiusLg }
                BrandFill { anchors.fill: parent; radius: Theme.radiusLg }
                Rectangle {
                    visible: reviewButton.activeFocus
                    anchors.fill: parent
                    anchors.margins: -3
                    radius: Theme.radiusLg + 3
                    color: "transparent"
                    border.width: 2
                    border.color: Theme.focusRing
                }
                Label {
                    id: reviewLabel
                    anchors.centerIn: parent
                    text: "Revisar y crear"
                    color: Theme.onBrand
                    font.pixelSize: Theme.textXs
                    font.weight: Font.DemiBold
                }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
                TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: root.review(root.action) }
            }
        }
    }
}
