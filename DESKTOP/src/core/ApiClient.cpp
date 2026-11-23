#include "core/ApiClient.h"

#include "core/SessionStore.h"

#include <QJSEngine>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSysInfo>

namespace {
constexpr int kTimeoutMs = 30000;

/* Su 401 es una respuesta de negocio (credenciales, código 2FA), no una sesión caducada. */
const QStringList kAuthEndpoints = {
    QStringLiteral("/auth/login"),
    QStringLiteral("/auth/register"),
    QStringLiteral("/auth/refresh"),
    QStringLiteral("/auth/2fa/verify-login"),
    QStringLiteral("/auth/change-expired-password"),
};

QString resolveBaseUrl()
{
    QString url = qEnvironmentVariable("STARTCODE_API_URL", QStringLiteral(STARTCODE_API_URL));
    while (url.endsWith(QLatin1Char('/')))
        url.chop(1);
    return url;
}
}

ApiClient::ApiClient(SessionStore *session, QObject *parent)
    : QObject(parent)
    , m_session(session)
    , m_baseUrl(resolveBaseUrl())
    /* Codificado: una cabecera no admite tildes («MacBook de Andrés»). */
    , m_deviceName(QUrl::toPercentEncoding(QSysInfo::machineHostName()))
{
}

QString ApiClient::socketUrl() const
{
    QString url = m_baseUrl;
    if (url.endsWith(QLatin1String("/api/v1")))
        url.chop(7);
    return url;
}

bool ApiClient::isAuthEndpoint(const QString &path)
{
    for (const QString &endpoint : kAuthEndpoints) {
        if (path.contains(endpoint))
            return true;
    }
    return false;
}

void ApiClient::get(const QString &path, Callback done)
{
    send({ "GET", path, {}, std::move(done) });
}

void ApiClient::post(const QString &path, const QJsonObject &body, Callback done)
{
    send({ "POST", path, QJsonDocument(body).toJson(QJsonDocument::Compact), std::move(done) });
}

void ApiClient::put(const QString &path, const QJsonObject &body, Callback done)
{
    send({ "PUT", path, QJsonDocument(body).toJson(QJsonDocument::Compact), std::move(done) });
}

void ApiClient::patch(const QString &path, const QJsonObject &body, Callback done)
{
    send({ "PATCH", path, QJsonDocument(body).toJson(QJsonDocument::Compact), std::move(done) });
}

void ApiClient::del(const QString &path, Callback done)
{
    send({ "DELETE", path, {}, std::move(done) });
}

ApiResult ApiClient::parse(int status, const QByteArray &raw, bool networkFailed)
{
    ApiResult result;
    result.status = status;
    const QJsonDocument document = QJsonDocument::fromJson(raw);
    result.body = document.object();

    if (status >= 200 && status < 300) {
        result.ok = true;
        /* El backend responde sin sobre o con `{ success, data }`; las listas llegan como array. */
        if (document.isArray())
            result.data = document.array();
        else
            result.data = result.body.contains(QLatin1String("data"))
                ? result.body.value(QLatin1String("data"))
                : QJsonValue(result.body);
        result.message = result.body.value(QLatin1String("message")).toString();
        return result;
    }

    if (status == 0 && networkFailed) {
        result.message = QStringLiteral("No se recibió respuesta del servidor");
        return result;
    }

    /* Nest devuelve `message` como texto o como lista de errores de validación. */
    const QJsonValue message = result.body.value(QLatin1String("message"));
    if (message.isArray() && !message.toArray().isEmpty())
        result.message = message.toArray().first().toString();
    else
        result.message = message.toString();
    if (result.message.isEmpty())
        result.message = QStringLiteral("Error en la petición");
    result.code = result.body.value(QLatin1String("code")).toString();
    result.hint = result.body.value(QLatin1String("hint")).toString();
    return result;
}

void ApiClient::send(Pending pending)
{
    QNetworkRequest request(QUrl(m_baseUrl + pending.path));
    request.setTransferTimeout(pending.timeoutMs > 0 ? pending.timeoutMs : kTimeoutMs);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QByteArrayLiteral("application/json"));
    request.setRawHeader("X-StartCode-Client", QByteArrayLiteral("desktop/" STARTCODE_VERSION));
    if (isAuthEndpoint(pending.path) && !m_deviceName.isEmpty())
        request.setRawHeader("X-StartCode-Device", m_deviceName);
    if (!m_session->accessToken().isEmpty())
        request.setRawHeader("Authorization", "Bearer " + m_session->accessToken().toUtf8());

    QNetworkReply *reply = m_network.sendCustomRequest(request, pending.method, pending.payload);
    connect(reply, &QNetworkReply::finished, this, [this, reply, pending]() mutable {
        reply->deleteLater();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QByteArray raw = reply->readAll();

        if (status == 401 && !pending.retried && !isAuthEndpoint(pending.path)) {
            pending.retried = true;
            m_waiting.append(std::move(pending));
            refreshSession();
            return;
        }

        const ApiResult result = parse(status, raw, reply->error() != QNetworkReply::NoError);
        if (result.code == QLatin1String("HOST_KEY_MISMATCH") || result.code == QLatin1String("HOST_KEY_UNVERIFIED"))
            emit hostKeyMismatch(result.body.toVariantMap());
        if (pending.done)
            pending.done(result);
    });
}

