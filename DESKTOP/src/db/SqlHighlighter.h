#pragma once

#include <QColor>
#include <QList>
#include <QPointer>
#include <QString>
#include <QSyntaxHighlighter>
#include <QTextCharFormat>
#include <QVariantList>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>
#include <QtQuick/QQuickTextDocument>

/**
 * Resaltado del editor SQL para un `TextEdit` de QML:
 *
 *     SqlHighlighter { textDocument: edit.textDocument; dialect: "mysql"; keywordColor: … }
 *
 * Es el `tokenizeSql` del panel web (utils/sql.ts) con las mismas expresiones
 * y listas de palabras. Como allí, se trocea el texto entero y no línea a
 * línea: comentarios de bloque, cadenas y bloques `$$` cruzan líneas sin más.
 * Solo cambia el color (y la cursiva en comentarios), nunca el peso.
 */
class SqlHighlighter : public QSyntaxHighlighter
{
    Q_OBJECT
    QML_ELEMENT

    /* El `textDocument` del TextEdit que se pinta. */
    Q_PROPERTY(QQuickTextDocument *textDocument READ textDocument WRITE setTextDocument NOTIFY textDocumentChanged)
    /* "mysql" o "postgresql": cambian comillas, comentarios, `$$` y operadores. */
    Q_PROPERTY(QString dialect READ dialect WRITE setDialect NOTIFY dialectChanged)
    /* Alto fijo de cada línea en px (el `leading-6` del panel web); 0 deja el de la fuente. */
    Q_PROPERTY(qreal lineHeight READ lineHeight WRITE setLineHeight NOTIFY lineHeightChanged)

    /* Colores del tema por clase de token (`--sql-*`). */
    Q_PROPERTY(QColor keywordColor READ keywordColor WRITE setKeywordColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor functionColor READ functionColor WRITE setFunctionColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor typeColor READ typeColor WRITE setTypeColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor stringColor READ stringColor WRITE setStringColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor numberColor READ numberColor WRITE setNumberColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor identifierColor READ identifierColor WRITE setIdentifierColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor commentColor READ commentColor WRITE setCommentColor NOTIFY colorsChanged)
    Q_PROPERTY(QColor operatorColor READ operatorColor WRITE setOperatorColor NOTIFY colorsChanged)

public:
    /* Mismo orden que `SqlTokenType` del panel web, con `Text` como «sin pintar». */
    enum TokenType { Text = 0, Keyword, Function, Type, String, Number, Identifier, Comment, Operator, TokenTypeCount };

    struct Token {
        int type = Text;
        int start = 0;
        int length = 0;
    };

    explicit SqlHighlighter(QObject *parent = nullptr);
    ~SqlHighlighter() override;

    QQuickTextDocument *textDocument() const;
    void setTextDocument(QQuickTextDocument *document);

    QString dialect() const;
    void setDialect(const QString &dialect);

    qreal lineHeight() const;
    void setLineHeight(qreal height);

    QColor keywordColor() const { return m_colors[Keyword]; }
    QColor functionColor() const { return m_colors[Function]; }
    QColor typeColor() const { return m_colors[Type]; }
    QColor stringColor() const { return m_colors[String]; }
    QColor numberColor() const { return m_colors[Number]; }
    QColor identifierColor() const { return m_colors[Identifier]; }
    QColor commentColor() const { return m_colors[Comment]; }
    QColor operatorColor() const { return m_colors[Operator]; }
    void setKeywordColor(const QColor &color) { setColor(Keyword, color); }
    void setFunctionColor(const QColor &color) { setColor(Function, color); }
    void setTypeColor(const QColor &color) { setColor(Type, color); }
    void setStringColor(const QColor &color) { setColor(String, color); }
    void setNumberColor(const QColor &color) { setColor(Number, color); }
    void setIdentifierColor(const QColor &color) { setColor(Identifier, color); }
    void setCommentColor(const QColor &color) { setColor(Comment, color); }
    void setOperatorColor(const QColor &color) { setColor(Operator, color); }

    /** Tokens con color de `text` (los tramos sin pintar no se devuelven), en orden. */
    static QList<Token> tokenize(const QString &text, bool postgres);

    /** `tokenizeSql`: lista de `{ type, text }`; concatenar los `text` da el original. */
    Q_INVOKABLE QVariantList tokenizeSql(const QString &text) const;
    /** `statementAt`: `{ start, end, sql }` de la sentencia del cursor; mapa vacío si no hay ninguna. */
    Q_INVOKABLE QVariantMap statementAt(const QString &text, int caret) const;
    /** Palabra reservada que el editor pasa a mayúsculas al cerrarla (`SQL_KEYWORDS`). */
    Q_INVOKABLE bool isReservedWord(const QString &word) const;

signals:
    void textDocumentChanged();
    void dialectChanged();
    void lineHeightChanged();
    void colorsChanged();

protected:
    void highlightBlock(const QString &text) override;

private:
    void attach();
    void setColor(TokenType type, const QColor &color);
    void rebuildFormats();
    void scheduleRehighlight();
    void ensureTokens();
    void onContentsChange();
    void applyLineHeight();

    QPointer<QQuickTextDocument> m_quickDocument;
    QPointer<QTextDocument> m_attached;
    bool m_postgres = false;
    qreal m_lineHeight = 0;
    QColor m_colors[TokenTypeCount];
    QTextCharFormat m_formats[TokenTypeCount];

    /* Tokens del documento entero, válidos para `m_revision`. */
    QList<Token> m_tokens;
    int m_revision = -1;
    bool m_dirty = true;
    bool m_rehighlightPending = false;
    bool m_lineHeightPending = false;
    bool m_applyingLineHeight = false;
};
