import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Texto secundario a la derecha (p. ej. el id de un modelo). */
  hint?: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Se muestra si `value` no coincide con ninguna opción. */
  placeholder?: string;
  disabled?: boolean;
  /** Clases del disparador; el campo (`glass-input`) lo pone quien lo usa. */
  className?: string;
  'aria-label'?: string;
}

/** Alto máximo de la lista antes de desplazar (max-h-72). */
const MENU_MAX = 288;
const GAP = 6;
const MARGIN = 8;

interface MenuPosition { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

/** El campo que rodea al disparador marca el ancho y la posición de la lista. */
const anchorOf = (trigger: HTMLElement | null) => trigger?.closest<HTMLElement>('.glass-input') ?? trigger;

/* ── Select propio ────────────────────────────────────────────────────
   Sustituye al `<select>` nativo, cuyo desplegable dibuja el sistema y no
   sigue el tema. Solo es el disparador: el campo `glass-input` que lo rodea
   lo pone quien lo usa, y la lista se alinea con ese campo.

   La lista va en un portal al `body`, igual que el Modal: dentro de una
   superficie `.glass` (o de un modal con scroll) un `fixed` quedaría
   encerrado o recortado. Se abre hacia arriba si abajo no cabe, y se cierra
   al hacer scroll fuera de ella o al cambiar el tamaño de la ventana. */
export function Select<T extends string | number>({
  value, options, onChange, placeholder = 'Seleccionar', disabled = false, className = '', 'aria-label': ariaLabel,
}: SelectProps<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<MenuPosition | null>(null);

  const selectedIndex = options.findIndex(o => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const place = useCallback(() => {
    const el = anchorOf(triggerRef.current);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = below < Math.min(MENU_MAX, options.length * 36 + 8) && above > below;
    const width = Math.max(r.width, 160);
    const left = Math.min(Math.max(MARGIN, r.left), window.innerWidth - width - MARGIN);
    setPos(up
      ? { left, width, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(MENU_MAX, above) }
      : { left, width, top: r.bottom + GAP, maxHeight: Math.min(MENU_MAX, below) });
  }, [options.length]);

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const close = useCallback(() => { setOpen(false); setPos(null); }, []);
  const choose = (i: number) => {
    const option = options[i];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close();
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !anchorOf(triggerRef.current)?.contains(t)) close();
    };
    /* El scroll de la propia lista no la cierra. */
    const scroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  /* La opción resaltada con el teclado siempre a la vista. */
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => Math.min(last, a + 1)); break;
      case 'ArrowUp':   e.preventDefault(); setActive(a => Math.max(0, a - 1)); break;
      case 'Home':      e.preventDefault(); setActive(0); break;
      case 'End':       e.preventDefault(); setActive(last); break;
      case 'Enter':
      case ' ':         e.preventDefault(); choose(active); break;
      /* Dentro de un modal, Escape cierra solo la lista. */
      case 'Escape':    e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); close(); break;
      case 'Tab':       close(); break;
      default:
        /* Una letra salta a la siguiente opción que empiece por ella. */
        if (e.key.length === 1) {
          const k = e.key.toLowerCase();
          for (let n = 1; n <= options.length; n++) {
            const i = (active + n) % options.length;
            if (options[i].label.toLowerCase().startsWith(k)) { setActive(i); break; }
          }
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex items-center gap-2 min-w-0 bg-transparent outline-none text-left text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? '' : 'text-white/40'}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          aria-hidden className={`w-3.5 h-3.5 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[70] p-1 rounded-xl glass-float elev-float border border-hairline animate-fadeIn"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        >
          <div id={listId} role="listbox" aria-label={ariaLabel}
            className="overflow-y-auto scroll-thin scroll-layer" style={{ maxHeight: pos.maxHeight }}>
            {options.map((o, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={String(o.value)}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  /* mousedown: elegir antes de que el disparador pierda el foco. */
                  onMouseDown={e => { e.preventDefault(); choose(i); }}
                  className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm cursor-pointer transition-colors
                    ${i === active ? 'bg-tint-hover' : ''}
                    ${isSelected ? 'text-white font-medium' : 'text-white/75'}`}
                >
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 max-w-[45%] truncate font-mono text-[11px] text-white/35">{o.hint}</span>}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden className={`w-3.5 h-3.5 shrink-0 text-violet-300 ${isSelected ? '' : 'invisible'}`}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
