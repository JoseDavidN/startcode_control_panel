#include "core/AppBridge.h"

#include "core/Variant.h"

#include "core/ApiClient.h"
#include "core/SessionStore.h"
#include "core/SocketIoClient.h"

#include <QClipboard>
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDir>
#include <QLocalSocket>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QWindow>
#include <QDateTime>
#include <QEvent>
#include <QJSEngine>
#include <QNetworkReply>
#include <QSysInfo>
#include <QDesktopServices>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonObject>
#include <QQmlEngine>
#include <QUrl>

AppBridge::AppBridge(ApiClient *api, SessionStore *session, QJSEngine *engine, QObject *parent)
    : QObject(parent)
    , m_api(api)
    , m_session(session)
    , m_engine(engine)
{
    /* Actividad del usuario en cualquier ventana de la app: la usa el cierre por inactividad. */
    m_lastActivity = QDateTime::currentMSecsSinceEpoch();
    qGuiApp->installEventFilter(this);
}

bool AppBridge::eventFilter(QObject *watched, QEvent *event)
{
    switch (event->type()) {
    case QEvent::KeyPress:
    case QEvent::MouseButtonPress:
    case QEvent::MouseMove:
    case QEvent::Wheel:
    case QEvent::TouchBegin:
        m_lastActivity = QDateTime::currentMSecsSinceEpoch();
        break;
    default:
        break;
    }
    return QObject::eventFilter(watched, event);
}

void AppBridge::httpGet(const QString &url, const QJSValue &callback)
{
    const QUrl target(url);
    if (target.scheme() != QLatin1String("https") && target.scheme() != QLatin1String("http")) {
        if (callback.isCallable())
            callback.call({ QJSValue(false), QJSValue(QString()), QJSValue(0) });
        return;
    }
    QNetworkRequest request(target);
    request.setTransferTimeout(15000);
    request.setRawHeader("X-StartCode-Client", QByteArrayLiteral("desktop/" STARTCODE_VERSION));
    QNetworkReply *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [reply, callback] {
        reply->deleteLater();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const bool ok = reply->error() == QNetworkReply::NoError && status >= 200 && status < 300;
        if (callback.isCallable())
            callback.call({ QJSValue(ok), QJSValue(QString::fromUtf8(reply->readAll())), QJSValue(status) });
    });
}

namespace {
const QString kNotifyService = QStringLiteral("org.freedesktop.Notifications");
const QString kNotifyPath = QStringLiteral("/org/freedesktop/Notifications");

/* Canal de control de Hyprland: un socket local por instancia del compositor. */
bool hyprlandCommand(const QByteArray &command)
{
    const QString instance = qEnvironmentVariable("HYPRLAND_INSTANCE_SIGNATURE");
    const QString runtime = qEnvironmentVariable("XDG_RUNTIME_DIR");
    if (instance.isEmpty() || runtime.isEmpty())
        return false;
    QLocalSocket socket;
    socket.connectToServer(runtime + QStringLiteral("/hypr/") + instance + QStringLiteral("/.socket.sock"));
    if (!socket.waitForConnected(300))
        return false;
    socket.write(command);
    socket.waitForBytesWritten(300);
    socket.waitForReadyRead(300);
    return socket.readAll().trimmed() == "ok";
}
}

void AppBridge::setWindow(QWindow *window)
{
    m_window = window;
}

bool AppBridge::notificationsAvailable() const
{
#ifdef Q_OS_LINUX
    return QDBusConnection::sessionBus().isConnected()
        && QDBusConnection::sessionBus().interface()->isServiceRegistered(kNotifyService);
#else
    return false;
#endif
}

bool AppBridge::notify(const QString &title, const QString &body)
{
    return notifyWith(title, body, {});
}

