#include "core/Transfers.h"

#include "core/ApiClient.h"
#include "core/SessionStore.h"

#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QIODevice>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRandomGenerator>
#include <QSet>
#include <QStandardPaths>
#include <QThread>
#include <QTimer>

#include <algorithm>
#include <utility>

namespace {
/* Avisos de progreso de una descarga: como mucho uno cada 150 ms. */
constexpr int kReportEveryMs = 150;
/* Plazo para llegar al servidor; una vez enviada la petición no hay límite. */
constexpr int kConnectTimeoutMs = 15000;
/* Del cuerpo de un error solo interesa el mensaje. */
constexpr qsizetype kMaxErrorBody = 64 * 1024;

/**
 * Un tramo de un archivo como dispositivo de solo lectura. El gestor de red
 * lo va leyendo según envía, así una parte de 8 MB (o un archivo de varios
 * GB, parte a parte) nunca está entera en memoria.
 */
class FileSlice : public QIODevice
{
public:
    FileSlice(const QString &path, qint64 start, qint64 length)
        : m_file(path)
        , m_start(start)
        , m_length(length)
    {
    }

    /** Falso si el archivo no se puede leer o ya no llega hasta el final del tramo. */
    bool openSlice()
    {
        if (!m_file.open(QIODevice::ReadOnly)) {
            m_problem = m_file.errorString();
            return false;
        }
        if (m_start + m_length > m_file.size()) {
            m_problem = QStringLiteral("el archivo cambió desde que se eligió");
            return false;
        }
        m_cursor = 0;
        return QIODevice::open(QIODevice::ReadOnly | QIODevice::Unbuffered);
    }

    QString problem() const { return m_problem; }

    bool isSequential() const override { return false; }
    qint64 size() const override { return m_length; }

    /* El gestor de red vuelve al principio si tiene que repetir el envío. */
    bool seek(qint64 pos) override
    {
        if (pos < 0 || pos > m_length)
            return false;
        m_cursor = pos;
        return QIODevice::seek(pos);
    }

protected:
    qint64 readData(char *data, qint64 maxSize) override
    {
        const qint64 wanted = std::min(maxSize, m_length - m_cursor);
        if (wanted <= 0)
            return 0;
        if (!m_file.seek(m_start + m_cursor))
            return -1;
        const qint64 got = m_file.read(data, wanted);
        if (got > 0)
            m_cursor += got;
        return got;
    }

