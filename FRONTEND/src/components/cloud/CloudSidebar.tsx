import { Card } from '@components/common/Card';
import { CloudIcon, FolderGlyph } from '@components/cloud/icons';
import { MenuIcon } from '@components/common/ContextMenu';
import { useContextMenu } from '@hooks/useContextMenu';
import { CLOUD_SECTIONS, formatBytes } from '@utils/cloud';
import type { CloudAccount, CloudConnectionStatus, CloudFolder, CloudSection, CloudStorage } from '@typings/cloud.types';

const STATUS: Record<CloudConnectionStatus, { label: string; badge: string; dot: string }> = {
  connected:    { label: 'Conectado',    badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20', dot: 'bg-emerald-400 animate-pulse' },
  connecting:   { label: 'Conectando…',  badge: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',       dot: 'bg-amber-400 animate-pulse' },
  disconnected: { label: 'Desconectado', badge: 'bg-rose-500/15 text-rose-300 ring-rose-400/20',          dot: 'bg-rose-400' },
};


/* ── Columna izquierda de StartCode Cloud ────────────────────────────
   Marca, cuenta, las secciones de la nube como tabs (cada una lleva debajo,
   como subcarpetas, sus fijadas) y, al pie, el estado de la conexión. */
export const CloudSidebar = ({
  account, status, section, onSelect, pinned, currentFolderId, onOpenPinned, onUnpin, onOpenSettings, storage,
}: {
  account: CloudAccount; status: CloudConnectionStatus;
  section: CloudSection; onSelect: (section: CloudSection) => void;
  /** Carpetas fijadas de cada sección que todavía existen, en orden. */
  pinned: Record<CloudSection, CloudFolder[]>;
  /** Carpeta abierta en el explorador: si es una fijada, se marca ella y no su sección. */
  currentFolderId: string;
  onOpenPinned: (section: CloudSection, id: string) => void;
  onUnpin: (section: CloudSection, id: string) => void;
  onOpenSettings: () => void;
  storage: CloudStorage;
}) => {
  const s = STATUS[status];
  const { openContextMenu } = useContextMenu();
  const free = Math.max(0, storage.total - storage.used);
  const usedPct = storage.total > 0 ? Math.min(100, Math.round((storage.used / storage.total) * 100)) : 0;

  return (
    <Card className="min-h-0 flex flex-col overflow-hidden">
      {/* Marca */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-line shrink-0">
        <span className="w-9 h-9 rounded-xl grad-brand flex items-center justify-center elev-brand-sm shrink-0">
          <CloudIcon name="cloud" className="w-4 h-4 text-white" />
        </span>
        <span className="flex-1 min-w-0 text-sm font-bold tracking-tight truncate">StartCode Cloud</span>
        <button type="button" onClick={onOpenSettings} aria-label="Configuración de Cloud" title="Configuración de Cloud"
          className="w-8 h-8 rounded-lg text-white/45 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 focus-ring transition-colors">
          <CloudIcon name="gear" className="w-4 h-4" />
        </button>
      </div>

      {/* Cuenta */}
      <div className="px-3 py-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 h-9 rounded-xl bg-tint-sunken" title={account.username}>
          <span className="w-5 h-5 rounded-md grad-brand-soft ring-1 ring-hairline text-violet-200 flex items-center justify-center shrink-0">
            <CloudIcon name="user" className="w-3 h-3" />
          </span>
          <span className="min-w-0 truncate text-xs font-medium text-white/85">{account.username}</span>
        </div>
      </div>

      {/* Secciones */}
      <nav aria-label="Secciones de la nube" className="flex-1 min-h-0 overflow-y-auto scroll-thin scroll-layer p-3">
        <h3 className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">Mi nube</h3>
        <div role="tablist" aria-orientation="vertical" className="space-y-0.5">
          {CLOUD_SECTIONS.map(({ id, label, icon }) => {
            const list = pinned[id];
            const active = section === id && !list.some(f => f.id === currentFolderId);
            return (
              <div key={id}>
                <button type="button" role="tab" aria-selected={active}
                  onClick={() => onSelect(id)}
                  className={`mo-tab focus-ring w-full h-10 px-3 rounded-xl flex items-center gap-3 text-sm font-medium border border-transparent
                    ${active ? 'nav-active text-white' : 'text-white/65 hover:text-white hover:bg-tint-hover'}`}>
                  <CloudIcon name={icon} className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>

                {/* Fijadas: colgando de su sección con guías de árbol, como en la lista. */}
                {list.length > 0 && (
                  <ul aria-label={`Carpetas fijadas en ${label}`} className="ml-[19px] pl-4 mt-0.5 mb-1 space-y-0.5">
                    {list.map((folder, i) => {
                      const on = section === id && folder.id === currentFolderId;
                      const last = i === list.length - 1;
                      return (
                        <li key={folder.id} className="relative">
                          <span aria-hidden className={`absolute -left-4 -top-0.5 w-px bg-hairline ${last ? 'h-[calc(50%+2px)]' : '-bottom-0.5'}`} />
                          <span aria-hidden className="absolute -left-4 top-1/2 w-3 h-px bg-hairline" />
                          <button type="button" onClick={() => onOpenPinned(id, folder.id)}
                            onContextMenu={e => openContextMenu(e, [{
                              id: 'unpin', label: 'Quitar del menú', icon: <MenuIcon name="unpin" />, onSelect: () => onUnpin(id, folder.id),
                            }])}
                            aria-current={on ? 'page' : undefined}
                            title={folder.name}
                            className={`mo-tab focus-ring w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm border border-transparent
                              ${on ? 'nav-active text-white' : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}>
                            <FolderGlyph className="w-4 h-3.5 shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Almacenamiento: disponible y total, y la barra de lo ocupado. */}
      <div className="px-4 pt-3 pb-3.5 border-t border-line shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40">
            <CloudIcon name="cloud" className="w-3.5 h-3.5 text-violet-300" />
            Almacenamiento
          </span>
          <span className="text-[11px] font-mono tabular-nums text-white/55">{usedPct}%</span>
        </div>
        <div className="bg-track h-1.5 rounded-full overflow-hidden" role="progressbar"
          aria-label="Espacio ocupado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct}>
          <div className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${usedPct}%`, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))' }} />
        </div>
        <p className="mt-2 text-xs text-white/55 truncate">
          <span className="font-medium text-white/85">{formatBytes(free)}</span> disponibles de {formatBytes(storage.total)}
        </p>
      </div>

      {/* Estado de la conexión */}
      <div className="px-4 py-3 border-t border-line shrink-0 flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/40">Estado</span>
        <span role="status"
          className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${s.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
    </Card>
  );
};
