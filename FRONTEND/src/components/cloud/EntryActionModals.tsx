import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '@components/common/Modal';
import { MenuIcon } from '@components/common/ContextMenu';
import { CloudIcon, FileGlyph, FolderGlyph } from '@components/cloud/icons';
import { CLOUD_SECTIONS, containsEntry, entryNameError, folderSummary, resolvePath } from '@utils/cloud';
import type { CloudEntry, CloudFolder, CloudSection } from '@typings/cloud.types';

/* Modales de las acciones de carpetas y archivos del menú contextual de
   Cloud: cambiar nombre, eliminar y mover. Se montan solo mientras están
   abiertos, así cada apertura parte del elemento elegido. */

const EntryIcon = ({ entry }: { entry: CloudEntry }) =>
  (entry.kind === 'folder' ? <FolderGlyph className="w-5 h-4 shrink-0" /> : <FileGlyph type={entry.type} size="sm" />);

const Actions = ({ onCancel, submitLabel, disabled, danger = false }: {
  onCancel: () => void; submitLabel: string; disabled?: boolean; danger?: boolean;
}) => (
  <div className="flex justify-end gap-2 pt-3 border-t border-line">
    <button type="button" onClick={onCancel}
      className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
      Cancelar
    </button>
    <button type="submit" disabled={disabled}
      className={danger
        ? 'h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold transition disabled:opacity-50'
        : 'grad-brand text-sm font-semibold px-4 h-10 rounded-xl elev-brand hover:elev-brand-hi transition disabled:opacity-50'}>
      {submitLabel}
    </button>
  </div>
);

/* ── Cambiar nombre ── */
export const RenameEntryModal = ({ entry, siblings, onRename, onClose }: {
  entry: CloudEntry;
  /** Contenido de la carpeta donde está, para no repetir nombre. */
  siblings: CloudEntry[];
  onRename: (name: string) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState(entry.name);
  const error = entryNameError(name, siblings, entry.kind, entry.id);
  const unchanged = name.trim() === entry.name;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (unchanged) { onClose(); return; }
    if (!error) onRename(name.trim());
  };

  return (
    <Modal isOpen onClose={onClose} title={entry.kind === 'folder' ? 'Cambiar nombre de la carpeta' : 'Cambiar nombre del archivo'} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className={`glass-input rounded-xl h-11 flex items-center gap-2.5 px-3.5 transition ${error ? 'ring-1 ring-rose-400/40' : ''}`}>
            <EntryIcon entry={entry} />
            <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120} spellCheck={false} autoComplete="off"
              aria-label="Nombre nuevo" aria-invalid={Boolean(error)}
              /* En un archivo se selecciona solo el nombre, sin la extensión. */
              onFocus={e => {
                const dot = entry.kind === 'file' ? entry.name.lastIndexOf('.') : -1;
                e.currentTarget.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
              }}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white" />
          </div>
          <p className={`text-xs mt-1.5 ${error ? 'text-rose-300' : 'text-white/40'}`}>
            {error ?? (entry.kind === 'file' ? 'Si cambias la extensión, el archivo cambia de tipo.' : 'Las carpetas fijadas conservan su lugar en el menú.')}
          </p>
        </div>
        <Actions onCancel={onClose} submitLabel="Cambiar nombre" disabled={Boolean(error) && !unchanged} />
      </form>
    </Modal>
  );
};

/** Elementos dentro de una carpeta, contando subcarpetas. */
const deepCount = (folder: CloudFolder): number =>
  folder.children.reduce((n, e) => n + 1 + (e.kind === 'folder' ? deepCount(e) : 0), 0);