    qint64 writeData(const char *, qint64) override { return -1; }

private:
    QFile m_file;
    QString m_problem;
    qint64 m_start;
    qint64 m_length;
    qint64 m_cursor = 0;
};

/** Mensaje de un error de Nest: texto, o lista de errores de validación. */
QString messageOf(const QJsonObject &body, const QString &separator)
{
    const QJsonValue message = body.value(QLatin1String("message"));
    if (message.isArray()) {
        QStringList parts;
        const QJsonArray list = message.toArray();
        for (const QJsonValue &part : list)
            parts << part.toString();
        return parts.join(separator);
    }
    return message.toString();
}

/* ── Recorrido de carpetas ─────────────────────────────────────────── */

struct ScanResult
{
    QVariantList files;
    QStringList skipped;
};

/* Carpetas de dependencias y cachés que no se suben: miles de archivos que se
   regeneran con el gestor de paquetes. Un entorno virtual de Python con otro
   nombre se reconoce por su `pyvenv.cfg`. */
const QSet<QString> &packageDirs()
{
    static const QSet<QString> names = {
        QStringLiteral("node_modules"), QStringLiteral("bower_components"), QStringLiteral("jspm_packages"),
        QStringLiteral(".pnpm-store"), QStringLiteral("venv"), QStringLiteral(".venv"),
        QStringLiteral("__pycache__"), QStringLiteral(".pytest_cache"), QStringLiteral(".mypy_cache"),
        QStringLiteral(".ruff_cache"), QStringLiteral(".tox"), QStringLiteral(".gradle"),
    };
    return names;
}

QVariantMap fileEntry(const QString &path, const QString &relPath, qint64 size)
{
    return {
        { QStringLiteral("path"), path },
        { QStringLiteral("relPath"), relPath },
        { QStringLiteral("name"), relPath.section(u'/', -1) },
        { QStringLiteral("size"), static_cast<double>(size) },
    };
}

/** Todos los archivos bajo `dir`. `root`: la carpeta elegida, que nunca se omite. */
void walk(const QString &dir, const QString &prefix, bool root, ScanResult &out, const std::atomic_bool &stop)
{
    if (stop.load())
        return;

    const QFileInfoList entries = QDir(dir).entryInfoList(
        QDir::AllEntries | QDir::NoDotAndDotDot | QDir::Hidden | QDir::System, QDir::Name);

    if (!root) {
        const bool virtualEnv = std::any_of(entries.cbegin(), entries.cend(), [](const QFileInfo &entry) {
            return !entry.isSymLink() && entry.isFile() && entry.fileName() == QLatin1String("pyvenv.cfg");
        });
        if (virtualEnv || packageDirs().contains(prefix.section(u'/', -1))) {
            out.skipped << prefix;
            return;
        }
    }

    for (const QFileInfo &entry : entries) {
        /* Los enlaces simbólicos se saltan: pueden salir de la carpeta o hacer ciclos. */
        if (entry.isSymLink())
            continue;
        const QString rel = prefix + u'/' + entry.fileName();
        if (entry.isDir())
            walk(entry.absoluteFilePath(), rel, false, out, stop);
        else if (entry.isFile())
            out.files << fileEntry(entry.absoluteFilePath(), rel, entry.size());
    }
}

/** Lo elegido o soltado: los archivos, tal cual; las carpetas, con todo su árbol. */
ScanResult scanPaths(const QStringList &paths, const std::atomic_bool &stop)
{
    ScanResult result;
    for (const QString &path : paths) {
        const QFileInfo info(path);
        if (!info.exists())
            continue;
        if (info.isDir()) {
            const QDir dir(info.absoluteFilePath());
            const QString name = dir.dirName();
            walk(dir.absolutePath(), name.isEmpty() ? QStringLiteral("raiz") : name, true, result, stop);
        } else if (info.isFile()) {
            result.files << fileEntry(info.absoluteFilePath(), info.fileName(), info.size());
        }
    }
    return result;
}
}

/* Una descarga en curso. */
struct Transfers::Download
{
    QString id;
    QString dest;
    /* Archivo temporal junto al destino; vacío si se escribe directo en él. */
    QString partPath;
    QNetworkReply *reply = nullptr;
    QTimer *connectTimer = nullptr;
    QFile file;
    QElapsedTimer lastReport;
    QByteArray errorBody;
    /* Primer fallo propio (disco, plazo): manda sobre lo que diga la red. */
    QString failure;
    qint64 loaded = 0;
    qint64 total = -1;
    int status = 0;
    bool started = false;
    bool created = false;
    bool canceled = false;
};

Transfers::Transfers(ApiClient *api, SessionStore *session, QObject *parent)
    : QObject(parent)
    , m_api(api)
    , m_session(session)
{
}

Transfers::~Transfers()
{
    /* Sin avisar a nadie: la interfaz ya no está. */
    const QList<QNetworkReply *> uploads = m_uploads.values();
    m_uploads.clear();
    for (QNetworkReply *reply : uploads) {
        reply->disconnect(this);
        reply->abort();
    }

    const QList<Download *> downloads = m_downloads.values();
    m_downloads.clear();
    for (Download *job : downloads) {
        job->reply->disconnect(this);
        job->reply->abort();
        job->file.close();
        if (job->created)
            QFile::remove(job->partPath.isEmpty() ? job->dest : job->partPath);
        delete job;
    }

    m_stopScans.store(true);
    for (QThread *thread : std::as_const(m_scans))
        thread->wait();
}

/* ── Peticiones ────────────────────────────────────────────────────── */

QUrl Transfers::resolve(const QString &target) const
{
    if (target.startsWith(QLatin1String("http://"), Qt::CaseInsensitive)
        || target.startsWith(QLatin1String("https://"), Qt::CaseInsensitive))
        return QUrl(target);
    return QUrl(m_api->baseUrl() + target);
}

