#include "terminal/TerminalView.h"

#include <QClipboard>
#include <QCursor>
#include <QFocusEvent>
#include <QFontMetricsF>
#include <QGuiApplication>
#include <QHoverEvent>
#include <QInputMethodEvent>
#include <QKeyEvent>
#include <QList>
#include <QMouseEvent>
#include <QPainter>
#include <QStringList>
#include <QStyleHints>
#include <QVarLengthArray>
#include <QWheelEvent>

#include <algorithm>
#include <cmath>

namespace {

/* En macOS Qt intercambia Control y Comando: la tecla Control física llega
   como Meta, y Comando (copiar y pegar) como Control. */
#ifdef Q_OS_MACOS
constexpr Qt::KeyboardModifier kTerminalCtrl = Qt::MetaModifier;
#else
constexpr Qt::KeyboardModifier kTerminalCtrl = Qt::ControlModifier;
#endif

constexpr int kMaxGrid = 500;
constexpr int kBlinkInterval = 600;
constexpr uint32_t kWideContinuation = uint32_t(-1);

/* Celda sin contenido propio: se puede recortar del final de una línea guardada. */
bool isBlank(const VTermScreenCell &cell)
{
    return cell.chars[0] == 0 && VTERM_COLOR_IS_DEFAULT_BG(&cell.bg) && !cell.attrs.reverse;
}

/* Carácter que se puede pintar dentro de una tirada: una sola celda y presente
   en la fuente principal, así el avance es exactamente el de la rejilla. */
bool isRunChar(const VTermScreenCell &cell)
{
    const uint32_t ch = cell.chars[0];
    if (cell.chars[1] != 0 || cell.width != 1)
        return false;
    return (ch >= 0x21 && ch <= 0x7e) || (ch >= 0xa1 && ch <= 0xff && ch != 0xad);
}

bool isWordSeparator(uint32_t ch)
{
    switch (ch) {
    case 0: case ' ': case '(': case ')': case '[': case ']': case '{': case '}':
    case '\'': case '"': case '`': case ',': case ';': case '|':
        return true;
    default:
        return false;
    }
}

} // namespace

TerminalView::TerminalView(QQuickItem *parent)
    : QQuickPaintedItem(parent)
{
    /* Paleta de consola del panel: la misma que la terminal web. */
    static const QRgb ansi[16] = {
        0xff1a1626, 0xfffb7185, 0xff34d399, 0xfffbbf24, 0xff60a5fa, 0xffc084fc, 0xff22d3ee, 0xffe6e1f5,
        0xff6b6480, 0xfffda4af, 0xff6ee7b7, 0xfffcd34d, 0xff93c5fd, 0xffd8b4fe, 0xff67e8f9, 0xffffffff,
    };
    for (int i = 0; i < 16; ++i)
        m_ansi[i] = QColor::fromRgba(ansi[i]);
    m_bg = QColor(0x07, 0x05, 0x0d);
    m_fg = QColor(0xe6, 0xe1, 0xf5);
    m_cursorColor = QColor(0xc0, 0x84, 0xfc);
    m_selectionColor = QColor(168, 85, 247, 89);

    static const VTermScreenCallbacks callbacks = [] {
        VTermScreenCallbacks c = {};
        c.damage = &TerminalView::onDamage;
        c.movecursor = &TerminalView::onMoveCursor;
        c.settermprop = &TerminalView::onSetTermProp;
        c.bell = &TerminalView::onBell;
        c.sb_pushline = &TerminalView::onPushLine;
        c.sb_popline = &TerminalView::onPopLine;
        c.sb_clear = &TerminalView::onClearScrollback;
        return c;
    }();

    m_vt = vterm_new(m_rows, m_cols);
    vterm_set_utf8(m_vt, 1);
    vterm_output_set_callback(m_vt, &TerminalView::onOutput, this);
    m_state = vterm_obtain_state(m_vt);
    m_screen = vterm_obtain_screen(m_vt);
    vterm_screen_set_callbacks(m_screen, &callbacks, this);
    vterm_screen_enable_altscreen(m_screen, 1);
    vterm_screen_enable_reflow(m_screen, true);
    /* Sin `moverect`, libvterm convierte los desplazamientos en daño de filas. */
    vterm_screen_set_damage_merge(m_screen, VTERM_DAMAGE_SCROLL);
    vterm_screen_reset(m_screen, 1);

    m_blinkTimer.setInterval(kBlinkInterval);
    connect(&m_blinkTimer, &QTimer::timeout, this, [this] {
        m_blinkOn = !m_blinkOn;
        updateCursorRow();
    });

    setAcceptedMouseButtons(Qt::LeftButton | Qt::MiddleButton | Qt::RightButton);
    setAcceptHoverEvents(true);
    setFlag(ItemAcceptsInputMethod, true);
    setActiveFocusOnTab(true);
    setAntialiasing(false);
    setCursor(Qt::IBeamCursor);

    applyPalette();
    rebuildFont();
    flush();
}

TerminalView::~TerminalView()
{
    m_blinkTimer.stop();
    if (m_vt)
        vterm_free(m_vt);
}

/* ── Propiedades ────────────────────────────────────────────────────── */

void TerminalView::setFontFamily(const QString &family)
{
    if (family == m_fontFamily)
        return;
    m_fontFamily = family;
    rebuildFont();
    emit fontFamilyChanged();
}

void TerminalView::setFontPixelSize(int size)
{
    size = std::clamp(size, 6, 96);
    if (size == m_fontPixelSize)
        return;
    m_fontPixelSize = size;
    rebuildFont();
    emit fontPixelSizeChanged();
}

void TerminalView::setLineHeight(qreal factor)
{
    factor = std::clamp(factor, 1.0, 3.0);
    if (qFuzzyCompare(factor, m_lineHeight))
        return;
    m_lineHeight = factor;
    rebuildFont();
    emit lineHeightChanged();
}

void TerminalView::setCursorBlink(bool blink)
{
    if (blink == m_cursorBlink)
        return;
    m_cursorBlink = blink;
    m_blinkOn = true;
    if (m_cursorBlink && hasActiveFocus())
        m_blinkTimer.start();
    else
        m_blinkTimer.stop();
    updateCursorRow();
    emit cursorBlinkChanged();
}

QVariantList TerminalView::ansiColors() const
{
    QVariantList list;
    for (const QColor &color : m_ansi)
        list.append(color);
    return list;
}

void TerminalView::setAnsiColors(const QVariantList &colors)
{
    const int count = std::min<int>(16, int(colors.size()));
    for (int i = 0; i < count; ++i) {
        const QVariant &value = colors.at(i);
        const QColor color = value.typeId() == QMetaType::QString ? QColor::fromString(value.toString())
                                                                  : value.value<QColor>();
        if (color.isValid())
            m_ansi[i] = color;
    }
    applyPalette();
    emit paletteChanged();
}

void TerminalView::setBackgroundColor(const QColor &color)
{
    if (!color.isValid() || color == m_bg)
        return;
    m_bg = color;
    applyPalette();
    emit paletteChanged();
}

