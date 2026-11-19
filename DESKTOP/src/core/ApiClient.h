#pragma once

#include <QJSValue>
#include <QJsonObject>
#include <QJsonValue>
#include <QList>
#include <QNetworkAccessManager>
#include <QObject>
#include <QString>
#include <QUrl>
#include <QVariantMap>

#include <functional>

class QJSEngine;
class SessionStore;

/** Resultado de una petición: los datos ya sin el sobre `{ success, data }`, o el error normalizado. */
struct ApiResult
{
    bool ok = false;
    int status = 0;
    QJsonValue data;
    QString message;
    QString code;
    QString hint;
    QJsonObject body;
};

/**
 * Cliente del API REST del panel. Añade el token, se identifica como app de
 * escritorio y, ante un 401, renueva la sesión una sola vez y repite las
 * peticiones que estaban esperando.
 */
class ApiClient : public QObject
{
    Q_OBJECT

public:
    using Callback = std::function<void(const ApiResult &)>;

    explicit ApiClient(SessionStore *session, QObject *parent = nullptr);

    QString baseUrl() const { return m_baseUrl; }
    /** Origen de los sockets: el del API sin `/api/v1`. */
    QString socketUrl() const;

    void get(const QString &path, Callback done);
    void post(const QString &path, const QJsonObject &body, Callback done);
    void put(const QString &path, const QJsonObject &body, Callback done);
    void patch(const QString &path, const QJsonObject &body, Callback done);
    void del(const QString &path, Callback done);

    /** Motor de QML: hace falta para devolver los resultados a un callback de JS. */
    void setScriptEngine(QJSEngine *engine) { m_engine = engine; }
    /**
     * Petición desde QML. `callback(ok, data, error)`: `data` ya viene sin el
     * sobre y `error` es `{ message, status, code, hint, data }` (`data`: cuerpo
     * completo de la respuesta de error). `body`: objeto, lista o `null`.
     */
    Q_INVOKABLE void request(const QString &method, const QString &path, const QVariant &body,
                             const QJSValue &callback, int timeoutMs = 0);

signals:
    /** La sesión ya no vale: `reason` es `reuse` (refresh reutilizado) o `expired`. */
    void sessionLost(const QString &reason, const QString &message);
    /** Una acción falló porque la clave de host SSH cambió (`code: HOST_KEY_MISMATCH`): cuerpo del error. */
    void hostKeyMismatch(const QVariantMap &error);

private:
    struct Pending
    {
        QByteArray method;
        QString path;
        QByteArray payload;
        Callback done;
        bool retried = false;
        /* 0 = el plazo normal; las acciones largas (comandos, instalaciones) piden el suyo. */
        int timeoutMs = 0;
    };

    void send(Pending pending);
    void refreshSession();
    static bool isAuthEndpoint(const QString &path);
    static ApiResult parse(int status, const QByteArray &raw, bool networkFailed);

    QNetworkAccessManager m_network;
    QJSEngine *m_engine = nullptr;
    /* `JSON.parse` del motor: da objetos y listas de JS de verdad (con `Array.isArray`). */
    QJSValue m_jsonParse;
    QJSValue toScript(const QJsonValue &value);
    SessionStore *m_session;
    QString m_baseUrl;
    QByteArray m_deviceName;
    bool m_refreshing = false;
    QList<Pending> m_waiting;
};
