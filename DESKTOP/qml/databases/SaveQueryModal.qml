import QtQuick
import StartCode

/* Guardar la consulta del editor activo con nombre. Si ya hay una con ese
   nombre, avisa de que se reemplazará.

       SaveQueryModal { queries: …; initialName: …; schema: …; onSave: name => … } */
Modal {
    id: root

    /* Consultas ya guardadas (`SavedQuery[]`), para detectar el nombre repetido. */
    property var queries: []
    property string initialName: ""
    /* Base activa; null si no hay ninguna. */
    property var schema: null

    signal save(string name)

    readonly property string clean: nameField.text.trim()
    readonly property bool clash: {
        const list = root.queries || []
        for (let i = 0; i < list.length; i++)
            if (store.sameName(list[i].name, root.clean)) return true
        return false
    }

    function submit() { if (clean) root.save(clean) }

    title: "Guardar consulta"
    size: "sm"

    onAboutToShow: nameField.text = initialName
    onOpened: {
        nameField.forceFocus()
        nameField.input.selectAll()
    }

    SqlQueryStore { id: store }

    Column {
        width: root.bodyWidth
        spacing: 6

        Label {
            width: parent.width
            text: "Nombre"
            tone: 0.55
            font.pixelSize: Theme.textXs
            font.weight: Font.Medium
        }
        GlassField {
            id: nameField
            width: parent.width
            height: 40
            placeholder: "Ventas por mes"
            maximumLength: store.maxQueryName
            Accessible.name: "Nombre"
            onAccepted: root.submit()
        }
        Label {
            visible: root.clash
            width: parent.width
            text: "Ya hay una consulta con este nombre: se reemplazará."
            color: Theme.tone("amber").text
            font.pixelSize: Theme.textXs
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }
    }

    Item {
        width: root.bodyWidth
        height: baseTitle.implicitHeight
        Label {
            id: baseTitle
            text: "Base: "
            tone: 0.45
            font.pixelSize: Theme.textXs
        }
        Label {
            anchors.left: baseTitle.right
            anchors.baseline: baseTitle.baseline
            width: parent.width - baseTitle.width
            text: root.schema ? root.schema : "sin base seleccionada"
            tone: 0.7
            mono: true
            font.pixelSize: Theme.textXs
        }
    }

    footer: Row {
        spacing: 8
        SecondaryButton {
            text: "Cancelar"
            onClicked: root.close()
        }
        PrimaryButton {
            text: root.clash ? "Reemplazar" : "Guardar"
            enabled: root.clean !== ""
            onClicked: root.submit()
        }
    }
}