void TerminalView::setForegroundColor(const QColor &color)
{
    if (!color.isValid() || color == m_fg)
        return;
    m_fg = color;
    applyPalette();
    emit paletteChanged();
}

void TerminalView::setCursorColor(const QColor &color)
{
    if (!color.isValid() || color == m_cursorColor)
        return;
    m_cursorColor = color;
    updateAll();
    emit paletteChanged();
}

void TerminalView::setSelectionColor(const QColor &color)
{
    if (!color.isValid() || color == m_selectionColor)
        return;
    m_selectionColor = color;
    updateAll();
    emit paletteChanged();
}

void TerminalView::setScrollbackLimit(int lines)
{
    lines = std::clamp(lines, 0, 100000);
    if (lines == m_scrollbackLimit)
        return;
    m_scrollbackLimit = lines;
    bool trimmed = false;
    while (int(m_scrollback.size()) > m_scrollbackLimit) {
        m_scrollback.pop_front();
        trimmed = true;
    }
    if (trimmed) {
        m_scrollOffset = std::min(m_scrollOffset, int(m_scrollback.size()));
        clearSelection();
        updateAll();
        emit scrollChanged();
    }
    emit scrollbackLimitChanged();
}

void TerminalView::setScrollOffset(int lines)
{
    /* La pantalla alternativa (vim, htop) no tiene historial. */
    lines = m_altScreen ? 0 : std::clamp(lines, 0, int(m_scrollback.size()));
    if (lines == m_scrollOffset)
        return;
    m_scrollOffset = lines;
    updateAll();
    emit scrollChanged();
}

void TerminalView::scrollLines(int delta)
{
    setScrollOffset(m_scrollOffset - delta);
}

void TerminalView::scrollPages(int delta)
{
    scrollLines(delta * std::max(1, m_rows - 1));
}

void TerminalView::scrollToBottom()
{
    setScrollOffset(0);
}

/* ── Fuente, rejilla y paleta ───────────────────────────────────────── */

void TerminalView::rebuildFont()
{
    QStringList families;
    const QStringList wanted = m_fontFamily.split(QLatin1Char(','), Qt::SkipEmptyParts);
    for (const QString &family : wanted) {
        const QString name = family.trimmed();
        if (!name.isEmpty() && !families.contains(name))
            families.append(name);
    }
    /* Los iconos de prompt (powerline, devicons) no están en JetBrains Mono. */
    for (const QString &fallback : { QStringLiteral("Symbols Nerd Font Mono"), QStringLiteral("monospace") }) {
        if (!families.contains(fallback))
            families.append(fallback);
    }

    QFont font;
    font.setFamilies(families);
    font.setPixelSize(m_fontPixelSize);
    font.setStyleHint(QFont::Monospace);
    font.setFixedPitch(true);
    font.setKerning(false);
    /* Sin ajuste a píxel el avance es el mismo al medir y al pintar una
       tirada, con cualquier escala de pantalla: el texto no se sale de la rejilla. */
    font.setHintingPreference(QFont::PreferNoHinting);
    /* Las ligaduras (`->`, `!=`) juntarían celdas que la shell trata por separado. */
    font.setFeature(QFont::Tag("liga"), 0);
    font.setFeature(QFont::Tag("calt"), 0);

    m_font = font;
    m_fontBold = font;
    m_fontBold.setBold(true);
    m_fontItalic = font;
    m_fontItalic.setItalic(true);
    m_fontBoldItalic = m_fontBold;
    m_fontBoldItalic.setItalic(true);

    const QFontMetricsF metrics(m_font);
    const qreal advance = metrics.horizontalAdvance(QLatin1Char('M'));
    m_cellW = advance >= 1 ? advance : qreal(m_fontPixelSize) * 0.6;
    const qreal height = std::max<qreal>(1, metrics.height());
    m_cellH = std::ceil(height * m_lineHeight);
    m_baseline = std::floor((m_cellH - height) / 2) + metrics.ascent();

    emit metricsChanged();
    updateGrid();
    updateAll();
}

void TerminalView::updateGrid()
{
    /* Sin tamaño (aún sin colocar) no se toca: quedaría en 2 columnas y la
       shell redibujaría el prompt a ese ancho. */
    if (width() <= 0 || height() <= 0 || !m_vt)
        return;
    const int cols = std::clamp(int(std::floor(width() / m_cellW)), 2, kMaxGrid);
    const int rows = std::clamp(int(std::floor(height() / m_cellH)), 1, kMaxGrid);
    if (cols == m_cols && rows == m_rows)
        return;

    m_cols = cols;
    m_rows = rows;
    /* El reajuste mueve el texto de fila: la selección dejaría de coincidir. */
    if (m_hasSelection) {
        m_hasSelection = false;
        m_selectionDirty = true;
    }
    m_selecting = false;
    vterm_set_size(m_vt, rows, cols);
    m_scrollOffset = std::min(m_scrollOffset, int(m_scrollback.size()));
    m_fullDirty = true;
    m_scrollDirty = true;
    flush();
    emit gridChanged(m_cols, m_rows);
}

void TerminalView::applyPalette()
{
    VTermColor fg;
    VTermColor bg;
    vterm_color_rgb(&fg, uint8_t(m_fg.red()), uint8_t(m_fg.green()), uint8_t(m_fg.blue()));
    vterm_color_rgb(&bg, uint8_t(m_bg.red()), uint8_t(m_bg.green()), uint8_t(m_bg.blue()));
    /* Así las consultas de color de las aplicaciones (OSC 10/11) responden lo que se ve. */
    vterm_screen_set_default_colors(m_screen, &fg, &bg);
    for (int i = 0; i < 16; ++i) {
        VTermColor color;
        vterm_color_rgb(&color, uint8_t(m_ansi[i].red()), uint8_t(m_ansi[i].green()), uint8_t(m_ansi[i].blue()));
        vterm_state_set_palette_color(m_state, i, &color);
    }
    setFillColor(m_bg);
    setOpaquePainting(m_bg.alpha() == 255);
    updateAll();
}

VTermScreenCell TerminalView::blankCell() const
{
    VTermScreenCell cell = {};
    cell.width = 1;
    vterm_state_get_default_colors(m_state, &cell.fg, &cell.bg);
    cell.fg.type = uint8_t(cell.fg.type | VTERM_COLOR_DEFAULT_FG);
    cell.bg.type = uint8_t(cell.bg.type | VTERM_COLOR_DEFAULT_BG);
    return cell;
}

/* ── Callbacks de libvterm ──────────────────────────────────────────── */

int TerminalView::onDamage(VTermRect rect, void *user)
{
    static_cast<TerminalView *>(user)->markRows(rect.start_row, rect.end_row - 1);
    return 1;
}

int TerminalView::onMoveCursor(VTermPos pos, VTermPos oldpos, int, void *user)
{
    auto *self = static_cast<TerminalView *>(user);
    self->markRows(oldpos.row, oldpos.row);
    self->markRows(pos.row, pos.row);
    self->m_cursor = pos;
    /* Recién movido se ve siempre: no desaparece mientras se escribe. */
    self->m_blinkOn = true;
    return 1;
}

