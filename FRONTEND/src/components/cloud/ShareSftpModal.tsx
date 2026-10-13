import { lazy, Suspense, useMemo, useState } from 'react';
import { Modal } from '@components/common/Modal';
import { TagBadge } from '@components/common/TagBadge';
import { useServers } from '@hooks/useServers';
import { cloudApi } from '@services/cloud.api';
import { describeEntries, formatBytes } from '@utils/cloud';
import { osLabel } from '@utils/servers';
import type { PickedFile } from '@lib/filePicker';
import type { CloudEntry, CloudSection } from '@typings/cloud.types';
import type { Server } from '@services/server.service';

const SftpModal = lazy(() => import('@components/servers/sftp/SftpModal').then(m => ({ default: m.SftpModal })));

/* Todos los archivos de la entrada con su ruta relativa (`carpeta/sub/a.txt`).
   El contenido se pide a la nube al subir cada uno, no antes. */
function cloudFiles(section: CloudSection, entry: CloudEntry, prefix = ''): PickedFile[] {
  const rel = `${prefix}${entry.name}`;
  if (entry.kind === 'file') {
    return [{ relPath: rel, name: entry.name, size: entry.size, blob: () => cloudApi.content(section, entry.id) }];
  }
  return entry.children.flatMap(child => cloudFiles(section, child, `${rel}/`));
}

const STATUS_DOT: Record<Server['status'], string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  checking: 'bg-sky-400 animate-pulse',
  pending: 'bg-white/30',
  maintenance: 'bg-amber-400',
  offline: 'bg-rose-400',
  error: 'bg-rose-400',
};

const STATUS_TEXT: Record<Server['status'], string> = {
  online: 'En línea', warning: 'Con avisos', checking: 'Comprobando', pending: 'Pendiente',
  maintenance: 'Mantenimiento', offline: 'Sin conexión', error: 'Con errores',
};

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const SearchIcon = () => <svg {...sp} className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
const ChevronIcon = () => <svg {...sp} className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>;

/**
 * Compartir por SFTP: se elige uno de los servidores registrados y se abre su
 * explorador SFTP para elegir la carpeta de destino. Los archivos van de la
 * nube al servidor a través de la app, con la cola de subida de SFTP
 * (progreso, conflictos y reintentos). Las carpetas mantienen su estructura.
 */
export const ShareSftpModal = ({ entries, section, onClose }: { entries: CloudEntry[]; section: CloudSection; onClose: () => void }) => {
  const { data: servers = [], isLoading } = useServers();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Server | null>(null);

  const files = useMemo(() => entries.flatMap(e => cloudFiles(section, e)), [section, entries]);
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  const single = entries.length === 1 ? entries[0] : null;
  const label = single ? `«${single.name}»` : describeEntries(entries);
  const summary = single?.kind === 'file'
    ? formatBytes(single.size)
    : `${files.length} ${files.length === 1 ? 'archivo' : 'archivos'} · ${formatBytes(bytes)}`;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...servers]
      .filter(s => !q || `${s.name} ${s.host} ${s.username}`.toLowerCase().includes(q))
      /* Primero los que están en línea. */
      .sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || a.name.localeCompare(b.name));
  }, [servers, query]);

  if (target) {
    return (
      <Suspense fallback={null}>
        <SftpModal serverId={target.id} serverName={target.name} isOpen onClose={onClose}
          incoming={{ label, summary, files }} />
      </Suspense>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Compartir por SFTP" size="md">
      <div className="space-y-4">
        <p className="text-sm text-white/65 leading-relaxed">
          Elige el servidor al que enviar <span className="font-medium text-white">{label}</span>
          <span className="text-white/45"> ({summary})</span>. Después eliges la carpeta de destino.
        </p>

        {files.length === 0 && (
          <div className="glass-soft rounded-xl p-3 text-xs text-amber-300 border border-amber-400/20">
            {single ? 'La carpeta está vacía' : 'Las carpetas elegidas están vacías'}: no hay archivos que enviar.
          </div>
        )}

        <div className="glass-input rounded-xl h-11 flex items-center gap-2 px-3.5">
          <span className="text-white/40"><SearchIcon /></span>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar servidor por nombre o host"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90" />
        </div>

        <div className="max-h-[50vh] overflow-y-auto scroll-thin space-y-1.5 -mx-1 px-1">
          {isLoading && <p className="text-sm text-white/45 py-6 text-center">Cargando servidores…</p>}
          {!isLoading && visible.length === 0 && (
            <p className="text-sm text-white/45 py-6 text-center">{servers.length ? 'Ningún servidor coincide con la búsqueda.' : 'No hay servidores registrados.'}</p>
          )}
          {visible.map(s => (
            <button key={s.id} type="button" disabled={files.length === 0} onClick={() => setTarget(s)}
              className="w-full text-left glass-soft row-hit rounded-xl px-3.5 py-3 flex items-center gap-3 disabled:opacity-50">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s.status]}`} title={STATUS_TEXT[s.status]} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white/90 truncate">{s.name}</span>
                  <TagBadge tag={s.tag} />
                </span>
                <span className="block text-xs text-white/45 font-mono truncate">{s.username}@{s.host}{s.port !== 22 ? `:${s.port}` : ''} · {osLabel(s.os)}</span>
              </span>
              <span className="text-white/35"><ChevronIcon /></span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
