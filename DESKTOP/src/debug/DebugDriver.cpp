#include "debug/DebugDriver.h"

#include <QCoreApplication>
#include <QFile>
#include <QGuiApplication>
#include <QKeySequence>
#include <QMimeData>
#include <QUrl>

#include <functional>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTest>
#include <QTextStream>

namespace {
/* Propiedades en las que un elemento lleva su texto visible o su ayuda. */
const char *const kTextProperties[] = { "text", "hint", "placeholder", "title", "label", "tip" };

bool shown(const QQuickItem *item)
{
    for (const QQuickItem *it = item; it; it = it->parentItem()) {
        if (!it->isVisible() || it->opacity() <= 0.01)
            return false;
    }
    return item->width() > 0 && item->height() > 0;
}

QString textOf(const QQuickItem *item)
{
    for (const char *name : kTextProperties) {
        const QVariant value = item->property(name);
        if (value.typeId() == QMetaType::QString && !value.toString().isEmpty())
            return value.toString();
    }
    return {};
}
}

DebugDriver::DebugDriver(QQuickWindow *window, const QString &scriptPath, QObject *parent)
    : QObject(parent)
    , m_window(window)
{
    QFile file(scriptPath);
    if (file.open(QIODevice::ReadOnly | QIODevice::Text))
        m_lines = QString::fromUtf8(file.readAll()).split(u'\n');

    m_timer.setSingleShot(true);
    connect(&m_timer, &QTimer::timeout, this, &DebugDriver::next);
    m_timer.start(1200);
}

void DebugDriver::fail(const QString &message)
{
    QTextStream(stderr) << "GUION: línea " << m_index << ": " << message << '\n';
    QCoreApplication::exit(3);
}

void DebugDriver::next()
{
    while (m_index < m_lines.size()) {
        const QString line = m_lines.at(m_index++).trimmed();
        if (line.isEmpty() || line.startsWith(u'#'))
            continue;
        if (line.startsWith(QLatin1String("wait "))) {
            m_timer.start(line.mid(5).toInt());
            return;
        }
        run(line);
        /* Un respiro tras cada acción: animaciones, respuestas del API. */
        m_timer.start(220);
        return;
    }
    QCoreApplication::quit();
}

void DebugDriver::collect(QQuickItem *item, const QString &text, QList<QQuickItem *> &exact,
                          QList<QQuickItem *> &partial) const
{
    if (!item->isVisible())
        return;
    const QString own = textOf(item);
    if (!own.isEmpty() && shown(item)) {
        if (own == text)
            exact.append(item);
        else if (own.contains(text, Qt::CaseInsensitive))
            partial.append(item);
    }
    /* Orden de pintado: los últimos quedan encima. */
    QList<QQuickItem *> children = item->childItems();
    std::stable_sort(children.begin(), children.end(),
                     [](const QQuickItem *a, const QQuickItem *b) { return a->z() < b->z(); });
    for (QQuickItem *child : children)
        collect(child, text, exact, partial);
}

QQuickItem *DebugDriver::find(const QString &text, int nth) const
{
    QList<QQuickItem *> exact, partial;
    collect(m_window->contentItem(), text, exact, partial);
    const QList<QQuickItem *> &matches = exact.isEmpty() ? partial : exact;
    if (matches.isEmpty())
        return nullptr;
    if (nth > 0)
        return nth <= matches.size() ? matches.at(nth - 1) : nullptr;
    return matches.last();
}

bool DebugDriver::click(const QString &argument, Qt::MouseButton button, bool twice)
{
    /* `click 2 Texto`: la coincidencia número 2. */
    int nth = 0;
    QString text = argument;
    const qsizetype space = argument.indexOf(u' ');
    bool numbered = false;
    if (space > 0) {
        const int value = argument.left(space).toInt(&numbered);
        if (numbered) {
            nth = value;
            text = argument.mid(space + 1);
        }
    }
    QQuickItem *item = find(text, nth);
    if (!item) {
        fail(QStringLiteral("no se ve «%1»").arg(text));
        return false;
    }
    const QPoint point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
    QTest::mouseMove(m_window, point);
    if (twice)
        QTest::mouseDClick(m_window, button, Qt::NoModifier, point);
    else
        QTest::mouseClick(m_window, button, Qt::NoModifier, point);
    return true;
}

void DebugDriver::dump(QQuickItem *item, QStringList &lines) const
{
    if (!item->isVisible())
        return;
    const QVariant value = item->property("text");
    if (value.typeId() == QMetaType::QString && !value.toString().isEmpty() && shown(item)) {
        const QPointF origin = item->mapToScene(QPointF(0, 0));
        lines << QStringLiteral("%1,%2\t%3").arg(qRound(origin.x())).arg(qRound(origin.y())).arg(value.toString());
    }
    QList<QQuickItem *> children = item->childItems();
    std::stable_sort(children.begin(), children.end(),
                     [](const QQuickItem *a, const QQuickItem *b) { return a->z() < b->z(); });
    for (QQuickItem *child : children)
        dump(child, lines);
}

