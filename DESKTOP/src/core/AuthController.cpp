#include "core/AuthController.h"

#include "core/SessionStore.h"

#include <utility>

namespace {
QString pick(const QJsonObject &object, const char *first, const char *second)
{
    const QString value = object.value(QLatin1String(first)).toString();
    return value.isEmpty() ? object.value(QLatin1String(second)).toString() : value;
}

/* El backend manda el usuario ya normalizado ({ email, role }) o como entidad ({ str_email, enu_role }). */
QJsonObject normalizeUser(const QJsonObject &raw)
{
    const QString firstname = pick(raw, "firstname", "str_firstname");
    const QString lastname = pick(raw, "lastname", "str_lastname");
    QString name = raw.value(QLatin1String("name")).toString();
    if (name.isEmpty())
        name = QStringList({ firstname, lastname }).join(QLatin1Char(' ')).trimmed();

    QJsonObject user = raw;
    user.insert(QLatin1String("name"), name);
    user.insert(QLatin1String("firstname"), firstname);
    user.insert(QLatin1String("lastname"), lastname);
    user.insert(QLatin1String("email"), pick(raw, "str_email", "email"));
    user.insert(QLatin1String("role"), pick(raw, "enu_role", "role"));
    user.insert(QLatin1String("twoFactorEnabled"),
                raw.value(QLatin1String("twoFactorEnabled"))
                    .toBool(raw.value(QLatin1String("bol_two_factor_enabled")).toBool()));
    return user;
}
}

AuthController::AuthController(ApiClient *api, SessionStore *session, QObject *parent)
    : QObject(parent)
    , m_api(api)
    , m_session(session)
{
    m_prefsTimer.setSingleShot(true);
    m_prefsTimer.setInterval(600);
    connect(&m_prefsTimer, &QTimer::timeout, this, &AuthController::flushPreferences);

    connect(m_api, &ApiClient::sessionLost, this, [this](const QString &reason, const QString &message) {
        if (m_loggingOut)
            return;
        endSession(reason == QLatin1String("reuse") && !message.isEmpty()
                       ? message
                       : QStringLiteral("La sesión terminó"));
    });
}

void AuthController::restore()
{
    if (!m_session->hasSession())
        return;

    /* Los datos guardados dejan entrar de inmediato; `/auth/me` los confirma. */
    if (!m_session->user().isEmpty()) {
        m_user = m_session->user().toVariantMap();
        emit userChanged();
    }

    m_api->get(QStringLiteral("/auth/me"), [this](const ApiResult &result) {
        if (result.ok) {
            const QJsonObject data = result.data.toObject();
            setUser(data.contains(QLatin1String("user")) ? data.value(QLatin1String("user")).toObject() : data);
        } else if (result.status == 401 && authenticated()) {
            endSession(QStringLiteral("La sesión terminó"));
        }
    });
}

void AuthController::login(const QString &email, const QString &password, bool rememberMe)
{
    if (m_busy)
        return;
    setError({});
    setNotice({});
    setBusy(true);
    m_pendingEmail = email;
    m_rememberMe = rememberMe;

    QJsonObject body {
        { QStringLiteral("email"), email },
        { QStringLiteral("password"), password },
        { QStringLiteral("rememberMe"), rememberMe },
    };
    /* Dispositivo de confianza: con un 2FA reciente el backend no vuelve a pedir el código. */
    const QString trusted = m_session->trustedDeviceToken(email);
    if (!trusted.isEmpty())
        body.insert(QStringLiteral("trustedDeviceToken"), trusted);

    m_api->post(QStringLiteral("/auth/login"), body, [this](const ApiResult &result) {
        handleAuthPayload(result, QStringLiteral("Credenciales incorrectas."));
    });
}

void AuthController::verifyTwoFactor(const QString &code, bool backupCode)
{
    if (m_busy)
        return;
    setError({});
    setBusy(true);
    m_api->post(QStringLiteral("/auth/2fa/verify-login"),
                {
                    { QStringLiteral("tempToken"), m_tempToken },
                    { backupCode ? QStringLiteral("backupCode") : QStringLiteral("code"), code },
                },
                [this](const ApiResult &result) {
                    handleAuthPayload(result, QStringLiteral("Código inválido o expirado."));
                });
}

void AuthController::changeExpiredPassword(const QString &currentPassword, const QString &newPassword)
{
    if (m_busy)
        return;
    setError({});
    setBusy(true);
    m_api->post(QStringLiteral("/auth/change-expired-password"),
                {
                    { QStringLiteral("tempToken"), m_tempToken },
                    { QStringLiteral("currentPassword"), currentPassword },
                    { QStringLiteral("newPassword"), newPassword },
                },
                [this](const ApiResult &result) {
                    handleAuthPayload(result, QStringLiteral("No se pudo cambiar la contraseña."));
                });
}