bool AppBridge::notifyWith(const QString &title, const QString &body, const QVariantMap &options)
{
#ifdef Q_OS_LINUX
    QDBusConnection bus = QDBusConnection::sessionBus();
    if (!bus.isConnected())
        return false;

    /* Las señales del servicio (acción pulsada, testigo de activación, cierre) se escuchan una vez. */
    if (!m_notificationSignals) {
        m_notificationSignals = true;
        bus.connect(kNotifyService, kNotifyPath, kNotifyService, QStringLiteral("ActionInvoked"),
                    this, SLOT(onNotificationAction(uint, QString)));
        bus.connect(kNotifyService, kNotifyPath, kNotifyService, QStringLiteral("ActivationToken"),
                    this, SLOT(onActivationToken(uint, QString)));
        bus.connect(kNotifyService, kNotifyPath, kNotifyService, QStringLiteral("NotificationClosed"),
                    this, SLOT(onNotificationClosed(uint, uint)));
    }

    /* Icono: el del tema si la app está instalada; si no, el propio en un archivo. */
    if (m_notificationIcon.isEmpty()) {
        const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
        const QString file = dir + QStringLiteral("/icono.png");
        if (!QFile::exists(file)) {
            QDir().mkpath(dir);
            QFile::copy(QStringLiteral(":/qt/qml/StartCode/assets/icons/app-512.png"), file);
        }
        m_notificationIcon = QFile::exists(file) ? file : QGuiApplication::desktopFileName();
    }

    const QString urgencyName = options.value(QStringLiteral("urgency")).toString();
    const uchar urgency = urgencyName == QLatin1String("critical") ? 2 : urgencyName == QLatin1String("low") ? 0 : 1;
    const QString tag = options.value(QStringLiteral("tag")).toString();
    const QString replaceTag = options.value(QStringLiteral("replaceTag")).toString();

    QVariantMap hints;
    hints.insert(QStringLiteral("urgency"), QVariant::fromValue(urgency));
    /* Con esto el escritorio agrupa los avisos bajo la app y usa su icono y su nombre. */
    hints.insert(QStringLiteral("desktop-entry"), QGuiApplication::desktopFileName());
    hints.insert(QStringLiteral("category"), urgency == 2 ? QStringLiteral("device.error") : QStringLiteral("im.received"));

    /* `default` es el clic sobre el aviso; la otra, su botón visible. */
    const QStringList actions { QStringLiteral("default"), QStringLiteral("Abrir"), QStringLiteral("open"), QStringLiteral("Abrir StartCode Panel") };
    const uint replaces = replaceTag.isEmpty() ? 0 : m_notificationIds.value(replaceTag, 0);
    /* Las críticas se quedan hasta que el usuario las atienda (0); las demás, lo que decida el escritorio (-1). */
    const int timeout = urgency == 2 ? 0 : -1;

    QDBusMessage call = QDBusMessage::createMethodCall(kNotifyService, kNotifyPath, kNotifyService, QStringLiteral("Notify"));
    call.setArguments({ QGuiApplication::applicationName(), replaces, m_notificationIcon, title, body, actions, hints, timeout });
    const QDBusMessage reply = bus.call(call, QDBus::Block, 1500);
    if (reply.type() != QDBusMessage::ReplyMessage || reply.arguments().isEmpty())
        return false;

    const uint id = reply.arguments().constFirst().toUInt();
    m_notificationTags.insert(id, tag);
    if (!replaceTag.isEmpty())
        m_notificationIds.insert(replaceTag, id);
    return true;
#else
    Q_UNUSED(title)
    Q_UNUSED(body)
    Q_UNUSED(options)
    return false;
#endif
}

void AppBridge::onActivationToken(uint id, const QString &token)
{
    /* Llega justo antes de `ActionInvoked`: es el permiso de Wayland para tomar el foco. */
    if (m_notificationTags.contains(id))
        m_activationToken = token;
}

void AppBridge::onNotificationAction(uint id, const QString &action)
{
    Q_UNUSED(action)
    if (!m_notificationTags.contains(id))
        return;   /* aviso de otra aplicación */
    const QString tag = m_notificationTags.take(id);
    activateWindow();
    emit notificationActivated(tag);
}

void AppBridge::onNotificationClosed(uint id, uint reason)
{
    Q_UNUSED(reason)
    m_notificationTags.remove(id);
}

