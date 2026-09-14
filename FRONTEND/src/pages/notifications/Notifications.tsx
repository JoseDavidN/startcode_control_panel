import React, { useMemo, useState } from 'react';
import {
  useNotificationsList,
  useMarkNotificationsRead,
  useMarkAllNotificationsRead,
  useRemoveNotification,
  useClearNotifications,
} from '@hooks/useNotificationsFeed';
import { NOTIFICATION_TYPE_LABELS } from '@typings/notification.types';
import type {
  AppNotification,
  NotificationSeverity,
  NotificationType,
} from '@typings/notification.types';
import { fullDateTime, timeAgo } from '@utils/time';

const PAGE_SIZE = 50;

/* ── Primitivos locales (mismo patrón que Servers/Dashboard) ───────── */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass rounded-2xl relative grain ${className}`}>{children}</div>
);

const svg = (className: string) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
});

const Icon = ({ name, className = 'w-4 h-4' }: { name: string; className?: string }) => {
  const p = svg(className);
  switch (name) {
    case 'bell':     return <svg {...p}><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 004 0" /></svg>;
    case 'alert':    return <svg {...p}><path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" /></svg>;
    case 'cpu':      return <svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></svg>;
    case 'ram':      return <svg {...p}><rect x="2.5" y="7" width="19" height="10" rx="1.5" /><path d="M7 11v2M11 11v2M15 11v2M19 11v2" /></svg>;
    case 'disk':     return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 14h18" /><circle cx="7" cy="17" r="1" /></svg>;
    case 'shield':   return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" /></svg>;
    case 'plug':     return <svg {...p}><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0V8zM12 18v4" /></svg>;
    case 'check':    return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'checkAll': return <svg {...p}><path d="M1 13l4 4L13 9" /><path d="M11 13l4 4L23 5" /></svg>;
    case 'trash':    return <svg {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
    case 'loader':   return <svg {...p} className={`${className} animate-spin`}><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>;
    default:         return null;
  }
};

/* ── Lenguaje visual por tipo y severidad ──────────────────────────── */
const TYPE_ICON: Record<NotificationType, string> = {
  server_offline: 'alert',
  server_online: 'plug',
  cpu_high: 'cpu',
  memory_high: 'ram',
  disk_high: 'disk',
  security: 'shield',
  system: 'bell',
};

const SEVERITY_TONE: Record<NotificationSeverity, { text: string; chip: string }> = {
  info:    { text: 'text-sky-300',     chip: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20' },
  warning: { text: 'text-amber-300',   chip: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20' },
  error:   { text: 'text-rose-300',    chip: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20' },
};

const FILTERS: { id: NotificationType | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  ...(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map(t => ({
    id: t,
    label: NOTIFICATION_TYPE_LABELS[t],
  })),
];

/* ── Fila ──────────────────────────────────────────────────────────── */
const Row = ({
  item, onRead, onRemove,
}: {
  item: AppNotification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) => {
  const tone = SEVERITY_TONE[item.severity];
  const serverName = item.metadata?.serverName;

  return (
    <div
      className={`mo-tab glass-soft rounded-xl p-4 flex items-start gap-4 border
        ${item.read ? 'border-white/[0.05]' : 'border-white/[0.10] bg-white/[0.03]'}`}
    >
      <div className={`w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 ${tone.text}`}>
        <Icon name={TYPE_ICON[item.type]} className="w-[18px] h-[18px]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {!item.read && <span className="w-2 h-2 rounded-full grad-brand shrink-0" aria-label="Sin leer" />}
          <span className={`text-sm font-semibold ${item.read ? 'text-white/75' : 'text-white'}`}>
            {item.title}
          </span>
          <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ${tone.chip}`}>
            {NOTIFICATION_TYPE_LABELS[item.type]}
          </span>
        </div>

        <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{item.body}</p>

        <div className="flex items-center gap-2 mt-2 text-xs text-white/35 flex-wrap">
          <span title={fullDateTime(item.createdAt)}>{timeAgo(item.createdAt)}</span>
          {serverName && (
            <>
              <span className="text-white/20">·</span>
              <span className="font-mono text-white/45">{serverName}</span>
            </>
          )}
          {typeof item.metadata?.value === 'number' && typeof item.metadata?.threshold === 'number' && (
            <>
              <span className="text-white/20">·</span>
              <span className="font-mono tabular-nums text-white/45">
                {item.metadata.value}% / umbral {item.metadata.threshold}%
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!item.read && (
          <button
            onClick={() => onRead(item.id)}
            title="Marcar como leída"
            className="mo-tab w-9 h-9 rounded-xl glass-soft text-white/60 hover:text-white hover:bg-white/[0.07] flex items-center justify-center"
          >
            <Icon name="check" />
          </button>
        )}
        <button
          onClick={() => onRemove(item.id)}
          title="Borrar"
          className="mo-tab w-9 h-9 rounded-xl glass-soft text-white/50 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center"
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
};