int TerminalView::onSetTermProp(VTermProp prop, VTermValue *val, void *user)
{
    auto *self = static_cast<TerminalView *>(user);
    switch (prop) {
    case VTERM_PROP_CURSORVISIBLE:
        if (self->m_cursorVisible != bool(val->boolean)) {
            self->m_cursorVisible = bool(val->boolean);
            self->markRows(self->m_cursor.row, self->m_cursor.row);
            emit self->cursorVisibleChanged();
        }
        break;
    case VTERM_PROP_CURSORBLINK:
        if (self->m_cursorBlink != bool(val->boolean)) {
            self->m_cursorBlink = bool(val->boolean);
            self->m_blinkOn = true;
            if (self->m_cursorBlink && self->hasActiveFocus())
                self->m_blinkTimer.start();
            else
                self->m_blinkTimer.stop();
            self->markRows(self->m_cursor.row, self->m_cursor.row);
            emit self->cursorBlinkChanged();
        }
        break;
    case VTERM_PROP_ALTSCREEN:
        if (self->m_altScreen != bool(val->boolean)) {
            self->m_altScreen = bool(val->boolean);
            self->m_fullDirty = true;
            if (self->m_scrollOffset != 0) {
                self->m_scrollOffset = 0;
                self->m_scrollDirty = true;
            }
            if (self->m_hasSelection) {
                self->m_hasSelection = false;
                self->m_selectionDirty = true;
            }
            emit self->altScreenChanged();
        }
        break;
    case VTERM_PROP_TITLE:
        /* El título puede llegar en varios trozos. */
        if (val->string.initial)
            self->m_titleBuffer.clear();
        if (val->string.str && val->string.len > 0)
            self->m_titleBuffer.append(val->string.str, qsizetype(val->string.len));
        if (val->string.final) {
            const QString title = QString::fromUtf8(self->m_titleBuffer);
            self->m_titleBuffer.clear();
            if (title != self->m_title) {
                self->m_title = title;
                emit self->titleChanged();
            }
        }
        break;
    case VTERM_PROP_REVERSE:
        self->m_reverseScreen = bool(val->boolean);
        self->m_fullDirty = true;
        break;
    case VTERM_PROP_CURSORSHAPE:
        self->m_cursorShape = val->number;
        self->markRows(self->m_cursor.row, self->m_cursor.row);
        break;
    case VTERM_PROP_MOUSE:
        if (self->m_mouseMode != val->number) {
            const bool was = self->mouseTracking();
            self->m_mouseMode = val->number;
            if (was != self->mouseTracking()) {
                /* Con el ratón en manos de la aplicación no hay selección de texto: flecha. */
                self->setCursor(self->mouseTracking() ? Qt::ArrowCursor : Qt::IBeamCursor);
                emit self->mouseTrackingChanged();
            }
        }
        break;
    default:
        break;
    }
    return 1;
}

int TerminalView::onBell(void *user)
{
    static_cast<TerminalView *>(user)->m_bellPending = true;
    return 1;
}

int TerminalView::onPushLine(int cols, const VTermScreenCell *cells, void *user)
{
    auto *self = static_cast<TerminalView *>(user);
    if (self->m_scrollbackLimit <= 0)
        return 0;

    int used = cols;
    while (used > 0 && isBlank(cells[used - 1]))
        --used;
    self->m_scrollback.emplace_back(cells, cells + used);

    if (int(self->m_scrollback.size()) > self->m_scrollbackLimit) {
        /* Se pierde la línea más antigua: todo el búfer sube una fila. */
        self->m_scrollback.pop_front();
        if (self->m_hasSelection || self->m_selecting) {
            --self->m_anchor.row;
            --self->m_anchorEnd.row;
            --self->m_selStart.row;
            --self->m_selEnd.row;
            if (self->m_selStart.row < 0 || self->m_anchor.row < 0) {
                self->m_selecting = false;
                if (self->m_hasSelection) {
                    self->m_hasSelection = false;
                    self->m_selectionDirty = true;
                }
            }
        }
        if (self->m_scrollOffset > 0)
            self->m_fullDirty = true;
    } else if (self->m_scrollOffset > 0) {
        /* Mirando el historial, lo que se ve no se mueve aunque siga llegando salida. */
        ++self->m_scrollOffset;
    }
    self->m_scrollDirty = true;
    return 1;
}

int TerminalView::onPopLine(int cols, VTermScreenCell *cells, void *user)
{
    auto *self = static_cast<TerminalView *>(user);
    if (self->m_scrollback.empty())
        return 0;

    const Line &line = self->m_scrollback.back();
    const VTermScreenCell blank = self->blankCell();
    const int stored = int(line.size());
    for (int i = 0; i < cols; ++i)
        cells[i] = i < stored ? line[size_t(i)] : blank;
    self->m_scrollback.pop_back();

    self->m_scrollOffset = std::min(self->m_scrollOffset, int(self->m_scrollback.size()));
    self->m_scrollDirty = true;
    self->m_fullDirty = true;
    return 1;
}

int TerminalView::onClearScrollback(void *user)
{
    auto *self = static_cast<TerminalView *>(user);
    self->m_scrollback.clear();
    self->m_scrollOffset = 0;
    if (self->m_hasSelection) {
        self->m_hasSelection = false;
        self->m_selectionDirty = true;
    }
    self->m_selecting = false;
    self->m_scrollDirty = true;
    self->m_fullDirty = true;
    return 1;
}

void TerminalView::onOutput(const char *bytes, size_t len, void *user)
{
    static_cast<TerminalView *>(user)->m_output.append(bytes, qsizetype(len));
}

/* ── Volcado de cambios ─────────────────────────────────────────────── */

void TerminalView::markRows(int firstScreenRow, int lastScreenRow)
{
    m_dirtyTop = m_dirtyTop < 0 ? firstScreenRow : std::min(m_dirtyTop, firstScreenRow);
    m_dirtyBottom = std::max(m_dirtyBottom, lastScreenRow);
}

void TerminalView::updateViewRows(int firstViewRow, int lastViewRow)
{
    firstViewRow = std::max(0, firstViewRow);
    lastViewRow = std::min(m_rows - 1, lastViewRow);
    if (firstViewRow > lastViewRow)
        return;
    update(QRect(0, int(firstViewRow * m_cellH), int(std::ceil(width())),
                 int((lastViewRow - firstViewRow + 1) * m_cellH)));
}

void TerminalView::updateCursorRow()
{
    updateViewRows(m_cursor.row + m_scrollOffset, m_cursor.row + m_scrollOffset);
}

void TerminalView::flush()
{
    if (m_flushing)
        return;
    m_flushing = true;

    vterm_screen_flush_damage(m_screen);

    if (m_fullDirty)
        updateAll();
    else if (m_dirtyTop >= 0)
        updateViewRows(m_dirtyTop + m_scrollOffset, m_dirtyBottom + m_scrollOffset);
    m_fullDirty = false;
    m_dirtyTop = -1;
    m_dirtyBottom = -1;

    if (m_scrollDirty) {
        m_scrollDirty = false;
        emit scrollChanged();
    }
    if (m_selectionDirty) {
        m_selectionDirty = false;
        updateAll();
        emit selectionChanged();
    }
    if (m_bellPending) {
        m_bellPending = false;
        emit bell();
    }
    if (!m_output.isEmpty()) {
        QByteArray out;
        out.swap(m_output);
        emit input(QString::fromUtf8(out));
    }

    m_flushing = false;
}

