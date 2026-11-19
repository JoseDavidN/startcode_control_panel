#include "SqlHighlighter.h"

#include <QMetaObject>
#include <QRegularExpression>
#include <QRegularExpressionMatch>
#include <QRegularExpressionMatchIterator>
#include <QSet>
#include <QStringView>
#include <QTextBlock>
#include <QTextBlockFormat>
#include <QTextCursor>
#include <QTextDocument>

#include <algorithm>

namespace {

/* Palabras reservadas que el editor pasa a mayúsculas al escribirlas
   (`SQL_KEYWORDS` de utils/sql.ts). */
const QSet<QString> &sqlKeywords()
{
    static const QSet<QString> set = {
        QStringLiteral("select"), QStringLiteral("from"), QStringLiteral("where"), QStringLiteral("and"),
        QStringLiteral("or"), QStringLiteral("not"), QStringLiteral("in"), QStringLiteral("is"),
        QStringLiteral("null"), QStringLiteral("like"), QStringLiteral("between"), QStringLiteral("exists"),
        QStringLiteral("join"), QStringLiteral("inner"), QStringLiteral("left"), QStringLiteral("right"),
        QStringLiteral("outer"), QStringLiteral("cross"), QStringLiteral("natural"), QStringLiteral("on"),
        QStringLiteral("using"), QStringLiteral("as"),
        QStringLiteral("order"), QStringLiteral("group"), QStringLiteral("by"), QStringLiteral("having"),
        QStringLiteral("limit"), QStringLiteral("offset"), QStringLiteral("asc"), QStringLiteral("desc"),
        QStringLiteral("distinct"),
        QStringLiteral("union"), QStringLiteral("all"), QStringLiteral("case"), QStringLiteral("when"),
        QStringLiteral("then"), QStringLiteral("else"), QStringLiteral("end"), QStringLiteral("with"),
        QStringLiteral("recursive"),
        QStringLiteral("insert"), QStringLiteral("into"), QStringLiteral("values"), QStringLiteral("update"),
        QStringLiteral("set"), QStringLiteral("delete"), QStringLiteral("replace"), QStringLiteral("ignore"),
        QStringLiteral("duplicate"),
        QStringLiteral("create"), QStringLiteral("alter"), QStringLiteral("drop"), QStringLiteral("truncate"),
        QStringLiteral("rename"), QStringLiteral("table"), QStringLiteral("database"), QStringLiteral("schema"),
        QStringLiteral("view"), QStringLiteral("index"),
        QStringLiteral("add"), QStringLiteral("column"), QStringLiteral("modify"), QStringLiteral("change"),
        QStringLiteral("primary"), QStringLiteral("foreign"), QStringLiteral("key"), QStringLiteral("references"),
        QStringLiteral("unique"),
        QStringLiteral("default"), QStringLiteral("constraint"), QStringLiteral("check"),
        QStringLiteral("auto_increment"), QStringLiteral("if"), QStringLiteral("cascade"),
        QStringLiteral("show"), QStringLiteral("databases"), QStringLiteral("tables"), QStringLiteral("columns"),
        QStringLiteral("describe"), QStringLiteral("explain"), QStringLiteral("use"),
        QStringLiteral("begin"), QStringLiteral("commit"), QStringLiteral("rollback"), QStringLiteral("transaction"),
        QStringLiteral("true"), QStringLiteral("false"), QStringLiteral("count"), QStringLiteral("sum"),
        QStringLiteral("avg"), QStringLiteral("min"), QStringLiteral("max"),
        /* PostgreSQL */
        QStringLiteral("ilike"), QStringLiteral("returning"), QStringLiteral("lateral"), QStringLiteral("conflict"),
    };
    return set;
}

/* Solo se pintan: también son nombres habituales de columna (`HIGHLIGHT_ONLY_KEYWORDS`). */
const QSet<QString> &highlightOnlyKeywords()
{
    static const QSet<QString> set = {
        QStringLiteral("interval"), QStringLiteral("regexp"), QStringLiteral("rlike"), QStringLiteral("escape"),
        QStringLiteral("xor"), QStringLiteral("div"), QStringLiteral("mod"), QStringLiteral("unsigned"),
        QStringLiteral("zerofill"),
        QStringLiteral("engine"), QStringLiteral("charset"), QStringLiteral("collate"), QStringLiteral("character"),
        QStringLiteral("after"), QStringLiteral("first"), QStringLiteral("returning"), QStringLiteral("over"),
        QStringLiteral("partition"),
        QStringLiteral("window"), QStringLiteral("procedure"), QStringLiteral("function"), QStringLiteral("trigger"),
        QStringLiteral("declare"), QStringLiteral("return"), QStringLiteral("returns"), QStringLiteral("call"),
        QStringLiteral("grant"),
        QStringLiteral("revoke"), QStringLiteral("privileges"), QStringLiteral("to"), QStringLiteral("of"),
        QStringLiteral("for"), QStringLiteral("lock"), QStringLiteral("unlock"), QStringLiteral("read"),
        QStringLiteral("write"), QStringLiteral("start"),
        /* PostgreSQL */
        QStringLiteral("similar"), QStringLiteral("only"), QStringLiteral("materialized"),
        QStringLiteral("concurrently"), QStringLiteral("nulls"), QStringLiteral("vacuum"), QStringLiteral("analyze"),
        QStringLiteral("extension"),
        QStringLiteral("sequence"), QStringLiteral("role"), QStringLiteral("owner"), QStringLiteral("language"),
        QStringLiteral("do"), QStringLiteral("nothing"), QStringLiteral("excluded"), QStringLiteral("filter"),
        QStringLiteral("perform"),
    };
    return set;
}

/* `SQL_TYPES`. */
const QSet<QString> &sqlTypes()
{
    static const QSet<QString> set = {
        QStringLiteral("int"), QStringLiteral("integer"), QStringLiteral("tinyint"), QStringLiteral("smallint"),
        QStringLiteral("mediumint"), QStringLiteral("bigint"), QStringLiteral("decimal"), QStringLiteral("numeric"),
        QStringLiteral("float"),
        QStringLiteral("double"), QStringLiteral("real"), QStringLiteral("bit"), QStringLiteral("bool"),
        QStringLiteral("boolean"), QStringLiteral("char"), QStringLiteral("varchar"), QStringLiteral("binary"),
        QStringLiteral("varbinary"), QStringLiteral("text"),
        QStringLiteral("tinytext"), QStringLiteral("mediumtext"), QStringLiteral("longtext"), QStringLiteral("blob"),
        QStringLiteral("tinyblob"), QStringLiteral("mediumblob"), QStringLiteral("longblob"), QStringLiteral("enum"),
        QStringLiteral("json"), QStringLiteral("date"), QStringLiteral("datetime"), QStringLiteral("timestamp"),
        QStringLiteral("time"), QStringLiteral("year"), QStringLiteral("uuid"), QStringLiteral("serial"),
        /* PostgreSQL */
        QStringLiteral("jsonb"), QStringLiteral("timestamptz"), QStringLiteral("timetz"), QStringLiteral("bigserial"),
        QStringLiteral("smallserial"), QStringLiteral("bytea"), QStringLiteral("inet"), QStringLiteral("cidr"),
        QStringLiteral("macaddr"),
        QStringLiteral("interval"), QStringLiteral("money"), QStringLiteral("citext"), QStringLiteral("tsvector"),
        QStringLiteral("xml"), QStringLiteral("int2"), QStringLiteral("int4"), QStringLiteral("int8"),
        QStringLiteral("float4"), QStringLiteral("float8"), QStringLiteral("oid"), QStringLiteral("regclass"),
    };
    return set;
}

/* Reservadas que, seguidas de `(`, son funciones (`CALLABLE_KEYWORDS`). */
const QSet<QString> &callableKeywords()
{
    static const QSet<QString> set = {
        QStringLiteral("count"), QStringLiteral("sum"), QStringLiteral("avg"), QStringLiteral("min"),
        QStringLiteral("max"), QStringLiteral("if"), QStringLiteral("replace"), QStringLiteral("left"),
        QStringLiteral("right"), QStringLiteral("insert"),
    };
    return set;
}

/* Las expresiones de `TOKEN_RE` con dos ajustes de PCRE que no cambian lo que
   casan: `\z` en vez de `$` (en PCRE `$` también casa antes de un salto final)
   y la etiqueta del dólar como alternativa vacía en vez de grupo opcional
   (en PCRE una retrorreferencia a un grupo sin casar falla; en JS casa vacío). */
const QRegularExpression &tokenExpression(bool postgres)
{
    static const QRegularExpression mysql(
        QString::fromLatin1(
            R"re((?<comment>--[^\n]*|#[^\n]*|/\*[\s\S]*?(?:\*/|\z)))re"
            R"re(|(?<string>'(?:\\.|''|[^'\\])*(?:'|\z)|"(?:\\.|""|[^"\\])*(?:"|\z)))re"
            R"re(|(?<identifier>`(?:``|[^`])*(?:`|\z)))re"
            R"re(|(?<number>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[0-9a-f]+\b))re"
            R"re(|(?<word>[A-Za-z_][\w$]*))re"
            R"re(|(?<operator>[=<>!]=?|<>|[-+*/%,;().]|\|\||&&))re"),
        QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression postgresql(
        QString::fromLatin1(
            R"re((?<comment>--[^\n]*|/\*[\s\S]*?(?:\*/|\z)))re"
            R"re(|(?<string>(?:[eE])?'(?:\\.|''|[^'\\])*(?:'|\z)|\$(?<tag>[A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?(?:\$\k<tag>\$|\z)))re"
            R"re(|(?<identifier>"(?:""|[^"])*(?:"|\z)))re"
            R"re(|(?<number>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b))re"
            R"re(|(?<word>[A-Za-z_][\w$]*))re"
            R"re(|(?<operator>::|[=<>!]=?|<>|->>?|[-+*/%,;().#~|&^@]|\|\|))re"),
        QRegularExpression::CaseInsensitiveOption);
    return postgres ? postgresql : mysql;
}