/* ── Página ────────────────────────────────────────────────────────── */
export const Notifications: React.FC = () => {
  const [type, setType] = useState<NotificationType | 'all'>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const query = useMemo(
    () => ({
      ...(type !== 'all' ? { type } : {}),
      ...(onlyUnread ? { unread: true } : {}),
      limit,
      offset: 0,
    }),
    [type, onlyUnread, limit],
  );

  const { data, isLoading, isError } = useNotificationsList(query);
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();
  const removeOne = useRemoveNotification();
  const clearAll = useClearNotifications();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;
  const total = data?.total ?? 0;

  const applyFilter = (id: NotificationType | 'all') => { setType(id); setLimit(PAGE_SIZE); };

  return (
    <div className="mo-view h-full min-h-0 flex flex-col gap-5">
      {/* Cabecera */}
      <Card className="px-6 py-5 flex items-center gap-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)]">
          <Icon name="bell" className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
          <p className="text-sm text-white/55 mt-0.5">
            {unread > 0 ? `${unread} sin leer` : 'Todo al día'}
          </p>
        </div>

        <button
          onClick={() => markAllRead.mutate(undefined)}
          disabled={unread === 0 || markAllRead.isPending}
          className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium disabled:opacity-40 shrink-0"
        >
          <Icon name={markAllRead.isPending ? 'loader' : 'checkAll'} />
          Marcar todas
        </button>
        <button
          onClick={() => clearAll.mutate(undefined)}
          disabled={total === 0 || clearAll.isPending}
          className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-rose-300 hover:bg-rose-500/10 border border-rose-500/15 text-sm font-medium disabled:opacity-40 shrink-0"
        >
          <Icon name={clearAll.isPending ? 'loader' : 'trash'} />
          Vaciar
        </button>
      </Card>

      {/* Filtros */}
      <Card className="p-3 flex items-center gap-2 flex-wrap shrink-0">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => applyFilter(id)}
            className={`mo-tab h-9 px-3.5 rounded-xl text-sm font-medium
              ${type === id
                ? 'mo-tab-on grad-brand text-white shadow-[0_4px_14px_-4px_rgba(168,85,247,0.6)]'
                : 'text-white/60 hover:text-white hover:bg-white/[0.05]'}`}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 pl-2">
          <button
            role="switch"
            aria-checked={onlyUnread}
            onClick={() => { setOnlyUnread(v => !v); setLimit(PAGE_SIZE); }}
            className={`mo-tab h-9 px-3.5 rounded-xl text-sm font-medium border
              ${onlyUnread
                ? 'mo-tab-on grad-brand-soft text-white border-white/10'
                : 'glass-soft text-white/60 hover:text-white border-transparent'}`}
          >
            Solo no leídas
          </button>
        </div>
      </Card>

      {/* Lista — única zona con scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-white/45 gap-3">
            <Icon name="loader" className="w-5 h-5" /> Cargando notificaciones…
          </div>
        )}

        {isError && (
          <Card className="p-8 text-center text-sm text-rose-300">
            No se pudo cargar el historial de notificaciones.
          </Card>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div
            className="glass rounded-2xl grain relative flex flex-col items-center justify-center text-center gap-3 py-16 px-6"
            style={{ border: '1.5px dashed var(--hairline-strong)' }}
          >
            <span className="text-white/20"><Icon name="bell" className="w-10 h-10" /></span>
            <div className="text-sm font-medium text-white/60">
              {onlyUnread || type !== 'all'
                ? 'Nada que mostrar con este filtro'
                : 'Todavía no hay notificaciones'}
            </div>
            <p className="text-xs text-white/35 max-w-[320px]">
              Las alertas de servidores caídos y de umbrales de CPU, memoria o disco aparecerán aquí.
              Los tipos activos se eligen en Configuración → Notificaciones.
            </p>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="mo-panel space-y-2.5">
            {items.map(item => (
              <Row
                key={item.id}
                item={item}
                onRead={id => markRead.mutate([id])}
                onRemove={id => removeOne.mutate(id)}
              />
            ))}

            {items.length < total && (
              <button
                onClick={() => setLimit(l => l + PAGE_SIZE)}
                className="mo-tab w-full h-11 rounded-xl glass-soft text-white/70 hover:text-white hover:bg-white/[0.07] text-sm font-medium"
              >
                Cargar más ({total - items.length} restantes)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