/* ── Entrada de datos ───────────────────────────────────────────────── */

void TerminalView::write(const QString &data)
{
    if (data.isEmpty())
        return;
    const QByteArray bytes = data.toUtf8();
    vterm_input_write(m_vt, bytes.constData(), size_t(bytes.size()));
    flush();
}

void TerminalView::clear()
{
    /* Como en la terminal web: fuera el historial y todo salvo la línea del
       cursor, que sube arriba. En pantalla alternativa no hay nada que limpiar. */
    if (m_altScreen)
        return;

    QByteArray sequence;
    const int above = m_cursor.row;
    if (above > 0) {
        const QByteArray count = QByteArray::number(above);
        sequence += "\x1b[" + count + "S\x1b[" + count + "A";
    }
    if (m_rows > 1)
        sequence += "\x1b" "7\x1b[2;1H\x1b[J\x1b" "8";
    if (!sequence.isEmpty())
        vterm_input_write(m_vt, sequence.constData(), size_t(sequence.size()));

    m_scrollback.clear();
    m_scrollOffset = 0;
    if (m_hasSelection) {
        m_hasSelection = false;
        m_selectionDirty = true;
    }
    m_selecting = false;
    m_scrollDirty = true;
    m_fullDirty = true;
    flush();
}

void TerminalView::reset()
{
    vterm_screen_reset(m_screen, 1);
    m_scrollback.clear();
    m_scrollOffset = 0;
    if (m_hasSelection) {
        m_hasSelection = false;
        m_selectionDirty = true;
    }
    m_selecting = false;
    m_scrollDirty = true;
    m_fullDirty = true;
    flush();
}

/* ── Lectura del búfer ──────────────────────────────────────────────── */

void TerminalView::fetchRow(int bufferRow, std::vector<VTermScreenCell> &out) const
{
    out.resize(size_t(m_cols));
    const int history = int(m_scrollback.size());
    if (bufferRow < 0 || bufferRow >= history + m_rows) {
        std::fill(out.begin(), out.end(), blankCell());
        return;
    }
    if (bufferRow < history) {
        const Line &line = m_scrollback[size_t(bufferRow)];
        const int stored = std::min(int(line.size()), m_cols);
        std::copy(line.begin(), line.begin() + stored, out.begin());
        if (stored < m_cols)
            std::fill(out.begin() + stored, out.end(), blankCell());
        return;
    }
    VTermPos pos = { bufferRow - history, 0 };
    for (pos.col = 0; pos.col < m_cols; ++pos.col)
        vterm_screen_get_cell(m_screen, pos, &out[size_t(pos.col)]);
}

QString TerminalView::cellString(const VTermScreenCell &cell)
{
    int count = 0;
    while (count < VTERM_MAX_CHARS_PER_CELL && cell.chars[count] != 0)
        ++count;
    if (count == 0 || cell.chars[0] == kWideContinuation)
        return QString();
    char32_t chars[VTERM_MAX_CHARS_PER_CELL];
    for (int i = 0; i < count; ++i)
        chars[i] = char32_t(cell.chars[i]);
    return QString::fromUcs4(chars, count);
}

QString TerminalView::rowText(int bufferRow, int fromCol, int toCol, bool trim) const
{
    std::vector<VTermScreenCell> cells;
    fetchRow(bufferRow, cells);
    fromCol = std::max(0, fromCol);
    toCol = std::min(m_cols - 1, toCol);

    QString text;
    for (int col = fromCol; col <= toCol; ++col) {
        const VTermScreenCell &cell = cells[size_t(col)];
        if (cell.chars[0] == kWideContinuation)
            continue;
        if (cell.chars[0] == 0)
            text.append(QLatin1Char(' '));
        else
            text.append(cellString(cell));
    }
    if (trim) {
        qsizetype end = text.size();
        while (end > 0 && text.at(end - 1) == QLatin1Char(' '))
            --end;
        text.truncate(end);
    }
    return text;
}

bool TerminalView::rowContinues(int bufferRow) const
{
    /* Solo la pantalla sabe si una fila es continuación de la anterior. */
    const int next = bufferRow + 1 - int(m_scrollback.size());
    if (next < 0 || next >= m_rows)
        return false;
    const VTermLineInfo *info = vterm_state_get_lineinfo(m_state, next);
    return info && info->continuation;
}

QString TerminalView::bufferText(int lines) const
{
    const int total = totalRows();
    QStringList rows;
    for (int row = std::max(0, total - std::max(1, lines)); row < total; ++row)
        rows.append(rowText(row, 0, m_cols - 1, true));
    while (!rows.isEmpty() && rows.constLast().isEmpty())
        rows.removeLast();
    return rows.join(QLatin1Char('\n'));
}

/* ── Selección y portapapeles ───────────────────────────────────────── */

bool TerminalView::before(const Cell &a, const Cell &b)
{
    return a.row != b.row ? a.row < b.row : a.col < b.col;
}

bool TerminalView::isSelected(int bufferRow, int col) const
{
    if (!m_hasSelection)
        return false;
    const Cell at = { bufferRow, col };
    return !before(at, m_selStart) && !before(m_selEnd, at);
}

void TerminalView::setHasSelection(bool has)
{
    if (has == m_hasSelection)
        return;
    m_hasSelection = has;
    emit selectionChanged();
}

void TerminalView::clearSelection()
{
    if (!m_hasSelection)
        return;
    setHasSelection(false);
    updateAll();
}

void TerminalView::selectAll()
{
    m_selectMode = SelectMode::Chars;
    m_anchor = m_selStart = { 0, 0 };
    m_anchorEnd = m_selEnd = { totalRows() - 1, m_cols - 1 };
    setHasSelection(true);
    updateAll();
}

QString TerminalView::selectedText() const
{
    if (!m_hasSelection)
        return QString();
    const int last = std::min(m_selEnd.row, totalRows() - 1);
    QString text;
    for (int row = std::max(0, m_selStart.row); row <= last; ++row) {
        const int from = row == m_selStart.row ? m_selStart.col : 0;
        const int to = row == m_selEnd.row ? m_selEnd.col : m_cols - 1;
        /* Una línea larga partida en varias filas se copia como una sola. */
        const bool wraps = row < last && rowContinues(row);
        text.append(rowText(row, from, to, !wraps));
        if (row < last && !wraps)
            text.append(QLatin1Char('\n'));
    }
    return text;
}

bool TerminalView::copySelection()
{
    const QString text = selectedText();
    if (text.isEmpty())
        return false;
    QGuiApplication::clipboard()->setText(text);
    return true;
}