bool Transfers::isApiUrl(const QUrl &url) const
{
    const QUrl api(m_api->baseUrl());
    return url.scheme() == api.scheme() && url.host() == api.host() && url.port() == api.port();
}

QNetworkRequest Transfers::buildRequest(const QUrl &url, const QString &token) const
{
    QNetworkRequest request(url);
    request.setRawHeader("X-StartCode-Client", QByteArrayLiteral("desktop/" STARTCODE_VERSION));
    if (!token.isEmpty())
        request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
    /* El backend nunca redirige: seguir una redirección llevaría el token (o
       el archivo) a otro sitio. */
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    return request;
}

/* ── Subida ────────────────────────────────────────────────────────── */

void Transfers::uploadChunk(const QString &id, const QString &apiPath, const QString &localPath,
                            qint64 offset, qint64 length)
{
    /* Los fallos previos se avisan en diferido: quien llama aún no ha vuelto. */
    const auto reject = [this, id](const QString &message) {
        QMetaObject::invokeMethod(this, [this, id, message] {
            /* -1: ni se intentó (archivo ilegible, datos no válidos); repetirlo no lo arregla. */
            emit uploadFinished(id, false, -1, QVariantMap(), message);
        }, Qt::QueuedConnection);
    };

    if (id.isEmpty() || m_uploads.contains(id) || m_downloads.contains(id) || offset < 0 || length < 0) {
        reject(QStringLiteral("Subida no válida"));
        return;
    }
    const QUrl url = resolve(apiPath);
    if (!url.isValid() || url.host().isEmpty()) {
        reject(QStringLiteral("Dirección de subida no válida"));
        return;
    }

    QNetworkRequest request = buildRequest(url, isApiUrl(url) ? m_session->accessToken() : QString());
    request.setHeader(QNetworkRequest::ContentTypeHeader, QByteArrayLiteral("application/octet-stream"));
    request.setHeader(QNetworkRequest::ContentLengthHeader, QVariant::fromValue(length));

    QNetworkReply *reply = nullptr;
    if (length == 0) {
        /* Un archivo vacío también se crea en el servidor. */
        reply = m_network.put(request, QByteArray());
    } else {
        auto *slice = new FileSlice(localPath, offset, length);
        if (!slice->openSlice()) {
            reject(QStringLiteral("No se pudo leer el archivo: %1").arg(slice->problem()));
            delete slice;
            return;
        }
        reply = m_network.put(request, slice);
        slice->setParent(reply);
    }
    m_uploads.insert(id, reply);

    connect(reply, &QNetworkReply::uploadProgress, this, [this, id, length](qint64 sent, qint64 total) {
        /* Al terminar llega un (0, 0) que no es progreso. */
        if (total <= 0)
            return;
        emit uploadProgress(id, std::min(sent, length), length);
    });
    connect(reply, &QNetworkReply::finished, this, [this, id, reply] {
        reply->deleteLater();
        if (m_uploads.value(id) == reply)
            m_uploads.remove(id);

        if (reply->property("canceled").toBool()) {
            emit uploadFinished(id, false, 0, QVariantMap(), QStringLiteral("Cancelado"));
            return;
        }

        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QJsonDocument document = QJsonDocument::fromJson(reply->readAll());
        const QVariant body = document.isNull() ? QVariant(QVariantMap()) : document.toVariant();
        const bool ok = status >= 200 && status < 300;

        QString message;
        if (!ok) {
            message = messageOf(document.object(), QStringLiteral(", "));
            if (message.isEmpty())
                message = status == 0 ? QStringLiteral("No se recibió respuesta del servidor")
                                      : QStringLiteral("Error en la petición");
        }
        emit uploadFinished(id, ok, status, body, message);
    });
}

/* ── Descarga ──────────────────────────────────────────────────────── */

