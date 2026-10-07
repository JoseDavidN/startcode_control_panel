import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';
import { useAuth } from '@hooks/useAuth';

/* ── Hooks ────────────────────────────────────────────────────────── */
function useDrift(base: number, range = 5, step = 600) {
  const [v, setV] = useState(base);
  useEffect(() => {
    const id = setInterval(
      () => setV(() => Math.max(0, Math.min(100, base + (Math.random() - 0.5) * range * 2))),
      step,
    );
    return () => clearInterval(id);
  }, [base, range, step]);
  return v;
}

/* ── Icon system ──────────────────────────────────────────────────── */
const sp = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
const Ico = ({ d, className = 'w-5 h-5' }: { d: React.ReactNode; className?: string }) => (
  <svg {...sp} className={className}>{d}</svg>
);

const I = {
  server:      <Ico d={<><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M15 7.5h3M15 16.5h3"/></>} />,
  mail:        <Ico d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>} />,
  lock:        <Ico d={<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>} />,
  eye:         <Ico d={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>} />,
  eyeOff:      <Ico d={<><path d="M17.94 17.94A10 10 0 0112 19c-7 0-10-7-10-7a18 18 0 014.06-5.06M9.9 5a10.5 10.5 0 012.1-.2c7 0 10 7 10 7a18 18 0 01-2.16 3.19M14.12 14.12A3 3 0 119.88 9.88M1 1l22 22"/></>} />,
  shield:      <Ico d={<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/>} />,
  fingerprint: <Ico d={<><path d="M5 12a7 7 0 0114 0v2"/><path d="M9 12a3 3 0 016 0v3"/><path d="M12 12v6"/><path d="M9 18c0 .7-.2 1.4-.5 2M15 18c0 1 .2 2 .7 3"/></>} />,
  arrow:       <Ico d={<path d="M5 12h14M13 6l6 6-6 6"/>} />,
  activity:    <Ico d={<path d="M3 12h4l3-9 4 18 3-9h4"/>} />,
  database:    <Ico d={<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>} />,
  globe:       <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>} />,
  terminal:    <Ico d={<><path d="M5 7l4 5-4 5M12 17h7"/></>} />,
  zap:         <Ico d={<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>} />,
  shieldCheck: <Ico d={<><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></>} />,
  github:      <Ico d={<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>} />,
  arrowLeft:   <Ico d={<path d="M19 12H5M12 19l-7-7 7-7"/>} />,
};

/* ── LiveSpark ────────────────────────────────────────────────────── */
function LiveSpark({ stroke = 'var(--brand-light-1)', height = 56 }: { stroke?: string; height?: number }) {
  const [pts, setPts] = useState(() => Array.from({ length: 28 }, () => 30 + Math.random() * 50));
  useEffect(() => {
    const id = setInterval(() => {
      setPts(p => [...p.slice(1), Math.max(15, Math.min(92, p[p.length - 1] + (Math.random() - 0.5) * 22))]);
    }, 700);
    return () => clearInterval(id);
  }, []);
  const w = 220, h = height, max = 100;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * w} ${h - (p / max) * (h - 6) - 3}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="url(#sg)" />
      <path d={path} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - (pts[pts.length - 1] / max) * (h - 6) - 3} r="3" fill={stroke} />
    </svg>
  );
}

/* ── MetricChip ───────────────────────────────────────────────────── */
const TONES: Record<string, string> = {
  violet:  'from-violet-500/30 to-violet-500/10 text-violet-300 ring-violet-400/20',
  emerald: 'from-emerald-500/30 to-emerald-500/10 text-emerald-300 ring-emerald-400/20',
  amber:   'from-amber-500/30 to-amber-500/10 text-amber-300 ring-amber-400/20',
};
const MetricChip = ({
  icon, label, value, sub, tone = 'violet', accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string; accent?: string }) => (
  <div className="glass rounded-2xl p-4 grain relative">
    <div className="flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${TONES[tone]} ring-1 flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">{label}</div>
        <div className={`text-xl font-bold tabular-nums tracking-tight ${accent ?? 'text-white'}`}>{value}</div>
      </div>
    </div>
    {sub && <div className="text-xs text-white/55 mt-2">{sub}</div>}
  </div>
);