void TerminalView::publishSelection()
{
    /* Selección primaria de X11 y Wayland: se pega con el botón central. */
    QClipboard *clipboard = QGuiApplication::clipboard();
    if (!clipboard->supportsSelection())
        return;
    const QString text = selectedText();
    if (!text.isEmpty())
        clipboard->setText(text, QClipboard::Selection);
}

void TerminalView::paste()
{
    pasteText(QGuiApplication::clipboard()->text());
}

void TerminalView::pasteText(const QString &text)
{
    if (text.isEmpty())
        return;
    QString prepared = text;
    prepared.replace(QLatin1String("\r\n"), QLatin1String("\n"));
    prepared.replace(QLatin1Char('\n'), QLatin1Char('\r'));
    /* El texto pegado no puede cerrar por su cuenta el pegado entre corchetes. */
    prepared.remove(QLatin1String("\x1b[201~"));

    /* libvterm solo escribe los corchetes si la aplicación activó el modo. */
    vterm_keyboard_start_paste(m_vt);
    m_output.append(prepared.toUtf8());
    vterm_keyboard_end_paste(m_vt);
    userInput();
    flush();
}

void TerminalView::wordBounds(const Cell &at, int &first, int &last) const
{
    std::vector<VTermScreenCell> cells;
    fetchRow(at.row, cells);
    const int col = std::clamp(at.col, 0, m_cols - 1);
    first = last = col;
    if (isWordSeparator(cells[size_t(col)].chars[0]))
        return;
    while (first > 0 && !isWordSeparator(cells[size_t(first - 1)].chars[0]))
        --first;
    while (last < m_cols - 1 && !isWordSeparator(cells[size_t(last + 1)].chars[0]))
        ++last;
}

void TerminalView::extendSelection(const Cell &to)
{
    Cell first = to;
    Cell last = to;
    if (m_selectMode == SelectMode::Words) {
        wordBounds(to, first.col, last.col);
    } else if (m_selectMode == SelectMode::Lines) {
        first.col = 0;
        last.col = m_cols - 1;
    }

    const Cell start = before(first, m_anchor) ? first : m_anchor;
    const Cell end = before(m_anchorEnd, last) ? last : m_anchorEnd;
    /* Un clic sin arrastrar no selecciona nada. */
    if (m_selectMode == SelectMode::Chars && !m_hasSelection && start.row == end.row && start.col == end.col)
        return;
    if (m_hasSelection && start.row == m_selStart.row && start.col == m_selStart.col
        && end.row == m_selEnd.row && end.col == m_selEnd.col)
        return;
    m_selStart = start;
    m_selEnd = end;
    setHasSelection(true);
    updateAll();
}

/* ── Pintado ────────────────────────────────────────────────────────── */

QColor TerminalView::resolveColor(const VTermColor &color, bool bold, bool foreground) const
{
    if (foreground ? VTERM_COLOR_IS_DEFAULT_FG(&color) : VTERM_COLOR_IS_DEFAULT_BG(&color))
        return foreground ? m_fg : m_bg;
    if (VTERM_COLOR_IS_INDEXED(&color)) {
        int index = color.indexed.idx;
        if (index < 16) {
            /* Negrita sobre un color básico: su variante brillante, como xterm. */
            if (foreground && bold && index < 8)
                index += 8;
            return m_ansi[index];
        }
        VTermColor rgb = color;
        vterm_screen_convert_color_to_rgb(m_screen, &rgb);
        return QColor(rgb.rgb.red, rgb.rgb.green, rgb.rgb.blue);
    }
    return QColor(color.rgb.red, color.rgb.green, color.rgb.blue);
}

void TerminalView::cellColors(const VTermScreenCell &cell, QColor &fg, QColor &bg) const
{
    fg = resolveColor(cell.fg, cell.attrs.bold, true);
    bg = resolveColor(cell.bg, false, false);
    if (bool(cell.attrs.reverse) != m_reverseScreen)
        std::swap(fg, bg);
}

/* Repintado completo con el rectángulo explícito: `update()` sin argumentos
   seguido de un `update(fila)` en el mismo fotograma deja en Qt solo la fila. */
void TerminalView::updateAll()
{
    update(QRect(0, 0, int(std::ceil(width())), int(std::ceil(height()))));
}

void TerminalView::paint(QPainter *painter)
{
    painter->setRenderHint(QPainter::Antialiasing, false);
    painter->setRenderHint(QPainter::TextAntialiasing, true);

    /* Con `update(rect)` el pintor llega recortado a las filas dañadas. */
    QRectF clip = painter->hasClipping() ? painter->clipBoundingRect() : QRectF();
    const QRectF bounds(0, 0, width(), height());
    clip = clip.isEmpty() ? bounds : clip.intersected(bounds);
    if (clip.isEmpty())
        return;

    painter->setCompositionMode(QPainter::CompositionMode_Source);
    painter->fillRect(clip, m_bg);
    painter->setCompositionMode(QPainter::CompositionMode_SourceOver);

    const int first = std::max(0, int(std::floor(clip.top() / m_cellH)));
    const int last = std::min(m_rows - 1, int(std::ceil(clip.bottom() / m_cellH)) - 1);
    for (int row = first; row <= last; ++row)
        paintRow(painter, row);
}

