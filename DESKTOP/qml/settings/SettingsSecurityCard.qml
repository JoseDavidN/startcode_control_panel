import QtQuick
import StartCode

/* Tarjeta de la pestaña Seguridad: cristal suave con relleno, cuyo alto sigue
   al contenido. Los hijos se apilan en columna y toman `parent.width`. */
Glass {
    id: card

    property int pad: 16
    property alias spacing: cardColumn.spacing
    default property alias cardContent: cardColumn.data

    variant: "soft"
    elevation: "raised"
    radius: Theme.radiusXl
    implicitHeight: cardColumn.implicitHeight + pad * 2

    Column {
        id: cardColumn
        x: card.pad
        y: card.pad
        width: card.width - card.pad * 2
    }
}
