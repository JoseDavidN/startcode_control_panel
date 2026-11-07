import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { newlineIndent, tokenizeSql, uppercaseKeywordBefore } from '@utils/sql';
import { completeSql, type CompletionIndex, type CompletionItem } from '@utils/sqlComplete';
import type { SqlDialect } from '@utils/sqlDialect';

interface SqlEditorProps {
  value: string;
  /** Resaltado y mayúsculas según el motor (comillas, comentarios, `$$`). */
  dialect?: SqlDialect;
  onChange: (value: string) => void;
  /** Ctrl/⌘ + Enter. */
  onRun: () => void;
  /** Ctrl/⌘ + S. */
  onSave?: () => void;
  /** Ctrl/⌘ + Mayús + S. */
  onSaveAs?: () => void;
  disabled?: boolean;
  /** Tablas y columnas para predecir; sin él, el editor no sugiere nada. */
  completion?: CompletionIndex | null;
}

const INDENT = '  ';

/**
 * Tras cambiar el texto desde código (mayúsculas, sangría, sugerencia), deja
 * el cursor en `pos` y el desplazamiento donde estaba, moviéndolo solo lo justo
 * para que el cursor se vea. Al reemplazar el valor, el navegador lleva el
 * cursor al final y desplaza la vista hasta allí; sin restaurar el scroll,
 * escribir `as` en una consulta larga saltaba al final. Y en horizontal la
 * vista sigue al cursor: Enter tras una línea larga vuelve al inicio de la fila
 * nueva en vez de quedarse desplazada a la derecha. `charW`: ancho de un
 * carácter (fuente monoespaciada).
 */
const placeCaret = (el: HTMLTextAreaElement, pos: number, charW: number) => {
  const { scrollTop, scrollLeft } = el;
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = pos;
    const before = el.value.slice(0, pos);
    /* Vertical: la línea del cursor a la vista (p. ej. Enter en la última línea visible). */
    const top = PAD + (before.split('\n').length - 1) * LINE;
    el.scrollTop = Math.min(Math.max(scrollTop, top + LINE + PAD + BAR - el.clientHeight), top);
    /* Horizontal: la columna del cursor entre el padding izquierdo y la franja de la barra. */
    const x = PAD + (pos - before.lastIndexOf('\n') - 1) * charW;
    /* `clientWidth` ya no cuenta el borde derecho (el margen): basta con que el carácter quepa. */
    el.scrollLeft = Math.min(Math.max(scrollLeft, x + charW - el.clientWidth), Math.max(0, x - PAD));
  });
};
/* Caja del texto: padding de 12 px (`p-3`) y alto de línea de 24 px (`leading-6`). */
const PAD = 12;
const LINE = 24;
/* Franja de las barras propias, reservada a la derecha y abajo (pb/pr de 12 px más). */
const BAR = 12;
const POPUP_W = 300;
const POPUP_MAX_H = 248;

const KIND_LABEL: Record<CompletionItem['kind'], string> = { table: 'T', view: 'V', column: 'C', alias: 'A' };
const KIND_TONE: Record<CompletionItem['kind'], string> = {
  table: 'text-sky-300 bg-sky-500/15',
  view: 'text-teal-300 bg-teal-500/15',
  column: 'text-violet-300 bg-violet-500/15',
  alias: 'text-amber-300 bg-amber-500/15',
};

