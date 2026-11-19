#pragma once

#include <QByteArray>
#include <QColor>
#include <QElapsedTimer>
#include <QFont>
#include <QPointF>
#include <QQuickPaintedItem>
#include <QString>
#include <QTimer>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

#include <deque>
#include <vector>

#include <vterm.h>

/**
 * Emulador de terminal para QML. libvterm lleva el estado de la pantalla
 * (secuencias de escape, pantalla alternativa, colores, cursor) y este
 * elemento lo pinta en una rejilla de celdas de ancho fijo, guarda el
 * historial de desplazamiento y traduce teclado, ratón y portapapeles.
 *
 * No abre ninguna conexión: lo que llega de la shell entra por `write()` y lo
 * que hay que mandarle sale por la señal `input()`.
 */
class TerminalView : public QQuickPaintedItem
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(int columns READ columns NOTIFY gridChanged)
    Q_PROPERTY(int rows READ rows NOTIFY gridChanged)
    Q_PROPERTY(qreal cellWidth READ cellWidth NOTIFY metricsChanged)
    Q_PROPERTY(qreal cellHeight READ cellHeight NOTIFY metricsChanged)

    /* Familia principal (admite varias separadas por comas); los símbolos
       Nerd Font y una monoespaciada del sistema van siempre de reserva. */
    Q_PROPERTY(QString fontFamily READ fontFamily WRITE setFontFamily NOTIFY fontFamilyChanged)
    Q_PROPERTY(int fontPixelSize READ fontPixelSize WRITE setFontPixelSize NOTIFY fontPixelSizeChanged)
    /* Alto de la fila respecto al de la fuente (1.25 en el panel web). */
    Q_PROPERTY(qreal lineHeight READ lineHeight WRITE setLineHeight NOTIFY lineHeightChanged)

    Q_PROPERTY(QString title READ title NOTIFY titleChanged)
    Q_PROPERTY(bool cursorVisible READ cursorVisible NOTIFY cursorVisibleChanged)
    Q_PROPERTY(bool cursorBlink READ cursorBlink WRITE setCursorBlink NOTIFY cursorBlinkChanged)
    Q_PROPERTY(bool altScreen READ altScreen NOTIFY altScreenChanged)
    /* La aplicación remota pidió el ratón (htop, vim con `mouse=a`…). */
    Q_PROPERTY(bool mouseTracking READ mouseTracking NOTIFY mouseTrackingChanged)
    Q_PROPERTY(bool hasSelection READ hasSelection NOTIFY selectionChanged)

    /* Paleta propia de la consola: no sigue el tema de la app. `ansiColors`
       son los 16 colores ANSI (8 normales y 8 brillantes). */
    Q_PROPERTY(QVariantList ansiColors READ ansiColors WRITE setAnsiColors NOTIFY paletteChanged)
    Q_PROPERTY(QColor backgroundColor READ backgroundColor WRITE setBackgroundColor NOTIFY paletteChanged)
    Q_PROPERTY(QColor foregroundColor READ foregroundColor WRITE setForegroundColor NOTIFY paletteChanged)
    Q_PROPERTY(QColor cursorColor READ cursorColor WRITE setCursorColor NOTIFY paletteChanged)
    Q_PROPERTY(QColor selectionColor READ selectionColor WRITE setSelectionColor NOTIFY paletteChanged)

    /* Historial: líneas guardadas, tope y cuántas se ha subido desde el final
       (0 = abajo del todo). Con esto QML dibuja la barra de desplazamiento. */
    Q_PROPERTY(int scrollbackSize READ scrollbackSize NOTIFY scrollChanged)
    Q_PROPERTY(int scrollbackLimit READ scrollbackLimit WRITE setScrollbackLimit NOTIFY scrollbackLimitChanged)
    Q_PROPERTY(int scrollOffset READ scrollOffset WRITE setScrollOffset NOTIFY scrollChanged)

