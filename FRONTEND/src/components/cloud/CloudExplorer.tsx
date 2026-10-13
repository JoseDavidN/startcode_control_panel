import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Card } from '@components/common/Card';
import { Select } from '@components/common/Select';
import { MenuIcon } from '@components/common/ContextMenu';
import { useContextMenu } from '@hooks/useContextMenu';
import { CloudToasts } from '@components/cloud/CloudToasts';
import { CreateFolderModal } from '@components/cloud/CreateFolderModal';
import { describeSkipped, filesFromDrop, pickDirectory, pickFiles, type PickedFile, type PickResult } from '@lib/filePicker';
import { CloudIcon, FileGlyph, FolderGlyph } from '@components/cloud/icons';
import type { CloudIconName } from '@components/cloud/icons';
import {
  CLOUD_DATE_FILTERS, CLOUD_FILE_TYPE_LABELS, CLOUD_GROUP_LABELS, CLOUD_MODIFIED_FILTERS, CLOUD_TYPE_FILTERS, DEFAULT_CLOUD_FILTERS,
  describeEntries, folderSummary, formatBytes, formatModified, groupEntries, isPreviewable, MAX_PINNED_FOLDERS, visibleEntries,
} from '@utils/cloud';
import type { CloudEntry, CloudFile, CloudFilters, CloudFolder, CloudGroup, CloudNotice, CloudView } from '@typings/cloud.types';

/* ── Migas de pan: la raíz de la sección y cada carpeta abierta; todas menos la última navegan. */
const Breadcrumbs = ({ trail, rootIcon, onNavigate }: {
  trail: CloudFolder[]; rootIcon: CloudIconName; onNavigate: (depth: number) => void;
}) => (
  <nav aria-label="Ruta" className="flex items-center gap-1 min-w-0 overflow-x-auto scroll-thin">
    {trail.map((folder, i) => {
      const last = i === trail.length - 1;
      return (
        <Fragment key={folder.id}>
          {i > 0 && <CloudIcon name="chevron" className="w-3.5 h-3.5 text-white/25 shrink-0" />}
          {last ? (
            <span aria-current="page" className="inline-flex items-center gap-1.5 h-8 px-2 text-sm font-semibold text-white truncate">
              {i === 0 && <CloudIcon name={rootIcon} className="w-4 h-4 text-violet-300 shrink-0" />}
              {folder.name}
            </span>
          ) : (
            <button type="button" onClick={() => onNavigate(i)}
              className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-sm text-white/55 hover:text-white hover:bg-tint-hover focus-ring shrink-0 transition-colors">
              {i === 0 && <CloudIcon name={rootIcon} className="w-4 h-4" />}
              {folder.name}
            </button>
          )}
        </Fragment>
      );
    })}
  </nav>
);

/* ── Filtro de la barra: etiqueta y select, resaltado si no está en su valor por defecto. */
function FilterSelect<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const active = value !== options[0][0];
  return (
    <label className={`glass-input rounded-xl h-9 flex items-center gap-2 pl-3 pr-2 transition ${active ? 'ring-1 ring-violet-400/40' : ''}`}>
      <span className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">{label}</span>
      <Select value={value} options={options.map(([v, text]) => ({ value: v, label: text }))} onChange={onChange}
        aria-label={label} className={active ? 'text-white' : 'text-white/75'} />
    </label>
  );
}