void DebugDriver::run(const QString &line)
{
    const qsizetype space = line.indexOf(u' ');
    const QString command = space < 0 ? line : line.left(space);
    const QString argument = space < 0 ? QString() : line.mid(space + 1);

    if (command == QLatin1String("click")) {
        click(argument, Qt::LeftButton, false);
    } else if (command == QLatin1String("rclick")) {
        click(argument, Qt::RightButton, false);
    } else if (command == QLatin1String("dclick")) {
        click(argument, Qt::LeftButton, true);
    } else if (command == QLatin1String("clickat")) {
        const QStringList parts = argument.split(u' ', Qt::SkipEmptyParts);
        if (parts.size() == 2)
            QTest::mouseClick(m_window, Qt::LeftButton, Qt::NoModifier, QPoint(parts.at(0).toInt(), parts.at(1).toInt()));
    } else if (command == QLatin1String("type")) {
        for (const QChar character : argument) {
            if (character == u' ')
                QTest::keyClick(m_window, Qt::Key_Space);
            else
                QTest::sendKeyEvent(QTest::Click, m_window, Qt::Key_unknown, QString(character), Qt::NoModifier);
        }
    } else if (command == QLatin1String("key")) {
        const QKeySequence sequence(argument);
        if (sequence.isEmpty()) {
            fail(QStringLiteral("tecla desconocida «%1»").arg(argument));
            return;
        }
        const QKeyCombination combination = sequence[0];
        QTest::keyClick(m_window, combination.key(), combination.keyboardModifiers());
    } else if (command == QLatin1String("wheel")) {
        const QStringList parts = argument.split(u' ', Qt::SkipEmptyParts);
        QPoint point(m_window->width() / 2, m_window->height() / 2);
        if (parts.size() > 1) {
            if (QQuickItem *item = find(argument.mid(parts.at(0).size() + 1), 0))
                point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
        }
        QWheelEvent event(point, m_window->mapToGlobal(point), QPoint(), QPoint(0, parts.value(0).toInt()),
                          Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(m_window, &event);
    } else if (command == QLatin1String("drop")) {
        /* `drop <ruta local> | <texto del destino>`: suelta un archivo o carpeta sobre ese elemento. */
        const QStringList parts = argument.split(QStringLiteral(" | "));
        QQuickItem *item = parts.size() == 2 ? find(parts.at(1), 0) : nullptr;
        if (!item) {
            fail(QStringLiteral("no se ve el destino de «%1»").arg(argument));
            return;
        }
        const QPointF point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
        QMimeData mime;
        mime.setUrls({ QUrl::fromLocalFile(parts.at(0)) });
        QDragEnterEvent enter(point.toPoint(), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QCoreApplication::sendEvent(m_window, &enter);
        QDragMoveEvent move(point.toPoint(), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QCoreApplication::sendEvent(m_window, &move);
        QDropEvent drop(point, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QCoreApplication::sendEvent(m_window, &drop);
    } else if (command == QLatin1String("dialog")) {
        /* `dialog accept|reject`: responde al diálogo de archivos abierto (va
           en otra ventana y no se puede pulsar). Acepta lo que traiga elegido. */
        QObject *dialog = nullptr;
        std::function<void(QObject *, int)> visit = [&](QObject *object, int depth) {
            if (dialog || depth > 40)
                return;
            const QByteArray type = object->metaObject()->className();
            if (type.contains("Dialog") && object->property("visible").toBool()
                && object->metaObject()->indexOfMethod("accept()") >= 0) {
                dialog = object;
                return;
            }
            for (QObject *child : object->children())
                visit(child, depth + 1);
            if (auto *item = qobject_cast<QQuickItem *>(object)) {
                for (QQuickItem *child : item->childItems())
                    visit(child, depth + 1);
            }
        };
        visit(m_window->contentItem(), 0);
        if (!dialog) {
            fail(QStringLiteral("no hay ningún diálogo abierto"));
            return;
        }
        QMetaObject::invokeMethod(dialog, argument == QLatin1String("reject") ? "reject" : "accept");
    } else if (command == QLatin1String("size")) {
        const QStringList parts = argument.split(u' ', Qt::SkipEmptyParts);
        if (parts.size() == 2)
            m_window->resize(parts.at(0).toInt(), parts.at(1).toInt());
    } else if (command == QLatin1String("shot")) {
        m_window->grabWindow().save(argument);
    } else if (command == QLatin1String("dump")) {
        QStringList lines;
        dump(m_window->contentItem(), lines);
        QFile file(argument);
        if (file.open(QIODevice::WriteOnly | QIODevice::Text))
            file.write(lines.join(u'\n').toUtf8());
    } else if (command == QLatin1String("expect")) {
        if (!find(argument, 0))
            fail(QStringLiteral("se esperaba ver «%1»").arg(argument));
    } else if (command == QLatin1String("absent")) {
        if (find(argument, 0))
            fail(QStringLiteral("no debería verse «%1»").arg(argument));
    } else if (command == QLatin1String("quit")) {
        QCoreApplication::quit();
    } else {
        fail(QStringLiteral("orden desconocida «%1»").arg(command));
    }
}
