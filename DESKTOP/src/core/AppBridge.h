#pragma once

#include <QJSValue>
#include <QNetworkAccessManager>
#include <QHash>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QSettings>
#include <QVariant>
#include <QVariantMap>

class ApiClient;
class QJSEngine;
class SessionStore;
class SocketIoClient;
class QWindow;

/** Servicios del sistema para QML: sockets con sesión, portapapeles y enlaces. */
class AppBridge : public QObject
{
    Q_OBJECT

public:
    AppBridge(ApiClient *api, SessionStore *session, QJSEngine *engine, QObject *parent = nullptr);

    /**
     * Abre un socket del panel en `nsp` (`/terminal`, `/sftp`…). El token de la
     * sesión se añade solo a `auth`. Sin reconexión automática: son sesiones.
     * El objeto es de quien lo pide: guardarlo en una propiedad y llamar a
     * `close()` y `destroy()` al terminar.
     */
    Q_INVOKABLE QObject *openSocket(const QString &nsp, const QVariantMap &auth = {});

    Q_INVOKABLE void copy(const QString &text);
    Q_INVOKABLE QString clipboardText() const;
    /** Abre una URL http(s) en el navegador o una carpeta en el gestor de archivos. */
    Q_INVOKABLE void openExternal(const QString &urlOrPath);
    /** Token de acceso vigente, para peticiones que no pasan por `Api`. */
    Q_INVOKABLE QString accessToken() const;
    /** URL base del API (`…/api/v1`). */
    Q_INVOKABLE QString apiUrl() const;

    /* Datos locales del equipo (pestañas del editor SQL, consultas guardadas…):
       equivalen al localStorage de la app anterior. El valor es cualquier dato
       JSON (objeto, lista, texto, número); `storeGet` devuelve `undefined` si
       la clave no existe. */
    Q_INVOKABLE QVariant storeGet(const QString &key) const;
    Q_INVOKABLE void storeSet(const QString &key, const QVariant &value);
    Q_INVOKABLE void storeRemove(const QString &key);

    /** Milisegundos (época) de la última tecla, clic, rueda o movimiento del ratón en la app. */
    Q_INVOKABLE qint64 lastActivityMs() const { return m_lastActivity; }
    /** GET a una URL externa (notas de versión, actualizaciones): `callback(ok, texto, estado)`. Sin cabeceras de sesión. */
    Q_INVOKABLE void httpGet(const QString &url, const QJSValue &callback);
    /** Notificación del sistema. Devuelve false si el equipo no las admite. */
    Q_INVOKABLE bool notify(const QString &title, const QString &body);
    /**
     * Notificación del sistema con opciones: `urgency` (`low`, `normal`,
     * `critical`: esta no caduca sola), `tag` (vuelve en `notificationActivated`
     * cuando el usuario la pulsa) y `replaceTag` (sustituye a la anterior con
     * esa etiqueta en vez de apilar otra).
     */
    Q_INVOKABLE bool notifyWith(const QString &title, const QString &body, const QVariantMap &options);
    /** Trae la ventana de la app al frente (y a su espacio de trabajo). */
    Q_INVOKABLE void activateWindow();

    /** Ventana principal: la que se activa al pulsar una notificación. */
    void setWindow(QWindow *window);
    /** Si este equipo puede mostrar notificaciones del sistema. */
    Q_INVOKABLE bool notificationsAvailable() const;
    /** Sistema del equipo: `linux`, `windows` o `macos`. */
    Q_INVOKABLE QString platform() const;
    /** Arquitectura del equipo (`x86_64`, `arm64`…). */
    Q_INVOKABLE QString architecture() const;

    /** Escribe un archivo de texto (UTF-8). Devuelve "" si fue bien, o el motivo del fallo. */
    Q_INVOKABLE QString writeTextFile(const QString &path, const QString &text) const;

signals:
    /** El usuario pulsó una notificación del sistema; `tag` es la etiqueta con la que se envió. */
    void notificationActivated(const QString &tag);

private slots:
    void onNotificationAction(uint id, const QString &action);
    void onActivationToken(uint id, const QString &token);
    void onNotificationClosed(uint id, uint reason);

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    QNetworkAccessManager m_network;
    qint64 m_lastActivity = 0;
    QPointer<QWindow> m_window;
    QHash<uint, QString> m_notificationTags;
    QHash<QString, uint> m_notificationIds;
    QString m_activationToken;
    QString m_notificationIcon;
    bool m_notificationSignals = false;
    ApiClient *m_api;
    SessionStore *m_session;
    QJSEngine *m_engine;
    mutable QSettings m_store;
};
