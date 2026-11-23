#pragma once

#include <QJSValue>
#include <QVariant>
#include <QVariantList>
#include <QVariantMap>

/**
 * Valor llegado de QML reducido a mapas, listas y tipos simples.
 *
 * Según la versión de Qt, un objeto o una lista de QML que entra por un
 * parámetro `QVariant` llega ya convertido o envuelto en un `QJSValue`
 * (también dentro de mapas y listas), y eso `QJsonDocument`/`QJsonValue` no lo
 * entienden: se serializaba como `null`.
 */
inline QVariant plainVariant(const QVariant &value)
{
    if (value.userType() == qMetaTypeId<QJSValue>())
        return plainVariant(value.value<QJSValue>().toVariant());
    if (value.typeId() == QMetaType::QVariantMap) {
        QVariantMap map = value.toMap();
        for (auto it = map.begin(); it != map.end(); ++it)
            *it = plainVariant(*it);
        return map;
    }
    if (value.typeId() == QMetaType::QVariantList) {
        QVariantList list = value.toList();
        for (QVariant &item : list)
            item = plainVariant(item);
        return list;
    }
    return value;
}