void TerminalView::paintRow(QPainter *painter, int viewRow)
{
    const int bufferRow = topRow() + viewRow;
    fetchRow(bufferRow, m_rowCells);
    const std::vector<VTermScreenCell> &cells = m_rowCells;
    const int cols = m_cols;
    const qreal y = viewRow * m_cellH;

    QVarLengthArray<QRgb, 256> fgs(cols);
    QVarLengthArray<QRgb, 256> bgs(cols);
    for (int col = 0; col < cols; ++col) {
        QColor fg;
        QColor bg;
        cellColors(cells[size_t(col)], fg, bg);
        fgs[col] = fg.rgba();
        bgs[col] = bg.rgba();
    }

    /* Fondos, por tramos del mismo color. */
    const QRgb base = m_bg.rgba();
    for (int col = 0; col < cols;) {
        int end = col + 1;
        while (end < cols && bgs[end] == bgs[col])
            ++end;
        if (bgs[col] != base)
            painter->fillRect(QRectF(col * m_cellW, y, (end - col) * m_cellW, m_cellH), QColor::fromRgba(bgs[col]));
        col = end;
    }

    /* Selección: un velo sobre el fondo y bajo el texto. */
    if (m_hasSelection && bufferRow >= m_selStart.row && bufferRow <= m_selEnd.row) {
        const int from = bufferRow == m_selStart.row ? m_selStart.col : 0;
        const int to = bufferRow == m_selEnd.row ? std::min(m_selEnd.col, cols - 1) : cols - 1;
        if (from <= to)
            painter->fillRect(QRectF(from * m_cellW, y, (to - from + 1) * m_cellW, m_cellH), m_selectionColor);
    }

    const auto fontFor = [this](const VTermScreenCell &cell) -> const QFont & {
        if (cell.attrs.bold)
            return cell.attrs.italic ? m_fontBoldItalic : m_fontBold;
        return cell.attrs.italic ? m_fontItalic : m_font;
    };

    /* Texto: las tiradas de caracteres simples van de una vez; lo demás
       (anchos, iconos, combinados) celda a celda para no salirse de la rejilla. */
    QString run;
    for (int col = 0; col < cols;) {
        const VTermScreenCell &cell = cells[size_t(col)];
        const uint32_t ch = cell.chars[0];
        if (ch == 0 || ch == ' ' || ch == kWideContinuation || cell.attrs.conceal) {
            ++col;
            continue;
        }

        painter->setFont(fontFor(cell));
        painter->setPen(QColor::fromRgba(fgs[col]));

        if (!isRunChar(cell)) {
            painter->drawText(QPointF(col * m_cellW, y + m_baseline), cellString(cell));
            col += std::max(1, int(cell.width));
            continue;
        }

        run.clear();
        int lastInk = col;
        int end = col;
        for (; end < cols; ++end) {
            const VTermScreenCell &next = cells[size_t(end)];
            const uint32_t nextChar = next.chars[0];
            const bool space = nextChar == 0 || (nextChar == ' ' && next.chars[1] == 0);
            if (!space) {
                if (!isRunChar(next) || fgs[end] != fgs[col] || next.attrs.bold != cell.attrs.bold
                    || next.attrs.italic != cell.attrs.italic || next.attrs.conceal)
                    break;
                lastInk = end;
            }
            run.append(space ? QChar(u' ') : QChar(char16_t(nextChar)));
        }
        run.truncate(lastInk - col + 1);
        painter->drawText(QPointF(col * m_cellW, y + m_baseline), run);
        col = lastInk + 1;
    }

    /* Subrayado y tachado. */
    for (int col = 0; col < cols; ++col) {
        const VTermScreenCell &cell = cells[size_t(col)];
        if (!cell.attrs.underline && !cell.attrs.strike)
            continue;
        const QColor ink = QColor::fromRgba(fgs[col]);
        const qreal x = col * m_cellW;
        if (cell.attrs.underline) {
            const qreal line = std::min(y + m_baseline + 2, y + m_cellH - 1);
            painter->fillRect(QRectF(x, line, m_cellW, 1), ink);
            if (cell.attrs.underline == VTERM_UNDERLINE_DOUBLE)
                painter->fillRect(QRectF(x, std::min(line + 2, y + m_cellH - 1), m_cellW, 1), ink);
        }
        if (cell.attrs.strike)
            painter->fillRect(QRectF(x, std::floor(y + m_baseline - m_fontPixelSize * 0.3), m_cellW, 1), ink);
    }

    /* Cursor. */
    if (!m_cursorVisible || bufferRow != int(m_scrollback.size()) + m_cursor.row)
        return;
    const bool focused = hasActiveFocus();
    if (focused && m_cursorBlink && !m_blinkOn)
        return;

    const int col = std::clamp(m_cursor.col, 0, cols - 1);
    const VTermScreenCell &cell = cells[size_t(col)];
    const QRectF box(col * m_cellW, y, m_cellW * std::max(1, int(cell.width)), m_cellH);

    if (!focused) {
        /* Sin foco, solo el contorno: se ve dónde está sin parecer activo. */
        painter->fillRect(QRectF(box.left(), box.top(), box.width(), 1), m_cursorColor);
        painter->fillRect(QRectF(box.left(), box.bottom() - 1, box.width(), 1), m_cursorColor);
        painter->fillRect(QRectF(box.left(), box.top(), 1, box.height()), m_cursorColor);
        painter->fillRect(QRectF(box.right() - 1, box.top(), 1, box.height()), m_cursorColor);
        return;
    }
    switch (m_cursorShape) {
    case VTERM_PROP_CURSORSHAPE_UNDERLINE:
        painter->fillRect(QRectF(box.left(), box.bottom() - 2, box.width(), 2), m_cursorColor);
        break;
    case VTERM_PROP_CURSORSHAPE_BAR_LEFT:
        painter->fillRect(QRectF(box.left(), box.top(), 2, box.height()), m_cursorColor);
        break;
    default: {
        painter->fillRect(box, m_cursorColor);
        const QString text = cell.attrs.conceal ? QString() : cellString(cell);
        if (!text.isEmpty() && text != QLatin1String(" ")) {
            painter->setFont(fontFor(cell));
            painter->setPen(m_bg);
            painter->drawText(QPointF(box.left(), y + m_baseline), text);
        }
        break;
    }
    }
}

/* ── Geometría y foco ───────────────────────────────────────────────── */

void TerminalView::geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry)
{
    QQuickPaintedItem::geometryChange(newGeometry, oldGeometry);
    if (newGeometry.size() != oldGeometry.size()) {
        updateGrid();
        /* Al cambiar de tamaño se estrena lienzo: hay que pintarlo entero, no
           solo las filas dañadas, o el resto se queda en negro. */
        updateAll();
    }
}

bool TerminalView::event(QEvent *event)
{
    /* Con el foco en la terminal, las teclas son suyas: ningún atajo de la
       app (ni Ctrl+letra ni Escape) se las quita. */
    if (event->type() == QEvent::ShortcutOverride) {
        event->accept();
        return true;
    }
    return QQuickPaintedItem::event(event);
}

void TerminalView::focusInEvent(QFocusEvent *event)
{
    QQuickPaintedItem::focusInEvent(event);
    m_blinkOn = true;
    if (m_cursorBlink)
        m_blinkTimer.start();
    /* libvterm solo lo notifica si la aplicación pidió avisos de foco. */
    vterm_state_focus_in(m_state);
    updateCursorRow();
    flush();
}

void TerminalView::focusOutEvent(QFocusEvent *event)
{
    QQuickPaintedItem::focusOutEvent(event);
    m_blinkTimer.stop();
    m_blinkOn = true;
    vterm_state_focus_out(m_state);
    updateCursorRow();
    flush();
}

/* ── Teclado ────────────────────────────────────────────────────────── */

VTermModifier TerminalView::vtermModifiers(Qt::KeyboardModifiers modifiers)
{
    int mod = VTERM_MOD_NONE;
    if (modifiers & Qt::ShiftModifier)
        mod |= VTERM_MOD_SHIFT;
    if (modifiers & Qt::AltModifier)
        mod |= VTERM_MOD_ALT;
    if (modifiers & kTerminalCtrl)
        mod |= VTERM_MOD_CTRL;
    return VTermModifier(mod);
}

void TerminalView::userInput()
{
    /* Escribir devuelve la vista al final, como cualquier terminal. */
    if (m_scrollOffset != 0)
        scrollToBottom();
}

void TerminalView::pushBytes(const QByteArray &bytes)
{
    m_output.append(bytes);
    userInput();
    flush();
}

void TerminalView::sendText(const QString &text, VTermModifier mod)
{
    const QList<uint> points = text.toUcs4();
    for (const uint point : points) {
        if (point < 0x20 || point == 0x7f) {
            m_output.append(char(point));
            continue;
        }
        vterm_keyboard_unichar(m_vt, uint32_t(point), mod);
    }
}