const char *typeName(int type)
{
    switch (type) {
    case SqlHighlighter::Keyword: return "keyword";
    case SqlHighlighter::Function: return "function";
    case SqlHighlighter::Type: return "type";
    case SqlHighlighter::String: return "string";
    case SqlHighlighter::Number: return "number";
    case SqlHighlighter::Identifier: return "identifier";
    case SqlHighlighter::Comment: return "comment";
    case SqlHighlighter::Operator: return "operator";
    default: return "text";
    }
}

bool hasContent(const QString &text, int from, int to)
{
    return to > from && !QStringView(text).mid(from, to - from).trimmed().isEmpty();
}

} // namespace

SqlHighlighter::SqlHighlighter(QObject *parent)
    : QSyntaxHighlighter(parent)
{
}

SqlHighlighter::~SqlHighlighter()
{
    /* El documento puede seguir vivo y avisar de un cambio mientras la base
       se destruye: sin soltar las conexiones llamaría a un objeto a medias. */
    if (m_attached)
        disconnect(m_attached.data(), nullptr, this, nullptr);
    if (m_quickDocument)
        disconnect(m_quickDocument.data(), nullptr, this, nullptr);
}

/* ── Enganche al TextEdit ──────────────────────────────────────────── */

QQuickTextDocument *SqlHighlighter::textDocument() const
{
    return m_quickDocument.data();
}

