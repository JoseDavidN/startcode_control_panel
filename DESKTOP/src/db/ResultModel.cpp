#include "ResultModel.h"

ResultModel::ResultModel(QObject *parent)
    : QAbstractTableModel(parent)
{
}

int ResultModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_rows;
}

int ResultModel::columnCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_columns;
}

QVariant ResultModel::data(const QModelIndex &index, int role) const
{
    /* Las celdas leen su valor de la rejilla por fila y columna. */
    Q_UNUSED(index)
    Q_UNUSED(role)
    return {};
}

void ResultModel::setRowTotal(int rows)
{
    rows = qMax(0, rows);
    if (rows == m_rows)
        return;
    if (rows > m_rows) {
        beginInsertRows(QModelIndex(), 0, rows - m_rows - 1);
        m_rows = rows;
        endInsertRows();
    } else {
        beginRemoveRows(QModelIndex(), 0, m_rows - rows - 1);
        m_rows = rows;
        endRemoveRows();
    }
    emit shapeChanged();
}

void ResultModel::resize(int rows, int columns)
{
    beginResetModel();
    m_rows = qMax(0, rows);
    m_columns = qMax(0, columns);
    endResetModel();
    emit shapeChanged();
}