void ApiClient::refreshSession()
{
    if (m_refreshing)
        return;
    m_refreshing = true;

    const auto fail = [this](const ApiResult &result, const QString &reason) {
        const QList<Pending> waiting = std::exchange(m_waiting, {});
        m_refreshing = false;
        m_session->clear();
        emit sessionLost(reason, result.message);
        for (const Pending &pending : waiting) {
            if (pending.done)
                pending.done(result);
        }
    };

    if (m_session->refreshToken().isEmpty()) {
        ApiResult result;
        result.status = 401;
        result.message = QStringLiteral("La sesión terminó");
        fail(result, QStringLiteral("expired"));
        return;
    }

    post(QStringLiteral("/auth/refresh"),
         { { QStringLiteral("refreshToken"), m_session->refreshToken() } },
         [this, fail](const ApiResult &result) {
             /* El refresh responde sin sobre: { user, token, refreshToken, expiresIn }. */
             const QJsonObject data = result.data.toObject();
             const QString token = data.value(QLatin1String("token")).toString();
             if (!result.ok || token.isEmpty()) {
                 fail(result, result.code == QLatin1String("REFRESH_REUSED")
                                  ? QStringLiteral("reuse")
                                  : QStringLiteral("expired"));
                 return;
             }

             m_session->rotateTokens(token, data.value(QLatin1String("refreshToken")).toString());
             const QList<Pending> waiting = std::exchange(m_waiting, {});
             m_refreshing = false;
             for (const Pending &pending : waiting)
                 send(pending);
         });
}

/* Según la versión de Qt, un objeto de QML llega como mapa o envuelto en un
   QJSValue (también dentro de mapas y listas), que QJsonDocument no entiende:
   se deja siempre en mapas y listas simples. */
static QVariant plainVariant(const QVariant &value)
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

void ApiClient::request(const QString &method, const QString &path, const QVariant &rawBody,
                        const QJSValue &callback, int timeoutMs)
{
    /* El cuerpo puede ser un objeto o una lista; sin cuerpo, `{}`. */
    const QVariant body = plainVariant(rawBody);
    QJsonDocument json = QJsonDocument::fromVariant(body);
    if (json.isNull())
        json = QJsonDocument(QJsonObject());
    const QByteArray verb = method.toUpper().toLatin1();
    const bool hasBody = verb != "GET" && !body.isNull() && body.isValid();

    send({ verb, path, hasBody || (verb != "GET" && verb != "DELETE") ? json.toJson(QJsonDocument::Compact) : QByteArray(),
           [this, callback](const ApiResult &result) {
               if (!m_engine || !callback.isCallable())
                   return;
               QJSValue error = QJSValue(QJSValue::NullValue);
               if (!result.ok) {
                   error = m_engine->newObject();
                   error.setProperty(QStringLiteral("message"), result.message);
                   error.setProperty(QStringLiteral("status"), result.status);
                   error.setProperty(QStringLiteral("code"), result.code);
                   error.setProperty(QStringLiteral("hint"), result.hint);
                   /* Cuerpo completo del error: campos propios como `hostKey`. */
                   error.setProperty(QStringLiteral("data"), toScript(result.body));
               }
               callback.call({ QJSValue(result.ok), toScript(result.data), error });
           },
           false, timeoutMs });
}

QJSValue ApiClient::toScript(const QJsonValue &value)
{
    /* Convertir desde QVariant deja las listas como envoltorios que no pasan
       `Array.isArray`; analizando el JSON en el propio motor salen nativas. */
    if (value.isNull() || value.isUndefined())
        return QJSValue(QJSValue::NullValue);
    if (value.isBool())
        return QJSValue(value.toBool());
    if (value.isDouble())
        return QJSValue(value.toDouble());
    if (value.isString())
        return QJSValue(value.toString());
    if (m_jsonParse.isUndefined())
        m_jsonParse = m_engine->evaluate(QStringLiteral("JSON.parse"));
    const QByteArray json = value.isArray() ? QJsonDocument(value.toArray()).toJson(QJsonDocument::Compact)
                                            : QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact);
    return m_jsonParse.call({ QJSValue(QString::fromUtf8(json)) });
}