void SqlHighlighter::setTextDocument(QQuickTextDocument *document)
{
    if (m_quickDocument == document)
        return;
    if (m_quickDocument)
        disconnect(m_quickDocument.data(), nullptr, this, nullptr);
    m_quickDocument = document;
    /* El TextEdit puede cambiar su documento interno (al cargar una fuente). */
    if (m_quickDocument)
        connect(m_quickDocument.data(), &QQuickTextDocument::textDocumentChanged, this, &SqlHighlighter::attach);
    attach();
    emit textDocumentChanged();
}

void SqlHighlighter::attach()
{
    QTextDocument *target = m_quickDocument ? m_quickDocument->textDocument() : nullptr;
    if (m_attached == target)
        return;
    if (m_attached)
        disconnect(m_attached.data(), &QTextDocument::contentsChange, this, &SqlHighlighter::onContentsChange);
    m_attached = target;
    m_dirty = true;
    /* Antes que `setDocument`: así los tokens se invalidan antes de que la
       clase base repinte los bloques cambiados (las ranuras corren en orden). */
    if (m_attached)
        connect(m_attached.data(), &QTextDocument::contentsChange, this, &SqlHighlighter::onContentsChange);
    setDocument(target);
    applyLineHeight();
}

void SqlHighlighter::onContentsChange()
{
    m_dirty = true;
    /* `text = …` vacía el documento y se lleva el formato de los bloques. */
    if (m_lineHeight > 0 && !m_applyingLineHeight && !m_lineHeightPending) {
        m_lineHeightPending = true;
        QMetaObject::invokeMethod(this, [this] {
            m_lineHeightPending = false;
            applyLineHeight();
        }, Qt::QueuedConnection);
    }
}

