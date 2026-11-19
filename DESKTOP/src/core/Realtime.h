#pragma once

#include "core/SocketIoClient.h"

#include <QHash>
#include <QObject>
#include <QTimer>
#include <QVariantMap>

class ApiClient;
class AuthController;
class SessionStore;

/**
 * Tiempo real del panel: el socket `/agent` y lo último que se sabe de cada
 * servidor (métricas, estado del agente, inventarios). Los datos en vivo se
 * guardan aparte de lo que devuelve el API y se combinan al leerlos.
 */
class Realtime : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    /** Cambia con cada dato en vivo: las vistas dependen de él para recalcular. */
    Q_PROPERTY(int revision READ revision NOTIFY liveChanged)

public:
    Realtime(ApiClient *api, SessionStore *session, AuthController *auth, QObject *parent = nullptr);

    bool connected() const { return m_socket.connected(); }
    int revision() const { return m_revision; }

    /** `{ metrics, status, timestamp (ms), serverName, services, processes }` o vacío. */
    Q_INVOKABLE QVariantMap live(const QString &serverId) const;

signals:
    void connectedChanged();
    void liveChanged();
    /** Un agente se conectó o desconectó: toca volver a pedir la lista y el resumen. */
    void presenceChanged();
    /** Cualquier evento del socket, para quien necesite uno concreto. */
    void event(const QString &name, const QVariant &payload);

private:
    void handleEvent(const QString &name, const QVariantList &args);
    void merge(const QString &serverId, const QVariantMap &values);
    void syncWithSession();

    ApiClient *m_api;
    SessionStore *m_session;
    AuthController *m_auth;
    SocketIoClient m_socket;
    QTimer m_renewTimer;
    QHash<QString, QVariantMap> m_live;
    int m_revision = 0;
    bool m_revoked = false;
};
