import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';
import { useAuth } from '@hooks/useAuth';
import { useServers } from '@hooks/useServers';

/* ── Inline SVG icon set (stroke-current) ────────────────────────── */
type IconName =
  | 'chart' | 'server' | 'cube' | 'globe' | 'database' | 'folder'
  | 'bell' | 'gear' | 'logout' | 'search' | 'monitor';

const PATHS: Record<IconName, string> = {
  chart:    'M4 20V10M10 20V4M16 20v-6M22 20H2',
  server:   'M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01',
  cube:     'M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z M3 7.5L12 12l9-4.5M12 12v9',
  globe:    'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18',
  database: 'M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  folder:   'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  bell:     'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9 M10 21a2 2 0 004 0',
  gear:     'M12 12m-3 0a3 3 0 106 0 3 3 0 00-6 0M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 01-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 01-2.8-2.9l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9L4.1 7a2 2 0 012.9-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 012.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  logout:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  search:   'M21 21l-4.3-4.3',
  monitor:  'M3 4h18v12H3z M8 20h8M12 16v4',
};

const Icon = ({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    {name === 'database' && <ellipse cx="12" cy="5" rx="8" ry="3" />}
    {name === 'search' && <circle cx="11" cy="11" r="7" />}
    {name === 'monitor' && <path d={PATHS[name]} />}
    {name === 'monitor' && null /* rendered via path */}
    <path d={PATHS[name]} />
  </svg>
);

/* ── Progress bar ────────────────────────────────────────────────── */
const Progress = ({ value = 0, gradient = 'from-violet-500 to-fuchsia-500' }) => (
  <div className="bg-white/[0.06] h-1 rounded-full overflow-hidden">
    <div
      className={`h-full bg-gradient-to-r ${gradient} rounded-full relative overflow-hidden transition-all duration-700`}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    >
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shine 2.4s linear infinite',
      }} />
    </div>
  </div>
);

/* ── Sidebar nav item ─────────────────────────────────────────────── */
const SideItem = ({
  icon, label, active, onClick, badge,
}: {
  icon: IconName; label: string; active: boolean;
  onClick: () => void; badge?: string | null;
}) => (
  <button
    onClick={onClick}
    className={`w-full h-10 px-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition relative
      ${active ? 'nav-active text-white' : 'text-white/65 hover:text-white hover:bg-white/[0.04]'}`}
  >
    <Icon name={icon} className="w-4 h-4 shrink-0" />
    <span className="flex-1 text-left">{label}</span>
    {badge && (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 ring-1 ring-pink-400/25">
        {badge}
      </span>
    )}
  </button>
);

/* ── Route-to-display mapping ─────────────────────────────────────── */
function routeToChrome(pathname: string): string {
  if (pathname.startsWith(ROUTES.SETTINGS)) return 'settings';
  if (pathname.startsWith('/servers/')) return `servers/${pathname.split('/')[2] ?? ''}`;
  return 'dashboard';
}

/* ── AppLayout ────────────────────────────────────────────────────── */
export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: servers = [] } = useServers();

  // Pick the first server for the sidebar status card
  const primaryServer = servers[0] ?? null;

  const nav: [string, string, IconName][] = [
    [ROUTES.DASHBOARD, 'Panel',           'chart'],
    ['/servers',        'Servidores',      'server'],
    ['/services',       'Servicios',       'cube'],
    ['/websites',       'Sitios Web',      'globe'],
    ['/databases',      'Bases de Datos',  'database'],
    ['/files',          'Archivos',        'folder'],
  ];
  const meta: [string, string, IconName, string?][] = [
    ['/notifications', 'Notificaciones', 'bell', '3'],
    [ROUTES.SETTINGS,  'Configuración',  'gear'],
  ];

  const userInitials = user
    ? `${(user.firstname?.[0] ?? user.name?.[0] ?? 'A').toUpperCase()}${(user.lastname?.[0] ?? user.name?.split(' ')[1]?.[0] ?? '').toUpperCase()}`
    : 'AS';
  const displayName = user?.name || [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Admin System';
  const displayEmail = user?.email ?? 'admin@startcode.local';

  const chromeSegment = routeToChrome(location.pathname);

  return (
    <>
      {/* ── Fixed background: gradient + aurora blobs ──────────── */}
      {/* Separate from the layout so backdrop-filter on glass panels blurs this correctly */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: -1, background: 'radial-gradient(ellipse at 20% 0%, #2a1352 0%, #150a2e 35%, #07050d 80%)' }}>
        <div className="aurora" style={{ width: 580, height: 580, background: '#a855f7', top: -140, left: -100, animation: 'float1 22s ease-in-out infinite' }} />
        <div className="aurora" style={{ width: 520, height: 520, background: '#ec4899', top: '35%', right: -120, opacity: 0.58, animation: 'float2 28s ease-in-out infinite' }} />
        <div className="aurora" style={{ width: 600, height: 600, background: '#6366f1', bottom: -140, left: '25%', opacity: 0.52, animation: 'float3 32s ease-in-out infinite' }} />
      </div>

    <div className="h-full flex p-5 gap-5">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[240px] shrink-0 glass rounded-2xl flex flex-col grain relative overflow-hidden">
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grad-brand flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(168,85,247,0.55)]">
            <Icon name="server" className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">StartCode</div>
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Cloud Console</div>
          </div>
        </div>

        {/* Nav */}
        <div className="px-3 mt-1 flex-1 overflow-y-auto scroll-thin">
          <div className="text-[10px] uppercase tracking-wider text-white/35 font-semibold px-2 py-2">Workspace</div>
          <div className="space-y-0.5">
            {nav.map(([path, label, icon]) => (
              <SideItem
                key={path}
                icon={icon}
                label={label}
                active={path === ROUTES.DASHBOARD
                  ? location.pathname === ROUTES.DASHBOARD || location.pathname === '/'
                  : location.pathname.startsWith(path)}
                onClick={() => navigate(path)}
              />
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-wider text-white/35 font-semibold px-2 pt-5 pb-2">Cuenta</div>
          <div className="space-y-0.5">
            {meta.map(([path, label, icon, badge]) => (
              <SideItem
                key={path}
                icon={icon}
                label={label}
                active={location.pathname.startsWith(path)}
                onClick={() => navigate(path)}
                badge={badge}
              />
            ))}
          </div>
        </div>

        {/* Bottom: server status + user chip */}
        <div className="p-3 space-y-2">
          <div className="glass-soft rounded-xl p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg grad-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{displayName}</div>
              <div className="text-[10px] text-white/45 truncate font-mono">{displayEmail}</div>
            </div>
            <button
              onClick={() => logout()}
              title="Cerrar sesión"
              className="text-white/45 hover:text-white transition"
            >
              <Icon name="logout" className="w-4 h-4" />
            </button>
          </div>
        </div>{/* end space-y-2 */}
      </aside>

      {/* ── Main pane ──────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col gap-0 overflow-hidden">
        {/* Window chrome */}
        <div className="glass rounded-2xl rounded-b-none border-b-0 px-5 py-3 flex items-center gap-4 grain relative shrink-0">
          <div className="text-xs text-white/45 font-mono">startcode://{chromeSegment}</div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 glass rounded-2xl rounded-t-none border-t-0 overflow-hidden grain relative">
          <div className="h-full overflow-y-auto scroll-area p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </>
  );
};
