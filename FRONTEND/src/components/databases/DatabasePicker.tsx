import React, { useEffect, useRef, useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import type { DatabaseSchema } from '@typings/database.types';

interface DatabasePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Pide las bases al servidor con los datos actuales del formulario. */
  load: () => Promise<DatabaseSchema[]>;
  /** Cambia cuando cambian los datos de conexión: entonces la lista se vuelve a pedir. */
  credentialsKey: string;
  /** Motivo por el que todavía no se puede cargar (faltan host o usuario). */
  blockedReason?: string | null;
}

/**
 * Lista de las bases que ve el usuario en el servidor. Se pide al montarse
 * (al entrar en la pestaña) y cada vez que cambian los datos de conexión;
 * pulsar una base la marca como seleccionada.
 */
export const DatabasePicker: React.FC<DatabasePickerProps> = ({
  value, onChange, load, credentialsKey, blockedReason,
}) => {
  const [items, setItems] = useState<DatabaseSchema[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const fetchList = async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await loadRef.current();
      if (request !== requestRef.current) return;
      setItems(list);
    } catch (err) {
      if (request !== requestRef.current) return;
      setItems(null);
      setError((err as { message?: string })?.message ?? 'No se pudieron cargar las bases');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (blockedReason) { requestRef.current++; setItems(null); setLoading(false); return; }
    void fetchList();
  }, [credentialsKey, blockedReason]);

  const selected = value.trim();
  /* Al editar, la base guardada puede no aparecer (sin permiso para listarla): se muestra igual. */
  const list = items && selected && !items.some(i => i.name === selected)
    ? [{ name: selected, system: false } as DatabaseSchema, ...items]
    : items ?? [];
  const firstSystem = list.findIndex(v => v.system);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-white/50 shrink-0">Base de datos seleccionada:</span>
        {selected
          ? <span className="font-mono text-[13px] text-white/90 truncate">{selected}</span>
          : <span className="text-white/35 italic">ninguna</span>}
        {!blockedReason && (
          <button type="button" onClick={() => void fetchList()} disabled={loading}
            aria-label="Recargar bases" title="Recargar bases"
            className="ml-auto w-7 h-7 rounded-lg text-white/45 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 transition-colors disabled:opacity-50">
            {loading
              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <DbIcon name="refresh" className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div role="listbox" aria-label="Bases de datos" className="glass-soft rounded-xl p-1 h-56 overflow-y-auto scroll-thin">
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
        ) : list.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-white/45">El servidor no devolvió ninguna base</p>
        ) : list.map((item, i) => {
          const isSelected = item.name === selected;
          return (
            <React.Fragment key={item.name}>
              {i === firstSystem && firstSystem > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/30">Sistema</div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(item.name)}
                className={`w-full flex items-center gap-2 h-8 px-3 rounded-lg text-left text-sm transition-colors
                  ${isSelected ? 'nav-active text-white' : item.system ? 'text-white/40 hover:bg-tint-hover' : 'text-white/75 hover:bg-tint-hover hover:text-white'}`}
              >
                <span className="text-violet-300"><DbIcon name="database" className="w-3.5 h-3.5" /></span>
                <span className="flex-1 truncate font-mono text-[13px]">{item.name}</span>
                {isSelected && <span className="text-emerald-300"><DbIcon name="check" className="w-3.5 h-3.5" /></span>}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