bool TerminalView::handleShortcut(QKeyEvent *event)
{
    const Qt::KeyboardModifiers mods =
        event->modifiers() & (Qt::ShiftModifier | Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier);
    const int key = event->key();

    /* Historial con Mayús + RePág / AvPág. */
    if (mods == Qt::ShiftModifier && !m_altScreen && (key == Qt::Key_PageUp || key == Qt::Key_PageDown)) {
        scrollPages(key == Qt::Key_PageUp ? -1 : 1);
        return true;
    }

    const Qt::KeyboardModifiers ctrlShift = Qt::ControlModifier | Qt::ShiftModifier;
    bool copy = (mods == ctrlShift && key == Qt::Key_C) || (mods == Qt::ControlModifier && key == Qt::Key_Insert);
    /* Ctrl + V pega, como en el panel web; Ctrl + C sigue siendo la interrupción. */
    const bool paste = (mods == ctrlShift && key == Qt::Key_V) || (mods == Qt::ControlModifier && key == Qt::Key_V)
                    || (mods == Qt::ShiftModifier && key == Qt::Key_Insert);
#ifdef Q_OS_MACOS
    copy = copy || (mods == Qt::ControlModifier && key == Qt::Key_C);
#endif
    if (copy) {
        copySelection();
        return true;
    }
    if (paste) {
        this->paste();
        return true;
    }
    return false;
}

void TerminalView::keyPressEvent(QKeyEvent *event)
{
    /* Siempre aceptada: Tab y las flechas no pasan a la navegación de QML. */
    event->accept();
    if (handleShortcut(event))
        return;

    const int key = event->key();
    int mod = vtermModifiers(event->modifiers());
    const bool ctrl = mod & VTERM_MOD_CTRL;
    const bool alt = mod & VTERM_MOD_ALT;

    VTermKey special = VTERM_KEY_NONE;
    switch (key) {
    /* Con Mayús o Ctrl libvterm mandaría la forma CSI u, que bash y la mayoría
       de programas no entienden: estas tres van como en xterm. */
    case Qt::Key_Return:
    case Qt::Key_Enter:
        special = VTERM_KEY_ENTER;
        mod &= VTERM_MOD_ALT;
        break;
    case Qt::Key_Escape:
        special = VTERM_KEY_ESCAPE;
        mod &= VTERM_MOD_ALT;
        break;
    case Qt::Key_Backspace:
        if (ctrl) {
            clearSelection();
            pushBytes(alt ? QByteArray("\x1b\x08") : QByteArray("\x08"));
            return;
        }
        special = VTERM_KEY_BACKSPACE;
        mod &= VTERM_MOD_ALT;
        break;
    case Qt::Key_Tab: special = VTERM_KEY_TAB; break;
    case Qt::Key_Backtab:
        special = VTERM_KEY_TAB;
        mod |= VTERM_MOD_SHIFT;
        break;
    case Qt::Key_Up: special = VTERM_KEY_UP; break;
    case Qt::Key_Down: special = VTERM_KEY_DOWN; break;
    case Qt::Key_Left: special = VTERM_KEY_LEFT; break;
    case Qt::Key_Right: special = VTERM_KEY_RIGHT; break;
    case Qt::Key_Insert: special = VTERM_KEY_INS; break;
    case Qt::Key_Delete: special = VTERM_KEY_DEL; break;
    case Qt::Key_Home: special = VTERM_KEY_HOME; break;
    case Qt::Key_End: special = VTERM_KEY_END; break;
    case Qt::Key_PageUp: special = VTERM_KEY_PAGEUP; break;
    case Qt::Key_PageDown: special = VTERM_KEY_PAGEDOWN; break;
    default:
        if (key >= Qt::Key_F1 && key <= Qt::Key_F35)
            special = VTermKey(VTERM_KEY_FUNCTION(key - Qt::Key_F1 + 1));
        break;
    }
    if (special != VTERM_KEY_NONE) {
        clearSelection();
        vterm_keyboard_key(m_vt, special, VTermModifier(mod));
        userInput();
        flush();
        return;
    }

    const QString text = event->text();
    const bool printable = !text.isEmpty() && text.at(0).unicode() >= 0x20 && text.at(0).unicode() != 0x7f;

    /* Ctrl + Alt con un carácter imprimible es AltGr en Windows: texto normal. */
    if (ctrl && !(alt && printable)) {
        const VTermModifier ctrlMod = VTermModifier(VTERM_MOD_CTRL | (alt ? VTERM_MOD_ALT : VTERM_MOD_NONE));
        if (key >= Qt::Key_A && key <= Qt::Key_Z) {
            const char letter = char('a' + (key - Qt::Key_A));
            clearSelection();
            if (letter == 'i' || letter == 'j' || letter == 'm') {
                /* Tab, salto de línea y retorno: libvterm los mandaría como CSI u. */
                QByteArray bytes;
                if (alt)
                    bytes.append('\x1b');
                bytes.append(char(letter & 0x1f));
                pushBytes(bytes);
            } else {
                vterm_keyboard_unichar(m_vt, uint32_t(letter), ctrlMod);
                userInput();
                flush();
            }
            return;
        }

        int code = -1;
        switch (key) {
        case Qt::Key_Space: case Qt::Key_At: case Qt::Key_2: code = 0x00; break;
        case Qt::Key_BracketLeft: case Qt::Key_3: code = 0x1b; break;
        case Qt::Key_Backslash: case Qt::Key_4: code = 0x1c; break;
        case Qt::Key_BracketRight: case Qt::Key_5: code = 0x1d; break;
        case Qt::Key_AsciiCircum: case Qt::Key_6: code = 0x1e; break;
        case Qt::Key_Underscore: case Qt::Key_Slash: case Qt::Key_7: code = 0x1f; break;
        case Qt::Key_Question: case Qt::Key_8: code = 0x7f; break;
        default: break;
        }
        if (code >= 0) {
            QByteArray bytes;
            if (alt)
                bytes.append('\x1b');
            bytes.append(char(code));
            clearSelection();
            pushBytes(bytes);
            return;
        }
        /* Solo el modificador, o una combinación sin código de control. */
        if (!printable)
            return;
        mod = VTERM_MOD_NONE;
    } else if (ctrl) {
        mod = VTERM_MOD_NONE;
    }

    if (text.isEmpty())
        return;
    clearSelection();
    /* Mayús ya viene aplicada en el texto; Alt antepone ESC. */
    sendText(text, VTermModifier(mod & VTERM_MOD_ALT));
    userInput();
    flush();
}

void TerminalView::keyReleaseEvent(QKeyEvent *event)
{
    event->accept();
}

void TerminalView::inputMethodEvent(QInputMethodEvent *event)
{
    /* Teclas muertas (´ + a) y métodos de entrada llegan ya compuestos. */
    const QString text = event->commitString();
    if (!text.isEmpty()) {
        clearSelection();
        sendText(text, VTERM_MOD_NONE);
        userInput();
        flush();
    }
    event->accept();
}