interface Suggest {
  items: CompletionItem[];
  from: number;
  caret: number;
  active: number;
  left: number;
  top?: number;
  bottom?: number;
}

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
  ({ value, dialect = 'mysql', onChange, onRun, onSave, onSaveAs, disabled = false, completion = null }, ref) => {
    const textRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => textRef.current!, []);
    const gutterRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const charWidth = useRef(0);
    const [suggest, setSuggest] = useState<Suggest | null>(null);
    const highlightRef = useRef<HTMLPreElement>(null);
    const lines = value.split('\n').length;
    const tokens = useMemo(() => tokenizeSql(value, dialect), [value, dialect]);

    /* ── Predicción ──
       Se calcula al escribir (solo la sentencia del cursor, sin peticiones) y
       el menú flota en la posición del cursor, fuera del panel para no cortarse. */
    const measureChar = (el: HTMLTextAreaElement) => {
      if (charWidth.current) return charWidth.current;
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return 8;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      charWidth.current = ctx.measureText('M').width || 8;
      return charWidth.current;
    };

    const openSuggest = (el: HTMLTextAreaElement, text: string, caret: number, force = false) => {
      const res = completion ? completeSql(text, caret, completion, dialect, force) : null;
      if (!res || !res.items.length) { setSuggest(null); return; }
      const lineStart = text.lastIndexOf('\n', res.from - 1) + 1;
      const line = text.slice(0, lineStart).split('\n').length - 1;
      const rect = el.getBoundingClientRect();
      const x = rect.left + PAD + (res.from - lineStart) * measureChar(el) - el.scrollLeft;
      const caretTop = rect.top + PAD + line * LINE - el.scrollTop;
      const left = Math.max(8, Math.min(x - 8, window.innerWidth - POPUP_W - 8));
      /* Sin sitio debajo, se abre encima de la línea. */
      const below = caretTop + LINE + POPUP_MAX_H + 8 <= window.innerHeight;
      setSuggest({
        items: res.items, from: res.from, caret, active: 0, left,
        ...(below ? { top: caretTop + LINE + 2 } : { bottom: window.innerHeight - caretTop + 2 }),
      });
    };

    const accept = (item: CompletionItem) => {
      const el = textRef.current;
      if (!el || !suggest) return;
      const next = value.slice(0, suggest.from) + item.insert + value.slice(suggest.caret);
      const pos = suggest.from + item.insert.length;
      setSuggest(null);
      onChange(next);
      placeCaret(el, pos, measureChar(el));
    };

    /* Sin índice (cambió la base), el menú abierto ya no vale. */
    useEffect(() => { setSuggest(null); }, [completion]);
    useEffect(() => {
      if (!suggest) return;
      (listRef.current?.children[suggest.active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    }, [suggest]);

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
      if (formatted !== next) placeCaret(el, caret, measureChar(el));
      /* Se sugiere al escribir un carácter; al borrar uno con el menú abierto, se
         ajusta; pegar o borrar más cierra el menú. */
      const erasedOne = next.length === value.length - 1 && caret === el.selectionEnd;
      if (typedOne || (erasedOne && suggest)) openSuggest(el, formatted, caret);
      else setSuggest(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSuggest(null);
        onRun();
        return;
      }
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSuggest(null);
        if (e.shiftKey) onSaveAs?.();
        else onSave?.();
        return;
      }
      /* Ctrl + Espacio: sugerencias aunque no haya nada escrito. */
      if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const el = e.currentTarget;
        openSuggest(el, value, el.selectionStart, true);
        return;
      }
      if (suggest) {
        const n = suggest.items.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.key === 'ArrowDown' ? 1 : -1;
          setSuggest({ ...suggest, active: (suggest.active + step + n) % n });
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          accept(suggest.items[suggest.active]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setSuggest(null);
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') setSuggest(null);
      }
      /* Enter: sangría automática mientras siga la misma consulta (hasta el `;`). */
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        const indent = newlineIndent(value, start, INDENT);
        const insert = `\n${indent}`;
        /* El salto de línea también cierra una palabra reservada: se pasa a mayúsculas como al escribirla. */
        const broken = uppercaseKeywordBefore(`${value.slice(0, start)}\n${value.slice(end)}`, start + 1, dialect);
        onChange(broken.slice(0, start + 1) + indent + broken.slice(start + 1));
        placeCaret(el, start + insert.length, measureChar(el));
        return;
      }
      /* Tab indenta en vez de sacar el foco del editor. */
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        onChange(value.slice(0, start) + INDENT + value.slice(end));
        placeCaret(el, start + INDENT.length, measureChar(el));
      }
    };

    return (
      <div className="glass-input rounded-xl flex-1 min-h-0 flex overflow-hidden font-mono text-[13px] leading-6">
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 overflow-hidden select-none pt-3 pb-[calc(0.75rem+12px)] pl-3 pr-3 text-right text-white/25 tabular-nums border-r border-line bg-tint-sunken"
        >
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {/* Capa propia: repintar el texto resaltado al escribir no invalida el panel. */}
        <div className="relative flex-1 min-w-0 scroll-layer">
        <pre
          ref={highlightRef}
          aria-hidden
          className="absolute inset-0 m-0 pt-3 pl-3 pb-[calc(0.75rem+12px)] pr-0 border-r-[20px] border-transparent overflow-hidden whitespace-pre pointer-events-none text-white/90"
        >
          {tokens.map((t, i) => t.type === 'text'
            ? t.text
            : <span key={i} className={`sql-${t.type}`}>{t.text}</span>)}
          {/* Sin barras nativas (las dibuja `overlayScrollbars`), el textarea y el <pre>
              tienen el mismo recorrido con el mismo padding. Abajo se reservan 12 px, la
              franja de esas barras. A la derecha va un borde transparente de 20 px: el padding
              derecho de un textarea no cuenta en su desplazamiento horizontal, así que con
              él el final de una línea larga quedaba pegado al borde; el borde sí queda
              siempre fuera del texto, y la barra vertical va dentro de él, al filo de la caja.
              Un salto final en el textarea abre una fila vacía: el <pre> también la necesita. */}
          {'\n'}
        </pre>
        <textarea
          ref={textRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setSuggest(null)}
          onMouseDown={() => setSuggest(null)}
          onScroll={e => {
            if (suggest) setSuggest(null);
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
          className="absolute inset-0 w-full h-full resize-none bg-transparent outline-none pt-3 pl-3 pb-[calc(0.75rem+12px)] pr-0 border-r-[20px] border-transparent text-transparent caret-white placeholder:text-white/25 whitespace-pre overflow-auto scroll-thin selection:bg-violet-500/30 disabled:opacity-50"
        />
        </div>
        {suggest && createPortal(
          <div
            className="fixed z-[70] p-1 rounded-xl glass-float elev-float border border-hairline animate-fadeIn"
            style={{ left: suggest.left, top: suggest.top, bottom: suggest.bottom, width: POPUP_W }}
          >
            <div ref={listRef} role="listbox" aria-label="Sugerencias"
              className="overflow-y-auto scroll-thin scroll-layer" style={{ maxHeight: POPUP_MAX_H - 8 }}>
              {suggest.items.map((it, i) => (
                <div key={`${it.kind}:${it.label}:${it.detail ?? ''}`} role="option" aria-selected={i === suggest.active}
                  onMouseEnter={() => setSuggest({ ...suggest, active: i })}
                  /* mousedown: elegir sin que el editor pierda el foco. */
                  onMouseDown={e => { e.preventDefault(); accept(it); }}
                  className={`flex items-center gap-2 px-2 h-7 rounded-lg cursor-pointer text-[12px] transition-colors
                    ${i === suggest.active ? 'bg-tint-hover text-white' : 'text-white/75'}`}>
                  <span className={`w-4 h-4 shrink-0 rounded text-[9px] font-bold flex items-center justify-center ${KIND_TONE[it.kind]}`}>{KIND_LABEL[it.kind]}</span>
                  <span className="flex-1 min-w-0 truncate font-mono">{it.label}</span>
                  {it.detail && <span className="shrink-0 max-w-[45%] truncate font-mono text-[10px] text-white/35">{it.detail}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  },
);
SqlEditor.displayName = 'SqlEditor';