void Transfers::download(const QString &id, const QString &target, const QString &destPath, const QString &token)
{
    const auto reject = [this, id](const QString &code) {
        QMetaObject::invokeMethod(this, [this, id, code] {
            emit downloadFinished(id, false, code, describeDownloadError(code));
        }, Qt::QueuedConnection);
    };

    if (id.isEmpty() || m_downloads.contains(id) || m_uploads.contains(id)) {
        reject(QStringLiteral("FILE:identificador de descarga no válido"));
        return;
    }
    const QUrl url = resolve(target);
    const QString scheme = url.scheme().toLower();
    if (!url.isValid() || url.host().isEmpty()
        || (scheme != QLatin1String("http") && scheme != QLatin1String("https"))) {
        reject(QStringLiteral("UNREACHABLE:solo se admiten URL http o https"));
        return;
    }

    /* El token de la sesión solo viaja al API del panel. */
    const bool own = isApiUrl(url);
    const QString bearer = !token.isEmpty() ? token : own ? m_session->accessToken() : QString();
    const bool badToken = std::any_of(bearer.cbegin(), bearer.cend(), [](QChar c) { return c.category() == QChar::Other_Control; });
    if ((own && bearer.isEmpty()) || bearer.size() > 8192 || badToken) {
        reject(QStringLiteral("UNREACHABLE:token no válido"));
        return;
    }

    const QFileInfo dest(destPath);
    if (!dest.isAbsolute() || dest.isDir()) {
        reject(QStringLiteral("FILE:ruta de destino no permitida"));
        return;
    }

    QNetworkRequest request = buildRequest(url, bearer);
    /* Sin compresión de transporte: el tamaño anunciado es el del archivo. */
    request.setRawHeader("Accept-Encoding", "identity");

    auto *job = new Download;
    job->id = id;
    job->dest = dest.absoluteFilePath();
    job->reply = m_network.get(request);
    m_downloads.insert(id, job);

    job->connectTimer = new QTimer(job->reply);
    job->connectTimer->setSingleShot(true);
    job->connectTimer->setInterval(kConnectTimeoutMs);
    connect(job->connectTimer, &QTimer::timeout, this, [job] {
        job->failure = QStringLiteral("UNREACHABLE:el servidor no respondió a tiempo");
        job->reply->abort();
    });
    job->connectTimer->start();

    /* En estos tres, `abort()` va lo último: termina la descarga y libera `job`. */
    connect(job->reply, &QNetworkReply::requestSent, job->connectTimer, &QTimer::stop);
    connect(job->reply, &QNetworkReply::metaDataChanged, this, [this, job] {
        job->connectTimer->stop();
        if (!beginDownload(job))
            job->reply->abort();
    });
    connect(job->reply, &QNetworkReply::readyRead, this, [this, job] {
        if (!beginDownload(job) || !writeAvailable(job))
            job->reply->abort();
    });
    connect(job->reply, &QNetworkReply::finished, this, [this, job] { finishDownload(job); });
}

/** Con las cabeceras: abre el archivo y da el primer aviso. Falso si no se puede escribir. */
bool Transfers::beginDownload(Download *job)
{
    if (job->started)
        return true;
    job->status = job->reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (job->status == 0)
        return true;
    job->started = true;
    /* Un error llega con su cuerpo: se junta al terminar. */
    if (job->status < 200 || job->status >= 300)
        return true;

    const QVariant length = job->reply->header(QNetworkRequest::ContentLengthHeader);
    job->total = length.isValid() ? length.toLongLong() : -1;

    /* A un temporal junto al destino: si falla, lo que hubiera con ese nombre
       sigue intacto. Si la carpeta no deja crear más archivos, directo. */
    job->partPath = QStringLiteral("%1.%2.part").arg(job->dest,
        QString::number(QRandomGenerator::global()->generate(), 16));
    job->file.setFileName(job->partPath);
    if (!job->file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        job->partPath.clear();
        job->file.setFileName(job->dest);
        if (!job->file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
            job->failure = QStringLiteral("FILE:%1").arg(job->file.errorString());
            return false;
        }
    }
    job->created = true;
    job->lastReport.start();
    emit downloadProgress(job->id, 0, job->total);
    return true;
}

