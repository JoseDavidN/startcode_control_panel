#pragma once

#include <QAbstractTableModel>
#include <QtQml/qqmlregistration.h>

/* Forma de la rejilla de resultados para `TableView`: cuántas filas y columnas
   hay. Los valores no viven aquí: la rejilla (ResultGrid.qml) los guarda junto
   con los cambios pendientes, las columnas ocultas y las filas nuevas, y cada
   celda visible los lee de ahí por su fila y columna. `TableView` solo
   necesita un modelo de tabla para virtualizar filas y columnas, y avisos
   exactos cuando entra o sale una fila por arriba (filas nuevas), para no
   perder la posición del desplazamiento. */
class ResultModel : public QAbstractTableModel
{
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(int rowTotal READ rowTotal WRITE setRowTotal NOTIFY shapeChanged)
    Q_PROPERTY(int columnTotal READ columnTotal NOTIFY shapeChanged)

public:
    explicit ResultModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    int columnCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;

    int rowTotal() const { return m_rows; }
    int columnTotal() const { return m_columns; }

    /* Cambia el número de filas insertando o quitando por arriba: las filas
       nuevas sin guardar van antes que las del resultado. */
    void setRowTotal(int rows);

    /* Resultado nuevo: la vista se rehace entera. */
    Q_INVOKABLE void resize(int rows, int columns);

signals:
    void shapeChanged();

private:
    int m_rows = 0;
    int m_columns = 0;
};
