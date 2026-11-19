#pragma once

#include <QJsonObject>
#include <QObject>
#include <QSettings>
#include <QString>

/**
 * Tokens y datos de la cuenta. Con «Mantener sesión iniciada» se guardan en
 * disco; sin ella viven solo en memoria y se pierden al cerrar la app.
 * Las claves son las mismas que usaba el store de la app anterior.
 */
class SessionStore : public QObject
{
    Q_OBJECT

public:
    explicit SessionStore(QObject *parent = nullptr);

    QString accessToken() const { return m_access; }
    QString refreshToken() const { return m_refresh; }
    QJsonObject user() const { return m_user; }
    bool hasSession() const { return !m_access.isEmpty(); }
    /** Sesión con «Mantener sesión iniciada»: se guarda en disco. */
    bool remembered() const { return m_remember; }

    void setTokens(const QString &access, const QString &refresh, bool remember);
    /** Rotación tras un refresh: conserva la elección de persistencia. */
    void rotateTokens(const QString &access, const QString &refresh);
    void setUser(const QJsonObject &user);
    void clear();

    /* Dispositivo de confianza del 2FA, uno por cuenta. No se borra al cerrar sesión. */
    QString trustedDeviceToken(const QString &email) const;
    void saveTrustedDeviceToken(const QString &email, const QString &token);

private:
    void persist();

    mutable QSettings m_settings;
    QString m_access;
    QString m_refresh;
    QJsonObject m_user;
    bool m_remember = false;
};