void AuthController::handleAuthPayload(const ApiResult &result, const QString &fallback)
{
    setBusy(false);
    if (!result.ok) {
        /* Como en la app web: una lista de errores de validación no se enseña
           tal cual (puede venir en inglés), se sustituye por el texto del paso. */
        const bool validationList = result.body.value(QLatin1String("message")).isArray();
        setError(validationList && !fallback.isEmpty() ? fallback : result.message);
        return;
    }

    const QJsonObject data = result.data.toObject();

    const QString trusted = data.value(QLatin1String("trustedDeviceToken")).toString();
    if (!trusted.isEmpty() && !m_pendingEmail.isEmpty())
        m_session->saveTrustedDeviceToken(m_pendingEmail, trusted);

    /* Respuestas sin sesión: falta el código 2FA o la contraseña caducó. */
    if (data.value(QLatin1String("requiresTwoFactor")).toBool()) {
        m_tempToken = data.value(QLatin1String("tempToken")).toString();
        setStep(QStringLiteral("twoFactor"));
        return;
    }
    if (data.value(QLatin1String("requiresPasswordChange")).toBool()) {
        m_tempToken = data.value(QLatin1String("tempToken")).toString();
        setStep(QStringLiteral("passwordChange"));
        return;
    }

    const QJsonObject tokens = data.value(QLatin1String("tokens")).toObject();
    QString access = tokens.value(QLatin1String("accessToken")).toString();
    if (access.isEmpty())
        access = data.value(QLatin1String("token")).toString();
    QString refresh = tokens.value(QLatin1String("refreshToken")).toString();
    if (refresh.isEmpty())
        refresh = data.value(QLatin1String("refreshToken")).toString();
    const QJsonObject user = data.value(QLatin1String("user")).toObject();

    if (access.isEmpty() || user.isEmpty()) {
        setError(QStringLiteral("Respuesta inválida del servidor en login"));
        return;
    }

    const bool remember = data.contains(QLatin1String("rememberMe"))
        ? data.value(QLatin1String("rememberMe")).toBool()
        : m_rememberMe;
    m_session->setTokens(access, refresh, remember);
    m_tempToken.clear();
    setStep(QStringLiteral("credentials"));
    setUser(user);
}

void AuthController::backToCredentials()
{
    m_tempToken.clear();
    setError({});
    setStep(QStringLiteral("credentials"));
}

void AuthController::logout()
{
    if (m_loggingOut)
        return;
    m_loggingOut = true;
    /* Pase lo que pase con la petición, la sesión local se cierra. */
    m_api->post(QStringLiteral("/auth/logout"), {}, [this](const ApiResult &) {
        m_loggingOut = false;
        endSession({});
    });
}

namespace {
QJsonObject defaultPreferences()
{
    return {
        { QStringLiteral("appearance"), QJsonObject {
            { QStringLiteral("theme"), QStringLiteral("dark") }, { QStringLiteral("font"), QStringLiteral("grotesk") },
            { QStringLiteral("sidebarMode"), QStringLiteral("expanded") }, { QStringLiteral("reducedMotion"), false },
            { QStringLiteral("serversView"), QStringLiteral("cards") } } },
        { QStringLiteral("notifications"), QJsonObject {
            { QStringLiteral("serverOffline"), true }, { QStringLiteral("highCpuUsage"), true },
            { QStringLiteral("highMemoryUsage"), true }, { QStringLiteral("highDiskUsage"), false },
            { QStringLiteral("weeklyReport"), true }, { QStringLiteral("productNews"), false } } },
        { QStringLiteral("security"), QJsonObject {
            { QStringLiteral("sessionTimeout"), 30 }, { QStringLiteral("passwordExpiration"), 90 } } },
        { QStringLiteral("monitoring"), QJsonObject {
            { QStringLiteral("refreshInterval"), 30 }, { QStringLiteral("cpuThreshold"), 80 },
            { QStringLiteral("memoryThreshold"), 85 }, { QStringLiteral("diskThreshold"), 90 } } },
    };
}
}

bool AuthController::persistent() const
{
    return m_session->remembered();
}

QVariantMap AuthController::preferences() const
{
    /* Por sección: lo guardado en la cuenta sobre los valores por defecto. */
    QJsonObject merged = defaultPreferences();
    const QJsonObject saved = m_session->user().value(QLatin1String("preferences")).toObject();
    for (auto section = merged.begin(); section != merged.end(); ++section) {
        QJsonObject values = section.value().toObject();
        const QJsonObject own = saved.value(section.key()).toObject();
        for (auto it = own.begin(); it != own.end(); ++it) {
            if (!it.value().isNull() && !it.value().isUndefined())
                values.insert(it.key(), it.value());
        }
        section.value() = values;
    }
    return merged.toVariantMap();
}

