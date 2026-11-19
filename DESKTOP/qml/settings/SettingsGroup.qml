import QtQuick
import StartCode

/* Título más sus filas, apiladas con 10 px de separación. Las filas se
   declaran dentro: `SettingsGroup { title: "…"; SettingsNotifRow { … } }`. */
Column {
    id: root

    property string title: ""
    default property alias rows: body.data

    spacing: 16

    SettingsSectionTitle { text: root.title }
    Column {
        id: body
        width: root.width
        spacing: 10
    }
}