/* ── NodeLabel ────────────────────────────────────────────────────── */
const NodeLabel = ({ pos, name, status }: { pos: string; name: string; status: 'ok' | 'degraded' }) => {
  const color = status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400';
  return (
    <div className={`absolute ${pos} flex items-center gap-1.5`}>
      <span className="relative inline-flex w-2.5 h-2.5">
        <span className={`absolute inset-0 rounded-full ${color}`} />
        <span className={`absolute inset-0 rounded-full ${color}`} style={{ animation: 'pulseRing 2.2s ease-out infinite' }} />
      </span>
      <span className="text-[10px] font-mono text-white/65 bg-black/40 backdrop-blur px-1.5 py-0.5 rounded">{name}</span>
    </div>
  );
};

/* ── ServerOrbit ──────────────────────────────────────────────────── */
function ServerOrbit() {
  return (
    <div className="relative w-[300px] h-[300px] mx-auto shrink-0">
      <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full glass grain flex items-center justify-center">
        <div className="absolute inset-0 rounded-full grad-brand opacity-30 blur-2xl" />
        <div className="relative w-12 h-12 rounded-2xl grad-brand flex items-center justify-center text-white elev-brand-hi">
          {I.server}
        </div>
      </div>
      <div className="absolute inset-0 rounded-full border border-hairline" />
      <div className="absolute inset-6 rounded-full border border-dashed border-edge" />
      <div className="absolute inset-12 rounded-full border border-hairline-soft" />
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full" style={{ animation: 'spin 22s linear infinite' }}>
        <circle cx="150" cy="150" r="138" fill="none" stroke="rgb(var(--brand-1-rgb) / 0.25)" strokeDasharray="2 6" />
        <circle cx="150" cy="12" r="5" fill="var(--brand-light-1)" />
        <circle cx="288" cy="150" r="4" fill="var(--brand-light-2)" />
        <circle cx="150" cy="288" r="3.5" fill="var(--aurora-3)" />
      </svg>
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full" style={{ animation: 'spinR 30s linear infinite' }}>
        <circle cx="150" cy="150" r="100" fill="none" stroke="rgb(var(--brand-2-rgb) / 0.18)" strokeDasharray="4 8" />
        <circle cx="250" cy="150" r="3" fill="var(--brand-light-2)" />
        <circle cx="50" cy="150" r="3" fill="var(--brand-1)" />
      </svg>
      <NodeLabel pos="top-0 left-1/2 -translate-x-1/2 -translate-y-2" name="eu-west-1" status="ok" />
      <NodeLabel pos="bottom-0 left-1/2 -translate-x-1/2 translate-y-2" name="ap-south-2" status="ok" />
      <NodeLabel pos="top-1/2 -right-2 -translate-y-1/2 translate-x-2" name="us-east-1" status="ok" />
      <NodeLabel pos="top-1/2 -left-2 -translate-y-1/2 -translate-x-2" name="sa-east-1" status="degraded" />
    </div>
  );
}

