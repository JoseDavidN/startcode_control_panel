#include "core/Realtime.h"

#include "core/ApiClient.h"
#include "core/AuthController.h"
#include "core/SessionStore.h"

#include <QDateTime>

Realtime::Realtime(ApiClient *api, SessionStore *session, AuthController *auth, QObject *parent)
    : QObject(parent)
    , m_api(api)
    , m_session(session)
    , m_auth(auth)
{
    m_socket.configure(m_api->socketUrl(), QStringLiteral("/agent"));
    m_socket.setAuthProvider([this] {
        return QJsonObject { { QStringLiteral("token"), m_session->accessToken() } };
    });

    connect(&m_socket, &SocketIoClient::connectedChanged, this, &Realtime::connectedChanged);
    connect(&m_socket, &SocketIoClient::event, this, &Realtime::handleEvent);

    /* El gateway corta la conexión si el token caducó y entonces no hay
       reconexión automática: una petición autenticada renueva el token y se
       vuelve a conectar con el nuevo. */
    m_renewTimer.setSingleShot(true);
    m_renewTimer.setInterval(1500);
    connect(&m_renewTimer, &QTimer::timeout, this, [this] {
        m_api->get(QStringLiteral("/auth/me"), [this](const ApiResult &) {
            if (m_auth->authenticated() && !m_revoked)
                m_socket.open();
        });
    });
    connect(&m_socket, &SocketIoClient::disconnected, this, [this](const QString &reason) {
        if (reason == QLatin1String("io server disconnect") && !m_revoked && m_auth->authenticated())
            m_renewTimer.start();
    });

    connect(m_auth, &AuthController::userChanged, this, &Realtime::syncWithSession);
    syncWithSession();
}

void Realtime::syncWithSession()
{
    if (m_auth->authenticated()) {
        m_revoked = false;
        m_socket.open();
        return;
    }
    m_renewTimer.stop();
    m_socket.close();
    if (!m_live.isEmpty()) {
        m_live.clear();
        ++m_revision;
        emit liveChanged();
    }
}

QVariantMap Realtime::live(const QString &serverId) const
{
    return m_live.value(serverId);
}

void Realtime::merge(const QString &serverId, const QVariantMap &values)
{
    if (serverId.isEmpty())
        return;
    QVariantMap &entry = m_live[serverId];
    for (auto it = values.cbegin(); it != values.cend(); ++it)
        entry.insert(it.key(), it.value());
    ++m_revision;
    emit liveChanged();
}

void Realtime::handleEvent(const QString &name, const QVariantList &args)
{
    const QVariant first = args.value(0);
    const QVariantMap payload = first.toMap();
    const QString serverId = payload.value(QStringLiteral("serverId")).toString();

    if (name == QLatin1String("auth:revoked")) {
        /* Sesión terminada en el backend: no se reintenta; la app cierra sesión. */
        m_revoked = true;
        m_auth->sessionRevoked(payload.value(QStringLiteral("reason")).toString(),
                               payload.value(QStringLiteral("message")).toString());
        return;
    }

    if (name == QLatin1String("server:metrics:realtime")) {
        /* `timestamp` llega como fecha ISO o como milisegundos. */
        const QVariant raw = payload.value(QStringLiteral("timestamp"));
        qint64 at = raw.typeId() == QMetaType::QString
            ? QDateTime::fromString(raw.toString(), Qt::ISODateWithMs).toMSecsSinceEpoch()
            : raw.toLongLong();
        if (at <= 0)
            at = QDateTime::currentMSecsSinceEpoch();
        merge(serverId, {
            { QStringLiteral("metrics"), payload.value(QStringLiteral("metrics")) },
            { QStringLiteral("status"), QStringLiteral("online") },
            { QStringLiteral("timestamp"), at },
            { QStringLiteral("serverName"), payload.value(QStringLiteral("serverName")) },
        });
    } else if (name == QLatin1String("agent:connected")) {
        merge(serverId, {
            { QStringLiteral("status"), QStringLiteral("online") },
            { QStringLiteral("serverName"), payload.value(QStringLiteral("serverName")) },
        });
        emit presenceChanged();
    } else if (name == QLatin1String("agent:disconnected")) {
        merge(serverId, { { QStringLiteral("status"), QStringLiteral("offline") } });
        emit presenceChanged();
    } else if (name == QLatin1String("server:services:updated")) {
        if (payload.contains(QStringLiteral("services")))
            merge(serverId, { { QStringLiteral("services"), payload.value(QStringLiteral("services")) } });
    } else if (name == QLatin1String("server:processes:updated")) {
        merge(serverId, { { QStringLiteral("processes"), payload.value(QStringLiteral("processes")) } });
    } else if (name == QLatin1String("server:websites:updated")) {
        merge(serverId, { { QStringLiteral("websites"), payload.value(QStringLiteral("websites")) } });
    } else if (name == QLatin1String("server:databases:updated")) {
        merge(serverId, { { QStringLiteral("databases"), payload.value(QStringLiteral("databases")) } });
    }

    emit event(name, first);
}
