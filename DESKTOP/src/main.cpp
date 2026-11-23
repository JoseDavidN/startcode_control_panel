#include "core/ApiClient.h"
#include "core/AppBridge.h"
#include "core/AuthController.h"
#include "core/Realtime.h"
#include "core/SessionStore.h"
#include "core/Transfers.h"

#include <QFontDatabase>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QSettings>
#include <QWindow>
#include <algorithm>

#ifdef STARTCODE_DEBUG_DRIVER
#include "debug/DebugDriver.h"
#endif

#ifndef QT_NO_DEBUG
#include <QQuickWindow>
#include <QTimer>
#endif

/* Compositores en mosaico (Hyprland, Sway, niri…): ellos colocan y
   redimensionan la ventana con atajos, así que no hacen falta botones de ventana
   (minimizar, maximizar, cerrar) ni bordes de redimensionado propios. */
static bool isTilingDesktop()
{
    if (qEnvironmentVariableIsSet("HYPRLAND_INSTANCE_SIGNATURE") || qEnvironmentVariableIsSet("SWAYSOCK")
        || qEnvironmentVariableIsSet("NIRI_SOCKET") || qEnvironmentVariableIsSet("I3SOCK"))
        return true;
    static const QStringList tiling = {
        QStringLiteral("hyprland"), QStringLiteral("sway"), QStringLiteral("niri"), QStringLiteral("river"),
        QStringLiteral("i3"), QStringLiteral("bspwm"), QStringLiteral("dwl"), QStringLiteral("qtile"),
    };
    const QStringList desktops = qEnvironmentVariable("XDG_CURRENT_DESKTOP").toLower().split(u':', Qt::SkipEmptyParts);
    return std::any_of(desktops.cbegin(), desktops.cend(),
                       [](const QString &name) { return tiling.contains(name); });
}

int main(int argc, char *argv[])
{
#ifndef QT_NO_DEBUG
    /* Solo en depuración: STARTCODE_CONFIG_DIR aparta la sesión guardada, para
       que las pruebas no toquen la del usuario ni manden su token a otro lado. */
    if (const QString dir = qEnvironmentVariable("STARTCODE_CONFIG_DIR"); !dir.isEmpty())
        QSettings::setPath(QSettings::NativeFormat, QSettings::UserScope, dir);
#endif

    QGuiApplication app(argc, argv);
    QGuiApplication::setOrganizationName(QStringLiteral("StartCode"));
    QGuiApplication::setOrganizationDomain(QStringLiteral("startcode.com.co"));
    QGuiApplication::setApplicationName(QStringLiteral("StartCode Panel"));
    QGuiApplication::setApplicationVersion(QStringLiteral(STARTCODE_VERSION));
    /* Identificador de la ventana en Wayland (app_id) y X11 (WM_CLASS): el mismo
       de la app anterior, así las reglas de ventana del compositor y el icono
       del archivo .desktop siguen valiendo. */
    QGuiApplication::setDesktopFileName(QStringLiteral("com.startcode.panel"));
    QGuiApplication::setWindowIcon(QIcon(QStringLiteral(":/qt/qml/StartCode/assets/icons/app-512.png")));

    /* Estilo sin aspecto propio: todos los controles los dibuja el sistema de diseño. */
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    for (const char *font : { "SpaceGrotesk", "JetBrainsMono", "Nunito", "SymbolsNerdFontMono-Regular" }) {
        QFontDatabase::addApplicationFont(
            QStringLiteral(":/qt/qml/StartCode/assets/fonts/%1.ttf").arg(QLatin1String(font)));
    }

    SessionStore session;
    ApiClient api(&session);
    AuthController auth(&api, &session);
    Realtime realtime(&api, &session, &auth);

    Transfers transfers(&api, &session);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("Transfers"), &transfers);
    api.setScriptEngine(&engine);
    AppBridge bridge(&api, &session, &engine);
    engine.rootContext()->setContextProperty(QStringLiteral("App"), &bridge);
    engine.rootContext()->setContextProperty(QStringLiteral("Api"), &api);
    engine.rootContext()->setContextProperty(QStringLiteral("Realtime"), &realtime);
    engine.rootContext()->setContextProperty(QStringLiteral("TilingDesktop"), isTilingDesktop());
    /* Sección inicial. En depuración, STARTCODE_PAGE abre otra para las capturas. */
    QString startPage = QStringLiteral("dashboard");
#ifndef QT_NO_DEBUG
    startPage = qEnvironmentVariable("STARTCODE_PAGE", startPage);
#endif
    engine.rootContext()->setContextProperty(QStringLiteral("StartPage"), startPage);
    engine.rootContext()->setContextProperty(QStringLiteral("Auth"), &auth);
    engine.rootContext()->setContextProperty(QStringLiteral("AppVersion"), QStringLiteral(STARTCODE_VERSION));

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app,
                     [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
#ifndef QT_NO_DEBUG
    /* Solo en depuración: STARTCODE_QML=<archivo.qml> carga ese archivo en vez
       de la app, para probar componentes sueltos (p. ej. todos los iconos). */
    if (const QString file = qEnvironmentVariable("STARTCODE_QML"); !file.isEmpty())
        engine.load(QUrl::fromLocalFile(file));
    else
#endif
    engine.loadFromModule("StartCode", "Main");
    bridge.setWindow(qobject_cast<QWindow *>(engine.rootObjects().value(0)));

    auth.restore();

#ifndef QT_NO_DEBUG
    /* Solo en depuración: STARTCODE_SHOT=<archivo.png> guarda una captura de la
       ventana y sale. Sirve para revisar cada pantalla en los tres temas. */
    if (const QString shot = qEnvironmentVariable("STARTCODE_SHOT"); !shot.isEmpty()) {
        /* STARTCODE_SIZE=<ancho>x<alto> fija el tamaño de la ventana capturada. */
        const QStringList size = qEnvironmentVariable("STARTCODE_SIZE").split(u'x');
        if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().value(0)); window && size.size() == 2)
            window->resize(size.at(0).toInt(), size.at(1).toInt());
        QTimer::singleShot(qEnvironmentVariableIntValue("STARTCODE_SHOT_DELAY") > 0 ? qEnvironmentVariableIntValue("STARTCODE_SHOT_DELAY") : 1500, &app, [&engine, shot] {
            if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().value(0)))
                window->grabWindow().save(shot);
            QCoreApplication::quit();
        });
    }
#endif

#ifdef STARTCODE_DEBUG_DRIVER
    /* STARTCODE_SCRIPT=<guion>: conduce la app con clics, teclado y capturas. */
    if (const QString script = qEnvironmentVariable("STARTCODE_SCRIPT"); !script.isEmpty()) {
        if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().value(0)))
            new DebugDriver(window, script, &app);
    }
#endif

    return app.exec();
}
