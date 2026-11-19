#include "TableExporter.h"

#include <QDateTime>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QList>
#include <QLocale>
#include <QMetaType>
#include <QRegularExpression>
#include <QSaveFile>

#include <array>
#include <cmath>

namespace {

/* ── Valores ──────────────────────────────────────────────────────── */

/* Lo que llega de QML puede venir envuelto (valor de JS o de JSON). */
QVariant plain(const QVariant &v)
{
    const int type = v.userType();
    if (type == qMetaTypeId<QJSValue>())
        return v.value<QJSValue>().toVariant();
    if (type == QMetaType::QJsonValue)
        return v.toJsonValue().toVariant();
    if (type == QMetaType::QJsonArray)
        return v.toJsonArray().toVariantList();
    if (type == QMetaType::QJsonObject)
        return v.toJsonObject().toVariantMap();
    return v;
}

bool isNullValue(const QVariant &v)
{
    return !v.isValid() || v.userType() == QMetaType::Nullptr || v.isNull();
}

bool isNumber(const QVariant &v)
{
    switch (v.userType()) {
    case QMetaType::Int:
    case QMetaType::UInt:
    case QMetaType::LongLong:
    case QMetaType::ULongLong:
    case QMetaType::Short:
    case QMetaType::UShort:
    case QMetaType::Long:
    case QMetaType::ULong:
        return true;
    case QMetaType::Double:
    case QMetaType::Float:
        return std::isfinite(v.toDouble());
    default:
        return false;
    }
}

/* Un número como lo escribe JavaScript (`String(n)`). */
QString numberText(double d)
{
    if (std::isnan(d))
        return QStringLiteral("NaN");
    if (std::isinf(d))
        return d > 0 ? QStringLiteral("Infinity") : QStringLiteral("-Infinity");
    if (d == 0)
        return QStringLiteral("0");
    if (d == std::floor(d) && std::fabs(d) < 1e15)
        return QString::number(d, 'f', 0);
    QString text = QString::number(d, 'g', QLocale::FloatingPointShortest);
    /* `1e-07` → `1e-7`. */
    static const QRegularExpression padded(QStringLiteral("e([+-])0+(\\d)"));
    text.replace(padded, QStringLiteral("e\\1\\2"));
    return text;
}

/* Texto de una celda: vacío si es nula, JSON si es un objeto o una lista. */
QString cellText(const QVariant &v)
{
    if (isNullValue(v))
        return QString();
    switch (v.userType()) {
    case QMetaType::QString:
        return v.toString();
    case QMetaType::Bool:
        return v.toBool() ? QStringLiteral("true") : QStringLiteral("false");
    case QMetaType::Double:
    case QMetaType::Float:
        return numberText(v.toDouble());
    case QMetaType::QVariantList:
    case QMetaType::QStringList:
    case QMetaType::QVariantMap:
    case QMetaType::QVariantHash:
        return QString::fromUtf8(QJsonDocument::fromVariant(v).toJson(QJsonDocument::Compact));
    default:
        return v.toString();
    }
}

QVariantList rowValues(const QVariant &row)
{
    return plain(row).toList();
}

/* ── CSV ──────────────────────────────────────────────────────────── */

QString csvEscape(const QString &text)
{
    static const QRegularExpression special(QStringLiteral("[\",\\r\\n]"));
    if (!text.contains(special))
        return text;
    QString quoted = text;
    quoted.replace(QLatin1Char('"'), QStringLiteral("\"\""));
    return QLatin1Char('"') + quoted + QLatin1Char('"');
}

void appendCsvLine(QString &out, const QVariantList &values)
{
    for (qsizetype i = 0; i < values.size(); ++i) {
        if (i > 0)
            out += QLatin1Char(',');
        out += csvEscape(cellText(plain(values.at(i))));
    }
    out += QStringLiteral("\r\n");
}

/* ── XLSX ─────────────────────────────────────────────────────────── */

/* Índices de estilo de celda (`cellXfs` en styles.xml). */
constexpr int StyleHeader = 1;
constexpr int StyleRow = 2;
constexpr int StyleRowStripe = 3;

/* Sin los caracteres de control que XML 1.0 no admite. */
QString xmlEscape(const QString &text)
{
    QString out;
    out.reserve(text.size() + 8);
    for (const QChar ch : text) {
        const char16_t u = ch.unicode();
        if (u <= 0x08 || u == 0x0B || u == 0x0C || (u >= 0x0E && u <= 0x1F))
            continue;
        switch (u) {
        case u'&': out += QStringLiteral("&amp;"); break;
        case u'<': out += QStringLiteral("&lt;"); break;
        case u'>': out += QStringLiteral("&gt;"); break;
        case u'"': out += QStringLiteral("&quot;"); break;
        default: out += ch; break;
        }
    }
    return out;
}

/* 0 → A, 25 → Z, 26 → AA. */
QByteArray columnRef(int index)
{
    int n = index + 1;
    QByteArray ref;
    while (n > 0) {
        const int m = (n - 1) % 26;
        ref.prepend(char('A' + m));
        n = (n - 1) / 26;
    }
    return ref;
}

/* Añade la celda y devuelve el largo de su texto (para el ancho de columna). */
qsizetype appendCell(QByteArray &out, const QVariant &raw, const QByteArray &ref, int style)
{
    const QVariant value = plain(raw);
    out += "<c r=\"" + ref + "\" s=\"" + QByteArray::number(style) + "\"";
    /* Vacía pero con estilo: si no, el hueco rompe la franja y el borde. */
    if (isNullValue(value)) {
        out += "/>";
        return 0;
    }
    const QString text = cellText(value);
    /* Solo los números de verdad van como número; los enteros grandes llegan
       como texto desde el backend y así conservan todos sus dígitos. */
    if (isNumber(value)) {
        out += "><v>" + text.toUtf8() + "</v></c>";
    } else if (value.userType() == QMetaType::Bool) {
        out += value.toBool() ? " t=\"b\"><v>1</v></c>" : " t=\"b\"><v>0</v></c>";
    } else {
        out += " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xmlEscape(text).toUtf8() + "</t></is></c>";
    }
    return text.size();
}

struct SheetTheme {
    QByteArray header = "A855F7";
    QByteArray headerText = "FFFFFF";
    QByteArray stripe = "F6EEFE";
    QByteArray text = "1F1B2E";
    QByteArray border = "E5D4FD";
};

/* `RRGGBB` válido de la clave, o el valor por defecto. */
void themeColor(const QVariantMap &theme, const QString &key, QByteArray &target)
{
    QString value = theme.value(key).toString().trimmed();
    if (value.startsWith(QLatin1Char('#')))
        value.remove(0, 1);
    static const QRegularExpression hex(QStringLiteral("^[0-9A-Fa-f]{6}$"));
    if (hex.match(value).hasMatch())
        target = value.toUpper().toLatin1();
}

/* ── ZIP ──────────────────────────────────────────────────────────── */

struct ZipEntry {
    QByteArray name;
    QByteArray data;
};

quint32 crc32(const QByteArray &data)
{
    static const std::array<quint32, 256> table = [] {
        std::array<quint32, 256> t{};
        for (quint32 i = 0; i < 256; ++i) {
            quint32 c = i;
            for (int k = 0; k < 8; ++k)
                c = (c & 1u) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            t[i] = c;
        }
        return t;
    }();
    quint32 c = 0xFFFFFFFFu;
    for (const char ch : data)
        c = table[(c ^ quint8(ch)) & 0xFFu] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

void le16(QByteArray &out, quint16 v)
{
    out += char(v & 0xFF);
    out += char((v >> 8) & 0xFF);
}

void le32(QByteArray &out, quint32 v)
{
    out += char(v & 0xFF);
    out += char((v >> 8) & 0xFF);
    out += char((v >> 16) & 0xFF);
    out += char((v >> 24) & 0xFF);
}

/* Contenedor ZIP: cabecera local y datos por archivo, directorio central y
   cierre. Deflacta con zlib (`qCompress`) quitándole su envoltorio; si no
   gana nada, guarda sin comprimir. */
QByteArray zip(const QList<ZipEntry> &entries)
{
    const QDateTime now = QDateTime::currentDateTime();
    const QTime t = now.time();
    const QDate d = now.date();
    const quint16 dosTime = quint16((t.hour() << 11) | (t.minute() << 5) | (t.second() / 2));
    const quint16 dosDate = quint16(((qMax(1980, d.year()) - 1980) << 9) | (d.month() << 5) | d.day());

    QByteArray out;
    QByteArray central;

    for (const ZipEntry &entry : entries) {
        quint16 method = 0;
        QByteArray stored = entry.data;
        /* qCompress: 4 bytes de longitud + zlib (2 de cabecera … 4 de Adler-32). */
        const QByteArray packed = qCompress(entry.data, 6);
        if (packed.size() > 10) {
            const QByteArray raw = packed.mid(6, packed.size() - 10);
            if (raw.size() < entry.data.size()) {
                method = 8;
                stored = raw;
            }
        }
        const quint32 crc = crc32(entry.data);
        const quint32 offset = quint32(out.size());

        le32(out, 0x04034b50u);
        le16(out, 20);
        le16(out, 0);
        le16(out, method);
        le16(out, dosTime);
        le16(out, dosDate);
        le32(out, crc);
        le32(out, quint32(stored.size()));
        le32(out, quint32(entry.data.size()));
        le16(out, quint16(entry.name.size()));
        le16(out, 0);
        out += entry.name;
        out += stored;

        le32(central, 0x02014b50u);
        le16(central, 20);
        le16(central, 20);
        le16(central, 0);
        le16(central, method);
        le16(central, dosTime);
        le16(central, dosDate);
        le32(central, crc);
        le32(central, quint32(stored.size()));
        le32(central, quint32(entry.data.size()));
        le16(central, quint16(entry.name.size()));
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, 0);
        le32(central, offset);
        central += entry.name;
    }

    const quint32 centralOffset = quint32(out.size());
    out += central;
    le32(out, 0x06054b50u);
    le16(out, 0);
    le16(out, 0);
    le16(out, quint16(entries.size()));
    le16(out, quint16(entries.size()));
    le32(out, quint32(central.size()));
    le32(out, centralOffset);
    le16(out, 0);
    return out;
}

QString writeFile(const QString &path, const QByteArray &bytes)
{
    if (path.isEmpty())
        return QStringLiteral("No se eligió dónde guardar el archivo");
    QSaveFile file(path);
    /* Carpetas donde no se puede crear el temporal: escribir directamente. */
    file.setDirectWriteFallback(true);
    if (!file.open(QIODevice::WriteOnly))
        return file.errorString();
    if (file.write(bytes) != bytes.size()) {
        const QString reason = file.errorString();
        file.cancelWriting();
        return reason;
    }
    if (!file.commit())
        return file.errorString();
    return QString();
}

} // namespace