public:
    explicit TerminalView(QQuickItem *parent = nullptr);
    ~TerminalView() override;

    int columns() const { return m_cols; }
    int rows() const { return m_rows; }
    qreal cellWidth() const { return m_cellW; }
    qreal cellHeight() const { return m_cellH; }

    QString fontFamily() const { return m_fontFamily; }
    void setFontFamily(const QString &family);
    int fontPixelSize() const { return m_fontPixelSize; }
    void setFontPixelSize(int size);
    qreal lineHeight() const { return m_lineHeight; }
    void setLineHeight(qreal factor);

    QString title() const { return m_title; }
    bool cursorVisible() const { return m_cursorVisible; }
    bool cursorBlink() const { return m_cursorBlink; }
    void setCursorBlink(bool blink);
    bool altScreen() const { return m_altScreen; }
    bool mouseTracking() const { return m_mouseMode != VTERM_PROP_MOUSE_NONE; }
    bool hasSelection() const { return m_hasSelection; }

    QVariantList ansiColors() const;
    void setAnsiColors(const QVariantList &colors);
    QColor backgroundColor() const { return m_bg; }
    void setBackgroundColor(const QColor &color);
    QColor foregroundColor() const { return m_fg; }
    void setForegroundColor(const QColor &color);
    QColor cursorColor() const { return m_cursorColor; }
    void setCursorColor(const QColor &color);
    QColor selectionColor() const { return m_selectionColor; }
    void setSelectionColor(const QColor &color);

    int scrollbackSize() const { return int(m_scrollback.size()); }
    int scrollbackLimit() const { return m_scrollbackLimit; }
    void setScrollbackLimit(int lines);
    int scrollOffset() const { return m_scrollOffset; }
    void setScrollOffset(int lines);

    /** Lo que llega de la shell (`terminal:output`). */
    Q_INVOKABLE void write(const QString &data);
    /** Borra el historial y deja solo la línea del cursor, arriba. */
    Q_INVOKABLE void clear();
    /** Estado inicial: pantalla, historial, atributos y modos. */
    Q_INVOKABLE void reset();

    Q_INVOKABLE QString selectedText() const;
    Q_INVOKABLE void clearSelection();
    Q_INVOKABLE void selectAll();
    /** Copia la selección al portapapeles; false si no hay nada seleccionado. */
    Q_INVOKABLE bool copySelection();
    /** Pega el portapapeles del sistema. */
    Q_INVOKABLE void paste();
    /** Pega `text` como lo haría el portapapeles (pegado entre corchetes si la aplicación lo pidió). */
    Q_INVOKABLE void pasteText(const QString &text);

    /** Texto de las últimas `lines` líneas (historial y pantalla), sin las vacías del final. */
    Q_INVOKABLE QString bufferText(int lines = 300) const;

    Q_INVOKABLE void scrollLines(int delta);
    Q_INVOKABLE void scrollPages(int delta);
    Q_INVOKABLE void scrollToBottom();

    void paint(QPainter *painter) override;
    void updateAll();

signals:
    /** Bytes (como texto) que hay que mandar a la shell (`terminal:input`). */
    void input(const QString &data);
    void gridChanged(int columns, int rows);
    void metricsChanged();
    void fontFamilyChanged();
    void fontPixelSizeChanged();
    void lineHeightChanged();
    void titleChanged();
    void cursorVisibleChanged();
    void cursorBlinkChanged();
    void altScreenChanged();
    void mouseTrackingChanged();
    void selectionChanged();
    void paletteChanged();
    void scrollChanged();
    void scrollbackLimitChanged();
    void bell();
    /** Clic derecho que no es para la aplicación remota: posición dentro del elemento. */
    void contextMenuRequested(qreal x, qreal y);

protected:
    bool event(QEvent *event) override;
    void geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) override;
    void keyPressEvent(QKeyEvent *event) override;
    void keyReleaseEvent(QKeyEvent *event) override;
    void inputMethodEvent(QInputMethodEvent *event) override;
    QVariant inputMethodQuery(Qt::InputMethodQuery query) const override;
    void focusInEvent(QFocusEvent *event) override;
    void focusOutEvent(QFocusEvent *event) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;
    void mouseDoubleClickEvent(QMouseEvent *event) override;
    void hoverMoveEvent(QHoverEvent *event) override;
    void wheelEvent(QWheelEvent *event) override;

