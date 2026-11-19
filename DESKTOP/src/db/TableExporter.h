#pragma once

#include <QByteArray>
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

/* Exportación de una tabla de resultados a CSV y XLSX, equivalente a
   `FRONTEND/src/lib/tableExport.ts`.

   El XLSX se arma a mano (SpreadsheetML mínimo: una hoja, cabecera fija con
   filtro, textos en línea) dentro de un ZIP escrito aquí mismo, sin
   dependencias. Los colores de la hoja los pasa QML desde el tema activo:
   `{ header, headerText, stripe, text, border }` en hex `RRGGBB`; lo que
   falte toma el de Nocturno. */
class TableExporter : public QObject
{
    Q_OBJECT
    QML_ELEMENT

public:
    explicit TableExporter(QObject *parent = nullptr);

    /* Escriben el archivo y devuelven "" si fue bien, o el motivo del fallo.
       `columns`: nombres; `rows`: lista de filas, cada una lista de valores. */
    Q_INVOKABLE QString writeCsv(const QString &path, const QVariantList &columns,
                                 const QVariantList &rows) const;
    Q_INVOKABLE QString writeXlsx(const QString &path, const QVariantList &columns,
                                  const QVariantList &rows,
                                  const QString &sheetName = QStringLiteral("Resultados"),
                                  const QVariantMap &theme = QVariantMap()) const;

    /* El contenido, sin escribirlo (para pruebas). */
    static QByteArray csv(const QVariantList &columns, const QVariantList &rows);
    static QByteArray xlsx(const QVariantList &columns, const QVariantList &rows,
                           const QString &sheetName, const QVariantMap &theme);
};