/* ── TerminalFeed ─────────────────────────────────────────────────── */
const LOGS: [string, string, string][] = [
  ['INFO', 'sched: deploy released-2026.05.17 → us-east-1', 'text-emerald-300'],
  ['OK',   'db.pool: connections 6/100 · latency 12ms',     'text-emerald-300'],
  ['INFO', 'agent[devstar] heartbeat · uptime 8w2d',         'text-white/65'],
  ['WARN', 'cpu.load reached 78% on devstar',                'text-amber-300'],
  ['INFO', 'tls.cert renewed (cloud.startcode.com.co)',       'text-violet-300'],
  ['OK',   'backup.snapshot.daily completed in 47s',          'text-emerald-300'],
  ['INFO', 'metrics: ingested 28,431 events in last 1m',      'text-sky-300'],
  ['INFO', 'auth.session.refresh admin@startcode.local',      'text-white/65'],
  ['OK',   'load.balancer: 12 nodes healthy / 12 total',      'text-emerald-300'],
  ['INFO', 'queue.jobs processed=412 failed=0 backlog=3',     'text-fuchsia-300'],
];
function TerminalFeed() {
  const [lines, setLines] = useState<[string, string, string][]>(LOGS.slice(0, 5));
  useEffect(() => {
    let i = 5;
    const id = setInterval(() => {
      setLines(prev => [...prev.slice(-6), LOGS[i % LOGS.length]]);
      i++;
    }, 1400);
    return () => clearInterval(id);
  }, []);
  const time = (offset: number) =>
    new Date(Date.now() - offset * 1400).toLocaleTimeString('es-CO', { hour12: false });
  return (
    <div className="glass rounded-2xl grain relative overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-line">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/90" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/90" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/90" />
        <div className="ml-2 flex items-center gap-1.5 text-white/55">
          {I.terminal}
          <span className="text-xs font-mono">~/startcode/agent.log</span>
        </div>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-emerald-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="px-4 py-3 font-mono text-[11px] leading-relaxed h-[152px] overflow-hidden">
        {lines.map((l, i) => (
          <div key={i + l[1]} className="flex gap-2 opacity-0" style={{ animation: 'fadeUp 400ms ease-out forwards', animationDelay: `${i * 30}ms` }}>
            <span className="text-white/30 shrink-0">{time(lines.length - i)}</span>
            <span className={`shrink-0 font-semibold ${l[2]}`}>[{l[0]}]</span>
            <span className="text-white/75 truncate">{l[1]}</span>
          </div>
        ))}
        <div className="flex gap-2 mt-0.5 text-white/55">
          <span className="text-violet-300">$</span>
          <span>tail -f agent.log</span>
          <span className="blink">▍</span>
        </div>
      </div>
    </div>
  );
}

/* ── StatsStrip ───────────────────────────────────────────────────── */
const MiniStat = ({ label, value, bar, grad }: { label: string; value: string; bar: number; grad: string }) => (
  <div className="glass-soft rounded-xl p-3">
    <div className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">{label}</div>
    <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    <div className="h-1 rounded-full bg-track mt-2 overflow-hidden">
      <div className={`h-full bg-gradient-to-r ${grad} rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, bar)}%` }} />
    </div>
  </div>
);
function StatsStrip() {
  const cpu     = useDrift(64, 8);
  const reqs    = useDrift(1240, 80);
  const latency = useDrift(38, 6);
  return (
    <div className="grid grid-cols-3 gap-3">
      <MiniStat label="Latencia p50"  value={`${Math.round(latency)}ms`}            bar={(latency / 120) * 100} grad="from-emerald-400 to-teal-400" />
      <MiniStat label="Requests/s"    value={Math.round(reqs).toLocaleString()}      bar={(reqs / 2000) * 100}   grad="from-violet-500 to-fuchsia-500" />
      <MiniStat label="CPU media"     value={`${Math.round(cpu)}%`}                  bar={cpu}                   grad="from-sky-500 to-cyan-400" />
    </div>
  );
}

/* ── SsoBtn ───────────────────────────────────────────────────────── */
const SsoBtn = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <button type="button" className="glass-soft rounded-xl h-11 flex items-center justify-center gap-2 text-xs text-white/75 row-hit hover:text-white transition">
    <span className="w-4 h-4">{icon}</span>
    {label}
  </button>
);

