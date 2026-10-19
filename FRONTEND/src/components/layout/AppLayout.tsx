import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';
import { useAuth } from '@hooks/useAuth';
import { useAppearance } from '@contexts/AppearanceContext';
import { useUnreadCount } from '@hooks/useNotificationsFeed';
import { AssistantLauncher, AssistantPanel } from '@components/assistant/AssistantPanel';
import { useAssistant } from '@hooks/useAssistantBridge';
import { TerminalDockProvider } from '@contexts/TerminalDockContext';

/* ── Inline SVG icon set ─────────────────────────────────────────── */
type IconName =
  | 'chart' | 'server' | 'database' | 'cloud'
  | 'bell' | 'gear' | 'logout' | 'search' | 'monitor';

const PATHS: Record<IconName, string> = {
  chart:        'M4 20V10M10 20V4M16 20v-6M22 20H2',
  server:       'M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01',
  database:     'M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  cloud:        'M7 18a4 4 0 01-.4-8A6 6 0 0118 10.5a3.75 3.75 0 01-.5 7.5H7z',
  bell:         'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9 M10 21a2 2 0 004 0',
  gear:         'M12 12m-3 0a3 3 0 106 0 3 3 0 00-6 0M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 01-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 01-2.8-2.9l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9L4.1 7a2 2 0 012.9-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 012.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  logout:       'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  search:       'M21 21l-4.3-4.3',
  monitor:      'M3 4h18v12H3z M8 20h8M12 16v4',
};

const Icon = ({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    {name === 'database' && <ellipse cx="12" cy="5" rx="8" ry="3" />}
    {name === 'search'   && <circle cx="11" cy="11" r="7" />}
    <path d={PATHS[name]} />
  </svg>
);

/* ── Fila del sidebar ────────────────────────────────────────────────
   Geometría congelada: slot fijo de 40px + label en posición absoluta.
   Nada se desmonta al colapsar, sólo cambia la opacidad. */
const RailRow = ({
  icon, label, active = false, badge, onClick, collapsed, soon = false,
}: {
  icon: IconName; label: string; active?: boolean; badge?: string | null;
  onClick: () => void; collapsed: boolean;
  /** La sección todavía no existe: se ve, pero no navega a un 404. */
  soon?: boolean;
}) => (
  <button
    onClick={soon ? undefined : onClick}
    disabled={soon}
    title={collapsed ? (soon ? `${label} · próximamente` : label) : undefined}
    aria-label={badge ? `${label}, ${badge} sin leer` : soon ? `${label}, próximamente` : label}
    aria-current={active ? 'page' : undefined}
    className={`sb-row sb-focus mo-tab rounded-xl text-sm font-medium
      ${soon
        ? 'text-white/30 cursor-not-allowed'
        : active ? 'nav-active text-white' : 'text-white/65 hover:text-white hover:bg-tint-hover'}`}
  >
    <span className="sb-slot">
      <Icon name={icon} className="w-4 h-4" />
      {badge && (
        <span className="sb-fade-rail absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-pink-400" />
      )}
    </span>

    <span className="sb-label sb-fade" aria-hidden={collapsed}>{label}</span>

    {badge && (
      <span
        aria-hidden
        className="sb-trail sb-fade text-[10px] font-semibold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 ring-1 ring-pink-400/25"
      >
        {badge}
      </span>
    )}

    {soon && !badge && (
      <span
        aria-hidden
        className="sb-trail sb-fade text-[10px] font-semibold px-1.5 py-0.5 rounded bg-tint-active text-white/40 ring-1 ring-hairline"
      >
        Pronto
      </span>
    )}
  </button>
);

/* ── Encabezado de sección — altura constante en ambos estados ───── */
const SectionHeading = ({ label }: { label: string }) => (
  <div className="relative h-8 flex items-center overflow-hidden" aria-hidden>
    <span className="sb-fade absolute left-0 text-[10px] uppercase tracking-wider text-white/35 font-semibold">
      {label}
    </span>
    <span className="sb-fade-rail absolute left-0 w-10 border-t border-hairline" />
  </div>
);

/* ── Guardia de primer frame — evita que la transición dispare al arrancar */
function useFirstFrameReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []);
  return ready;
}