/* ── Propiedades ───────────────────────────────────────────────────── */

QString SqlHighlighter::dialect() const
{
    return m_postgres ? QStringLiteral("postgresql") : QStringLiteral("mysql");
}

void SqlHighlighter::setDialect(const QString &dialect)
{
    const bool postgres = dialect == QLatin1String("postgresql");
    if (postgres == m_postgres)
        return;
    m_postgres = postgres;
    m_dirty = true;
    scheduleRehighlight();
    emit dialectChanged();
}

qreal SqlHighlighter::lineHeight() const
{
    return m_lineHeight;
}

void SqlHighlighter::setLineHeight(qreal height)
{
    height = qMax<qreal>(0, height);
    if (qFuzzyCompare(height + 1, m_lineHeight + 1))
        return;
    m_lineHeight = height;
    applyLineHeight();
    emit lineHeightChanged();
}

/* El alto de línea es formato de bloque. Las líneas nuevas heredan el de la
   anterior, así que basta con ponerlo cuando el primer bloque no lo tiene
   (documento recién enganchado o recién vaciado con `text = …`). Va sin
   deshacer para que Ctrl+Z no lo quite; en esos dos momentos la pila de
   deshacer ya está vacía. */
void SqlHighlighter::applyLineHeight()
{
    QTextDocument *doc = document();
    if (!doc || m_applyingLineHeight)
        return;
    const QTextBlockFormat first = doc->firstBlock().blockFormat();
    const bool fixed = first.lineHeightType() == QTextBlockFormat::FixedHeight;
    if (m_lineHeight > 0 ? (fixed && qFuzzyCompare(first.lineHeight(), m_lineHeight)) : !fixed)
        return;

    m_applyingLineHeight = true;
    const bool undo = doc->isUndoRedoEnabled();
    doc->setUndoRedoEnabled(false);
    QTextBlockFormat format;
    if (m_lineHeight > 0)
        format.setLineHeight(m_lineHeight, QTextBlockFormat::FixedHeight);
    else
        format.setLineHeight(0, QTextBlockFormat::SingleHeight);
    QTextCursor cursor(doc);
    cursor.select(QTextCursor::Document);
    cursor.mergeBlockFormat(format);
    doc->setUndoRedoEnabled(undo);
    m_applyingLineHeight = false;
}

void SqlHighlighter::setColor(TokenType type, const QColor &color)
{
    if (m_colors[type] == color)
        return;
    m_colors[type] = color;
    rebuildFormats();
    scheduleRehighlight();
    emit colorsChanged();
}