/* ── Eliminar ── */
export const DeleteEntryModal = ({ entry, onDelete, onClose }: {
  entry: CloudEntry;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const inside = entry.kind === 'folder' ? deepCount(entry) : 0;
  return (
    <Modal isOpen onClose={onClose} title={entry.kind === 'folder' ? 'Eliminar carpeta' : 'Eliminar archivo'} size="sm">
      <form onSubmit={e => { e.preventDefault(); onDelete(); }} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20 flex items-center justify-center shrink-0">
            <MenuIcon name="trash" className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-white">
              ¿Eliminar <span className="font-semibold break-words">«{entry.name}»</span>?
            </p>
            <p className="text-xs text-white/55 mt-1">
              {entry.kind === 'folder' && inside > 0
                ? `Se eliminará también todo su contenido (${inside} ${inside === 1 ? 'elemento' : 'elementos'}). `
                : ''}
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <Actions onCancel={onClose} submitLabel="Eliminar" danger />
      </form>
    </Modal>
  );
};

/* ── Mover: árbol de carpetas de todas las secciones para elegir destino ── */
interface Destination { section: CloudSection; path: string[] }

const PickerNode = ({ folder, section, path, depth, entry, selected, expanded, onSelect, onToggle }: {
  folder: CloudFolder; section: CloudSection; path: string[]; depth: number; entry: CloudEntry;
  selected: Destination | null; expanded: Set<string>;
  onSelect: (d: Destination) => void; onToggle: (id: string) => void;
}) => {
  /* Una carpeta no puede ir dentro de sí misma ni de sus subcarpetas. */
  const blocked = entry.kind === 'folder' && containsEntry(entry, folder.id);
  const subfolders = folder.children.filter((e): e is CloudFolder => e.kind === 'folder');
  const open = expanded.has(folder.id) && !blocked;
  const isSelected = selected?.section === section && selected.path.join('/') === path.join('/');
  const root = depth === 0;
  const icon = CLOUD_SECTIONS.find(s => s.id === section)?.icon ?? 'home';

  return (
    <li>
      <div className={`flex items-center gap-1 h-8 pr-2 rounded-lg text-sm transition-colors
        ${blocked ? 'opacity-40' : isSelected ? 'bg-tint-active text-white' : 'text-white/70 hover:text-white hover:bg-tint-hover'}`}
        style={{ paddingLeft: 4 + depth * 16 }}>
        <button type="button" onClick={() => onToggle(folder.id)} tabIndex={subfolders.length && !blocked ? 0 : -1}
          aria-label={open ? `Contraer ${folder.name}` : `Expandir ${folder.name}`}
          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-white/40 hover:text-white ${subfolders.length && !blocked ? '' : 'invisible'}`}>
          <CloudIcon name="chevron" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <button type="button" disabled={blocked} onClick={() => onSelect({ section, path })} aria-pressed={isSelected}
          className="flex-1 min-w-0 h-full flex items-center gap-2 text-left disabled:cursor-not-allowed">
          {root ? <CloudIcon name={icon} className="w-4 h-4 text-violet-300 shrink-0" /> : <FolderGlyph className="w-4 h-3.5 shrink-0" />}
          <span className={`truncate ${root ? 'font-semibold' : ''}`}>{folder.name}</span>
          {isSelected && <CloudIcon name="check" className="w-3.5 h-3.5 ml-auto text-violet-300 shrink-0" />}
        </button>
      </div>
      {open && subfolders.length > 0 && (
        <ul className="space-y-0.5 mt-0.5">
          {subfolders.map(sub => (
            <PickerNode key={sub.id} folder={sub} section={section} path={[...path, sub.id]} depth={depth + 1}
              entry={entry} selected={selected} expanded={expanded} onSelect={onSelect} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const MoveEntryModal = ({ entry, from, roots, onMove, onClose }: {
  entry: CloudEntry;
  /** Dónde está ahora (sección y ruta de su carpeta). */
  from: Destination;
  roots: Record<CloudSection, CloudFolder>;
  onMove: (to: Destination) => void;
  onClose: () => void;
}) => {
  const [selected, setSelected] = useState<Destination | null>(null);
  /* Abiertas de inicio: las raíces y el camino hasta la carpeta actual. */
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set([...CLOUD_SECTIONS.map(s => roots[s.id].id), ...from.path]));
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const target = selected ? resolvePath(roots[selected.section], selected.path).at(-1) : undefined;
  const same = selected?.section === from.section && selected.path.join('/') === from.path.join('/');
  const conflict = target && !same ? entryNameError(entry.name, target.children, entry.kind) : null;
  const message = !selected ? 'Elige la carpeta de destino.'
    : same ? `«${entry.name}» ya está en esta carpeta.`
      : conflict ? conflict.replace('aquí', `en «${target?.name}»`)
        : `Se moverá a «${target?.name}».`;

  return (
    <Modal isOpen onClose={onClose} title={`Mover «${entry.name}»`} size="md">
      <form onSubmit={e => { e.preventDefault(); if (selected && !same && !conflict) onMove(selected); }} className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <EntryIcon entry={entry} />
          <span className="truncate">{entry.kind === 'folder' ? folderSummary(entry) : entry.name}</span>
        </div>
        <ul aria-label="Carpeta de destino"
          className="max-h-80 overflow-y-auto scroll-thin scroll-layer rounded-xl bg-tint-sunken border border-line p-2 space-y-0.5">
          {CLOUD_SECTIONS.map(({ id }) => (
            <PickerNode key={id} folder={roots[id]} section={id} path={[]} depth={0} entry={entry}
              selected={selected} expanded={expanded} onSelect={setSelected} onToggle={toggle} />
          ))}
        </ul>
        <p className={`text-xs ${conflict ? 'text-rose-300' : 'text-white/45'}`}>{message}</p>
        <Actions onCancel={onClose} submitLabel="Mover aquí" disabled={!selected || same || Boolean(conflict)} />
      </form>
    </Modal>
  );
};
