#pragma once

#include <QHash>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QTimer>
#include <QVariant>
#include <QWebSocket>

#include <functional>

/**
 * Cliente Socket.IO (protocolo 5 sobre Engine.IO 4) con transporte WebSocket
 * directo, que es el que usa el backend del panel. Cubre lo que la app
 * necesita: un espacio de nombres por conexión, autenticación en el saludo,
 * eventos de texto, confirmaciones (ack) y reconexión con espera creciente.
 */
class QJSEngine;

class SocketIoClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)

public:
    using AuthProvider = std::function<QJsonObject()>;
    using AckHandler = std::function<void(const QJsonArray &)>;

    explicit SocketIoClient(QObject *parent = nullptr);
    ~SocketIoClient() override;

    /** `origin` es el del API sin `/api/v1`; `nsp` empieza por `/` (p. ej. `/agent`). */
    void configure(const QString &origin, const QString &nsp);
    /** Se consulta en cada conexión: así una reconexión manda el token vigente. */
    void setAuthProvider(AuthProvider provider) { m_authProvider = std::move(provider); }
    void setReconnect(bool reconnect) { m_reconnect = reconnect; }
    void setScriptEngine(QJSEngine *engine) { m_engine = engine; }

    bool connected() const { return m_connected; }

    Q_INVOKABLE void open();
    Q_INVOKABLE void close();
    void send(const QString &event, const QJsonArray &args = {}, AckHandler ack = {});

    /* Variantes para QML. */
    Q_INVOKABLE void emitEvent(const QString &event, const QVariantList &args = {});
    Q_INVOKABLE void emitWithAck(const QString &event, const QVariantList &args, const QJSValue &callback);

signals:
    void connectedChanged();
    /** Evento del servidor con sus argumentos. */
    void event(const QString &name, const QVariantList &args);
    /** El servidor rechazó la conexión al espacio de nombres. */
    void connectError(const QString &message);
    /** `io server disconnect` (lo cerró el servidor) o `transport close`. */
    void disconnected(const QString &reason);

private:
    void openTransport();
    void handleFrame(const QString &frame);
    void handlePacket(QStringView packet);
    void setConnected(bool connected);
    void scheduleReconnect();

    QWebSocket m_socket;
    QTimer m_reconnectTimer;
    QTimer m_heartbeat;
    AuthProvider m_authProvider;
    QJSEngine *m_engine = nullptr;
    QHash<int, AckHandler> m_acks;
    QString m_origin;
    QString m_nsp = QStringLiteral("/");
    int m_nextAck = 0;
    int m_attempts = 0;
    bool m_connected = false;
    bool m_reconnect = true;
    bool m_wanted = false;
};
