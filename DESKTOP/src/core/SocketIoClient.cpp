#include "core/SocketIoClient.h"

#include <QJSEngine>
#include <QJsonDocument>
#include <QUrl>
#include <QUrlQuery>

#include <algorithm>

namespace {
/* Engine.IO: tipo de paquete en el primer carácter. */
constexpr QChar kEioOpen = u'0';
constexpr QChar kEioClose = u'1';
constexpr QChar kEioPing = u'2';
constexpr QChar kEioMessage = u'4';

/* Socket.IO: tipo de paquete tras el `4` de Engine.IO. */
constexpr QChar kConnect = u'0';
constexpr QChar kDisconnect = u'1';
constexpr QChar kEvent = u'2';
constexpr QChar kAck = u'3';
constexpr QChar kConnectError = u'4';

constexpr int kMaxReconnectMs = 5000;
}

SocketIoClient::SocketIoClient(QObject *parent)
    : QObject(parent)
{
    m_reconnectTimer.setSingleShot(true);
    connect(&m_reconnectTimer, &QTimer::timeout, this, &SocketIoClient::openTransport);

    /* Sin ping del servidor dentro del plazo, la conexión está muerta. */
    m_heartbeat.setSingleShot(true);
    connect(&m_heartbeat, &QTimer::timeout, this, [this] { m_socket.abort(); });

    connect(&m_socket, &QWebSocket::textMessageReceived, this, &SocketIoClient::handleFrame);
    connect(&m_socket, &QWebSocket::disconnected, this, [this] {
        m_heartbeat.stop();
        m_acks.clear();
        const bool wasConnected = m_connected;
        setConnected(false);
        if (wasConnected)
            emit disconnected(QStringLiteral("transport close"));
        if (m_wanted && m_reconnect)
            scheduleReconnect();
    });
}

SocketIoClient::~SocketIoClient()
{
    m_wanted = false;
    m_socket.abort();
}

void SocketIoClient::configure(const QString &origin, const QString &nsp)
{
    m_origin = origin;
    m_nsp = nsp.isEmpty() ? QStringLiteral("/") : nsp;
}

void SocketIoClient::open()
{
    if (m_wanted)
        return;
    m_wanted = true;
    m_attempts = 0;
    openTransport();
}

void SocketIoClient::close()
{
    m_wanted = false;
    m_reconnectTimer.stop();
    m_heartbeat.stop();
    if (m_connected)
        m_socket.sendTextMessage(QStringLiteral("41") + (m_nsp == QLatin1String("/") ? QString() : m_nsp + u','));
    m_socket.close();
    setConnected(false);
}

