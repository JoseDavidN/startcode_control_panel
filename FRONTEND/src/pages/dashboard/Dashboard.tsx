import React, { useState, useEffect } from 'react';
import { useServers } from '@hooks/useServers';

/* ── Glassmorphism primitives ─────────────────────────────────────── */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass rounded-2xl relative grain ${className}`}>{children}</div>
);

/* ── KPI card ─────────────────────────────────────────────────────── */
const Kpi = ({ label, value, sub, icon, tone = 'violet', accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; tone?: 'violet' | 'emerald' | 'sky' | 'amber'; accent?: string;
}) => {
  const tones: Record<string, { wrap: string; ring: string }> = {
    violet:  { wrap: 'from-violet-500/30 to-violet-500/10',   ring: 'ring-violet-400/25' },
    emerald: { wrap: 'from-emerald-500/30 to-emerald-500/10', ring: 'ring-emerald-400/25' },
    sky:     { wrap: 'from-sky-500/30 to-sky-500/10',         ring: 'ring-sky-400/25' },
    amber:   { wrap: 'from-amber-500/30 to-amber-500/10',     ring: 'ring-amber-400/25' },
  };
  const t = tones[tone];
  return (
    <Card className="p-5 flex items-center justify-between gap-4 hover:bg-white/[0.05] transition">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-white/50 font-medium">{label}</div>
        <div className={`text-4xl font-extrabold tracking-tight mt-1 ${accent ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-white/50 mt-1">{sub}</div>}
      </div>
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.wrap} ring-1 ${t.ring} flex items-center justify-center backdrop-blur-md`}>
        {icon}
      </div>
    </Card>
  );
};

/* ── Inline icons ─────────────────────────────────────────────────── */
const I = ({ d, className = 'w-5 h-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const icons = {
  server: <I d="M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01" className="w-7 h-7" />,
};

/* ── Dashboard ────────────────────────────────────────────────────── */
export const Dashboard: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: servers = [] } = useServers();

  const onlineCount = servers.filter(s => s.status === 'online').length;
  const time = now.toLocaleTimeString('es-CO', { hour12: false });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <Card className="px-6 py-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)]">
          <span className="text-white">{icons.server}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
          <p className="text-sm text-white/55 mt-0.5">Administración de Servidores y Servicios</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Hora actual</div>
            <div className="font-mono text-base text-white/95 tabular-nums">{time}</div>
          </div>
          <button className="w-11 h-11 rounded-xl glass-soft text-white/75 hover:text-white hover:bg-white/[0.06] flex items-center justify-center relative transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 004 0" />
            </svg>
            <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-pink-400 ring-2 ring-[#150a2e]" />
          </button>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Kpi label="Servidores Online" value={`${onlineCount}/${servers.length}`}
          accent="text-emerald-300" tone="emerald"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-300"><circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9.5" /></svg>} />
        <Kpi label="Servicios Activos" value="0/0"
          accent="text-sky-300" tone="sky"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-sky-300"><path d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z M3 7.5L12 12l9-4.5M12 12v9" /></svg>} />
        <Kpi label="Sitios Web" value="—"
          accent="text-violet-300" tone="violet"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-violet-300"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>} />
        <Kpi label="Bases de Datos" value="—"
          accent="text-amber-300" tone="amber"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-amber-300"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>} />
      </div>
    </div>
  );
};