/* ── Left panel ───────────────────────────────────────────────────── */
function TechShowcase() {
  return (
    <div className="relative p-8 lg:p-10 overflow-hidden hidden lg:flex flex-col gap-5 border-r border-line">
      <div className="absolute -top-32 -left-20 w-[400px] h-[400px] rounded-full bg-violet-600/30 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-20 w-[400px] h-[400px] rounded-full bg-pink-600/20 blur-[120px] pointer-events-none" />

      <div className="relative flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-semibold">// Status global · en tiempo real</div>
        <div className="flex-1 h-px bg-line" />
        <span className="font-mono text-[10px] text-emerald-300">SYNCED</span>
      </div>

      <h2 className="relative text-3xl xl:text-4xl font-extrabold tracking-tight leading-[1.1]">
        Tu infraestructura,<br />
        <span className="text-grad-brand">orquestada en una sola vista.</span>
      </h2>
      <p className="relative text-sm text-white/55 max-w-md -mt-1">
        Métricas, logs y despliegues en vivo. Acceso seguro a tus servidores con autenticación cifrada extremo a extremo.
      </p>

      <StatsStrip />

      <div className="relative grid grid-cols-[1fr_auto] gap-5 mt-2 items-center">
        <div className="space-y-3">
          <div className="glass rounded-2xl p-4 grain relative">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-violet-300">{I.activity}</span>
                <div className="text-xs text-white/70 font-medium">CPU · cluster-prod</div>
              </div>
              <span className="font-mono text-xs text-violet-200">live</span>
            </div>
            <LiveSpark stroke="var(--brand-light-1)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricChip icon={I.database} label="Base de datos" value="6/100" sub="conexiones · 12ms p50" tone="amber" accent="text-amber-300" />
            <MetricChip icon={I.globe}    label="Sitios web"    value="34"    sub="todos resolviendo"     tone="emerald" accent="text-emerald-300" />
          </div>
        </div>
        <ServerOrbit />
      </div>

      <div className="relative">
        <TerminalFeed />
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────────── */
export const Login = () => {
  const [email, setEmail]          = useState('');
  const [password, setPassword]    = useState('');
  const [showPwd, setShowPwd]      = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError]          = useState('');
  const [twoFactorPending, set2FA] = useState(false);
  const [tempToken, setTempToken]  = useState('');
  const [code, setCode]            = useState(['', '', '', '', '', '']);
  const [useBackup, setUseBackup]  = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const inputRefs                  = useRef<(HTMLInputElement | null)[]>([]);

  /* Contraseña caducada: el backend no emite sesión hasta cambiarla. */
  const [pwdChangePending, setPwdChangePending] = useState(false);
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const { login, complete2FALogin, completeExpiredPasswordChange, isLoading } = useAuth();
  const navigate = useNavigate();

  /* El interceptor rechaza con un objeto plano (ApiError), no con Error, así que
     `instanceof Error` nunca se cumplía y el mensaje del backend no se veía. */
  const messageOf = (err: unknown, fallback: string): string => {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login({ email, password, rememberMe });
      if (result && 'requiresTwoFactor' in result) {
        setTempToken(result.tempToken);
        set2FA(true);
        return;
      }
      if (result && 'requiresPasswordChange' in result) {
        setTempToken(result.tempToken);
        setPwdChangePending(true);
        return;
      }
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      setError(messageOf(err, 'Credenciales incorrectas.'));
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (digits.length === 6) { setCode(digits.split('')); inputRefs.current[5]?.focus(); }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const joined = code.join('');
    if (useBackup ? backupCode.trim().length < 8 : joined.length < 6) return;
    setError('');
    try {
      const result = await complete2FALogin(
        tempToken,
        useBackup ? { backupCode: backupCode.trim() } : { code: joined },
      );
      /* Puede encadenar con la contraseña caducada. */
      if (result && 'requiresPasswordChange' in result) {
        setTempToken(result.tempToken);
        set2FA(false);
        setPwdChangePending(true);
        return;
      }
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      setError(messageOf(err, 'Código inválido o expirado.'));
      setCode(['', '', '', '', '', '']);
      setBackupCode('');
      if (!useBackup) inputRefs.current[0]?.focus();
    }
  };

  const handleExpiredPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (newPwd !== confirmPwd) { setError('Las contraseñas no coinciden.'); return; }
    try {
      await completeExpiredPasswordChange(tempToken, password, newPwd);
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      setError(messageOf(err, 'No se pudo cambiar la contraseña.'));
    }
  };

  return (
    /* El login no sigue las preferencias de Aspecto: se muestra siempre en
       Nocturno y en Space Grotesk, incluso para quien tenga Solar o Nunito.
       Las clases fijan los tokens en este subárbol y el fondo se pinta aquí,
       porque el de la app vive en el <html> y sí cambia con el tema. */
    <div
      className="theme-nocturno font-grotesk h-full w-full flex items-center justify-center p-5"
      style={{ background: 'var(--bg-radial)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}
    >
      {/* Window card */}
      <div className="w-full max-w-[1280px] h-full max-h-[820px] glass rounded-2xl flex flex-col grain relative overflow-hidden">

        {/* Window chrome */}
        <div className="px-5 py-3 flex items-center gap-4 border-b border-line shrink-0">
          <div className="text-xs text-white/45 font-mono">startcode://auth/login</div>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-white/45">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online
          </div>
        </div>

        {/* Content split */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] min-h-0">

          {/* Left: tech showcase */}
          <TechShowcase />

          {/* Right: auth form */}
          <div className="relative p-8 lg:p-12 flex items-center justify-center overflow-y-auto scroll-area">
            <div className="absolute top-10 right-10 hidden lg:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-white/40">
              <span>{I.zap}</span> 0.1.0-rc
            </div>

            {pwdChangePending ? (
              /* ── Contraseña caducada ── */
              <form onSubmit={handleExpiredPasswordChange} className="w-full max-w-[420px] mx-auto space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="absolute inset-0 grad-brand blur-2xl opacity-50 rounded-2xl" />
                    <div className="relative w-16 h-16 rounded-2xl grad-brand flex items-center justify-center text-white elev-brand-hi">
                      {I.shieldCheck}
                    </div>
                  </div>
                  <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
                    <span className="text-grad-brand">Contraseña caducada</span>
                  </h1>
                  <p className="text-sm text-white/55 mt-1">
                    Por política de seguridad debes cambiarla antes de entrar.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-white/55 font-medium mb-1.5">Nueva contraseña</div>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoFocus
                      className="w-full h-12 px-4 glass-input rounded-xl text-sm text-white outline-none placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-white/55 font-medium mb-1.5">Repite la nueva contraseña</div>
                    <input
                      type="password"
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full h-12 px-4 glass-input rounded-xl text-sm text-white outline-none placeholder:text-white/30"
                    />
                  </div>
                </div>

                {error && (
                  <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm text-center border border-rose-400/20">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !newPwd || !confirmPwd}
                  className="w-full h-12 rounded-xl grad-brand text-white font-semibold tracking-wide elev-brand transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Cambiar y entrar
                </button>

                <p className="text-xs text-white/35 text-center">
                  Al cambiarla se cerrará cualquier otra sesión abierta.
                </p>
              </form>
            ) : twoFactorPending ? (
              /* ── 2FA step ── */
              <form onSubmit={handleVerify2FA} className="w-full max-w-[420px] mx-auto space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="absolute inset-0 grad-brand blur-2xl opacity-50 rounded-2xl" />
                    <div className="relative w-16 h-16 rounded-2xl grad-brand flex items-center justify-center text-white elev-brand-hi">
                      {I.shieldCheck}
                    </div>
                  </div>
                  <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
                    <span className="text-grad-brand">Verificación 2FA</span>
                  </h1>
                  <p className="text-sm text-white/55 mt-1">Ingresa el código de tu app autenticadora</p>
                </div>

                {useBackup ? (
                  <div>
                    <div className="text-xs text-white/55 font-medium mb-3 text-center">
                      Código de respaldo
                    </div>
                    <input
                      type="text"
                      value={backupCode}
                      onChange={e => setBackupCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX"
                      autoFocus
                      autoCapitalize="characters"
                      className="w-full h-14 text-center text-xl font-bold font-mono glass-input rounded-xl text-white outline-none tracking-[0.2em]"
                    />
                    <p className="text-xs text-white/35 mt-2 text-center">
                      Cada código sirve una sola vez.
                    </p>
                  </div>
                ) : (
                <div>
                  <div className="text-xs text-white/55 font-medium mb-3 text-center">Código de 6 dígitos</div>
                  <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                    {code.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { inputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleCodeInput(i, e.target.value)}
                        onKeyDown={e => handleCodeKeyDown(i, e)}
                        autoFocus={i === 0}
                        className="w-11 h-14 text-center text-xl font-bold font-mono glass-input rounded-xl text-white outline-none focus:border-violet-400/50 transition"
                      />
                    ))}
                  </div>
                </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setUseBackup(v => !v);
                    setError('');
                    setCode(['', '', '', '', '', '']);
                    setBackupCode('');
                  }}
                  className="w-full text-center text-sm text-violet-300 hover:text-violet-200 transition"
                >
                  {useBackup
                    ? 'Usar el código de la app'
                    : '¿No tienes el móvil? Usa un código de respaldo'}
                </button>

                {error && (
                  <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm text-center border border-rose-400/20">{error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || (useBackup ? backupCode.trim().length < 8 : code.join('').length < 6)}
                  className="relative w-full h-12 rounded-xl grad-brand text-white font-semibold tracking-wide elev-brand hover:elev-brand-hi transition-all active:scale-[0.98] overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }} />
                  <span className="relative inline-flex items-center justify-center gap-2.5">
                    {isLoading
                      ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/><path d="M21 12a9 9 0 00-9-9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>Verificando...</>
                      : 'Verificar Código'
                    }
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    set2FA(false);
                    setError('');
                    setCode(['', '', '', '', '', '']);
                    setUseBackup(false);
                    setBackupCode('');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-white/45 hover:text-white/75 transition"
                >
                  {I.arrowLeft} Volver al inicio de sesión
                </button>
              </form>
            ) : (
              /* ── Login step ── */
              <form onSubmit={handleSubmit} className="w-full max-w-[420px] mx-auto">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="absolute inset-0 grad-brand blur-2xl opacity-50 rounded-2xl" />
                    <div className="relative w-16 h-16 rounded-2xl grad-brand flex items-center justify-center text-white elev-brand-hi">
                      <span className="scale-125">{I.server}</span>
                    </div>
                  </div>
                  <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
                    <span className="text-grad-brand">StartCode</span>
                  </h1>
                  <div className="text-sm text-white/55 mt-1">Cloud Console · Acceso seguro</div>
                  {/* <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Endpoint operativo · v0.1.0
                  </div> */}
                </div>

                <div className="space-y-3.5 mt-8">
                  <div>
                    <label className="text-xs text-white/55 font-medium block mb-1.5">Correo Electrónico</label>
                    <div className="glass-input rounded-xl h-12 flex items-center gap-2.5 px-3.5">
                      <span className="text-white/45 shrink-0">{I.mail}</span>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="admin@servidor.com"
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-white/55 font-medium">Contraseña</label>
                    </div>
                    <div className="glass-input rounded-xl h-12 flex items-center gap-2.5 px-3.5">
                      <span className="text-white/45 shrink-0">{I.lock}</span>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90"
                      />
                      <button type="button" onClick={() => setShowPwd(v => !v)} className="text-white/45 hover:text-white transition shrink-0">
                        {showPwd ? I.eyeOff : I.eye}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center gap-2 text-white/65 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="chk"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      Mantener sesión iniciada
                    </label>
                    <span className="font-mono text-white/45 flex items-center gap-1.5">
                      {I.shield} <span>TLS 1.3 · E2E</span>
                    </span>
                  </div>

                  {error && (
                    <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">{error}</div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="relative w-full h-12 rounded-xl grad-brand text-white font-semibold tracking-wide elev-brand hover:elev-brand-hi transition-all active:scale-[0.98] overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }} />
                    <span className="relative inline-flex items-center justify-center gap-2.5">
                      {isLoading
                        ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/><path d="M21 12a9 9 0 00-9-9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>Autenticando...</>
                        : <>Iniciar sesión {I.arrow}</>
                      }
                    </span>
                  </button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-line" />
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">o continúa con</span>
                    <div className="flex-1 h-px bg-line" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <SsoBtn label="SSO"     icon={I.shield} />
                    <SsoBtn label="GitHub"  icon={I.github} />
                    <SsoBtn label="WebAuthn" icon={I.fingerprint} />
                  </div>
                </div>

                <div className="mt-7 text-center text-xs text-white/45">
                  ¿No tienes acceso?{' '}
                  <span className="text-violet-300 font-medium">Contacta al administrador</span>
                </div>
              </form>
            )}

            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 text-[10px] text-white/40">
              <span className="hover:text-white/70 cursor-pointer">Términos</span>
              <span>·</span>
              <span className="hover:text-white/70 cursor-pointer">Privacidad</span>
              <span>·</span>
              <span className="hover:text-white/70 cursor-pointer">Estado del servicio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