/* ── Route-to-display mapping ────────────────────────────────────── */
function routeToChrome(pathname: string): string {
  if (pathname.startsWith(ROUTES.SETTINGS)) return 'settings';
  if (pathname.startsWith('/servers/')) return `servers/${pathname.split('/')[2] ?? ''}`;
  if (pathname.startsWith(ROUTES.SERVERS)) return 'servers';
  if (pathname.startsWith('/databases/')) return `databases/${pathname.split('/')[2] ?? ''}`;
  if (pathname.startsWith(ROUTES.DATABASES)) return 'databases';
  if (pathname.startsWith(ROUTES.CLOUD)) return 'cloud';
  return 'dashboard';
}

/* ── AppLayout ───────────────────────────────────────────────────── */
export const AppLayout = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();

  const { isSidebarCollapsed: collapsed } = useAppearance();
  const { data: unreadCount = 0 } = useUnreadCount();
  const ready = useFirstFrameReady();

  /* El asistente todavía no está permitido en la nube: sin botón ni panel, y
     si venía abierto se cierra para que no reaparezca solo al salir. */
  const { setOpen: setAssistantOpen } = useAssistant();
  const assistantAllowed = !location.pathname.startsWith(ROUTES.CLOUD);
  useEffect(() => {
    if (!assistantAllowed) setAssistantOpen(false);
  }, [assistantAllowed, setAssistantOpen]);


  /* `soon` marca lo que todavía no tiene página: el ítem se ve, pero no
     navega. Antes los cuatro apuntaban a rutas inexistentes y acababan en el
     404 sin avisar. */
  const nav: { path: string; label: string; icon: IconName; soon?: boolean }[] = [
    { path: ROUTES.DASHBOARD, label: 'Panel',          icon: 'chart' },
    { path: '/servers',       label: 'Servidores',     icon: 'server' },
    { path: ROUTES.DATABASES, label: 'Bases de Datos', icon: 'database' },
    { path: ROUTES.CLOUD,     label: 'Cloud',          icon: 'cloud' },
  ];
  const meta: [string, string, IconName, string?][] = [
    [ROUTES.NOTIFICATIONS, 'Notificaciones', 'bell', unreadCount > 0 ? String(unreadCount) : undefined],
    [ROUTES.SETTINGS,      'Configuración',  'gear'],
  ];

  const userInitials = user
    ? `${(user.firstname?.[0] ?? user.name?.[0] ?? 'A').toUpperCase()}${(user.lastname?.[0] ?? user.name?.split(' ')[1]?.[0] ?? '').toUpperCase()}`
    : 'AS';
  const displayName  = user?.name || [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Admin System';
  const displayEmail = user?.email ?? 'admin@startcode.local';
  const chromeSegment = routeToChrome(location.pathname);

  return (
    <TerminalDockProvider>
      {/* ── Fixed background ────────────────────────────────────── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: -1, background: 'var(--bg-radial)' }}>
        <div className="aurora" style={{ width: 580, height: 580, background: 'var(--aurora-1)', top: -140, left: -100, animation: 'float1 22s ease-in-out infinite' }} />
        <div className="aurora" style={{ width: 520, height: 520, background: 'var(--aurora-2)', top: '35%', right: -120, opacity: 'var(--aurora-2-opacity)', animation: 'float2 28s ease-in-out infinite' }} />
        <div className="aurora" style={{ width: 600, height: 600, background: 'var(--aurora-3)', bottom: -140, left: '25%', opacity: 'var(--aurora-3-opacity)', animation: 'float3 32s ease-in-out infinite' }} />
      </div>

      <div className="h-full flex p-5 gap-5">

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside
          aria-label="Barra lateral"
          data-sb={collapsed ? 'collapsed' : 'expanded'}
          className={`sidebar ${ready ? 'is-ready' : ''} glass rounded-2xl flex flex-col grain relative overflow-hidden`}
        >

          {/* ── Brand ─────────────────────────────────────────────── */}
          <div className="shrink-0 px-[14px] pt-4 pb-3 border-b border-line">
            <div className="sb-row">
              <span className="sb-slot">
                {/* El logo trae su fondo y sus esquinas: solo se fija el tamaño. */}
                <img src="/icono-oscuro-180.png" alt="" width={36} height={36} draggable={false}
                  className="block w-9 h-9 shrink-0 object-contain select-none" />
              </span>
              <span className="sb-label sb-fade" aria-hidden={collapsed}>
                <span className="block text-sm font-bold tracking-tight leading-none">StartCode</span>
                <span className="block text-[10px] uppercase tracking-wider text-white/45 font-medium mt-0.5">Cloud Console</span>
              </span>
            </div>
          </div>

          {/* ── Nav ───────────────────────────────────────────────── */}
          <nav
            id="sidebar-nav"
            aria-label="Navegación principal"
            className="sb-scroll mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-thin"
          >
            <SectionHeading label="Workspace" />

            <div className="space-y-0.5">
              {nav.map(({ path, label, icon, soon }) => (
                <RailRow
                  key={path}
                  icon={icon}
                  label={label}
                  soon={soon}
                  active={path === ROUTES.DASHBOARD
                    ? location.pathname === ROUTES.DASHBOARD || location.pathname === '/'
                    : location.pathname.startsWith(path)}
                  onClick={() => navigate(path)}
                  collapsed={collapsed}
                />
              ))}
            </div>

            <SectionHeading label="Cuenta" />

            <div className="space-y-0.5">
              {meta.map(([path, label, icon, badge]) => (
                <RailRow
                  key={path}
                  icon={icon}
                  label={label}
                  active={location.pathname.startsWith(path)}
                  onClick={() => navigate(path)}
                  badge={badge}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </nav>

          {/* ── User chip ─────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-line px-[14px] py-3">
            <div className="sb-row rounded-xl bg-tint-sunken">
              <span className="sb-slot">
                <span className="w-8 h-8 rounded-lg grad-brand flex items-center justify-center text-white text-xs font-bold">
                  {userInitials}
                </span>
              </span>

              <span className="sb-label sb-fade" aria-hidden={collapsed}>
                <span className="block text-xs font-medium truncate">{displayName}</span>
                <span className="block text-[10px] text-white/45 truncate font-mono">{displayEmail}</span>
              </span>

              {/* Recortado por overflow:hidden en el rail ⇒ fuera del tab order */}
              <button
                onClick={() => void logout()}
                aria-label="Cerrar sesión"
                aria-hidden={collapsed}
                tabIndex={collapsed ? -1 : 0}
                className="sb-trail sb-fade sb-focus rounded-lg text-white/40 hover:text-white transition-colors"
              >
                <Icon name="logout" className="w-4 h-4" />
              </button>
            </div>
          </div>

        </aside>

        {/* ── Main pane ───────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col gap-0 overflow-hidden">
          <div className="glass panel-head rounded-2xl rounded-b-none border-b-0 px-5 py-3 flex items-center gap-4 grain relative shrink-0">
            <div className="text-xs text-white/45 font-mono">startcode://{chromeSegment}</div>
            {/* -my: el botón no debe agrandar la barra */}
            {assistantAllowed && <div className="ml-auto -my-1.5"><AssistantLauncher /></div>}
          </div>

          <div className="flex-1 min-h-0 glass rounded-2xl rounded-t-none border-t-0 overflow-hidden grain relative">
            <div className="h-full overflow-y-auto scroll-area p-6">
              {/* key por ruta ⇒ cada página entra con .mo-view */}
              <div key={location.pathname} className="mo-view h-full">
                <Outlet />
              </div>
            </div>
          </div>
        </main>

      </div>

      {assistantAllowed && <AssistantPanel />}
    </TerminalDockProvider>
  );
};
