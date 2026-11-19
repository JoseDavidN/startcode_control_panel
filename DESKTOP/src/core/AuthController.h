#pragma once

#include "core/ApiClient.h"

#include <QJsonObject>
#include <QObject>
#include <QTimer>
#include <QVariantMap>

class SessionStore;

/** Sesión del usuario para la interfaz: inicio, 2FA, contraseña caducada y cierre. */
class AuthController : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool authenticated READ authenticated NOTIFY userChanged)
    Q_PROPERTY(QVariantMap user READ user NOTIFY userChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    /** `credentials`, `twoFactor` o `passwordChange`. */
    Q_PROPERTY(QString step READ step NOTIFY stepChanged)
    /** Motivo por el que se cerró la sesión, para mostrarlo en el login. */
    Q_PROPERTY(QString notice READ notice NOTIFY noticeChanged)
    /** Sesión con «Mantener sesión iniciada»: no se cierra por inactividad. */
    Q_PROPERTY(bool persistent READ persistent NOTIFY userChanged)
    /** Preferencias de la cuenta, ya completadas con los valores por defecto. */
    Q_PROPERTY(QVariantMap preferences READ preferences NOTIFY userChanged)
    /** Sincronización de las preferencias: `local`, `syncing`, `synced` o `error`. */
    Q_PROPERTY(QString prefsStatus READ prefsStatus NOTIFY prefsStatusChanged)

public:
    AuthController(ApiClient *api, SessionStore *session, QObject *parent = nullptr);

    bool authenticated() const { return !m_user.isEmpty(); }
    QVariantMap user() const { return m_user; }
    bool busy() const { return m_busy; }
    QString error() const { return m_error; }
    QString step() const { return m_step; }
    QString notice() const { return m_notice; }
    QVariantMap preferences() const;
    bool persistent() const;
    QString prefsStatus() const { return m_prefsStatus; }

    /** Recupera la sesión guardada y la confirma contra `/auth/me`. */
    Q_INVOKABLE void restore();
    Q_INVOKABLE void login(const QString &email, const QString &password, bool rememberMe);
    Q_INVOKABLE void verifyTwoFactor(const QString &code, bool backupCode);
    Q_INVOKABLE void changeExpiredPassword(const QString &currentPassword, const QString &newPassword);
    Q_INVOKABLE void backToCredentials();
    Q_INVOKABLE void logout();
    /**
     * Cambia preferencias de una sección (`appearance`, `notifications`,
     * `security`, `monitoring`): al momento en local y, 600 ms después del
     * último cambio, en la cuenta (un solo envío con todo lo pendiente).
     */
    Q_INVOKABLE void patchPreferences(const QString &section, const QVariantMap &values);
    /** Envía ya lo pendiente; al terminar emite `preferencesFlushed(ok)`. */
    Q_INVOKABLE void flushPreferences();
    /** Vuelve a pedir el usuario (`/auth/me`): tras cambiar el perfil, el 2FA… */
    Q_INVOKABLE void refreshUser();

    /** El backend terminó la sesión y avisó por un socket (`auth:revoked`). */
    Q_INVOKABLE void sessionRevoked(const QString &reason, const QString &message);

signals:
    void userChanged();
    void busyChanged();
    void errorChanged();
    void stepChanged();
    void noticeChanged();
    void prefsStatusChanged();
    void preferencesFlushed(bool ok);

private:
    /** `fallback`: texto del paso cuando el backend responde con una lista de errores de validación. */
    void handleAuthPayload(const ApiResult &result, const QString &fallback = {});
    void endSession(const QString &notice);
    void setUser(const QJsonObject &rawUser);
    void setBusy(bool busy);
    void setError(const QString &error);
    void setStep(const QString &step);
    void setNotice(const QString &notice);

    ApiClient *m_api;
    SessionStore *m_session;
    QVariantMap m_user;
    QString m_error;
    QString m_notice;
    QString m_step = QStringLiteral("credentials");
    QString m_tempToken;
    QString m_pendingEmail;
    bool m_rememberMe = false;
    bool m_busy = false;
    bool m_loggingOut = false;

    void setPrefsStatus(const QString &status);
    QTimer m_prefsTimer;
    QJsonObject m_prefsPending;
    QString m_prefsStatus = QStringLiteral("local");
    bool m_prefsSending = false;
};