void AuthController::setPrefsStatus(const QString &status)
{
    if (m_prefsStatus == status)
        return;
    m_prefsStatus = status;
    emit prefsStatusChanged();
}

void AuthController::patchPreferences(const QString &section, const QVariantMap &values)
{
    if (!authenticated())
        return;

    QJsonObject user = m_session->user();
    QJsonObject preferences = user.value(QLatin1String("preferences")).toObject();
    QJsonObject current = preferences.value(section).toObject();
    QJsonObject pending = m_prefsPending.value(section).toObject();
    const QJsonObject changes = QJsonObject::fromVariantMap(values);
    for (auto it = changes.begin(); it != changes.end(); ++it) {
        current.insert(it.key(), it.value());
        pending.insert(it.key(), it.value());
    }
    preferences.insert(section, current);
    user.insert(QLatin1String("preferences"), preferences);
    m_prefsPending.insert(section, pending);

    m_session->setUser(user);
    m_user = user.toVariantMap();
    emit userChanged();

    setPrefsStatus(QStringLiteral("local"));
    m_prefsTimer.start();
}

void AuthController::flushPreferences()
{
    m_prefsTimer.stop();
    if (m_prefsSending)
        return;   /* al volver la respuesta se manda lo que haya quedado pendiente */
    if (m_prefsPending.isEmpty() || !authenticated()) {
        emit preferencesFlushed(m_prefsStatus != QLatin1String("error"));
        return;
    }

    const QJsonObject sending = std::exchange(m_prefsPending, {});
    m_prefsSending = true;
    setPrefsStatus(QStringLiteral("syncing"));
    m_api->patch(QStringLiteral("/auth/preferences"), sending, [this, sending](const ApiResult &result) {
        m_prefsSending = false;
        if (!result.ok) {
            /* Lo no enviado vuelve a la cola, sin pisar cambios más nuevos. */
            for (auto section = sending.begin(); section != sending.end(); ++section) {
                QJsonObject merged = section.value().toObject();
                const QJsonObject newer = m_prefsPending.value(section.key()).toObject();
                for (auto it = newer.begin(); it != newer.end(); ++it)
                    merged.insert(it.key(), it.value());
                m_prefsPending.insert(section.key(), merged);
            }
            setPrefsStatus(QStringLiteral("error"));
            emit preferencesFlushed(false);
            return;
        }
        if (!m_prefsPending.isEmpty()) {
            flushPreferences();
            return;
        }
        setPrefsStatus(QStringLiteral("synced"));
        emit preferencesFlushed(true);
    });
}

void AuthController::refreshUser()
{
    if (!m_session->hasSession())
        return;
    m_api->get(QStringLiteral("/auth/me"), [this](const ApiResult &result) {
        if (!result.ok)
            return;
        const QJsonObject data = result.data.toObject();
        setUser(data.contains(QLatin1String("user")) ? data.value(QLatin1String("user")).toObject() : data);
    });
}

void AuthController::sessionRevoked(const QString &reason, const QString &message)
{
    if (m_loggingOut || !authenticated())
        return;
    /* Tras un cierre pedido por el usuario no hay nada que explicar. */
    endSession(reason == QLatin1String("logout")
                   ? QString()
                   : (message.isEmpty() ? QStringLiteral("La sesión terminó") : message));
}

void AuthController::endSession(const QString &notice)
{
    m_prefsTimer.stop();
    m_prefsPending = {};
    m_session->clear();
    m_tempToken.clear();
    setStep(QStringLiteral("credentials"));
    setNotice(notice);
    if (!m_user.isEmpty()) {
        m_user.clear();
        emit userChanged();
    }
}

void AuthController::setUser(const QJsonObject &rawUser)
{
    const QJsonObject user = normalizeUser(rawUser);
    m_session->setUser(user);
    m_user = user.toVariantMap();
    emit userChanged();
}

void AuthController::setBusy(bool busy)
{
    if (m_busy == busy)
        return;
    m_busy = busy;
    emit busyChanged();
}

void AuthController::setError(const QString &error)
{
    if (m_error == error)
        return;
    m_error = error;
    emit errorChanged();
}

void AuthController::setStep(const QString &step)
{
    if (m_step == step)
        return;
    m_step = step;
    emit stepChanged();
}

void AuthController::setNotice(const QString &notice)
{
    if (m_notice == notice)
        return;
    m_notice = notice;
    emit noticeChanged();
}
