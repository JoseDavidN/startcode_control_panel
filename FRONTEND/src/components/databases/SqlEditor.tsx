import React, { forwardRef, useMemo, useRef } from 'react';
import { tokenizeSql, uppercaseKeywordBefore } from '@utils/sql';
import type { SqlDialect } from '@utils/sqlDialect';

interface SqlEditorProps {
  value: string;
  /** Resaltado y mayúsculas según el motor (comillas, comentarios, `$$`). */
  dialect?: SqlDialect;
  onChange: (value: string) => void;
  /** Ctrl/⌘ + Enter. */
  onRun: () => void;
  disabled?: boolean;
}

const INDENT = '  ';

/**
 * Editor SQL con filas numeradas: un textarea sin ajuste de línea y una
 * columna de números que sigue su scroll vertical. Las dos comparten fuente,
 * alto de línea y padding superior, así que cada número cae en su fila.
 *
 * El resaltado es un <pre> debajo del textarea, con el mismo texto tokenizado
 * y la misma caja; el textarea lleva el texto transparente y solo aporta el
 * cursor y la selección. El color de cada token sale de `--sql-*` del tema.
 */
export const SqlEditor = forwardRef<HTMLTextAreaElement, SqlEditorProps>(
  ({ value, dialect = 'mysql', onChange, onRun, disabled = false }, ref) => {
    const gutterRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLPreElement>(null);
    const lines = value.split('\n').length;
    const tokens = useMemo(() => tokenizeSql(value, dialect), [value, dialect]);

    /* Al cerrar una palabra reservada con espacio, salto de línea, paréntesis,
       coma o punto y coma, se pasa a mayúsculas. Solo al escribir un carácter:
       un texto pegado se respeta tal cual. */
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const next = el.value;
      const caret = el.selectionStart;
      const typedOne = next.length === value.length + 1 && caret === el.selectionEnd;
      const formatted = typedOne ? uppercaseKeywordBefore(next, caret, dialect) : next;
      onChange(formatted);
      /* Mismo largo: el cursor vuelve a donde estaba tras el re-render. */
      if (formatted !== next) requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = caret; });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun();
        return;
      }
      /* Tab indenta en vez de sacar el foco del editor. */
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        onChange(value.slice(0, start) + INDENT + value.slice(end));
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + INDENT.length; });
      }
    };

    return (
      <div className="glass-input rounded-xl flex-1 min-h-0 flex overflow-hidden font-mono text-[13px] leading-6">
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 overflow-hidden select-none pt-3 pb-[calc(0.75rem+6px)] pl-3 pr-3 text-right text-white/25 tabular-nums border-r border-line bg-tint-sunken"
        >
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {/* Capa propia: repintar el texto resaltado al escribir no invalida el panel. */}
        <div className="relative flex-1 min-w-0 scroll-layer">
        <pre
          ref={highlightRef}
          aria-hidden
          className="absolute inset-0 m-0 pt-3 pl-3 pb-[calc(0.75rem+6px)] pr-[calc(0.75rem+6px)] overflow-hidden whitespace-pre pointer-events-none text-white/90"
        >
          {tokens.map((t, i) => t.type === 'text'
            ? t.text
            : <span key={i} className={`sql-${t.type}`}>{t.text}</span>)}
          {/* Las barras de scroll del textarea (6 px, `.scroll-thin`) le dan más
              recorrido que al <pre> y la columna de números: ese padding extra lo
              iguala para que no se desalineen al llegar al final.
              Un salto final en el textarea abre una fila vacía: el <pre> también la necesita. */}
          {'\n'}
        </pre>
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={e => {
            const { scrollTop, scrollLeft } = e.currentTarget;
            if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
            if (highlightRef.current) {
              highlightRef.current.scrollTop = scrollTop;
              highlightRef.current.scrollLeft = scrollLeft;
            }
          }}
          disabled={disabled}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Editor SQL"
          placeholder="SELECT * FROM tabla LIMIT 100;"
          className="absolute inset-0 w-full h-full resize-none bg-transparent outline-none py-3 px-3 text-transparent caret-white placeholder:text-white/25 whitespace-pre overflow-auto scroll-thin selection:bg-violet-500/30 disabled:opacity-50"
        />
        </div>
      </div>
    );
  },
);
SqlEditor.displayName = 'SqlEditor';
