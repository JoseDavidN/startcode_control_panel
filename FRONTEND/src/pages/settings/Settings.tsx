import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';
import { useTwoFactorSetup, useTwoFactorEnable, useTwoFactorDisable } from '@hooks/useTwoFactor';
import { useAuth } from '@hooks/useAuth';
import { useUpdateProfile, useChangePassword } from '@hooks/useProfile';
import type { TwoFactorSetupResponse } from '@typings/auth.types';
import { useNotifications } from '@contexts/NotificationContext';
import type { NotifPrefs } from '@contexts/NotificationContext';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'monitoring' | 'system';

/* ── SVG base props ───────────────────────────────────────────────── */
const svg = (className = 'w-4 h-4') => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
});

/* ── Icon component ───────────────────────────────────────────────── */
const Icon = ({ name, className = 'w-4 h-4' }: { name: string; className?: string }) => {
  const p = svg(className);
  switch (name) {
    case 'user':      return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>;
    case 'bell':      return <svg {...p}><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/></svg>;
    case 'shield':    return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/></svg>;
    case 'shieldOff': return <svg {...p}><path d="M19.7 14a8.9 8.9 0 00.3-2V6l-8-3-3.5 1.3M4.7 4.7L4 5v7c0 5 3.5 8.5 8 9 2.1-.2 3.9-1.1 5.3-2.4M3 3l18 18"/></svg>;
    case 'shieldCheck':return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>;
    case 'monitor':   return <svg {...p}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>;
    case 'database':  return <svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case 'gear':      return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 01-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 01-2.8-2.9l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9L4.1 7a2 2 0 012.9-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 012.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>;
    case 'save':      return <svg {...p}><path d="M5 4h11l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M7 4v6h9V4M7 20v-6h10v6"/></svg>;
    case 'check':     return <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>;
    case 'arrowLeft': return <svg {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
    case 'mail':      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case 'key':       return <svg {...p}><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>;
    case 'eye':       return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eyeOff':    return <svg {...p}><path d="M17.9 17.9A10 10 0 0112 19c-6.5 0-10-7-10-7a18 18 0 015.1-5.9M9.9 4.2A9 9 0 0112 4c6.5 0 10 7 10 7a18 18 0 01-1.8 2.7M3 3l18 18"/></svg>;
    case 'copy':      return <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
    case 'refresh':   return <svg {...p}><path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/></svg>;
    case 'clock':     return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'alert':     return <svg {...p}><path d="M12 4L2 20h20L12 4z"/><path d="M12 10v5M12 18v.01"/></svg>;
    case 'cpu':       return <svg {...p}><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>;
    case 'ram':       return <svg {...p}><rect x="2.5" y="7" width="19" height="10" rx="1.5"/><path d="M7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2"/></svg>;
    case 'disk':      return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/><circle cx="7" cy="17" r="1"/></svg>;
    case 'terminal':  return <svg {...p}><path d="M5 7l4 5-4 5M12 17h7"/></svg>;
    case 'loader':       return <svg {...p} className={`${className} animate-spin`}><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>;
    case 'download':     return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>;
    case 'checkCircle':  return <svg {...p}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>;
    case 'alertCircle':  return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16v.01"/></svg>;
    default:             return null;
  }
};

/* ── Glass primitives ─────────────────────────────────────────────── */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass rounded-2xl relative grain ${className}`}>{children}</div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-base font-semibold text-white/90 tracking-tight">{children}</h2>
);

const GlassInput = ({
  icon, suffix, type = 'text', className = '', ...rest
}: {
  icon?: React.ReactNode; suffix?: React.ReactNode;
  type?: string; className?: string; [k: string]: any;
}) => (
  <div className={`glass-input rounded-xl h-11 flex items-center gap-2 px-3.5 transition ${className}`}>
    {icon && <span className="text-white/45 shrink-0">{icon}</span>}
    <input type={type} className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90" {...rest} />
    {suffix && <span className="text-white/45 shrink-0">{suffix}</span>}
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <div className="text-xs text-white/55 mb-1.5 font-medium">{label}</div>
    {children}
    {hint && <div className="text-xs text-white/40 mt-1.5">{hint}</div>}
  </label>
);

const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
    className={`toggle-track w-12 h-7 rounded-full relative shrink-0 border border-white/10
      ${on ? 'grad-brand shadow-[0_4px_14px_-4px_rgba(168,85,247,0.7)]' : 'bg-white/10'}`}>
    <span className={`toggle-dot absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md ${on ? 'translate-x-5' : ''}`} />
  </button>
);

const NotifRow = ({ title, desc, on, onChange, icon }: {
  title: string; desc: string; on: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode;
}) => (
  <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
    {icon && (
      <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/5 flex items-center justify-center shrink-0">
        {icon}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-white/50 mt-0.5">{desc}</div>
    </div>
    <Toggle on={on} onChange={onChange} />
  </div>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <SectionTitle>{title}</SectionTitle>
    <div className="mt-4 space-y-2.5">{children}</div>
  </div>
);

/* ── Custom range slider ──────────────────────────────────────────── */
const RangeSlider = ({
  min = 0, max = 100, value, onChange, className = '',
}: {
  min?: number; max?: number; value: number;
  onChange: (v: number) => void; className?: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`relative flex items-center ${className}`} style={{ height: 24 }}>
      {/* Track */}
      <div className="absolute left-0 right-0 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
          }}
        />
      </div>
      {/* Thumb */}
      <div
        className="absolute w-[18px] h-[18px] rounded-full pointer-events-none"
        style={{
          left: `calc(${pct}% - 9px)`,
          background: 'linear-gradient(135deg, #c084fc 0%, #f472b6 100%)',
          boxShadow: '0 0 0 4px rgba(168,85,247,0.22), 0 2px 6px rgba(0,0,0,0.5)',
          zIndex: 1,
        }}
      />
      {/* Native input invisible on top */}
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(+e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: 2 }}
      />
    </div>
  );
};

/* ── Password strength ────────────────────────────────────────────── */
const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Muy débil', color: 'bg-rose-500' };
  if (score === 2) return { score, label: 'Débil', color: 'bg-orange-400' };
  if (score === 3) return { score, label: 'Media', color: 'bg-amber-400' };
  if (score === 4) return { score, label: 'Fuerte', color: 'bg-emerald-400' };
  return { score, label: 'Muy fuerte', color: 'bg-emerald-500' };
};

/* ── Inline feedback banner ───────────────────────────────────────── */
const Feedback = ({ ok, msg }: { ok: boolean; msg: string }) => (
  <div className={`rounded-xl p-3 flex items-center gap-2 border text-xs font-medium
    ${ok
      ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
      : 'bg-rose-500/10 border-rose-400/20 text-rose-300'}`}>
    <Icon name={ok ? 'checkCircle' : 'alertCircle'} className="w-4 h-4 shrink-0" />
    {msg}
  </div>
);

/* ── Pane: Perfil ─────────────────────────────────────────────────── */
const ProfilePane = () => {
  const { user, refreshAuth } = useAuth();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  /* Profile form */
  const [firstname, setFirstname] = useState(user?.firstname ?? user?.name?.split(' ')[0] ?? '');
  const [lastname, setLastname]   = useState(user?.lastname ?? user?.name?.split(' ').slice(1).join(' ') ?? '');
  const [email, setEmail]         = useState(user?.email ?? '');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* Password form */
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [pwMsg, setPwMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const strength = passwordStrength(newPw);

  const roleLabel: Record<string, { label: string; color: string }> = {
    admin:  { label: 'Administrador', color: 'text-violet-300' },
    user:   { label: 'Usuario',       color: 'text-sky-300' },
    viewer: { label: 'Observador',    color: 'text-white/55' },
  };
  const roleInfo = roleLabel[user?.role ?? ''] ?? { label: user?.role ?? '', color: 'text-white/55' };

  const handleSaveProfile = async () => {
    setProfileMsg(null);
    try {
      await updateProfile.mutateAsync({ firstname: firstname.trim(), lastname: lastname.trim(), email: email.trim() });
      await refreshAuth();
      setProfileMsg({ ok: true, text: 'Perfil actualizado correctamente' });
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.message || 'Error al actualizar el perfil';
      setProfileMsg({ ok: false, text: msg });
    }
    setTimeout(() => setProfileMsg(null), 4000);
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Las contraseñas no coinciden' }); return; }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: 'La nueva contraseña debe tener al menos 8 caracteres' }); return; }
    try {
      await changePassword.mutateAsync({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ ok: true, text: 'Contraseña actualizada correctamente' });
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.message || 'Error al cambiar la contraseña';
      setPwMsg({ ok: false, text: msg });
    }
    setTimeout(() => setPwMsg(null), 5000);
  };

  const initials = `${firstname[0] ?? ''}${lastname[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div className="space-y-6">
      {/* ── Avatar + info ── */}
      <div className="flex items-center gap-4 pb-6 border-b border-white/[0.06]">
        <div className="w-16 h-16 rounded-2xl grad-brand flex items-center justify-center text-white text-2xl font-bold shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] shrink-0">
          {initials}
        </div>
        <div>
          <div className="text-lg font-semibold">{firstname} {lastname}</div>
          <div className="text-sm text-white/50 font-mono">{email}</div>
          <div className={`text-xs mt-1 inline-flex items-center gap-1.5 ${roleInfo.color}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {roleInfo.label}
          </div>
        </div>
      </div>

      {/* ── Two columns ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left: Información Personal */}
        <div className="space-y-5">
          <SectionTitle>Información Personal</SectionTitle>

          <Field label="Nombre *">
            <GlassInput value={firstname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstname(e.target.value)}
              placeholder="Nombre" />
          </Field>

          <Field label="Apellido *">
            <GlassInput value={lastname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastname(e.target.value)}
              placeholder="Apellido" />
          </Field>

          <Field label="Correo Electrónico *">
            <GlassInput icon={<Icon name="mail" />} type="email" value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com" />
          </Field>

          {profileMsg && <Feedback ok={profileMsg.ok} msg={profileMsg.text} />}

          <button
            onClick={handleSaveProfile}
            disabled={updateProfile.isPending}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl grad-brand text-white text-sm font-semibold shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition disabled:opacity-50"
          >
            <Icon name={updateProfile.isPending ? 'loader' : 'save'} className="w-4 h-4" />
            {updateProfile.isPending ? 'Guardando…' : 'Guardar Perfil'}
          </button>
        </div>

        {/* Right: Cambiar Contraseña */}
        <div className="space-y-5">
          <SectionTitle>Cambiar Contraseña</SectionTitle>

          <Field label="Contraseña Actual *">
            <GlassInput icon={<Icon name="key" />} type={showCurrent ? 'text' : 'password'}
              value={currentPw}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPw(e.target.value)}
              placeholder="••••••••"
              suffix={
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="text-white/50 hover:text-white transition">
                  <Icon name={showCurrent ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
          </Field>

          <Field label="Nueva Contraseña *">
            <GlassInput icon={<Icon name="key" />} type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPw(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              suffix={
                <button type="button" onClick={() => setShowNew(!showNew)} className="text-white/50 hover:text-white transition">
                  <Icon name={showNew ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
            {newPw && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-white/10'}`} />
                  ))}
                </div>
                <div className={`text-xs ${strength.score >= 4 ? 'text-emerald-400' : strength.score >= 3 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {strength.label}
                </div>
              </div>
            )}
          </Field>

          <Field label="Confirmar Nueva Contraseña *">
            <GlassInput icon={<Icon name="key" />} type="password"
              value={confirmPw}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPw(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className={confirmPw && newPw !== confirmPw ? 'border-rose-500/40' : ''}
            />
            {confirmPw && newPw !== confirmPw && (
              <div className="text-xs text-rose-400 mt-1.5">Las contraseñas no coinciden</div>
            )}
          </Field>

          {pwMsg && <Feedback ok={pwMsg.ok} msg={pwMsg.text} />}

          <button
            onClick={handleChangePassword}
            disabled={changePassword.isPending || !currentPw || !newPw || !confirmPw}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl glass-soft border border-white/10 text-white/85 hover:bg-white/[0.07] text-sm font-semibold transition disabled:opacity-40"
          >
            <Icon name={changePassword.isPending ? 'loader' : 'shield'} className="w-4 h-4" />
            {changePassword.isPending ? 'Actualizando…' : 'Cambiar Contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Badge de canal ───────────────────────────────────────────────── */
const ChannelBadge = ({ type }: { type: 'inapp' | 'native' }) =>
  type === 'native' ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      Sistema
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-400/10 border border-violet-400/20 rounded px-1.5 py-0.5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/></svg>
      In-app
    </span>
  );

/* ── NotifRow con botón de prueba ─────────────────────────────────── */
const NotifRowFull = ({
  icon, title, desc, on, onChange, channel, onTest,
}: {
  icon?: React.ReactNode; title: string; desc: string;
  on: boolean; onChange: (v: boolean) => void;
  channel: 'inapp' | 'native'; onTest?: () => void;
}) => (
  <div className="flex items-start gap-4 py-3 border-b border-white/[0.05] last:border-0">
    {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-white">{title}</span>
        <ChannelBadge type={channel} />
      </div>
      <p className="text-xs text-white/50">{desc}</p>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {on && onTest && (
        <button
          onClick={onTest}
          className="h-7 px-3 rounded-lg glass-soft text-xs text-white/65 hover:text-white hover:bg-white/[0.08] transition"
        >
          Probar
        </button>
      )}
      <Toggle on={on} onChange={onChange} />
    </div>
  </div>
);

/* ── Pane: Notificaciones ─────────────────────────────────────────── */
const NotifPane = () => {
  const { prefs, setPrefs, testToast, testNative } = useNotifications();
  const set = (key: keyof NotifPrefs) => (v: boolean) => setPrefs({ ...prefs, [key]: v });

  return (
    <div className="space-y-8">
      {/* Leyenda */}
      <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-white/[0.06]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-300 mt-0.5 shrink-0"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.01"/></svg>
        <p className="text-xs text-white/60 leading-relaxed">
          Las notificaciones <ChannelBadge type="inapp" /> aparecen como toasts dentro de la app.
          Las notificaciones <ChannelBadge type="native" /> usan el sistema operativo y se entregan
          incluso cuando la app está en segundo plano o minimizada.
        </p>
      </div>

      <Group title="Alertas de Servidores">
        <NotifRowFull
          icon={<span className="text-rose-300"><Icon name="alert" /></span>}
          title="Servidor desconectado"
          desc="Alerta cuando un servidor deje de responder al agente de monitoreo"
          on={prefs.serverOffline} onChange={set('serverOffline')}
          channel="inapp" onTest={() => testToast('serverOffline')}
        />
        <NotifRowFull
          icon={<span className="text-amber-300"><Icon name="cpu" /></span>}
          title="Uso alto de CPU"
          desc="Alerta cuando el uso de CPU supere el umbral configurado en Monitoreo"
          on={prefs.highCpuUsage} onChange={set('highCpuUsage')}
          channel="inapp" onTest={() => testToast('highCpuUsage')}
        />
        <NotifRowFull
          icon={<span className="text-sky-300"><Icon name="ram" /></span>}
          title="Uso alto de Memoria"
          desc="Alerta cuando el uso de RAM supere el umbral configurado en Monitoreo"
          on={prefs.highMemoryUsage} onChange={set('highMemoryUsage')}
          channel="inapp" onTest={() => testToast('highMemoryUsage')}
        />
        <NotifRowFull
          icon={<span className="text-violet-300"><Icon name="disk" /></span>}
          title="Uso alto de Disco"
          desc="Alerta cuando el espacio en disco supere el umbral configurado en Monitoreo"
          on={prefs.highDiskUsage} onChange={set('highDiskUsage')}
          channel="inapp" onTest={() => testToast('highDiskUsage')}
        />
      </Group>

      <Group title="Alertas de Seguridad">
        <NotifRowFull
          icon={<span className="text-emerald-300"><Icon name="shieldCheck" /></span>}
          title="Alertas de seguridad"
          desc="Intentos de acceso sospechosos y eventos críticos de seguridad. Se envían como notificación nativa del SO para garantizar visibilidad incluso fuera de la app."
          on={prefs.securityAlerts} onChange={set('securityAlerts')}
          channel="native" onTest={testNative}
        />
        {prefs.securityAlerts && (
          <div className="glass-soft rounded-xl p-3 mt-2 flex items-center gap-3 border border-amber-400/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-300 shrink-0"><path d="M12 9v4M12 17v.01"/><path d="M10.3 3.3L2 19a2 2 0 001.7 3h16.6A2 2 0 0022 19L13.7 3.3a2 2 0 00-3.4 0z"/></svg>
            <p className="text-xs text-amber-200/80">
              Activo. El SO deberá otorgar permiso de notificaciones a StartCode Panel la primera vez.
            </p>
          </div>
        )}
      </Group>

      <Group title="Otros">
        <NotifRowFull
          icon={<span className="text-fuchsia-300"><Icon name="terminal" /></span>}
          title="Reporte semanal"
          desc="Resumen de actividad enviado cada lunes a las 9:00 AM"
          on={prefs.weeklyReport} onChange={set('weeklyReport')}
          channel="inapp" onTest={() => testToast('weeklyReport')}
        />
        <NotifRowFull
          icon={<span className="text-pink-300"><Icon name="gear" /></span>}
          title="Novedades del producto"
          desc="Avisos sobre nuevas versiones y funciones de StartCode Panel"
          on={prefs.productNews} onChange={set('productNews')}
          channel="inapp" onTest={() => testToast('productNews')}
        />
      </Group>
    </div>
  );
};

/* ── Pane: Seguridad ──────────────────────────────────────────────── */
const SecurityPane = ({
  security, setSecurity,
  twoFactorEnabled, setTwoFactorEnabled,
  setupData, setSetupData,
  twoFactorCode, setTwoFactorCode,
  twoFactorMsg, twoFactorError, setTwoFactorError,
  showDisableInput, setShowDisableInput,
  disableCode, setDisableCode,
  setupMutation, enableMutation, disableMutation,
  handleSetup2FA, handleEnable2FA, handleDisable2FA,
}: any) => (
  <div className="space-y-8">
    {/* ── 2FA ── */}
    <div>
      <SectionTitle>Autenticación de dos factores (2FA)</SectionTitle>

      {twoFactorMsg && (
        <div className="mt-4 glass-soft rounded-xl p-3 text-emerald-300 text-sm flex items-center gap-2 border border-emerald-400/20">
          <Icon name="check" className="w-4 h-4 shrink-0" />{twoFactorMsg}
        </div>
      )}
      {twoFactorError && (
        <div className="mt-4 glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
          {twoFactorError}
        </div>
      )}

      {!twoFactorEnabled && !setupData && (
        <div className="glass-soft rounded-xl p-4 mt-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-400/15 flex items-center justify-center text-amber-300">
            <Icon name="shieldOff" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">2FA desactivado</div>
            <div className="text-xs text-white/55 mt-0.5">Usa Google Authenticator, Authy o cualquier app TOTP</div>
          </div>
          <button onClick={handleSetup2FA} disabled={setupMutation.isPending}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] transition disabled:opacity-50">
            <Icon name={setupMutation.isPending ? 'loader' : 'shield'} className="w-4 h-4" />
            Activar 2FA
          </button>
        </div>
      )}

      {!twoFactorEnabled && setupData && (
        <div className="glass-soft rounded-xl p-5 mt-4 space-y-4">
          <p className="text-sm text-white/70"><strong className="text-white">Paso 1:</strong> Escanea el QR con tu app autenticadora.</p>
          <div className="flex justify-center">
            <img src={setupData.qrCodeDataUrl} alt="QR 2FA" className="w-44 h-44 rounded-xl border border-white/10" />
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-black/30 border border-white/10">
            <code className="text-xs text-violet-300 font-mono flex-1 break-all">{setupData.secret}</code>
            <button onClick={() => navigator.clipboard.writeText(setupData.secret)}
              className="text-white/45 hover:text-white shrink-0" title="Copiar secreto">
              <Icon name="copy" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-white/70"><strong className="text-white">Paso 2:</strong> Ingresa el código de 6 dígitos que muestra la app.</p>
          <div className="flex gap-2">
            <div className="glass-input flex-1 rounded-xl h-12 flex items-center px-3.5">
              <input type="text" inputMode="numeric" maxLength={6} value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full bg-transparent outline-none text-center text-xl font-mono tracking-widest text-white placeholder:text-white/30" />
            </div>
            <button onClick={handleEnable2FA}
              disabled={twoFactorCode.length !== 6 || enableMutation.isPending}
              className="h-12 px-4 rounded-xl grad-brand text-white font-semibold text-sm transition disabled:opacity-50 flex items-center gap-2">
              <Icon name={enableMutation.isPending ? 'loader' : 'check'} className="w-4 h-4" />
              Confirmar
            </button>
          </div>
          <button onClick={() => { setSetupData(null); setTwoFactorCode(''); setTwoFactorError(''); }}
            className="text-sm text-white/45 hover:text-white transition">Cancelar</button>
        </div>
      )}

      {twoFactorEnabled && (
        <div className="glass-soft rounded-xl p-4 mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center text-emerald-300">
                <Icon name="shieldCheck" />
              </div>
              <div>
                <div className="text-sm font-medium">2FA activado</div>
                <div className="text-xs text-white/55 mt-0.5">Tu cuenta está protegida con TOTP</div>
              </div>
            </div>
            <button
              onClick={() => { setShowDisableInput(!showDisableInput); setDisableCode(''); setTwoFactorError(''); }}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition">
              <Icon name="shieldOff" className="w-4 h-4" />
              Desactivar
            </button>
          </div>
          {showDisableInput && (
            <div className="border-t border-white/[0.06] pt-4 space-y-3">
              <p className="text-sm text-white/70">Ingresa el código de tu app para confirmar la desactivación:</p>
              <div className="flex gap-2">
                <div className="glass-input flex-1 rounded-xl h-12 flex items-center px-3.5">
                  <input type="text" inputMode="numeric" maxLength={6} value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-transparent outline-none text-center text-xl font-mono tracking-widest text-white placeholder:text-white/30" />
                </div>
                <button onClick={handleDisable2FA}
                  disabled={disableCode.length !== 6 || disableMutation.isPending}
                  className="h-12 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white font-semibold text-sm transition disabled:opacity-50 flex items-center gap-2">
                  <Icon name={disableMutation.isPending ? 'loader' : 'shieldOff'} className="w-4 h-4" />
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── Sesión ── */}
    <div>
      <SectionTitle>Sesión</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Tiempo de inactividad" hint="Cierre automático tras inactividad">
          <div className="flex items-center gap-3">
            <GlassInput icon={<Icon name="clock" />} type="number"
              value={security.sessionTimeout}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecurity({ ...security, sessionTimeout: +e.target.value || 30 })}
              className="flex-1" />
            <span className="text-sm text-white/55 shrink-0">minutos</span>
          </div>
          <RangeSlider min={5} max={120} value={security.sessionTimeout}
            onChange={v => setSecurity({ ...security, sessionTimeout: v })}
            className="w-full mt-3" />
        </Field>
        <Field label="Expiración de contraseña" hint="0 = sin expiración">
          <div className="flex items-center gap-3">
            <GlassInput icon={<Icon name="key" />} type="number"
              value={security.passwordExpiration}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecurity({ ...security, passwordExpiration: +e.target.value || 0 })}
              className="flex-1" />
            <span className="text-sm text-white/55 shrink-0">días</span>
          </div>
          <RangeSlider min={0} max={365} value={security.passwordExpiration}
            onChange={v => setSecurity({ ...security, passwordExpiration: v })}
            className="w-full mt-3" />
        </Field>
      </div>
    </div>

    {/* ── Sesiones Activas ── */}
    <div>
      <SectionTitle>Sesiones Activas</SectionTitle>
      <div className="space-y-2.5 mt-4">
        {/* Current session */}
        <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center text-emerald-300">
            <Icon name="monitor" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Sesión actual</div>
            <div className="text-xs text-white/55 mt-0.5">Navegador actual · Activa ahora</div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20 font-medium">Activa</span>
        </div>
        {/* Other sessions */}
        <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center text-emerald-300">
            <Icon name="monitor" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">MacBook Pro · Chrome</div>
            <div className="text-xs text-white/55 mt-0.5">Bogotá, CO · hace 2 horas</div>
          </div>
          <button className="text-xs text-rose-300 hover:text-rose-200 transition">Cerrar sesión</button>
        </div>
        <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center text-emerald-300">
            <Icon name="cpu" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Servidor CI · Token API</div>
            <div className="text-xs text-white/55 mt-0.5">186.121.51.206 · expira en 30 días</div>
          </div>
          <button className="text-xs text-rose-300 hover:text-rose-200 transition">Cerrar sesión</button>
        </div>
      </div>
    </div>
  </div>
);

/* ── Pane: Monitoreo ──────────────────────────────────────────────── */
const MonitoringPane = ({
  monitoring, setMonitoring,
}: {
  monitoring: { refreshInterval: number; cpuThreshold: number; memoryThreshold: number; diskThreshold: number; retentionDays: number };
  setMonitoring: (m: any) => void;
}) => (
  <div className="space-y-8">
    <div>
      <SectionTitle>Intervalo de Actualización</SectionTitle>
      <div className="mt-4 flex items-center gap-3">
        <div className="glass-input rounded-xl h-11 flex items-center gap-2 px-3.5">
          <span className="text-white/45"><Icon name="refresh" /></span>
          <select value={monitoring.refreshInterval}
            onChange={e => setMonitoring({ ...monitoring, refreshInterval: +e.target.value })}
            className="bg-transparent outline-none text-sm text-white/90 pr-2">
            <option value={5}>5 segundos</option>
            <option value={15}>15 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
            <option value={300}>5 minutos</option>
          </select>
        </div>
        <div className="text-xs text-white/50">Con qué frecuencia se actualizan las métricas en tiempo real.</div>
      </div>
    </div>

    <div className="border-t border-white/[0.06]" />

    <div>
      <SectionTitle>Umbrales de Alerta</SectionTitle>
      <div className="space-y-5 mt-4">
        {[
          { label: 'Umbral de CPU',     key: 'cpuThreshold',    gradient: 'from-emerald-400 via-amber-400 to-rose-500' },
          { label: 'Umbral de Memoria', key: 'memoryThreshold', gradient: 'from-sky-400 via-violet-400 to-fuchsia-500' },
          { label: 'Umbral de Disco',   key: 'diskThreshold',   gradient: 'from-violet-500 via-fuchsia-500 to-rose-500' },
        ].map(({ label, key, gradient }) => {
          const val = monitoring[key as keyof typeof monitoring] as number;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/75">{label}</span>
                <span className="text-sm font-mono tabular-nums text-white">{val}%</span>
              </div>
              <RangeSlider min={10} max={100} value={val}
                onChange={v => setMonitoring({ ...monitoring, [key]: v })}
                className="w-full" />
            </div>
          );
        })}
      </div>
    </div>

    <div className="border-t border-white/[0.06]" />

    <div>
      <SectionTitle>Retención de Datos</SectionTitle>
      <div className="mt-4 flex items-center gap-3">
        <div className="glass-input rounded-xl h-11 flex items-center gap-2 px-3.5">
          <span className="text-white/45"><Icon name="database" /></span>
          <select value={monitoring.retentionDays}
            onChange={e => setMonitoring({ ...monitoring, retentionDays: +e.target.value })}
            className="bg-transparent outline-none text-sm text-white/90 pr-2">
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={365}>1 año</option>
          </select>
        </div>
        <div className="text-xs text-white/50">Tiempo que se conservan los históricos de métricas.</div>
      </div>
    </div>
  </div>
);

/* ── Pane: Sistema ────────────────────────────────────────────────── */
type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available';

const SystemPane = () => {
  const [autoUpdate, setAutoUpdate]       = useState(true);
  const [notifyUpdate, setNotifyUpdate]   = useState(true);
  const [checkStatus, setCheckStatus]     = useState<UpdateStatus>('idle');
  const [lastChecked, setLastChecked]     = useState<string | null>(null);

  const handleCheck = async () => {
    setCheckStatus('checking');
    await new Promise(r => setTimeout(r, 2200));
    setCheckStatus('uptodate');
    setLastChecked(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
  };

  const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-white/55">{label}</span>
      <span>{children}</span>
    </div>
  );

  const Mono = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm text-white/90 font-mono">{children}</span>
  );

  const Badge = ({ color, children }: { color: 'amber' | 'emerald' | 'rose' | 'violet'; children: React.ReactNode }) => {
    const map = {
      amber:   'bg-amber-500/15 text-amber-300 ring-amber-400/20',
      emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
      rose:    'bg-rose-500/15 text-rose-300 ring-rose-400/20',
      violet:  'bg-violet-500/15 text-violet-300 ring-violet-400/20',
    };
    return (
      <span className={`text-xs font-medium px-2.5 py-1 rounded-md ring-1 ${map[color]}`}>{children}</span>
    );
  };

  return (
    <div className="space-y-8">

      {/* ── Sistema + DB en la misma fila ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <SectionTitle>Información del Sistema</SectionTitle>
          <div className="glass-soft rounded-xl mt-4 divide-y divide-white/[0.04]">
            <InfoRow label="Versión"><Mono>0.1.0</Mono></InfoRow>
            <InfoRow label="Entorno"><Badge color="amber">Desarrollo</Badge></InfoRow>
            <InfoRow label="API URL"><Mono>localhost:3001</Mono></InfoRow>
            <InfoRow label="Frontend"><Mono>localhost:5173</Mono></InfoRow>
            <InfoRow label="Stack"><Mono>React · NestJS</Mono></InfoRow>
          </div>
        </div>

        <div>
          <SectionTitle>Base de Datos</SectionTitle>
          <div className="glass-soft rounded-xl mt-4 divide-y divide-white/[0.04]">
            <InfoRow label="Motor"><Mono>PostgreSQL 16</Mono></InfoRow>
            <InfoRow label="Estado"><Badge color="emerald">Conectada</Badge></InfoRow>
            <InfoRow label="Host"><Mono>localhost:5432</Mono></InfoRow>
            <InfoRow label="Base de datos"><Mono>startcode_db</Mono></InfoRow>
            <InfoRow label="ORM"><Mono>TypeORM</Mono></InfoRow>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]" />

      {/* ── Actualización ── */}
      <div>
        <SectionTitle>Actualización</SectionTitle>
        <div className="space-y-3 mt-4">

          {/* Versión actual + estado */}
          <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl grad-brand-soft border border-violet-400/20 flex items-center justify-center text-violet-300 shrink-0">
              <Icon name="download" className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Versión instalada</div>
              <div className="text-xs text-white/50 font-mono mt-0.5">
                v0.1.0
                {lastChecked && <span className="ml-3 text-white/35">Comprobado a las {lastChecked}</span>}
              </div>
            </div>
            {checkStatus === 'uptodate' && (
              <div className="flex items-center gap-1.5 text-emerald-300 shrink-0">
                <Icon name="checkCircle" className="w-4 h-4" />
                <span className="text-xs font-medium">Al día</span>
              </div>
            )}
            {checkStatus === 'available' && (
              <Badge color="violet">Actualización disponible</Badge>
            )}
          </div>

          {/* Auto-actualización */}
          <NotifRow
            icon={<span className="text-violet-300"><Icon name="refresh" /></span>}
            title="Actualizaciones automáticas"
            desc="Descargar e instalar actualizaciones en segundo plano cuando estén disponibles"
            on={autoUpdate} onChange={setAutoUpdate}
          />

          {/* Notificar actualizaciones */}
          <NotifRow
            icon={<span className="text-sky-300"><Icon name="bell" /></span>}
            title="Notificar nuevas versiones"
            desc="Mostrar un aviso cuando haya una versión más reciente disponible"
            on={notifyUpdate} onChange={setNotifyUpdate}
          />

          {/* Botón de comprobación manual */}
          <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/50 shrink-0">
              <Icon name={checkStatus === 'checking' ? 'loader' : 'refresh'} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Comprobar actualizaciones</div>
              <div className="text-xs text-white/50 mt-0.5">
                {checkStatus === 'checking'
                  ? 'Buscando actualizaciones disponibles…'
                  : checkStatus === 'uptodate'
                    ? 'Estás usando la versión más reciente'
                    : 'Comprobar si hay versiones más recientes del sistema'}
              </div>
            </div>
            <button
              onClick={handleCheck}
              disabled={checkStatus === 'checking'}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl grad-brand text-white text-xs font-semibold shadow-[0_6px_18px_-6px_rgba(168,85,247,0.55)] transition disabled:opacity-60 shrink-0"
            >
              {checkStatus === 'checking'
                ? <><Icon name="loader" className="w-3.5 h-3.5" />Comprobando…</>
                : <><Icon name="refresh" className="w-3.5 h-3.5" />Comprobar</>}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]" />

      {/* ── Acciones del sistema ── */}
      <div>
        <SectionTitle>Acciones del Sistema</SectionTitle>
        <div className="flex flex-wrap gap-3 mt-4">
          <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium transition">
            <Icon name="refresh" /> Limpiar caché
          </button>
          <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium transition">
            <Icon name="database" /> Exportar configuración
          </button>
          <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium transition">
            <Icon name="terminal" /> Ver logs
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Settings page ────────────────────────────────────────────────── */
const TABS: [SettingsTab, string, string][] = [
  ['profile',       'Perfil',         'user'],
  ['notifications', 'Notificaciones', 'bell'],
  ['security',      'Seguridad',      'shield'],
  ['monitoring',    'Monitoreo',      'monitor'],
  ['system',        'Sistema',        'database'],
];

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  useAuth();

  const [activeTab, setActiveTab]           = useState<SettingsTab>('profile');
  const [isSaving, setIsSaving]             = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState(false);

  const [twoFactorEnabled, setTF]           = useState(false);
  const [setupData, setSetupData]           = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorCode, setTFCode]          = useState('');
  const [twoFactorMsg, setTFMsg]            = useState('');
  const [twoFactorError, setTFError]        = useState('');
  const [showDisableInput, setShowDisable]  = useState(false);
  const [disableCode, setDisableCode]       = useState('');

  const setupMutation   = useTwoFactorSetup();
  const enableMutation  = useTwoFactorEnable();
  const disableMutation = useTwoFactorDisable();

  const { thresholds, setThresholds } = useNotifications();
  const [monitoring, setMonitoring] = useState({
    refreshInterval: 30,
    cpuThreshold: thresholds.cpuThreshold,
    memoryThreshold: thresholds.memoryThreshold,
    diskThreshold: thresholds.diskThreshold,
    retentionDays: 30,
  });
  const [security, setSecurity] = useState({ sessionTimeout: 30, passwordExpiration: 90 });

  const handleSave = async () => {
    setIsSaving(true);
    /* Sincroniza thresholds del panel Monitoreo al contexto de notificaciones */
    setThresholds({
      cpuThreshold: monitoring.cpuThreshold,
      memoryThreshold: monitoring.memoryThreshold,
      diskThreshold: monitoring.diskThreshold,
    });
    await new Promise(r => setTimeout(r, 1000));
    setIsSaving(false); setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSetup2FA = async () => {
    setTFError(''); setTFMsg('');
    try {
      const data = await setupMutation.mutateAsync();
      setSetupData(data); setTFCode('');
    } catch (e: any) { setTFError(e.message || 'Error al iniciar el setup de 2FA'); }
  };

  const handleEnable2FA = async () => {
    if (twoFactorCode.length !== 6) return;
    setTFError('');
    try {
      await enableMutation.mutateAsync(twoFactorCode);
      setTF(true); setSetupData(null); setTFCode('');
      setTFMsg('2FA activado correctamente');
    } catch (e: any) { setTFError(e.message || 'Código inválido'); }
  };

  const handleDisable2FA = async () => {
    if (disableCode.length !== 6) return;
    setTFError('');
    try {
      await disableMutation.mutateAsync(disableCode);
      setTF(false); setShowDisable(false); setDisableCode('');
      setTFMsg('2FA desactivado correctamente');
    } catch (e: any) { setTFError(e.message || 'Código inválido'); }
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <Card className="px-6 py-5 flex items-center gap-4">
        <button
          onClick={() => navigate(ROUTES.DASHBOARD)}
          className="w-11 h-11 rounded-xl glass-soft text-white/75 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition shrink-0"
        >
          <Icon name="arrowLeft" />
        </button>
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] shrink-0">
          <Icon name="gear" className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-sm text-white/55 mt-0.5">Administra las preferencias del sistema</p>
        </div>
        <button
          onClick={handleSave} disabled={isSaving}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition disabled:opacity-50 shrink-0"
        >
          <Icon name={isSaving ? 'loader' : saveSuccess ? 'check' : 'save'} className="w-4 h-4" />
          {isSaving ? 'Guardando…' : saveSuccess ? 'Guardado' : 'Guardar Cambios'}
        </button>
      </Card>

      {/* ── Two-column layout ── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '260px 1fr' }}>
        {/* Tabs sidebar */}
        <Card className="p-3 self-start" style={{ position: 'sticky', top: 0 }}>
          <div className="space-y-1">
            {TABS.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition
                  ${activeTab === id
                    ? 'nav-active text-white'
                    : 'text-white/65 hover:text-white hover:bg-white/[0.05]'}`}
              >
                <Icon name={icon} className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </Card>

        {/* Content pane */}
        <Card className="p-7">
          {activeTab === 'profile' && <ProfilePane />}
          {activeTab === 'notifications' && <NotifPane />}
          {activeTab === 'security' && (
            <SecurityPane
              security={security} setSecurity={setSecurity}
              twoFactorEnabled={twoFactorEnabled} setTwoFactorEnabled={setTF}
              setupData={setupData} setSetupData={setSetupData}
              twoFactorCode={twoFactorCode} setTwoFactorCode={setTFCode}
              twoFactorMsg={twoFactorMsg} twoFactorError={twoFactorError} setTwoFactorError={setTFError}
              showDisableInput={showDisableInput} setShowDisableInput={setShowDisable}
              disableCode={disableCode} setDisableCode={setDisableCode}
              setupMutation={setupMutation} enableMutation={enableMutation} disableMutation={disableMutation}
              handleSetup2FA={handleSetup2FA} handleEnable2FA={handleEnable2FA} handleDisable2FA={handleDisable2FA}
            />
          )}
          {activeTab === 'monitoring' && (
            <MonitoringPane monitoring={monitoring} setMonitoring={setMonitoring} />
          )}
          {activeTab === 'system' && <SystemPane />}
        </Card>
      </div>
    </div>
  );
};