void AppBridge::activateWindow()
{
    if (!m_window)
        return;
    if (m_window->visibility() == QWindow::Minimized || !m_window->isVisible())
        m_window->showNormal();

    /* Wayland solo deja tomar el foco con un testigo de activación: el del
       aviso pulsado. Qt lo recoge de esta variable en la siguiente petición. */
    if (!m_activationToken.isEmpty()) {
        qputenv("XDG_ACTIVATION_TOKEN", m_activationToken.toUtf8());
        m_activationToken.clear();
    }
    m_window->raise();
    m_window->requestActivate();

    /* En Hyprland, además, se le pide al compositor directamente: enfoca la
       ventana y cambia al espacio de trabajo donde esté. Las versiones con
       configuración en Lua usan `hl.dsp.focus`; las anteriores, `focuswindow`. */
    const QByteArray pattern = "class:^(" + QRegularExpression::escape(QGuiApplication::desktopFileName()).toUtf8() + ")$";
    QByteArray luaPattern = pattern;
    luaPattern.replace("\\", "\\\\");
    if (!hyprlandCommand("dispatch hl.dsp.focus({ window = \"" + luaPattern + "\" })"))
        hyprlandCommand("dispatch focuswindow " + pattern);
}

QString AppBridge::platform() const
{
#if defined(Q_OS_WIN)
    return QStringLiteral("windows");
#elif defined(Q_OS_MACOS)
    return QStringLiteral("macos");
#else
    return QStringLiteral("linux");
#endif
}

QString AppBridge::architecture() const
{
    return QSysInfo::currentCpuArchitecture();
}

QObject *AppBridge::openSocket(const QString &nsp, const QVariantMap &auth)
{
    auto *socket = new SocketIoClient;
    QQmlEngine::setObjectOwnership(socket, QQmlEngine::JavaScriptOwnership);
    socket->setScriptEngine(m_engine);
    socket->setReconnect(false);
    socket->configure(m_api->socketUrl(), nsp);
    socket->setAuthProvider([this, auth] {
        QJsonObject payload = QJsonObject::fromVariantMap(auth);
        payload.insert(QStringLiteral("token"), m_session->accessToken());
        return payload;
    });
    socket->open();
    return socket;
}

void AppBridge::copy(const QString &text)
{
    QGuiApplication::clipboard()->setText(text);
}

QString AppBridge::clipboardText() const
{
    return QGuiApplication::clipboard()->text();
}

void AppBridge::openExternal(const QString &urlOrPath)
{
    const QUrl url = QFileInfo::exists(urlOrPath) ? QUrl::fromLocalFile(urlOrPath) : QUrl(urlOrPath);
    const QString scheme = url.scheme();
    if (scheme == QLatin1String("http") || scheme == QLatin1String("https") || url.isLocalFile())
        QDesktopServices::openUrl(url);
}

QString AppBridge::accessToken() const
{
    return m_session->accessToken();
}

QString AppBridge::apiUrl() const
{
    return m_api->baseUrl();
}

namespace {
/* Los datos locales van en su propio grupo, separados de la sesión. */
QString storeKey(const QString &key)
{
    return QStringLiteral("local/") + QString::fromLatin1(key.toUtf8().toBase64(QByteArray::Base64UrlEncoding));
}
}

QVariant AppBridge::storeGet(const QString &key) const
{
    const QVariant raw = m_store.value(storeKey(key));
    if (!raw.isValid())
        return {};
    /* Se guarda como JSON envuelto en una lista: así caben también textos y números sueltos. */
    return QJsonDocument::fromJson(raw.toByteArray()).array().at(0).toVariant();
}

void AppBridge::storeSet(const QString &key, const QVariant &value)
{
    const QJsonArray wrapped { QJsonValue::fromVariant(plainVariant(value)) };
    m_store.setValue(storeKey(key), QJsonDocument(wrapped).toJson(QJsonDocument::Compact));
}

void AppBridge::storeRemove(const QString &key)
{
    m_store.remove(storeKey(key));
}

QString AppBridge::writeTextFile(const QString &path, const QString &text) const
{
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return file.errorString();
    const QByteArray data = text.toUtf8();
    if (file.write(data) != data.size())
        return file.errorString();
    return {};
}
