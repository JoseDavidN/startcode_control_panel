import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import type { DatabaseSchema } from '@typings/database.types';

interface DatabasePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Pide las bases al servidor con los datos actuales del formulario. */
  load: () => Promise<DatabaseSchema[]>;
  /** Cambia cuando cambian los datos de conexión: entonces la lista se vuelve a pedir. */
  credentialsKey: string;
  /** Motivo por el que todavía no se puede cargar (faltan host o usuario). */
  blockedReason?: string | null;
}

/**
 * Campo de base de datos del formulario de conexión: se puede escribir a mano
 * o, al pulsarlo, elegir entre las bases que ve el usuario en el servidor.
 * La lista va en línea bajo el campo (no flotando) para que el cuerpo con
 * scroll del modal no la recorte.
 */
export const DatabasePicker: React.FC<DatabasePickerProps> = ({
  value, onChange, placeholder, load, credentialsKey, blockedReason,
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DatabaseSchema[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const fetchList = async () => {
    if (blockedReason) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await load();
      if (request !== requestRef.current) return;
      setItems(list);
      setLoadedKey(credentialsKey);
    } catch (err) {
      if (request !== requestRef.current) return;
      setItems(null);
      setError((err as { message?: string })?.message ?? 'No se pudieron cargar las bases');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const openList = () => {
    setOpen(true);
    if (loadedKey !== credentialsKey && !loading) void fetchList();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  /* Lo escrito filtra; si coincide exacto con una base, se enseñan todas. */
  const visible = useMemo(() => {
    if (!items) return [];
    const term = value.trim().toLowerCase();
    if (!term || items.some(i => i.name.toLowerCase() === term)) return items;
    return items.filter(i => i.name.toLowerCase().includes(term));
  }, [items, value]);

  /* Opción 0: servidor completo; después, las bases visibles. */
  const options = useMemo(() => ['', ...visible.map(v => v.name)], [visible]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setCursor(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); setCursor(c => Math.min(c + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && open && cursor >= 0) { e.preventDefault(); choose(options[cursor]); }
  };

  const firstSystem = visible.findIndex(v => v.system);

  return (
    <div ref={rootRef}>
      <div className="glass-input rounded-xl h-11 flex items-center gap-2 pl-3.5 pr-1.5 transition">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setCursor(-1); if (!open) openList(); }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90 font-mono"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openList())}
          aria-label={open ? 'Cerrar lista de bases' : 'Ver bases disponibles'}
          className="w-8 h-8 rounded-lg text-white/45 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 transition-colors"
        >
          {loading
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <DbIcon name="chevronDown" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
      </div>

      {open && (
        <div role="listbox" className="mt-1.5 glass-soft rounded-xl p-1 max-h-56 overflow-y-auto scroll-thin animate-fadeIn">
          {blockedReason ? (
            <p className="px-3 py-2.5 text-xs text-white/45">{blockedReason}</p>
          ) : loading && !items ? (
            <p className="px-3 py-2.5 text-xs text-white/45">Conectando para listar las bases…</p>
          ) : error ? (
            <div className="px-3 py-2.5 flex items-center gap-3">
              <p className="flex-1 text-xs text-rose-300">{error}</p>
              <button type="button" onClick={() => void fetchList()}
                className="text-xs text-white/60 hover:text-white underline-offset-2 hover:underline shrink-0">Reintentar</button>
            </div>
          ) : (
            <>
              {options.map((name, i) => {
                const item = i === 0 ? null : visible[i - 1];
                const selected = name === value.trim();
                return (
                  <React.Fragment key={name || '__server'}>
                    {i - 1 === firstSystem && firstSystem > 0 && (
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/30">Sistema</div>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => choose(name)}
                      onMouseEnter={() => setCursor(i)}
                      className={`w-full flex items-center gap-2 h-8 px-3 rounded-lg text-left text-sm transition-colors
                        ${cursor === i ? 'bg-tint-hover text-white' : item?.system ? 'text-white/40' : 'text-white/75'}`}
                    >
                      <span className={i === 0 ? 'text-white/40' : 'text-violet-300'}>
                        <DbIcon name={i === 0 ? 'folder' : 'database'} className="w-3.5 h-3.5" />
                      </span>
                      {i === 0
                        ? <span className="flex-1 italic text-white/55">Servidor completo (todas las bases)</span>
                        : <span className="flex-1 truncate font-mono text-[13px]">{name}</span>}
                      {selected && <span className="text-emerald-300"><DbIcon name="check" className="w-3.5 h-3.5" /></span>}
                    </button>
                  </React.Fragment>
                );
              })}
              {items && visible.length === 0 && (
                <p className="px-3 py-2 text-xs text-white/40">Ninguna base coincide; se usará el nombre escrito</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
