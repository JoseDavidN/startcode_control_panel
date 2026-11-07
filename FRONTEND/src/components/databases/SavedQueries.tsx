import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@components/common/Modal';
import { DbIcon } from '@components/databases/icons';
import { MAX_QUERY_NAME, sameName, type SavedQuery } from '@lib/sqlQueries';
import { tokenizeSql } from '@utils/sql';
import type { SqlDialect } from '@utils/sqlDialect';
import { timeAgo } from '@utils/time';

const secondary = 'h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium transition disabled:opacity-50';
const primary = 'h-10 px-4 rounded-xl grad-brand elev-brand-sm hover:elev-brand text-sm font-semibold transition disabled:opacity-50';

/* ── Guardar con nombre ───────────────────────────────────────────── */
export const SaveQueryModal = ({ isOpen, onClose, queries, initialName, schema, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  queries: SavedQuery[];
  initialName: string;
  schema: string | null;
  onSave: (name: string) => void;
}) => {
  const [name, setName] = useState(initialName);
  useEffect(() => { if (isOpen) setName(initialName); }, [isOpen, initialName]);

  const clean = name.trim();
  const clash = queries.find(q => sameName(q.name, clean));
  const submit = () => { if (clean) onSave(clean); };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Guardar consulta" size="sm">
      <div className="space-y-4">
        <div>
          <label htmlFor="saved-query-name" className="block text-xs font-medium text-white/55 mb-1.5">Nombre</label>
          <div className="glass-input rounded-xl h-10 flex items-center px-3.5">
            <input
              id="saved-query-name"
              autoFocus
              value={name}
              maxLength={MAX_QUERY_NAME}
              onChange={e => setName(e.target.value)}
              onFocus={e => e.currentTarget.select()}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Ventas por mes"
              className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30"
            />
          </div>
          {clash && <p className="text-xs text-amber-300 mt-1.5">Ya hay una consulta con este nombre: se reemplazará.</p>}
        </div>
        <p className="text-xs text-white/45">
          Base: <span className="font-mono text-white/70">{schema ?? 'sin base seleccionada'}</span>
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" onClick={onClose} className={secondary}>Cancelar</button>
          <button type="button" onClick={submit} disabled={!clean} className={primary} style={{ color: 'var(--on-brand)' }}>
            {clash ? 'Reemplazar' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* ── Lista: buscar, ver, cargar, renombrar y eliminar ─────────────── */
export const SavedQueriesModal = ({
  isOpen, onClose, queries, dialect, canAddEditor, activeEmpty, activeUnsaved, activeRunning, canSaveCurrent,
  onLoad, onReplace, onSaveCurrent, onRename, onRemove,
}: {
  isOpen: boolean;
  onClose: () => void;
  queries: SavedQuery[];
  dialect: SqlDialect;
  /** Queda sitio para otro editor. */
  canAddEditor: boolean;
  activeEmpty: boolean;
  /** El editor activo tiene texto que no está guardado en ninguna consulta. */
  activeUnsaved: boolean;
  activeRunning: boolean;
  canSaveCurrent: boolean;
  /** En el editor activo si está vacío; si no, en uno nuevo o en el que ya la tenga abierta. */
  onLoad: (query: SavedQuery) => void;
  onReplace: (query: SavedQuery) => void;
  onSaveCurrent: () => void;
  onRename: (id: string, name: string) => boolean;
  onRemove: (id: string) => void;
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState(false);
  /* Las dos acciones que pierden algo piden un segundo clic. */
  const [confirming, setConfirming] = useState<'delete' | 'replace' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setRenaming(null);
    setConfirming(null);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return queries;
    return queries.filter(q => q.name.toLocaleLowerCase().includes(needle) || q.sql.toLocaleLowerCase().includes(needle));
  }, [queries, search]);

  const selected = filtered.find(q => q.id === selectedId) ?? filtered[0] ?? null;
  const tokens = useMemo(() => (selected ? tokenizeSql(selected.sql, dialect) : []), [selected, dialect]);

  const pick = (id: string) => {
    setSelectedId(id);
    setRenaming(null);
    setRenameError(false);
    setConfirming(null);
  };

  const commitRename = () => {
    if (!selected || renaming === null) return;
    const name = renaming.trim();
    if (!name || name === selected.name) { setRenaming(null); setRenameError(false); return; }
    if (onRename(selected.id, name)) { setRenaming(null); setRenameError(false); }
    else setRenameError(true);
  };

  const replace = () => {
    if (!selected) return;
    if (activeUnsaved && confirming !== 'replace') { setConfirming('replace'); return; }
    onReplace(selected);
  };

  const remove = () => {
    if (!selected) return;
    if (confirming !== 'delete') { setConfirming('delete'); return; }
    onRemove(selected.id);
    setConfirming(null);
  };

  const canLoad = activeEmpty || canAddEditor;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Consultas guardadas" size="xl" tall>
      <div className="h-full min-h-0 flex flex-col gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="glass-input rounded-xl h-10 flex items-center gap-2.5 px-3.5 flex-1 min-w-0">
            <DbIcon name="search" className="w-4 h-4 text-white/35 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o por texto de la consulta"
              className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30"
            />
          </div>
          <button type="button" onClick={onSaveCurrent} disabled={!canSaveCurrent}
            title="Guarda el texto del editor activo como una consulta nueva"
            className={`${secondary} inline-flex items-center gap-2 shrink-0`}>
            <DbIcon name="save" className="w-4 h-4" />
            Guardar editor como nueva
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)] gap-4">
          {/* Lista */}
          <div className="glass-soft rounded-xl min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-white/45">
                  {queries.length === 0 ? 'Aún no hay consultas guardadas' : 'Ninguna coincide con la búsqueda'}
                </p>
              ) : filtered.map(q => (
                <button key={q.id} type="button" onClick={() => pick(q.id)} onDoubleClick={() => canLoad && onLoad(q)}
                  aria-current={q.id === selected?.id ? 'true' : undefined}
                  title="Doble clic para cargar"
                  className={`w-full text-left px-3.5 py-2.5 border-b border-line last:border-0 transition ${
                    q.id === selected?.id ? 'bg-tint-active' : 'hover:bg-tint-hover'
                  }`}>
                  <span className="block text-sm text-white truncate">{q.name}</span>
                  <span className="block text-[11px] text-white/40 truncate mt-0.5">
                    {q.schema && <span className="font-mono">{q.schema} · </span>}
                    {timeAgo(new Date(q.updatedAt))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Detalle */}
          <div className="glass-soft rounded-xl min-h-0 min-w-0 flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <DbIcon name="folder" className="w-7 h-7 text-white/25" />
                <p className="text-sm text-white/55">Aquí verás la consulta que elijas</p>
                <p className="text-xs text-white/35">Para guardar una, escríbela en el editor y pulsa Guardar o Ctrl + S</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 min-h-12 py-2 border-b border-line shrink-0">
                  {renaming !== null ? (
                    <div className="flex-1 min-w-0">
                      <div className="glass-input rounded-lg h-8 flex items-center px-2.5">
                        <input
                          autoFocus
                          value={renaming}
                          maxLength={MAX_QUERY_NAME}
                          aria-label="Nombre de la consulta"
                          onChange={e => { setRenaming(e.target.value); setRenameError(false); }}
                          onFocus={e => e.currentTarget.select()}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') {
                              /* Solo cancela el nombre, no cierra el modal. */
                              e.stopPropagation();
                              e.nativeEvent.stopImmediatePropagation();
                              setRenaming(null);
                              setRenameError(false);
                            }
                          }}
                          className="w-full bg-transparent outline-none text-sm text-white/90"
                        />
                      </div>
                      {renameError && <p className="text-xs text-rose-300 mt-1">Ya hay otra consulta con ese nombre</p>}
                    </div>
                  ) : (
                    <>
                      <h3 className="flex-1 min-w-0 text-sm font-semibold text-white truncate" title={selected.name}>{selected.name}</h3>
                      <button type="button" onClick={() => setRenaming(selected.name)}
                        aria-label="Cambiar nombre" title="Cambiar nombre"
                        className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0">
                        <DbIcon name="edit" className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <pre className="flex-1 min-h-0 m-0 p-4 overflow-auto scroll-thin font-mono text-[13px] leading-6 text-white/90 whitespace-pre">
                  {tokens.map((t, i) => t.type === 'text'
                    ? t.text
                    : <span key={i} className={`sql-${t.type}`}>{t.text}</span>)}
                </pre>

                <div className="px-4 py-3 border-t border-line shrink-0 flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-white/45 mr-auto min-w-0 truncate">
                    Base: <span className="font-mono text-white/70">{selected.schema ?? 'sin base'}</span>
                  </p>
                  <button type="button" onClick={remove} onBlur={() => setConfirming(c => (c === 'delete' ? null : c))}
                    className="h-10 px-4 rounded-xl glass-soft row-hit text-rose-300 text-sm font-medium transition">
                    {confirming === 'delete' ? 'Pulsa otra vez para eliminar' : 'Eliminar'}
                  </button>
                  {!activeEmpty && !activeRunning && (
                    <button type="button" onClick={replace} onBlur={() => setConfirming(c => (c === 'replace' ? null : c))}
                      title="Pone esta consulta en el editor activo, en lugar de lo que tiene"
                      className={confirming === 'replace'
                        ? 'h-10 px-4 rounded-xl glass-soft row-hit text-amber-300 text-sm font-medium transition'
                        : secondary}>
                      {confirming === 'replace' ? 'Se perderá el texto actual: pulsa otra vez' : 'Reemplazar editor actual'}
                    </button>
                  )}
                  <button type="button" onClick={() => onLoad(selected)} disabled={!canLoad}
                    title={canLoad ? undefined : 'No caben más editores: cierra uno o reemplaza el actual'}
                    className={primary} style={{ color: 'var(--on-brand)' }}>
                    {activeEmpty ? 'Cargar' : 'Cargar en un editor nuevo'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