/* ── Selector de vista: mosaico o lista. */
const ViewToggle = ({ value, onChange }: { value: CloudView; onChange: (v: CloudView) => void }) => {
  const options: [CloudView, string, CloudIconName][] = [
    ['grid', 'Vista de mosaico', 'grid'],
    ['list', 'Vista de lista',   'list'],
  ];
  return (
    <div role="radiogroup" aria-label="Modo de vista" className="glass-soft rounded-xl h-9 flex items-center gap-1 p-1 shrink-0">
      {options.map(([mode, label, icon]) => {
        const active = value === mode;
        return (
          <button key={mode} type="button" role="radio" aria-checked={active} aria-label={label} title={label}
            onClick={() => onChange(mode)}
            className={`mo-tab w-8 h-7 rounded-lg flex items-center justify-center
              ${active ? 'mo-tab-on grad-brand text-white elev-brand-sm' : 'text-white/50 hover:text-white hover:bg-tint-hover'}`}>
            <CloudIcon name={icon} className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
};

/** Clic derecho sobre una carpeta o un archivo. */
type EntryMenu = (e: ReactMouseEvent, entry: CloudEntry) => void;

/** Modo selección: un clic marca o desmarca en lugar de abrir. */
interface Selection {
  ids: Set<string>;
  toggle: (entry: CloudEntry) => void;
}

/* Casilla de selección con el estilo `.chk` de la app; la decide el clic de la fila o la tarjeta. */
const SelectBox = ({ checked, label, className = '' }: { checked: boolean; label: string; className?: string }) => (
  <input type="checkbox" readOnly tabIndex={-1} checked={checked} aria-label={label} className={`chk pointer-events-none shrink-0 ${className}`} />
);

const entryMeta = (entry: CloudEntry) => (entry.kind === 'folder' ? folderSummary(entry) : formatBytes(entry.size));

/* ── Mosaico: carpetas como carpetas y archivos con el icono de su tipo. */
const GridView = ({ entries, selection, onOpen, onPreview, onMenu }: {
  entries: CloudEntry[]; selection: Selection | null; onOpen: (folder: CloudFolder) => void; onPreview: (file: CloudFile) => void; onMenu: EntryMenu;
}) => (
  /* Un bloque por tipo, en el mismo orden que la lista: el separador es el
     icono y el nombre del grupo, su número y una línea que se desvanece. */
  <div className="space-y-7">
    {groupEntries(entries).map(([group, items]) => (
      <section key={group} aria-label={CLOUD_GROUP_LABELS[group]}>
        <h3 className="flex items-center gap-2.5 mb-3 text-xs font-semibold text-white/70">
          {group === 'folder' ? <FolderGlyph className="w-4 h-3.5 shrink-0" /> : <FileGlyph type={group} size="sm" />}
          <span className="shrink-0">{CLOUD_GROUP_LABELS[group]}</span>
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-tint-active text-white/45 tabular-nums">{items.length}</span>
          {/* Se desvanece hacia la derecha: separa sin cortar la vista. */}
          <span aria-hidden className="flex-1 h-px ml-1 bg-gradient-to-r from-hairline-strong via-hairline to-transparent" />
        </h3>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {items.map(entry => {
            const content = (
              <>
                <span className="h-14 flex items-center justify-center">
                  {entry.kind === 'folder' ? <FolderGlyph /> : <FileGlyph type={entry.type} />}
                </span>
                <span className="w-full text-sm text-white/85 font-medium text-center leading-snug line-clamp-2 break-words" title={entry.name}>
                  {entry.name}
                </span>
                <span className="text-[11px] text-white/40">{entryMeta(entry)}</span>
              </>
            );
            const cls = 'w-full h-full glass-soft row-hit rounded-xl p-4 flex flex-col items-center gap-2 select-none';
            if (selection) {
              const on = selection.ids.has(entry.id);
              return (
                <li key={entry.id} onContextMenu={e => onMenu(e, entry)}>
                  <button type="button" onClick={() => selection.toggle(entry)} aria-pressed={on}
                    className={`${cls} relative focus-ring transition ${on ? 'grad-brand-soft border-hairline-strong elev-brand-sm' : ''}`}>
                    <SelectBox checked={on} label={`Seleccionar ${entry.name}`} className="absolute top-2.5 left-2.5" />
                    {content}
                  </button>
                </li>
              );
            }
            return (
              <li key={entry.id} onContextMenu={e => onMenu(e, entry)}>
                {entry.kind === 'folder' ? (
                  /* Doble clic (o Enter) abre la carpeta, como un archivo; un clic solo la enfoca. */
                  <button type="button" onDoubleClick={() => onOpen(entry)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onOpen(entry); } }}
                    className={`${cls} focus-ring`}>{content}</button>
                ) : (
                  <div className={`${cls} cursor-default`} onDoubleClick={() => onPreview(entry)}
                    title={`${entry.name} · ${CLOUD_FILE_TYPE_LABELS[entry.type]}`}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

/* ── Lista: nombre, tipo, tamaño y última modificación, separada en grupos
   colapsables (carpetas y luego un grupo por tipo de archivo). */
const LIST_COLS = 'grid grid-cols-[minmax(0,1fr)_minmax(0,180px)_96px_150px] gap-4 items-center';

const ListView = ({
  entries, selection, collapsed, onToggle, onOpen, onPreview, onMenu,
}: {
  entries: CloudEntry[]; selection: Selection | null; collapsed: Set<CloudGroup>;
  onToggle: (group: CloudGroup) => void; onOpen: (folder: CloudFolder) => void;
  onPreview: (file: CloudFile) => void; onMenu: EntryMenu;
}) => (
  <div role="table" aria-label="Contenido de la carpeta">
    <div role="row" className={`${LIST_COLS} px-3 h-9 text-[10px] font-semibold uppercase tracking-wider text-white/40 border-b border-line`}>
      <span role="columnheader">Nombre</span>
      <span role="columnheader">Tipo</span>
      <span role="columnheader" className="text-right">Tamaño</span>
      <span role="columnheader">Modificado</span>
    </div>
    {groupEntries(entries).map(([group, items]) => {
      const open = !collapsed.has(group);
      return (
        <div key={group} role="rowgroup" className="mt-2">
          <div role="row">
            <button type="button" role="cell" onClick={() => onToggle(group)} aria-expanded={open}
              className="w-full flex items-center gap-2 px-2 h-8 rounded-lg text-xs font-semibold text-white/60 hover:text-white hover:bg-tint-hover focus-ring transition-colors">
              <CloudIcon name="chevron" className={`w-3.5 h-3.5 text-white/40 transition-transform ${open ? 'rotate-90' : ''}`} />
              {group === 'folder' ? <FolderGlyph className="w-4 h-3.5 shrink-0" /> : <FileGlyph type={group} size="sm" />}
              <span>{CLOUD_GROUP_LABELS[group]}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-tint-active text-white/45 tabular-nums">{items.length}</span>
              <span className="flex-1 border-t border-line ml-1" />
            </button>
          </div>
          {/* Árbol: sangría bajo el chevron del grupo y guías de cada fila
             (la última corta la vertical a media altura). */}
          {open && (
            <div className="ml-[15px] pl-5 divide-y divide-line">
              {items.map((entry, i) => {
                const folder = entry.kind === 'folder';
                const last = i === items.length - 1;
                const on = selection?.ids.has(entry.id) ?? false;
                /* En modo selección un clic marca la fila (también carpetas); si no, las carpetas se abren con doble clic o Enter. */
                const activate = selection ? () => selection.toggle(entry) : folder ? () => onOpen(entry) : undefined;
                return (
                  <div key={entry.id} role="row" aria-selected={selection ? on : undefined}
                    onClick={selection ? activate : undefined}
                    onDoubleClick={selection ? undefined : folder ? () => onOpen(entry) : () => onPreview(entry)}
                    onContextMenu={e => onMenu(e, entry)}
                    onKeyDown={activate ? e => { if (e.key === 'Enter' || (selection && e.key === ' ')) { e.preventDefault(); activate(); } } : undefined}
                    tabIndex={activate ? 0 : undefined}
                    className={`${LIST_COLS} relative px-3 h-11 text-sm rounded-lg select-none transition-colors ${on ? 'bg-tint-active' : 'hover:bg-tint-hover'} ${activate ? 'cursor-pointer focus-ring-inset' : ''}`}>
                    <span aria-hidden className={`absolute -left-5 -top-px w-px bg-hairline ${last ? 'h-[calc(50%+1px)]' : '-bottom-px'}`} />
                    <span aria-hidden className="absolute -left-5 top-1/2 w-3.5 h-px bg-hairline" />
                    <span role="cell" className="flex items-center gap-3 min-w-0">
                      {selection && <SelectBox checked={on} label={`Seleccionar ${entry.name}`} />}
                      {folder ? <FolderGlyph className="w-5 h-4 shrink-0" /> : <FileGlyph type={entry.type} size="sm" />}
                      <span className="truncate text-white/85" title={entry.name}>{entry.name}</span>
                    </span>
                    <span role="cell" className="truncate text-white/50">{folder ? 'Carpeta' : CLOUD_FILE_TYPE_LABELS[entry.type]}</span>
                    <span role="cell" className="text-right font-mono tabular-nums text-xs text-white/50">{entryMeta(entry)}</span>
                    <span role="cell" className="text-white/50">{formatModified(entry.modifiedAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

/* ── Columna de contenido de StartCode Cloud ─────────────────────────
   Migas de pan, barra de filtros con el selector de vista y el contenido
   de la carpeta abierta, que desplaza por su cuenta. */
export const CloudExplorer = ({
  trail, rootIcon, filters, view, notices, onNavigate, onOpen, onFiltersChange, onViewChange, onDownload, onPreview, onDropFiles, onDismissNotice, pinnedIds, onTogglePin, onCreateFolder, onMove, onRename, onDelete, onDetails, onShareSftp, batchDone, onPickError, onSkipped,
}: {
  /** Carpetas desde la raíz de la sección hasta la abierta. */
  trail: CloudFolder[];
  /** Icono de la sección, al inicio de las migas. */
  rootIcon: CloudIconName;
  filters: CloudFilters;
  view: CloudView;
  onNavigate: (depth: number) => void;
  onOpen: (folder: CloudFolder) => void;
  onFiltersChange: (filters: CloudFilters) => void;
  onViewChange: (view: CloudView) => void;
  /** Avisos que se muestran abajo, dentro de esta columna. */
  notices: CloudNotice[];
  onDownload: (entry: CloudEntry) => void;
  /** Doble clic en un archivo. */
  onPreview: (file: CloudFile) => void;
  /** Archivos soltados sobre la columna o elegidos con Cargar, para la carpeta abierta. */
  onDropFiles: (files: PickedFile[]) => void;
  onDismissNotice: (id: string) => void;
  /** Carpetas fijadas en la columna de navegación. */
  pinnedIds: string[];
  onTogglePin: (folder: CloudFolder) => void;
  /** Crea una carpeta vacía con ese nombre (ya validado) en la abierta. */
  onCreateFolder: (name: string) => void;
  /** Acciones sobre elementos de la carpeta abierta (menú contextual o selección múltiple). */
  onMove: (entries: CloudEntry[]) => void;
  onRename: (entry: CloudEntry) => void;
  onDelete: (entries: CloudEntry[]) => void;
  onDetails: (entry: CloudEntry) => void;
  /** Enviar archivos o carpetas a un servidor registrado por SFTP. */
  onShareSftp: (entries: CloudEntry[]) => void;
  /** Cambia al terminar un mover o eliminar en lote: la selección se vacía. */
  batchDone: number;
  /** El explorador del sistema no se pudo abrir o no dejó leer lo elegido. */
  onPickError: () => void;
  /** Se dejaron fuera carpetas de paquetes (`node_modules`, `venv`…); el texto ya explica cuáles. */
  onSkipped: (message: string) => void;
}) => {
  const current = trail[trail.length - 1];
  const entries = useMemo(() => visibleEntries(current.children, filters), [current, filters]);
  const searching = filters.query.trim() !== '';
  const filtered = searching || filters.type !== 'all' || filters.date !== 'any' || filters.modified !== 'any';
  const [creating, setCreating] = useState(false);

  /* ── Selección múltiple: solo dentro de la carpeta abierta y de lo visible. ── */
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedEntries = useMemo(() => entries.filter(e => selectedIds.has(e.id)), [entries, selectedIds]);
  const exitSelection = () => { setSelecting(false); setSelectedIds(new Set()); };
  /* Otra carpeta o una acción en lote terminada: se sale del modo selección. */
  useEffect(() => { setSelecting(false); setSelectedIds(new Set()); }, [current.id, batchDone]);
  const toggleSelected = (entry: CloudEntry) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
    return next;
  });
  const allSelected = entries.length > 0 && selectedEntries.length === entries.length;
  const selectAll = () => setSelectedIds(allSelected ? new Set() : new Set(entries.map(e => e.id)));
  const selection: Selection | null = selecting ? { ids: selectedIds, toggle: toggleSelected } : null;
  const selectedBytes = selectedEntries.reduce((sum, e) => sum + (e.kind === 'file' ? e.size : 0), 0);

  /* Ctrl + A marca todo lo visible mientras se selecciona (fuera de los campos de texto). */
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSelectedIds(new Set(entries.map(x => x.id)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, entries]);
  /* Grupos plegados de la lista; vacío = todos desplegados. Se conserva al
     cambiar de carpeta o de vista. */
  const [collapsed, setCollapsed] = useState<Set<CloudGroup>>(() => new Set());
  /* Abrir, solo en los archivos que el lector sabe mostrar; fijar, en las
     carpetas (con el tope lleno la opción se ve, desactivada); Descargar,
     Compartir por SFTP, Detalles y luego Mover, Cambiar nombre y Eliminar, en todo. */
  const { openContextMenu } = useContextMenu();
  const entryMenu: EntryMenu = (e, entry) => {
    /* Sobre un elemento marcado de una selección de varios: las acciones en lote. */
    if (selecting && selectedIds.has(entry.id) && selectedEntries.length > 1) {
      const n = selectedEntries.length;
      openContextMenu(e, [
        { id: 'sftp', label: `Compartir ${n} por SFTP`, icon: <MenuIcon name="send" />, onSelect: () => onShareSftp(selectedEntries) },
        { id: 'move', label: `Mover ${n}`, icon: <MenuIcon name="move" />, onSelect: () => onMove(selectedEntries) },
        { id: 'delete', label: `Eliminar ${n}`, icon: <MenuIcon name="trash" />, separator: true, danger: true, onSelect: () => onDelete(selectedEntries) },
      ]);
      return;
    }
    const pinned = entry.kind === 'folder' && pinnedIds.includes(entry.id);
    const full = pinnedIds.length >= MAX_PINNED_FOLDERS;
    const marked = selectedIds.has(entry.id);
    openContextMenu(e, [
      /* Seleccionar entra en el modo selección con este elemento ya marcado. */
      selecting
        ? { id: 'select', label: marked ? 'Desmarcar' : 'Marcar', icon: <MenuIcon name={marked ? 'unselect' : 'select'} />, onSelect: () => toggleSelected(entry) }
        : { id: 'select', label: 'Seleccionar', icon: <MenuIcon name="select" />, onSelect: () => { setSelecting(true); setSelectedIds(new Set([entry.id])); } },
      ...(entry.kind === 'file' && isPreviewable(entry.type) ? [{
        separator: true,
        id: 'open', label: 'Abrir', icon: <MenuIcon name="open" />, onSelect: () => onPreview(entry),
      }] : []),
      ...(entry.kind === 'folder' ? [{
        id: 'pin',
        label: pinned ? 'Quitar del menú' : full ? `Fijar en el menú (máximo ${MAX_PINNED_FOLDERS})` : 'Fijar en el menú',
        icon: <MenuIcon name={pinned ? 'unpin' : 'pin'} />,
        disabled: !pinned && full,
        onSelect: () => onTogglePin(entry),
      }] : []),
      { id: 'download', label: 'Descargar', icon: <MenuIcon name="download" />, onSelect: () => onDownload(entry) },
      { id: 'sftp', label: 'Compartir por SFTP', icon: <MenuIcon name="send" />, onSelect: () => onShareSftp([entry]) },
      { id: 'details', label: 'Detalles', icon: <MenuIcon name="info" />, onSelect: () => onDetails(entry) },
      { id: 'move', label: 'Mover', icon: <MenuIcon name="move" />, separator: true, onSelect: () => onMove([entry]) },
      { id: 'rename', label: 'Cambiar nombre', icon: <MenuIcon name="rename" />, onSelect: () => onRename(entry) },
      { id: 'delete', label: 'Eliminar', icon: <MenuIcon name="trash" />, separator: true, danger: true, onSelect: () => onDelete([entry]) },
    ]);
  };

  /* Clic derecho en cualquier parte de la columna que no sea un elemento
     (los elementos abren su propio menú y marcan el evento como atendido). */
  const areaMenu = (e: ReactMouseEvent) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    openContextMenu(e, [
      ...(selecting ? [
        allSelected
          ? { id: 'none', label: 'Quitar la selección', icon: <MenuIcon name="unselect" />, disabled: selectedEntries.length === 0, onSelect: () => setSelectedIds(new Set()) }
          : { id: 'all', label: 'Seleccionar todo', shortcut: 'Ctrl+A', icon: <MenuIcon name="select" />, disabled: entries.length === 0, onSelect: () => setSelectedIds(new Set(entries.map(x => x.id))) },
        { id: 'exit', label: 'Salir de la selección', icon: <MenuIcon name="unselect" />, onSelect: exitSelection },
      ] : [
        { id: 'select', label: 'Seleccionar', icon: <MenuIcon name="select" />, disabled: entries.length === 0, onSelect: () => setSelecting(true) },
        { id: 'all', label: 'Seleccionar todo', shortcut: 'Ctrl+A', icon: <MenuIcon name="select" />, disabled: entries.length === 0,
          onSelect: () => { setSelecting(true); setSelectedIds(new Set(entries.map(x => x.id))); } },
      ]),
      { id: 'folder', label: 'Nueva carpeta', icon: <MenuIcon name="newFolder" />, separator: true, onSelect: () => setCreating(true) },
      { id: 'files', label: 'Cargar archivos', icon: <MenuIcon name="upload" />, disabled: picking, onSelect: () => pick('files') },
      { id: 'dir', label: 'Cargar carpeta', icon: <MenuIcon name="upload" />, disabled: picking, onSelect: () => pick('directory') },
    ]);
  };

  /* ── Soltar para cargar ──
     Solo reacciona a archivos del sistema (no a texto arrastrado dentro de
     la app). El contador evita el parpadeo de dragenter/dragleave en los
     hijos. El `DataTransfer` se vacía al terminar el manejador: en el drop
     no puede haber un await antes de `filesFromDrop`. */
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  /* Cargar eligiendo en el explorador del sistema. */
  const [picking, setPicking] = useState(false);
  /* Lo elegido o soltado se carga; las carpetas de paquetes omitidas se avisan. */
  const accept = ({ files, skipped }: PickResult) => {
    const note = describeSkipped(skipped);
    if (note) onSkipped(note);
    if (files.length > 0) onDropFiles(files);
  };
  const pick = (kind: 'files' | 'directory') => {
    setPicking(true);
    void (kind === 'files' ? pickFiles() : pickDirectory())
      .then(accept)
      .catch(() => onPickError())
      .finally(() => setPicking(false));
  };
  const hasFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const drag = {
    onDragEnter: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) { depth.current = 0; setDragging(false); }
    },
    onDrop: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void filesFromDrop(e).then(accept);
    },
  };
  const toggleGroup = (group: CloudGroup) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  return (
    <Card className="min-h-0 flex flex-col overflow-hidden">
      <div {...drag} onContextMenu={areaMenu} className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-3 h-12 border-b border-line shrink-0">
        <Breadcrumbs trail={trail} rootIcon={rootIcon} onNavigate={onNavigate} />
        {/* Cargar con el explorador del sistema (diálogo nativo en la app de escritorio). */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => pick('files')} disabled={picking}
            title={`Elegir archivos para cargar en «${current.name}»`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium disabled:opacity-50">
            <CloudIcon name="upload" className="w-3.5 h-3.5" />
            Cargar archivos
          </button>
          <button type="button" onClick={() => pick('directory')} disabled={picking}
            title={`Elegir una carpeta para cargar en «${current.name}»`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium disabled:opacity-50">
            <CloudIcon name="folderPlus" className="w-3.5 h-3.5" />
            Cargar carpeta
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-line shrink-0 flex-wrap">
        <CloudIcon name="filter" className="w-4 h-4 text-white/35 shrink-0" />
        <FilterSelect label="Tipo" value={filters.type} options={CLOUD_TYPE_FILTERS}
          onChange={type => onFiltersChange({ ...filters, type })} />
        <FilterSelect label="Fecha" value={filters.date} options={CLOUD_DATE_FILTERS}
          onChange={date => onFiltersChange({ ...filters, date })} />
        <FilterSelect label="Modificado" value={filters.modified} options={CLOUD_MODIFIED_FILTERS}
          onChange={modified => onFiltersChange({ ...filters, modified })} />
        {filtered && (
          <button type="button" onClick={() => onFiltersChange(DEFAULT_CLOUD_FILTERS)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs text-white/55 hover:text-white hover:bg-tint-hover transition">
            <CloudIcon name="close" className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
        <span className="flex-1" />
        {/* Busca en la carpeta abierta; Escape lo vacía. */}
        <div className="glass-input rounded-xl h-9 w-56 flex items-center gap-2 px-3 transition">
          <CloudIcon name="search" className="w-4 h-4 text-white/40 shrink-0" />
          <input type="search" value={filters.query} placeholder={`Buscar en ${current.name}`} aria-label={`Buscar en ${current.name}`}
            onChange={e => onFiltersChange({ ...filters, query: e.target.value })}
            onKeyDown={e => { if (e.key === 'Escape' && filters.query) { e.stopPropagation(); onFiltersChange({ ...filters, query: '' }); } }}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-white/30 text-white [&::-webkit-search-cancel-button]:hidden" />
          {searching && (
            <button type="button" onClick={() => onFiltersChange({ ...filters, query: '' })} aria-label="Vaciar búsqueda"
              className="w-5 h-5 rounded-md text-white/40 hover:text-white flex items-center justify-center shrink-0">
              <CloudIcon name="close" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-sm font-semibold elev-brand-sm hover:elev-brand transition shrink-0">
          <CloudIcon name="folderPlus" className="w-4 h-4" />
          Nueva carpeta
        </button>
        <ViewToggle value={view} onChange={onViewChange} />
      </div>

      {selecting && (
        <div className="flex items-center gap-2 px-4 h-12 border-b border-line shrink-0 grad-brand-soft animate-fadeIn">
          <label className="inline-flex items-center gap-2.5 h-8 px-2 rounded-lg hover:bg-tint-hover cursor-pointer">
            <input type="checkbox" className="chk" checked={allSelected} onChange={selectAll} aria-label="Seleccionar todo" />
            <span className="text-xs text-white/70">Todo</span>
          </label>
          <span className="text-sm text-white/85 min-w-0 truncate">
            {selectedEntries.length === 0
              ? <span className="text-white/50">Marca carpetas o archivos</span>
              : <><span className="font-semibold">{selectedEntries.length} {selectedEntries.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
                <span className="text-white/45"> · {describeEntries(selectedEntries)}{selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ''}</span></>}
          </span>
          <span className="flex-1" />
          <button type="button" disabled={selectedEntries.length === 0} onClick={() => onShareSftp(selectedEntries)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/80 hover:text-white text-xs font-medium disabled:opacity-40 shrink-0">
            <MenuIcon name="send" className="w-3.5 h-3.5" /> Compartir por SFTP
          </button>
          <button type="button" disabled={selectedEntries.length === 0} onClick={() => onMove(selectedEntries)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/80 hover:text-white text-xs font-medium disabled:opacity-40 shrink-0">
            <MenuIcon name="move" className="w-3.5 h-3.5" /> Mover
          </button>
          <button type="button" disabled={selectedEntries.length === 0} onClick={() => onDelete(selectedEntries)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium disabled:opacity-40 shrink-0">
            <MenuIcon name="trash" className="w-3.5 h-3.5" /> Eliminar
          </button>
          <button type="button" onClick={exitSelection} aria-label="Salir de la selección" title="Salir de la selección"
            className="w-8 h-8 rounded-lg text-white/55 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0">
            <CloudIcon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scroll-area scroll-layer p-4">
        {entries.length === 0 ? (
          <div className="h-full min-h-48 rounded-2xl edge-dashed flex flex-col items-center justify-center text-center gap-2 px-6">
            <CloudIcon name={filtered ? 'filter' : 'folder'} className="w-9 h-9 text-white/20" />
            <div className="text-sm font-medium text-white/60">
              {searching ? `Nada se llama «${filters.query.trim()}» aquí` : filtered ? 'Nada coincide con los filtros' : 'Esta carpeta está vacía'}
            </div>
            {filtered && <p className="text-xs text-white/35">{searching ? 'La búsqueda es solo en esta carpeta. ' : ''}Prueba con otro texto, tipo o periodo, o limpia los filtros.</p>}
          </div>
        ) : view === 'grid' ? (
          <GridView entries={entries} selection={selection} onOpen={onOpen} onPreview={onPreview} onMenu={entryMenu} />
        ) : (
          <ListView entries={entries} selection={selection} collapsed={collapsed} onToggle={toggleGroup} onOpen={onOpen} onPreview={onPreview} onMenu={entryMenu} />
        )}
      </div>

      {/* Zona de soltar: cubre toda la columna mientras se arrastran archivos. */}
      {dragging && (
        <div className="absolute inset-3 z-10 rounded-2xl border border-dashed border-violet-400/40 glass-float elev-float overflow-hidden
          flex flex-col items-center justify-center text-center gap-3 pointer-events-none animate-fadeIn">
          <span className="absolute inset-0 grad-brand-soft" />
          <span className="relative w-14 h-14 rounded-2xl grad-brand flex items-center justify-center elev-brand">
            <CloudIcon name="upload" className="w-6 h-6 text-white" />
          </span>
          <div className="relative">
            <p className="text-base font-semibold text-white">Suelta para cargar</p>
            <p className="text-sm text-white/55 mt-1">Carpetas o archivos en «{current.name}»</p>
          </div>
        </div>
      )}

      <CloudToasts notices={notices} onDismiss={onDismissNotice} />

      {creating && (
        <CreateFolderModal parent={current} onClose={() => setCreating(false)}
          onCreate={name => { onCreateFolder(name); setCreating(false); }} />
      )}
      </div>
    </Card>
  );
};
