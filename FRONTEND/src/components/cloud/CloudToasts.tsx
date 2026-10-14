import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { CloudIcon } from '@components/cloud/icons';
import { formatBytes } from '@utils/cloud';
import type { CloudNotice } from '@typings/cloud.types';

const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label="Cerrar aviso"
    className="w-6 h-6 rounded-md text-white/40 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 transition-colors">
    <CloudIcon name="close" className="w-3.5 h-3.5" />
  </button>
);

const NoticeCard = ({ notice, onDismiss }: { notice: CloudNotice; onDismiss: () => void }) => {
  const box = 'pointer-events-auto glass-float elev-float border border-hairline rounded-xl p-3 animate-slideUp';

  if (notice.kind === 'info') {
    return (
      <div role="status" className={`${box} flex items-start gap-3`}>
        <span className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20 flex items-center justify-center shrink-0">
          <CloudIcon name="info" className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-medium text-white truncate">{notice.title}</p>
          {notice.description && <p className="text-xs text-white/55 mt-0.5">{notice.description}</p>}
        </div>
        <CloseButton onClick={onDismiss} />
      </div>
    );
  }

  if (notice.kind === 'download') return <DownloadCard notice={notice} onDismiss={onDismiss} />;

  const done = notice.status === 'done';
  const pct = Math.round(notice.progress * 100);
  const files = `${notice.fileCount} ${notice.fileCount === 1 ? 'archivo' : 'archivos'}`;

  return (
    <div role="status" aria-live="polite" className={box}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg ring-1 flex items-center justify-center shrink-0 ${done
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
          : 'grad-brand-soft text-violet-200 ring-hairline'}`}>
          <CloudIcon name={done ? 'check' : 'upload'} className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-medium text-white truncate">
            {done ? 'Carga completada' : `Cargando «${notice.label}»`}
          </p>
          <p className="text-xs text-white/55 mt-0.5 truncate">
            {done
              ? `«${notice.label}» se cargó en ${notice.destination} · ${files} · ${formatBytes(notice.bytes)}`
              : `${files} · ${formatBytes(notice.bytes * notice.progress)} de ${formatBytes(notice.bytes)} · a ${notice.destination}`}
          </p>
        </div>
        {done
          ? <CloseButton onClick={onDismiss} />
          : <span className="text-xs font-mono font-semibold tabular-nums text-white pt-0.5 shrink-0">{pct}%</span>}
      </div>
      {!done && (
        <div className="mt-2.5 bg-track h-1.5 rounded-full overflow-hidden" role="progressbar"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))' }} />
        </div>
      )}
    </div>
  );
};

/* Carpeta donde se guardó y nombre del archivo, desde la ruta elegida (/ o \\). */
const folderOf = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : path;
};

const DownloadCard = ({ notice, onDismiss }: { notice: Extract<CloudNotice, { kind: 'download' }>; onDismiss: () => void }) => {
  const box = 'pointer-events-auto glass-float elev-float border border-hairline rounded-xl p-3 animate-slideUp';
  const done = notice.status === 'done';
  const pct = notice.total ? Math.min(100, Math.round((notice.loaded / notice.total) * 100)) : null;
  const where = folderOf(notice.destination);

  return (
    <div role="status" aria-live="polite" className={box}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg ring-1 flex items-center justify-center shrink-0 ${done
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
          : 'grad-brand-soft text-violet-200 ring-hairline'}`}>
          <CloudIcon name={done ? 'check' : 'download'} className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-medium text-white truncate">
            {done ? 'Descarga completada' : `Descargando «${notice.label}»`}
          </p>
          <p className="text-xs text-white/55 mt-0.5 truncate" title={notice.destination}>
            {done
              ? `«${notice.label}» · ${formatBytes(notice.total ?? notice.loaded)} · en ${where}`
              : notice.total
                ? `${formatBytes(notice.loaded)} de ${formatBytes(notice.total)} · a ${where}`
                : `${formatBytes(notice.loaded)} · comprimiendo y descargando · a ${where}`}
          </p>
          {done && (
            <button type="button" onClick={() => void revealItemInDir(notice.destination).catch(() => undefined)}
              className="mt-2 h-7 px-2.5 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium inline-flex items-center gap-1.5">
              <CloudIcon name="folder" className="w-3.5 h-3.5" />
              Mostrar en la carpeta
            </button>
          )}
        </div>
        {done ? (
          <CloseButton onClick={onDismiss} />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {pct !== null && <span className="text-xs font-mono font-semibold tabular-nums text-white pt-0.5">{pct}%</span>}
            <button type="button" onClick={notice.cancel} aria-label="Cancelar la descarga" title="Cancelar la descarga"
              className="w-6 h-6 rounded-md text-white/40 hover:text-rose-300 hover:bg-tint-hover flex items-center justify-center transition-colors">
              <CloudIcon name="close" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {!done && (
        <div className="mt-2.5 bg-track h-1.5 rounded-full overflow-hidden" role="progressbar"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          {/* Sin tamaño total (carpeta comprimiéndose), la barra late en vez de avanzar. */}
          <div className={`h-full rounded-full transition-[width] duration-150 ${pct === null ? 'animate-pulse' : ''}`}
            style={{ width: `${pct ?? 100}%`, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))', opacity: pct === null ? 0.6 : 1 }} />
        </div>
      )}
    </div>
  );
};

/* ── Avisos de Cloud ──────────────────────────────────────────────────
   Abajo y centrados en la columna de contenido, no en la esquina de la
   ventana como los toasts del resto de la app. `.glass-float` porque pasan
   por encima del contenido que se desplaza. */
export const CloudToasts = ({ notices, onDismiss }: { notices: CloudNotice[]; onDismiss: (id: string) => void }) => {
  if (notices.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(440px,calc(100%-2rem))] flex flex-col gap-2 pointer-events-none">
      {notices.map(n => <NoticeCard key={n.id} notice={n} onDismiss={() => onDismiss(n.id)} />)}
    </div>
  );
};