TableExporter::TableExporter(QObject *parent)
    : QObject(parent)
{
}

/* RFC 4180 con BOM para que Excel lea bien tildes y eñes. */
QByteArray TableExporter::csv(const QVariantList &columns, const QVariantList &rows)
{
    QString out;
    out += QChar(0xFEFF);
    appendCsvLine(out, columns);
    for (const QVariant &row : rows)
        appendCsvLine(out, rowValues(row));
    return out.toUtf8();
}

QByteArray TableExporter::xlsx(const QVariantList &columns, const QVariantList &rows,
                               const QString &sheetName, const QVariantMap &theme)
{
    SheetTheme colors;
    themeColor(theme, QStringLiteral("header"), colors.header);
    themeColor(theme, QStringLiteral("headerText"), colors.headerText);
    themeColor(theme, QStringLiteral("stripe"), colors.stripe);
    themeColor(theme, QStringLiteral("text"), colors.text);
    themeColor(theme, QStringLiteral("border"), colors.border);

    const int columnCount = int(columns.size());
    QList<QByteArray> refs;
    refs.reserve(columnCount);
    for (int c = 0; c < columnCount; ++c)
        refs.append(columnRef(c));

    /* Texto más largo de cada columna, para su ancho. */
    QList<qsizetype> longest(columnCount, 0);

    QByteArray data;
    data += "<row r=\"1\" ht=\"22\" customHeight=\"1\">";
    for (int c = 0; c < columnCount; ++c) {
        /* El nombre de la columna va siempre como texto. */
        const QString name = cellText(plain(columns.at(c)));
        longest[c] = appendCell(data, QVariant(name), refs.at(c) + "1", StyleHeader);
    }
    data += "</row>";

    /* Filas alternas: la primera de datos teñida, la siguiente en blanco. */
    for (qsizetype r = 0; r < rows.size(); ++r) {
        const QVariantList row = rowValues(rows.at(r));
        const int style = r % 2 == 0 ? StyleRowStripe : StyleRow;
        const QByteArray number = QByteArray::number(r + 2);
        data += "<row r=\"" + number + "\">";
        for (int c = 0; c < columnCount; ++c) {
            const qsizetype length = appendCell(data, c < row.size() ? row.at(c) : QVariant(),
                                                refs.at(c) + number, style);
            if (length > longest[c])
                longest[c] = length;
        }
        data += "</row>";
    }

    const QByteArray lastRef = columnRef(qMax(columnCount - 1, 0)) + QByteArray::number(rows.size() + 1);

    /* Ancho aproximado por columna según el texto más largo (tope 60). */
    QByteArray cols = "<cols>";
    for (int c = 0; c < columnCount; ++c) {
        const qsizetype width = qMin<qsizetype>(60, qMax<qsizetype>(8, longest.at(c) + 2));
        const QByteArray index = QByteArray::number(c + 1);
        cols += "<col min=\"" + index + "\" max=\"" + index + "\" width=\"" + QByteArray::number(width)
                + "\" customWidth=\"1\"/>";
    }
    cols += "</cols>";

    QByteArray sheet;
    sheet.reserve(data.size() + cols.size() + 512);
    sheet += "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
             "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n"
             "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>\n";
    sheet += cols;
    sheet += "<sheetData>";
    sheet += data;
    sheet += "</sheetData><autoFilter ref=\"A1:" + lastRef + "\"/></worksheet>";
    data.clear();

    const QByteArray contentTypes =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n"
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n"
        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>\n"
        "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>\n"
        "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>\n"
        "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>\n"
        "</Types>";

    const QByteArray rootRels =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>\n"
        "</Relationships>";

    const QByteArray workbook =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n"
        "<sheets><sheet name=\"" + xmlEscape(sheetName.left(31)).toUtf8() + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets>\n"
        "</workbook>";

    const QByteArray workbookRels =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>\n"
        "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>\n"
        "</Relationships>";

    QByteArray styles =
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n"
        "<fonts count=\"3\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><color rgb=\"FF{headerText}\"/><name val=\"Calibri\"/></font><font><sz val=\"11\"/><color rgb=\"FF{text}\"/><name val=\"Calibri\"/></font></fonts>\n"
        "<fills count=\"5\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF{header}\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFFFFFFF\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF{stripe}\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>\n"
        "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style=\"thin\"><color rgb=\"FF{border}\"/></left><right style=\"thin\"><color rgb=\"FF{border}\"/></right><top style=\"thin\"><color rgb=\"FF{border}\"/></top><bottom style=\"thin\"><color rgb=\"FF{border}\"/></bottom><diagonal/></border></borders>\n"
        "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>\n"
        "<cellXfs count=\"4\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"><alignment vertical=\"center\"/></xf><xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"/><xf numFmtId=\"0\" fontId=\"2\" fillId=\"4\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"/></cellXfs>\n"
        "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>\n"
        "</styleSheet>";
    styles.replace("{headerText}", colors.headerText);
    styles.replace("{header}", colors.header);
    styles.replace("{stripe}", colors.stripe);
    styles.replace("{text}", colors.text);
    styles.replace("{border}", colors.border);

    /* Mismo orden que el original: los tipos de contenido van primero. */
    const QList<ZipEntry> files = {
        { "[Content_Types].xml", contentTypes },
        { "_rels/.rels", rootRels },
        { "xl/workbook.xml", workbook },
        { "xl/_rels/workbook.xml.rels", workbookRels },
        { "xl/styles.xml", styles },
        { "xl/worksheets/sheet1.xml", sheet },
    };
    return zip(files);
}

QString TableExporter::writeCsv(const QString &path, const QVariantList &columns,
                                const QVariantList &rows) const
{
    return writeFile(path, csv(columns, rows));
}

QString TableExporter::writeXlsx(const QString &path, const QVariantList &columns,
                                 const QVariantList &rows, const QString &sheetName,
                                 const QVariantMap &theme) const
{
    return writeFile(path, xlsx(columns, rows, sheetName, theme));
}