private:
    /* Línea del historial: celdas sin el relleno vacío del final. */
    using Line = std::vector<VTermScreenCell>;

    /* Posición en el búfer completo: fila 0 es la más antigua del historial. */
    struct Cell
    {
        int row = 0;
        int col = 0;
    };

    enum class SelectMode { Chars, Words, Lines };

    /* Callbacks de libvterm (`user` es el propio elemento). */
    static int onDamage(VTermRect rect, void *user);
    static int onMoveCursor(VTermPos pos, VTermPos oldpos, int visible, void *user);
    static int onSetTermProp(VTermProp prop, VTermValue *val, void *user);
    static int onBell(void *user);
    static int onPushLine(int cols, const VTermScreenCell *cells, void *user);
    static int onPopLine(int cols, VTermScreenCell *cells, void *user);
    static int onClearScrollback(void *user);
    static void onOutput(const char *bytes, size_t len, void *user);

    void rebuildFont();
    void updateGrid();
    void applyPalette();
    VTermScreenCell blankCell() const;

    /* Tras tocar libvterm: vuelca el daño, lo que haya que mandar y las señales pendientes. */
    void flush();
    void markRows(int firstScreenRow, int lastScreenRow);
    void updateViewRows(int firstViewRow, int lastViewRow);

    int totalRows() const { return int(m_scrollback.size()) + m_rows; }
    int topRow() const { return int(m_scrollback.size()) - m_scrollOffset; }
    void fetchRow(int bufferRow, std::vector<VTermScreenCell> &out) const;
    QString rowText(int bufferRow, int fromCol, int toCol, bool trim) const;
    bool rowContinues(int bufferRow) const;

    QColor resolveColor(const VTermColor &color, bool bold, bool foreground) const;
    void cellColors(const VTermScreenCell &cell, QColor &fg, QColor &bg) const;
    void paintRow(QPainter *painter, int viewRow);
    static QString cellString(const VTermScreenCell &cell);

    Cell cellAt(const QPointF &point) const;
    VTermPos screenPosAt(const QPointF &point) const;
    static bool before(const Cell &a, const Cell &b);
    bool isSelected(int bufferRow, int col) const;
    void extendSelection(const Cell &to);
    void wordBounds(const Cell &at, int &first, int &last) const;
    void setHasSelection(bool has);
    void publishSelection();

    bool handleShortcut(QKeyEvent *event);
    /* Manda el botón a la aplicación remota si pidió el ratón; false si es para la selección. */
    bool forwardMouse(QMouseEvent *event, bool pressed);
    void updateCursorRow();
    void sendText(const QString &text, VTermModifier mod);
    void pushBytes(const QByteArray &bytes);
    void userInput();
    static VTermModifier vtermModifiers(Qt::KeyboardModifiers modifiers);

    VTerm *m_vt = nullptr;
    VTermScreen *m_screen = nullptr;
    VTermState *m_state = nullptr;

    int m_rows = 24;
    int m_cols = 80;

    QString m_fontFamily = QStringLiteral("JetBrains Mono");
    int m_fontPixelSize = 13;
    qreal m_lineHeight = 1.25;
    QFont m_font;
    QFont m_fontBold;
    QFont m_fontItalic;
    QFont m_fontBoldItalic;
    qreal m_cellW = 8;
    qreal m_cellH = 17;
    qreal m_baseline = 13;

    QColor m_ansi[16];
    QColor m_bg;
    QColor m_fg;
    QColor m_cursorColor;
    QColor m_selectionColor;

    std::deque<Line> m_scrollback;
    int m_scrollbackLimit = 5000;
    int m_scrollOffset = 0;
    qreal m_wheelRemainder = 0;

    VTermPos m_cursor = { 0, 0 };
    bool m_cursorVisible = true;
    bool m_cursorBlink = true;
    bool m_blinkOn = true;
    int m_cursorShape = VTERM_PROP_CURSORSHAPE_BLOCK;
    QTimer m_blinkTimer;

    QString m_title;
    QByteArray m_titleBuffer;
    bool m_altScreen = false;
    bool m_reverseScreen = false;
    int m_mouseMode = VTERM_PROP_MOUSE_NONE;

    /* Selección: del ancla a la cabeza, ambas celdas incluidas. */
    bool m_hasSelection = false;
    bool m_selecting = false;
    SelectMode m_selectMode = SelectMode::Chars;
    /* Unidad pulsada (celda, palabra o línea) y extremos actuales de la selección. */
    Cell m_anchor;
    Cell m_anchorEnd;
    Cell m_selStart;
    Cell m_selEnd;
    QElapsedTimer m_doubleClickTimer;
    QPointF m_doubleClickPos;
    /* Botones que se le mandaron a la aplicación remota y aún no se soltaron. */
    Qt::MouseButtons m_forwardedButtons;

    /* Pendiente de volcar en `flush()`. */
    QByteArray m_output;
    int m_dirtyTop = -1;
    int m_dirtyBottom = -1;
    bool m_fullDirty = false;
    bool m_scrollDirty = false;
    bool m_selectionDirty = false;
    bool m_bellPending = false;
    bool m_flushing = false;

    mutable std::vector<VTermScreenCell> m_rowCells;
};
