import type { ReactNode } from 'react';
import { Modal } from '@components/common/Modal';
import { CloudIcon, FileGlyph, FolderGlyph } from '@components/cloud/icons';
import { CLOUD_FILE_TYPE_LABELS, CLOUD_SECTIONS, formatBytes, formatModified, isPreviewable } from '@utils/cloud';
import type { CloudEntry, CloudFileType, CloudFolder, CloudSection } from '@typings/cloud.types';

/** Totales de una carpeta contando todo lo que tiene dentro. */
function folderStats(folder: CloudFolder) {
  const stats = { bytes: 0, files: 0, folders: 0, byType: new Map<CloudFileType, number>(), lastModified: folder.modifiedAt };
  const walk = (f: CloudFolder) => {
    for (const e of f.children) {
      if (e.modifiedAt > stats.lastModified) stats.lastModified = e.modifiedAt;
      if (e.kind === 'folder') {
        stats.folders++;
        walk(e);
      } else {
        stats.files++;
        stats.bytes += e.size;
        stats.byType.set(e.type, (stats.byType.get(e.type) ?? 0) + 1);
      }
    }
  };
  walk(folder);
  return stats;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es')} ${n === 1 ? one : many}`;

/** Fecha completa y, al lado, cuánto hace. */
const DateValue = ({ iso }: { iso: string }) => {
  if (!iso) return <>—</>;
  const full = new Date(iso).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });
  return <>{full} <span className="text-white/40">· {formatModified(iso)}</span></>;
};

const Row = ({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) => (
  <>
    <dt className="text-white/45">{label}</dt>
    <dd className={`min-w-0 break-words text-white/85 ${mono ? 'font-mono text-xs leading-5' : ''}`}>{children}</dd>
  </>
);

/* ── Detalles de una carpeta o un archivo ────────────────────────────
   Icono grande del tipo, nombre y los datos que da la nube: tamaño,
   contenido, fechas y dónde está (en la sección y en el disco). */
export const EntryDetailsModal = ({ entry, section, location, serverRoot, pinned, onClose }: {
  entry: CloudEntry;
  section: CloudSection;
  /** Carpetas desde la raíz de la sección hasta la que lo contiene. */
  location: string[];
  /** Ruta de la sección en el servidor, si ya se conoce. */
  serverRoot?: string;
  /** Si es una carpeta fijada en el menú. */
  pinned: boolean;
  onClose: () => void;
}) => {
  const sectionLabel = CLOUD_SECTIONS.find(s => s.id === section)?.label ?? section;
  const inCloud = [...location, entry.name].join(' / ');
  const onDisk = serverRoot ? `${serverRoot.replace(/\/$/, '')}/${entry.id}` : null;
  const folder = entry.kind === 'folder' ? folderStats(entry) : null;
  const ext = entry.kind === 'file' && entry.name.includes('.') ? entry.name.split('.').pop()?.toUpperCase() : undefined;

  return (
    <Modal isOpen onClose={onClose} title="Detalles" size="sm">
      <div className="flex flex-col items-center text-center gap-3 pb-5 mb-5 border-b border-line">
        <span className="h-24 flex items-center justify-center">
          {entry.kind === 'folder' ? <FolderGlyph className="w-24 h-20" /> : <FileGlyph type={entry.type} size="xl" />}
        </span>
        <div className="min-w-0 max-w-full">
          <p className="text-base font-semibold text-white break-words">{entry.name}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {entry.kind === 'folder' ? 'Carpeta' : CLOUD_FILE_TYPE_LABELS[entry.type]}
            {ext && <span className="ml-1.5 font-mono px-1.5 py-0.5 rounded-md bg-tint-active text-white/55">.{ext.toLowerCase()}</span>}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {folder ? (
          <>
            <Row label="Tamaño">
              {formatBytes(folder.bytes)} <span className="text-white/40">({folder.bytes.toLocaleString('es')} bytes)</span>
            </Row>
            <Row label="Contenido">
              {folder.files + folder.folders === 0
                ? 'Vacía'
                : `${plural(folder.files, 'archivo', 'archivos')} y ${plural(folder.folders, 'carpeta', 'carpetas')}`}
              {entry.kind === 'folder' && entry.children.length > 0 && (
                <span className="text-white/40"> · {plural(entry.children.length, 'elemento', 'elementos')} directos</span>
              )}
            </Row>
            {folder.byType.size > 0 && (
              <Row label="Tipos">
                <span className="flex flex-wrap gap-1.5">
                  {[...folder.byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                    <span key={type} className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md bg-tint-active text-white/70">
                      <FileGlyph type={type} size="sm" />
                      {CLOUD_FILE_TYPE_LABELS[type]} · {n}
                    </span>
                  ))}
                </span>
              </Row>
            )}
          </>
        ) : entry.kind === 'file' && (
          <>
            <Row label="Tamaño">
              {formatBytes(entry.size)} <span className="text-white/40">({entry.size.toLocaleString('es')} bytes)</span>
            </Row>
            <Row label="Vista previa">{isPreviewable(entry.type) ? 'Se abre en el lector de Cloud' : 'Sin vista previa: se descarga'}</Row>
          </>
        )}

        <Row label="Cargado"><DateValue iso={entry.createdAt} /></Row>
        <Row label="Modificado"><DateValue iso={entry.modifiedAt} /></Row>
        {folder && folder.lastModified !== entry.modifiedAt && (
          <Row label="Último cambio dentro"><DateValue iso={folder.lastModified} /></Row>
        )}

        <Row label="Ubicación">
          <span className="inline-flex items-center gap-1.5">
            <CloudIcon name={CLOUD_SECTIONS.find(s => s.id === section)?.icon ?? 'home'} className="w-3.5 h-3.5 text-violet-300 shrink-0" />
            {sectionLabel} / {inCloud}
          </span>
        </Row>
        {onDisk && <Row label="En el servidor" mono>{onDisk}</Row>}
        {entry.kind === 'folder' && <Row label="En el menú">{pinned ? 'Fijada' : 'No fijada'}</Row>}
      </dl>

      <div className="flex justify-end pt-4 mt-5 border-t border-line">
        <button type="button" onClick={onClose}
          className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
          Cerrar
        </button>
      </div>
    </Modal>
  );
};