void SqlHighlighter::rebuildFormats()
{
    for (int i = 0; i < TokenTypeCount; ++i) {
        QTextCharFormat format;
        if (m_colors[i].isValid())
            format.setForeground(m_colors[i]);
        /* Cursiva sí (no cambia el ancho en una monoespaciada); peso, nunca. */
        if (i == Comment)
            format.setFontItalic(true);
        m_formats[i] = format;
    }
}

/* Un cambio de tema mueve los ocho colores a la vez: un solo repintado. */
void SqlHighlighter::scheduleRehighlight()
{
    if (m_rehighlightPending)
        return;
    m_rehighlightPending = true;
    QMetaObject::invokeMethod(this, [this] {
        m_rehighlightPending = false;
        if (document())
            rehighlight();
    }, Qt::QueuedConnection);
}

/* ── Tokenizador ───────────────────────────────────────────────────── */

QList<SqlHighlighter::Token> SqlHighlighter::tokenize(const QString &text, bool postgres)
{
    static const QString comment = QStringLiteral("comment");
    static const QString string = QStringLiteral("string");
    static const QString identifier = QStringLiteral("identifier");
    static const QString number = QStringLiteral("number");
    static const QString op = QStringLiteral("operator");

    QList<Token> tokens;
    QRegularExpressionMatchIterator it = tokenExpression(postgres).globalMatch(text);
    while (it.hasNext()) {
        const QRegularExpressionMatch m = it.next();
        const int index = int(m.capturedStart(0));
        const int length = int(m.capturedLength(0));
        if (length <= 0)
            continue;

        int type = Text;
        if (m.hasCaptured(comment)) type = Comment;
        else if (m.hasCaptured(string)) type = String;
        else if (m.hasCaptured(identifier)) type = Identifier;
        else if (m.hasCaptured(number)) type = Number;
        else if (m.hasCaptured(op)) type = Operator;
        else {
            const QString lower = m.captured(0).toLower();
            /* Detrás de un punto es un nombre (`tbl.from`, `db.date`). */
            const bool afterDot = index > 0 && text.at(index - 1) == QLatin1Char('.');
            const bool call = index + length < text.size() && text.at(index + length) == QLatin1Char('(');
            if (afterDot) type = Text;
            /* `INT(11)` es un tipo; `COUNT(`, `IF(` o `NOW(` son llamadas. */
            else if (sqlTypes().contains(lower)) type = Type;
            else if (call && (!sqlKeywords().contains(lower) || callableKeywords().contains(lower))) type = Function;
            else if (sqlKeywords().contains(lower) || highlightOnlyKeywords().contains(lower)) type = Keyword;
        }
        if (type != Text)
            tokens.append(Token{type, index, length});
    }
    return tokens;
}

void SqlHighlighter::ensureTokens()
{
    QTextDocument *doc = document();
    if (!doc) {
        m_tokens.clear();
        return;
    }
    if (!m_dirty && m_revision == doc->revision())
        return;
    /* `toPlainText` conserva las posiciones: cada separador de bloque es un `\n`. */
    m_tokens = tokenize(doc->toPlainText(), m_postgres);
    m_revision = doc->revision();
    m_dirty = false;
}

void SqlHighlighter::highlightBlock(const QString &text)
{
    ensureTokens();
    const int blockStart = currentBlock().position();
    const int blockEnd = blockStart + int(text.size());

    /* Primer token que acaba después del inicio del bloque. */
    auto it = std::upper_bound(m_tokens.cbegin(), m_tokens.cend(), blockStart,
                               [](int pos, const Token &t) { return pos < t.start + t.length; });
    int state = 0;
    for (; it != m_tokens.cend() && it->start < blockEnd; ++it) {
        const int tokenEnd = it->start + it->length;
        const int from = qMax(it->start, blockStart);
        const int to = qMin(tokenEnd, blockEnd);
        if (to > from)
            setFormat(from - blockStart, to - from, m_formats[it->type]);
        /* El token sigue en la línea siguiente. El estado lleva el tipo y lo que
           le queda: si cambia (se abre o se cierra un comentario, cambia dónde
           termina), la clase base repinta las líneas de debajo. */
        if (tokenEnd > blockEnd)
            state = it->type | (qMin(tokenEnd - blockEnd, 0x3ffffff) << 4);
    }
    setCurrentBlockState(state);
}