void SocketIoClient::openTransport()
{
    if (!m_wanted || m_socket.state() != QAbstractSocket::UnconnectedState)
        return;

    QUrl url(m_origin + QStringLiteral("/socket.io/"));
    url.setScheme(url.scheme() == QLatin1String("https") ? QStringLiteral("wss") : QStringLiteral("ws"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("EIO"), QStringLiteral("4"));
    query.addQueryItem(QStringLiteral("transport"), QStringLiteral("websocket"));
    url.setQuery(query);
    m_socket.open(url);
}

void SocketIoClient::scheduleReconnect()
{
    /* 1 s, 2 s, 4 s… hasta 5 s, sin límite de intentos. */
    const int delay = std::min(kMaxReconnectMs, 1000 * (1 << std::min(m_attempts, 3)));
    ++m_attempts;
    m_reconnectTimer.start(delay);
}

void SocketIoClient::setConnected(bool connected)
{
    if (m_connected == connected)
        return;
    m_connected = connected;
    emit connectedChanged();
}

void SocketIoClient::handleFrame(const QString &frame)
{
    if (frame.isEmpty())
        return;

    const QChar type = frame.at(0);
    if (type == kEioOpen) {
        const QJsonObject handshake = QJsonDocument::fromJson(QStringView(frame).mid(1).toUtf8()).object();
        const int interval = handshake.value(QLatin1String("pingInterval")).toInt(25000);
        const int timeout = handshake.value(QLatin1String("pingTimeout")).toInt(20000);
        m_heartbeat.setInterval(interval + timeout);
        m_heartbeat.start();

        /* Conexión al espacio de nombres, con los datos de autenticación. */
        QString packet = QStringLiteral("40");
        if (m_nsp != QLatin1String("/"))
            packet += m_nsp + u',';
        if (m_authProvider)
            packet += QString::fromUtf8(QJsonDocument(m_authProvider()).toJson(QJsonDocument::Compact));
        m_socket.sendTextMessage(packet);
    } else if (type == kEioPing) {
        m_socket.sendTextMessage(QStringLiteral("3"));
        m_heartbeat.start();
    } else if (type == kEioClose) {
        m_socket.close();
    } else if (type == kEioMessage) {
        handlePacket(QStringView(frame).mid(1));
    }
}

void SocketIoClient::handlePacket(QStringView packet)
{
    if (packet.isEmpty())
        return;
    const QChar type = packet.at(0);
    packet = packet.mid(1);

    /* Espacio de nombres: `/nombre,` delante de los datos, salvo en el raíz. */
    if (packet.startsWith(u'/')) {
        const qsizetype comma = packet.indexOf(u',');
        const QStringView nsp = comma < 0 ? packet : packet.left(comma);
        if (nsp != m_nsp)
            return;
        packet = comma < 0 ? QStringView() : packet.mid(comma + 1);
    } else if (m_nsp != QLatin1String("/")) {
        return;
    }

    /* Identificador de confirmación: dígitos antes del JSON. */
    qsizetype digits = 0;
    while (digits < packet.size() && packet.at(digits).isDigit())
        ++digits;
    const int ackId = digits > 0 ? packet.left(digits).toInt() : -1;
    const QJsonDocument payload = QJsonDocument::fromJson(packet.mid(digits).toUtf8());

    if (type == kConnect) {
        m_attempts = 0;
        setConnected(true);
    } else if (type == kConnectError) {
        const QString message = payload.object().value(QLatin1String("message")).toString();
        emit connectError(message);
    } else if (type == kDisconnect) {
        /* El servidor cerró este espacio de nombres: no se reconecta solo. */
        m_wanted = false;
        m_acks.clear();
        setConnected(false);
        m_socket.close();
        emit disconnected(QStringLiteral("io server disconnect"));
    } else if (type == kEvent) {
        QJsonArray args = payload.array();
        if (args.isEmpty())
            return;
        const QString name = args.takeAt(0).toString();
        emit event(name, args.toVariantList());
    } else if (type == kAck && ackId >= 0) {
        if (const AckHandler handler = m_acks.take(ackId))
            handler(payload.array());
    }
}

void SocketIoClient::send(const QString &event, const QJsonArray &args, AckHandler ack)
{
    if (!m_connected)
        return;

    QJsonArray body = args;
    body.prepend(event);

    QString packet = QStringLiteral("42");
    if (m_nsp != QLatin1String("/"))
        packet += m_nsp + u',';
    if (ack) {
        const int id = m_nextAck++;
        m_acks.insert(id, std::move(ack));
        packet += QString::number(id);
    }
    packet += QString::fromUtf8(QJsonDocument(body).toJson(QJsonDocument::Compact));
    m_socket.sendTextMessage(packet);
}

void SocketIoClient::emitEvent(const QString &event, const QVariantList &args)
{
    send(event, QJsonArray::fromVariantList(args));
}

void SocketIoClient::emitWithAck(const QString &event, const QVariantList &args, const QJSValue &callback)
{
    send(event, QJsonArray::fromVariantList(args), [this, callback](const QJsonArray &reply) {
        if (!callback.isCallable())
            return;
        QJSEngine *engine = m_engine;
        if (!engine)
            return;
        /* Con `JSON.parse` del motor las listas llegan como arrays nativos. */
        const QJSValue parse = engine->evaluate(QStringLiteral("JSON.parse"));
        const QJSValue parsed = parse.call({ QJSValue(QString::fromUtf8(QJsonDocument(reply).toJson(QJsonDocument::Compact))) });
        QJSValueList values;
        const int count = parsed.property(QStringLiteral("length")).toInt();
        for (int i = 0; i < count; ++i)
            values << parsed.property(quint32(i));
        callback.call(values);
    });
}