QVariant TerminalView::inputMethodQuery(Qt::InputMethodQuery query) const
{
    switch (query) {
    case Qt::ImEnabled:
        return true;
    case Qt::ImCursorRectangle:
        return QRectF(m_cursor.col * m_cellW, (m_cursor.row + m_scrollOffset) * m_cellH, m_cellW, m_cellH);
    case Qt::ImHints:
        return int(Qt::ImhNoPredictiveText | Qt::ImhNoAutoUppercase | Qt::ImhMultiLine);
    default:
        return QQuickPaintedItem::inputMethodQuery(query);
    }
}

/* ── Ratón ──────────────────────────────────────────────────────────── */

TerminalView::Cell TerminalView::cellAt(const QPointF &point) const
{
    const VTermPos pos = screenPosAt(point);
    return { topRow() + pos.row, pos.col };
}

VTermPos TerminalView::screenPosAt(const QPointF &point) const
{
    VTermPos pos;
    pos.col = std::clamp(int(std::floor(point.x() / m_cellW)), 0, m_cols - 1);
    pos.row = std::clamp(int(std::floor(point.y() / m_cellH)), 0, m_rows - 1);
    return pos;
}

bool TerminalView::forwardMouse(QMouseEvent *event, bool pressed)
{
    const Qt::MouseButton button = event->button();
    const int number = button == Qt::LeftButton ? 1 : button == Qt::MiddleButton ? 2 : button == Qt::RightButton ? 3 : 0;
    if (number == 0)
        return false;

    if (pressed) {
        /* Con Mayús el ratón vuelve a ser de la terminal (seleccionar, menú). */
        if (!mouseTracking() || (event->modifiers() & Qt::ShiftModifier))
            return false;
        m_forwardedButtons |= button;
    } else {
        if (!(m_forwardedButtons & button))
            return false;
        m_forwardedButtons &= ~Qt::MouseButtons(button);
    }

    const VTermModifier mod = vtermModifiers(event->modifiers());
    const VTermPos pos = screenPosAt(event->position());
    vterm_mouse_move(m_vt, pos.row, pos.col, mod);
    vterm_mouse_button(m_vt, number, pressed, mod);
    flush();
    return true;
}

void TerminalView::mousePressEvent(QMouseEvent *event)
{
    event->accept();
    forceActiveFocus(Qt::MouseFocusReason);
    if (forwardMouse(event, true))
        return;

    if (event->button() == Qt::RightButton) {
        emit contextMenuRequested(event->position().x(), event->position().y());
        return;
    }
    if (event->button() == Qt::MiddleButton) {
        QClipboard *clipboard = QGuiApplication::clipboard();
        if (clipboard->supportsSelection())
            pasteText(clipboard->text(QClipboard::Selection));
        return;
    }
    if (event->button() != Qt::LeftButton)
        return;

    const Cell at = cellAt(event->position());
    const int interval = QGuiApplication::styleHints()->mouseDoubleClickInterval();
    const bool triple = m_doubleClickTimer.isValid() && m_doubleClickTimer.elapsed() < interval
                     && (event->position() - m_doubleClickPos).manhattanLength() < 6;
    m_doubleClickTimer.invalidate();

    if (triple) {
        m_selectMode = SelectMode::Lines;
        m_anchor = m_selStart = { at.row, 0 };
        m_anchorEnd = m_selEnd = { at.row, m_cols - 1 };
        setHasSelection(true);
        updateAll();
    } else if ((event->modifiers() & Qt::ShiftModifier) && m_hasSelection) {
        m_selectMode = SelectMode::Chars;
        extendSelection(at);
    } else {
        m_selectMode = SelectMode::Chars;
        m_anchor = m_anchorEnd = at;
        clearSelection();
    }
    m_selecting = true;
}

void TerminalView::mouseDoubleClickEvent(QMouseEvent *event)
{
    event->accept();
    if (forwardMouse(event, true))
        return;
    if (event->button() != Qt::LeftButton)
        return;

    const Cell at = cellAt(event->position());
    int first = at.col;
    int last = at.col;
    wordBounds(at, first, last);
    m_selectMode = SelectMode::Words;
    m_anchor = m_selStart = { at.row, first };
    m_anchorEnd = m_selEnd = { at.row, last };
    setHasSelection(true);
    m_selecting = true;
    m_doubleClickTimer.start();
    m_doubleClickPos = event->position();
    updateAll();
}

void TerminalView::mouseMoveEvent(QMouseEvent *event)
{
    event->accept();
    if (m_forwardedButtons) {
        const VTermPos pos = screenPosAt(event->position());
        vterm_mouse_move(m_vt, pos.row, pos.col, vtermModifiers(event->modifiers()));
        flush();
        return;
    }
    if (!m_selecting || !(event->buttons() & Qt::LeftButton))
        return;

    /* Arrastrar fuera por arriba o por abajo recorre el historial. */
    if (event->position().y() < 0)
        scrollLines(-1);
    else if (event->position().y() > height())
        scrollLines(1);
    extendSelection(cellAt(event->position()));
}

void TerminalView::mouseReleaseEvent(QMouseEvent *event)
{
    event->accept();
    if (forwardMouse(event, false))
        return;
    if (event->button() != Qt::LeftButton || !m_selecting)
        return;
    m_selecting = false;
    if (m_hasSelection)
        publishSelection();
}

void TerminalView::hoverMoveEvent(QHoverEvent *event)
{
    /* Solo si la aplicación pidió todos los movimientos (modo 1003). */
    if (m_mouseMode == VTERM_PROP_MOUSE_MOVE && !(event->modifiers() & Qt::ShiftModifier)) {
        const VTermPos pos = screenPosAt(event->position());
        vterm_mouse_move(m_vt, pos.row, pos.col, vtermModifiers(event->modifiers()));
        flush();
    }
    QQuickPaintedItem::hoverMoveEvent(event);
}

void TerminalView::wheelEvent(QWheelEvent *event)
{
    event->accept();

    /* Líneas hacia arriba (positivo) o hacia abajo; los paneles táctiles
       mandan fracciones que se acumulan. */
    qreal lines = 0;
    if (event->angleDelta().y() != 0)
        lines = event->angleDelta().y() / 120.0 * 3;
    else if (event->pixelDelta().y() != 0)
        lines = event->pixelDelta().y() / m_cellH;
    m_wheelRemainder += lines;
    const int whole = int(m_wheelRemainder);
    if (whole == 0)
        return;
    m_wheelRemainder -= whole;
    const int steps = std::abs(whole);

    if (mouseTracking() && !(event->modifiers() & Qt::ShiftModifier)) {
        const VTermModifier mod = vtermModifiers(event->modifiers());
        const VTermPos pos = screenPosAt(event->position());
        vterm_mouse_move(m_vt, pos.row, pos.col, mod);
        for (int i = 0; i < steps; ++i)
            vterm_mouse_button(m_vt, whole > 0 ? 4 : 5, true, mod);
        flush();
        return;
    }
    if (m_altScreen) {
        /* Sin historial (less, man): la rueda mueve el cursor, como en xterm. */
        for (int i = 0; i < steps; ++i)
            vterm_keyboard_key(m_vt, whole > 0 ? VTERM_KEY_UP : VTERM_KEY_DOWN, VTERM_MOD_NONE);
        flush();
        return;
    }
    scrollLines(-whole);
}