/* ── Utilidades para QML ───────────────────────────────────────────── */

QVariantList SqlHighlighter::tokenizeSql(const QString &text) const
{
    QVariantList out;
    const auto push = [&out, &text](int type, int from, int to) {
        if (to <= from)
            return;
        QVariantMap token;
        token.insert(QStringLiteral("type"), QString::fromLatin1(typeName(type)));
        token.insert(QStringLiteral("text"), text.mid(from, to - from));
        out.append(token);
    };
    int last = 0;
    const QList<Token> tokens = tokenize(text, m_postgres);
    for (const Token &t : tokens) {
        push(Text, last, t.start);
        push(t.type, t.start, t.start + t.length);
        last = t.start + t.length;
    }
    push(Text, last, int(text.size()));
    return out;
}

QVariantMap SqlHighlighter::statementAt(const QString &text, int caret) const
{
    struct Segment {
        int start;
        int end;
        bool hasSql;
    };
    QList<Segment> segments;
    int start = 0;
    int last = 0;
    bool hasSql = false;
    const QList<Token> tokens = tokenize(text, m_postgres);
    for (const Token &t : tokens) {
        /* Texto sin pintar entre tokens (nombres, espacios). */
        if (hasContent(text, last, t.start))
            hasSql = true;
        if (t.type == Operator && t.length == 1 && text.at(t.start) == QLatin1Char(';')) {
            segments.append(Segment{start, t.start + 1, hasSql});
            start = t.start + 1;
            hasSql = false;
        } else if (t.type != Comment) {
            hasSql = true;
        }
        last = t.start + t.length;
    }
    if (hasContent(text, last, int(text.size())))
        hasSql = true;
    segments.append(Segment{start, int(text.size()), hasSql});

    int i = -1;
    for (int k = 0; k < segments.size(); ++k) {
        if (caret >= segments[k].start && caret < segments[k].end) {
            i = k;
            break;
        }
    }
    if (i < 0)
        i = int(segments.size()) - 1;
    /* Justo después de un `;` en la misma línea (`SELECT 1;|`): la que se acaba de escribir. */
    const QString before = text.mid(segments[i].start, qMax(0, caret - segments[i].start));
    if (i > 0 && !before.contains(QLatin1Char('\n')) && before.trimmed().isEmpty())
        i -= 1;
    int pick = segments[i].hasSql ? i : -1;
    for (int k = i - 1; pick < 0 && k >= 0; --k)
        if (segments[k].hasSql) pick = k;
    for (int k = i + 1; pick < 0 && k < segments.size(); ++k)
        if (segments[k].hasSql) pick = k;
    if (pick < 0)
        return {};

    const Segment seg = segments[pick];
    const QString raw = text.mid(seg.start, seg.end - seg.start);
    /* Sin el `;` final ni el espacio de alrededor. */
    int cut = int(raw.size());
    while (cut > 0 && raw.at(cut - 1).isSpace())
        --cut;
    const QString body = cut > 0 && raw.at(cut - 1) == QLatin1Char(';') ? raw.left(cut - 1) : raw;
    const QString sql = body.trimmed();
    int lead = 0;
    while (lead < raw.size() && raw.at(lead).isSpace())
        ++lead;

    QVariantMap out;
    out.insert(QStringLiteral("start"), seg.start + lead);
    out.insert(QStringLiteral("end"), seg.start + lead + int(sql.size()));
    out.insert(QStringLiteral("sql"), sql);
    return out;
}

bool SqlHighlighter::isReservedWord(const QString &word) const
{
    return sqlKeywords().contains(word.toLower());
}