/** Pasa a disco lo que haya llegado. Falso si el disco falla. */
bool Transfers::writeAvailable(Download *job)
{
    const QByteArray chunk = job->reply->readAll();
    if (chunk.isEmpty())
        return true;
    if (!job->started || job->status < 200 || job->status >= 300) {
        if (job->errorBody.size() < kMaxErrorBody)
            job->errorBody += chunk;
        return true;
    }
    if (!job->failure.isEmpty())
        return false;
    if (job->file.write(chunk) != chunk.size()) {
        job->failure = QStringLiteral("FILE:%1").arg(job->file.errorString());
        return false;
    }
    job->loaded += chunk.size();
    if (job->lastReport.elapsed() >= kReportEveryMs) {
        job->lastReport.restart();
        emit downloadProgress(job->id, job->loaded, job->total);
    }
    return true;
}

void Transfers::finishDownload(Download *job)
{
    QNetworkReply *reply = job->reply;
    reply->deleteLater();
    m_downloads.remove(job->id);
    job->connectTimer->stop();

    QString failure;
    if (job->canceled) {
        failure = QStringLiteral("CANCELLED");
    } else if (!job->failure.isEmpty()) {
        failure = job->failure;
    } else if (!beginDownload(job) || !writeAvailable(job)) {
        failure = job->failure;
    } else if (job->status == 0) {
        failure = QStringLiteral("UNREACHABLE:%1").arg(reply->errorString());
    } else if (job->status < 200 || job->status >= 300) {
        failure = QStringLiteral("HTTP:%1:").arg(job->status) + QString::fromUtf8(job->errorBody);
    } else if (reply->error() != QNetworkReply::NoError) {
        failure = QStringLiteral("INTERRUPTED:%1").arg(reply->errorString());
    } else if (job->total >= 0 && job->loaded != job->total) {
        /* El servidor corta la conexión si falla a medias: no hay otra forma de avisar. */
        failure = QStringLiteral("INTERRUPTED:la respuesta llegó incompleta");
    } else if (!job->file.flush()) {
        failure = QStringLiteral("FILE:%1").arg(job->file.errorString());
    }

    job->file.close();
    if (failure.isEmpty() && !job->partPath.isEmpty()) {
        if (QFile::exists(job->dest) && !QFile::remove(job->dest))
            failure = QStringLiteral("FILE:no se pudo reemplazar el archivo que había");
        else if (!QFile::rename(job->partPath, job->dest))
            failure = QStringLiteral("FILE:no se pudo dejar el archivo en su destino");
    }
    /* Nada a medias: en la carpeta parecería completo. */
    if (!failure.isEmpty() && job->created)
        QFile::remove(job->partPath.isEmpty() ? job->dest : job->partPath);

    const QString id = job->id;
    const qint64 loaded = job->loaded;
    const qint64 total = job->total;
    delete job;

    if (!failure.isEmpty()) {
        emit downloadFinished(id, false, failure, describeDownloadError(failure));
        return;
    }
    emit downloadProgress(id, loaded, total >= 0 ? total : loaded);
    emit downloadFinished(id, true, QString(), QString());
}

QString Transfers::describeDownloadError(const QString &code)
{
    if (code == QLatin1String("CANCELLED"))
        return QStringLiteral("Cancelado");
    if (code.startsWith(QLatin1String("HTTP:"))) {
        const qsizetype separator = code.indexOf(u':', 5);
        const QString status = separator < 0 ? code.mid(5) : code.mid(5, separator - 5);
        const QString body = separator < 0 ? QString() : code.mid(separator + 1);
        const QString message = messageOf(QJsonDocument::fromJson(body.toUtf8()).object(), QStringLiteral(". "));
        return message.isEmpty() ? QStringLiteral("El servidor respondió con un error (%1)").arg(status) : message;
    }
    if (code.startsWith(QLatin1String("UNREACHABLE:")))
        return QStringLiteral("No se pudo contactar con el backend");
    if (code.startsWith(QLatin1String("INTERRUPTED:")))
        return QStringLiteral("La descarga se cortó antes de terminar");
    if (code.startsWith(QLatin1String("FILE:")))
        return QStringLiteral("No se pudo escribir el archivo: %1").arg(code.mid(5));
    return code;
}

