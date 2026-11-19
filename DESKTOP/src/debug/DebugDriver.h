#pragma once

#include <QObject>
#include <QPointF>
#include <QStringList>
#include <QTimer>

class QQuickItem;
class QQuickWindow;

/**
 * Solo en compilaciones de depuración. Conduce la app con un guion de texto
 * (STARTCODE_SCRIPT=<archivo>): clics, teclado, esperas, capturas y volcados
 * del texto visible. Sirve para validar pantallas y flujos sin pantalla real.
 *
 *   wait 500                  espera en milisegundos
 *   click Agregar servidor    clic en el elemento visible con ese texto, ayuda o marcador
 *   click 2 Cancelar          la segunda coincidencia (por defecto, la última: la de más arriba)
 *   rclick web-prod-01        clic derecho
 *   dclick texto              doble clic
 *   clickat 120 300           clic en coordenadas de la ventana
 *   type hola mundo           escribe en el elemento con foco
 *   key Return                tecla (Return, Escape, Tab, Up, Down, Backspace, Ctrl+Shift+C…)
 *   wheel -240                rueda en el centro de la ventana (o `wheel -240 Texto`)
 *   drop /ruta | Destino      suelta un archivo o carpeta local sobre ese elemento
 *   size 1500 1200            tamaño de la ventana
 *   shot /ruta/captura.png    captura
 *   dump /ruta/textos.txt     textos visibles, en orden de pintado
 *   expect Texto              falla (sale con código 3) si ese texto no está visible
 *   absent Texto              falla si ese texto está visible
 *   quit
 */
class DebugDriver : public QObject
{
    Q_OBJECT

public:
    DebugDriver(QQuickWindow *window, const QString &scriptPath, QObject *parent = nullptr);

private:
    void next();
    void run(const QString &line);
    bool click(const QString &argument, Qt::MouseButton button, bool twice);
    QQuickItem *find(const QString &text, int nth) const;
    void collect(QQuickItem *item, const QString &text, QList<QQuickItem *> &exact, QList<QQuickItem *> &partial) const;
    void dump(QQuickItem *item, QStringList &lines) const;
    void fail(const QString &message);

    QQuickWindow *m_window;
    QStringList m_lines;
    QTimer m_timer;
    int m_index = 0;
};
