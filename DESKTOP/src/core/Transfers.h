#pragma once

#include <QHash>
#include <QList>
#include <QNetworkAccessManager>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QUrl>
#include <QVariant>
#include <QVariantList>
#include <QVariantMap>

#include <atomic>

class ApiClient;
class QNetworkReply;
class QNetworkRequest;
class QThread;
class SessionStore;

/**
 * Transferencias de archivos para QML: subida por trozos, descarga a disco y
 * el sistema de archivos local que necesita un explorador (elegir, soltar,
 * recorrer carpetas).
 *
 * Quien llama elige el `id` de cada transferencia y lo recibe de vuelta en las
 * señales; `cancel(id)` vale para subidas y descargas. Nada pasa entero por
 * memoria: la subida lee solo su tramo del archivo y la descarga escribe según
 * llega, en un archivo temporal que se renombra al terminar.
 *
 * No renueva el token: antes de una descarga se hace una petición normal con
 * `Api` (que sí lo renueva) y ante un 401 en una subida se repite tras otra.
 */
class Transfers : public QObject
{
    Q_OBJECT

public:
    Transfers(ApiClient *api, SessionStore *session, QObject *parent = nullptr);
    ~Transfers() override;

    /* ── Red ───────────────────────────────────────────────────────── */

    /**
     * PUT `application/octet-stream` con los bytes `[offset, offset + length)`
     * de `localPath`. `apiPath` va tras `/api/v1` (con su consulta ya
     * codificada) o es una URL http(s) completa.
     */
    Q_INVOKABLE void uploadChunk(const QString &id, const QString &apiPath, const QString &localPath,
                                 qint64 offset, qint64 length);
    /**
     * GET a `destPath`. `target`: ruta del API o URL http(s) completa. `token`
     * solo hace falta para otro servicio (la nube); con el API del panel se usa
     * el de la sesión.
     */
    Q_INVOKABLE void download(const QString &id, const QString &target, const QString &destPath,
                              const QString &token = QString());
    /** Corta una subida o una descarga en curso; no hace nada si ya terminó. */
    Q_INVOKABLE void cancel(const QString &id);

    /* ── Sistema de archivos local ─────────────────────────────────── */

    /** `{ name, path, size, isDir, exists }`. */
    Q_INVOKABLE QVariantMap fileInfo(const QString &path) const;
    /**
     * Archivos bajo `path`, con la ruta relativa a la carpeta (incluido su
     * nombre): `{ path, relPath, name, size }`. Las carpetas de paquetes y
     * cachés que se dejan fuera van como `{ relPath, skipped: true }`.
     * Bloquea mientras recorre: para carpetas grandes, `scan`.
     */
    Q_INVOKABLE QVariantList listDirRecursive(const QString &path) const;
    /**
     * Lo mismo sin bloquear la interfaz y para varias rutas a la vez (lo
     * elegido en un diálogo o lo soltado): los archivos van tal cual y las
     * carpetas se recorren. Responde con `scanFinished`.
     */
    Q_INVOKABLE void scan(const QString &id, const QStringList &paths);
    /** Texto UTF-8 del archivo; `maxBytes` <= 0 lo lee entero. */
    Q_INVOKABLE QString readTextFile(const QString &path, qint64 maxBytes = 0) const;
    /** Ruta local de una URL `file://…` de `DropArea` o `FileDialog`; vacío si no es local. */
    Q_INVOKABLE QString localPathFromUrl(const QVariant &url) const;
    /** La inversa: para fijar la carpeta o el archivo inicial de un diálogo. */
    Q_INVOKABLE QUrl urlFromLocalPath(const QString &path) const;
    Q_INVOKABLE QString downloadsDir() const;
    Q_INVOKABLE QString joinPath(const QString &dir, const QString &name) const;
    Q_INVOKABLE QString parentDir(const QString &path) const;
    /** `path` si está libre; si existe (o está en `taken`), «nombre (1).ext», «nombre (2).ext»… */
    Q_INVOKABLE QString uniquePath(const QString &path, const QStringList &taken = {}) const;

signals:
    void uploadProgress(const QString &id, qint64 sent, qint64 total);
    /**
     * `status`: el de HTTP; 0 sin respuesta (red) o cancelada; -1 si no se
     * llegó a enviar (archivo ilegible). `body`: JSON de la respuesta.
     */
    void uploadFinished(const QString &id, bool ok, int status, const QVariant &body, const QString &error);
    /** Como mucho cada 150 ms. `total` -1 si el servidor no dice el tamaño. */
    void downloadProgress(const QString &id, qint64 received, qint64 total);
    /**
     * `code`: vacío si fue bien; si no, `CANCELLED`, `UNREACHABLE:<detalle>`,
     * `HTTP:<estado>:<cuerpo>`, `INTERRUPTED:<detalle>` o `FILE:<detalle>`.
     * `message`: lo mismo en palabras.
     */
    void downloadFinished(const QString &id, bool ok, const QString &code, const QString &message);
    /** `files`: `{ path, relPath, name, size }`. `skipped`: rutas relativas de las carpetas omitidas. */
    void scanFinished(const QString &id, const QVariantList &files, const QStringList &skipped);

private:
    struct Download;

    QUrl resolve(const QString &target) const;
    bool isApiUrl(const QUrl &url) const;
    QNetworkRequest buildRequest(const QUrl &url, const QString &token) const;
    bool beginDownload(Download *job);
    bool writeAvailable(Download *job);
    void finishDownload(Download *job);
    static QString describeDownloadError(const QString &code);

    QNetworkAccessManager m_network;
    ApiClient *m_api;
    SessionStore *m_session;
    QHash<QString, QNetworkReply *> m_uploads;
    QHash<QString, Download *> m_downloads;
    QList<QThread *> m_scans;
    std::atomic_bool m_stopScans { false };
};