void Transfers::cancel(const QString &id)
{
    if (QNetworkReply *reply = m_uploads.value(id)) {
        reply->setProperty("canceled", true);
        reply->abort();
        return;
    }
    if (Download *job = m_downloads.value(id)) {
        job->canceled = true;
        job->reply->abort();
    }
}

/* ── Sistema de archivos local ─────────────────────────────────────── */

QVariantMap Transfers::fileInfo(const QString &path) const
{
    const QFileInfo info(path);
    return {
        { QStringLiteral("name"), info.fileName() },
        { QStringLiteral("path"), info.absoluteFilePath() },
        { QStringLiteral("size"), info.exists() && !info.isDir() ? static_cast<double>(info.size()) : 0.0 },
        { QStringLiteral("isDir"), info.isDir() },
        { QStringLiteral("exists"), info.exists() },
    };
}

QVariantList Transfers::listDirRecursive(const QString &path) const
{
    const std::atomic_bool never { false };
    ScanResult result;
    const QFileInfo info(path);
    if (info.isDir()) {
        const QDir dir(info.absoluteFilePath());
        const QString name = dir.dirName();
        walk(dir.absolutePath(), name.isEmpty() ? QStringLiteral("raiz") : name, true, result, never);
    }
    QVariantList list = result.files;
    for (const QString &skipped : std::as_const(result.skipped)) {
        list << QVariantMap {
            { QStringLiteral("relPath"), skipped },
            { QStringLiteral("skipped"), true },
        };
    }
    return list;
}

void Transfers::scan(const QString &id, const QStringList &paths)
{
    /* En otro hilo: una carpeta con decenas de miles de archivos congelaría la ventana. */
    QThread *thread = QThread::create([this, id, paths] {
        const ScanResult result = scanPaths(paths, m_stopScans);
        QMetaObject::invokeMethod(this, [this, id, result] {
            emit scanFinished(id, result.files, result.skipped);
        }, Qt::QueuedConnection);
    });
    thread->setParent(this);
    m_scans.append(thread);
    connect(thread, &QThread::finished, this, [this, thread] {
        m_scans.removeOne(thread);
        thread->deleteLater();
    });
    thread->start();
}

QString Transfers::readTextFile(const QString &path, qint64 maxBytes) const
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        return {};
    return QString::fromUtf8(maxBytes > 0 ? file.read(maxBytes) : file.readAll());
}

QString Transfers::localPathFromUrl(const QVariant &url) const
{
    const QUrl parsed = url.typeId() == QMetaType::QUrl ? url.toUrl() : QUrl(url.toString());
    if (parsed.isLocalFile())
        return parsed.toLocalFile();
    /* Ya era una ruta. */
    const QString text = url.toString();
    return QDir::isAbsolutePath(text) ? text : QString();
}

QUrl Transfers::urlFromLocalPath(const QString &path) const
{
    return QUrl::fromLocalFile(path);
}

QString Transfers::downloadsDir() const
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
    return dir.isEmpty() ? QDir::homePath() : dir;
}

QString Transfers::joinPath(const QString &dir, const QString &name) const
{
    return QDir(dir).filePath(name);
}

QString Transfers::parentDir(const QString &path) const
{
    return QFileInfo(path).absolutePath();
}

QString Transfers::uniquePath(const QString &path, const QStringList &taken) const
{
    const QFileInfo info(path);
    const QDir dir(info.absolutePath());
    const QString name = info.fileName();
    const qsizetype dot = name.lastIndexOf(u'.');
    const QString base = dot > 0 ? name.left(dot) : name;
    const QString extension = dot > 0 ? name.mid(dot) : QString();

    for (int n = 0;; ++n) {
        const QString candidate = dir.filePath(
            n == 0 ? name : base + QStringLiteral(" (") + QString::number(n) + u')' + extension);
        if (!taken.contains(candidate) && !QFileInfo::exists(candidate))
            return candidate;
    }
}
