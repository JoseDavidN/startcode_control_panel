#include "core/SessionStore.h"

#include <QJsonDocument>

namespace {
const QString kAccess = QStringLiteral("access_token");
const QString kRefresh = QStringLiteral("refresh_token");
const QString kUser = QStringLiteral("user_data");
const QString kRemember = QStringLiteral("remember_me");
const QString kTrusted = QStringLiteral("2fa-trusted");
}

SessionStore::SessionStore(QObject *parent)
    : QObject(parent)
{
    m_remember = m_settings.value(kRemember, false).toBool();
    if (m_remember) {
        m_access = m_settings.value(kAccess).toString();
        m_refresh = m_settings.value(kRefresh).toString();
        m_user = QJsonDocument::fromJson(m_settings.value(kUser).toByteArray()).object();
    }
}

void SessionStore::setTokens(const QString &access, const QString &refresh, bool remember)
{
    m_access = access;
    m_refresh = refresh;
    m_remember = remember;
    persist();
}

void SessionStore::rotateTokens(const QString &access, const QString &refresh)
{
    m_access = access;
    if (!refresh.isEmpty())
        m_refresh = refresh;
    persist();
}

void SessionStore::setUser(const QJsonObject &user)
{
    m_user = user;
    persist();
}

void SessionStore::clear()
{
    m_access.clear();
    m_refresh.clear();
    m_user = {};
    m_remember = false;
    persist();
}

void SessionStore::persist()
{
    m_settings.setValue(kRemember, m_remember);
    if (m_remember) {
        m_settings.setValue(kAccess, m_access);
        m_settings.setValue(kRefresh, m_refresh);
        m_settings.setValue(kUser, QJsonDocument(m_user).toJson(QJsonDocument::Compact));
    } else {
        m_settings.remove(kAccess);
        m_settings.remove(kRefresh);
        m_settings.remove(kUser);
    }
}

QString SessionStore::trustedDeviceToken(const QString &email) const
{
    return m_settings.value(kTrusted).toMap().value(email.trimmed().toLower()).toString();
}

void SessionStore::saveTrustedDeviceToken(const QString &email, const QString &token)
{
    QVariantMap all = m_settings.value(kTrusted).toMap();
    all.insert(email.trimmed().toLower(), token);
    m_settings.setValue(kTrusted, all);
}
