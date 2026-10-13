import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuItem } from '@contexts/context-menu-context';

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export type MenuIconName = 'cut' | 'copy' | 'paste' | 'download' | 'open' | 'pin' | 'unpin' | 'move' | 'rename' | 'trash' | 'info' | 'send' | 'select' | 'unselect' | 'newFolder' | 'upload';

/* Iconos de trazo de las opciones del menú contextual. */
export const MenuIcon = ({ name, className = 'w-4 h-4' }: { name: MenuIconName; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {name === 'cut'      && <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.1 8.1L20 20M8.1 15.9L20 4M14.5 12h.01" /></>}
    {name === 'copy'     && <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></>}
    {name === 'paste'    && <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" /></>}
    {name === 'download' && <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />}
    {name === 'pin'      && <path d="M12 17v5M9 3h6l-1 5 3 4H7l3-4-1-5zM7 12h10" />}
    {name === 'unpin'    && <path d="M12 17v5M9 3h6l-1 5 3 4H7l3-4-1-5zM7 12h10M3 3l18 18" />}
    {name === 'move'     && <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><path d="M10 13h6M13.5 10.5L16 13l-2.5 2.5" /></>}
    {name === 'rename'   && <><path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" /><path d="M14 7l3 3" /></>}
    {name === 'info'     && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>}
    {name === 'trash'    && <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" />}
    {name === 'send'     && <><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 16.5h.01M12 3v7M8.5 6.5L12 3l3.5 3.5" /></>}
    {name === 'select'   && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12l3 3 5-6" /></>}
    {name === 'unselect' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 9l6 6M15 9l-6 6" /></>}
    {name === 'newFolder' && <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM12 10.5v5M9.5 13h5" />}
    {name === 'upload'   && <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />}
    {name === 'open'     && <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>
);

const MARGIN = 8;

/* ── Menú contextual propio ───────────────────────────────────────────
   En portal al `body` (como el Modal y el Select) y por encima de todo
   (`z-[80]`). Se mide antes de pintarse para no salirse de la ventana: si
   no cabe a la derecha o abajo del cursor, se abre hacia el otro lado.
   Las opciones no toman el foco (`mousedown` cancelado), así un campo
   conserva su selección hasta que la acción la usa. */
export const ContextMenu = ({ menu, onClose }: { menu: ContextMenuState | null; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);

  useLayoutEffect(() => {
    setActive(-1);
    if (!menu || !ref.current) { setPos(null); return; }
    const { width, height } = ref.current.getBoundingClientRect();
    const left = menu.x + width + MARGIN > window.innerWidth ? Math.max(MARGIN, menu.x - width) : menu.x;
    const top = menu.y + height + MARGIN > window.innerHeight ? Math.max(MARGIN, menu.y - height) : menu.y;
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const enabled = menu.items.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0);
    const outside = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const scroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    /* En captura: mientras el menú está abierto, las flechas y Enter son suyos. */
    const keys = (e: KeyboardEvent) => {
      const step = (dir: 1 | -1) => setActive(a => {
        const at = enabled.indexOf(a);
        return enabled[(at + dir + enabled.length) % enabled.length] ?? -1;
      });
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') step(1);
      else if (e.key === 'ArrowUp') step(-1);
      else if (e.key === 'Enter') {
        const item = menu.items[active];
        if (!item || item.disabled) return;
        onClose();
        item.onSelect();
      } else { onClose(); return; }
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', keys, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [menu, active, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[80] min-w-[200px] p-1 rounded-xl glass-float elev-float border border-hairline animate-fadeIn"
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
    >
      {menu.items.map((item, i) => (
        <Fragment key={item.id}>
        {item.separator && i > 0 && <div role="separator" className="my-1 mx-2 border-t border-line" />}
        <button
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onMouseEnter={() => setActive(item.disabled ? -1 : i)}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onClose(); item.onSelect(); }}
          className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-sm transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            ${item.danger
              ? `text-rose-300 ${i === active ? 'bg-rose-500/15' : ''}`
              : i === active ? 'bg-tint-hover text-white' : 'text-white/80'}`}
        >
          <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${item.danger ? 'text-rose-300' : 'text-white/55'}`}>{item.icon}</span>
          <span className="flex-1 min-w-0 truncate">{item.label}</span>
          {item.shortcut && <span className="shrink-0 font-mono text-[11px] text-white/35">{item.shortcut}</span>}
        </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
};
