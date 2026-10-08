import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, STORAGE_KEYS } from '@utils/constants';
import {
  useTwoFactorSetup,
  useTwoFactorEnable,
  useTwoFactorDisable,
  useRegenerateBackupCodes,
} from '@hooks/useTwoFactor';
import { useSessions, useRevokeSession } from '@hooks/useSessions';
import { useAuth } from '@hooks/useAuth';
import { useUpdateProfile, useChangePassword } from '@hooks/useProfile';
import type { TwoFactorSetupResponse } from '@typings/auth.types';
import { useNotifications } from '@contexts/NotificationContext';
import { useAppearance } from '@contexts/AppearanceContext';
import { usePreferences } from '@contexts/PreferencesContext';
import type { SidebarMode, Theme, FontFamily } from '@contexts/AppearanceContext';
import type { NotifPrefs } from '@contexts/NotificationContext';
import { useSecuritySettings, passwordAgeDays } from '@hooks/useSecuritySettings';
import { useSystemInfo } from '@hooks/useSystemInfo';
import { useUpdater } from '@hooks/useUpdater';
import { ReleaseNotes } from '@components/settings/ReleaseNotes';
import { useMonitoringSettings } from '@hooks/useMonitoringSettings';
import { useServers } from '@hooks/useServers';
import { useRealtimeMetrics } from '@contexts/RealtimeMetricsContext';
import { queryClient } from '@lib/queryClient';
import { notify } from '@services/notification.service';
import { timeAgo } from '@utils/time';
import { Card } from '@components/common/Card';

type SettingsTab = 'profile' | 'appearance' | 'notifications' | 'security' | 'monitoring' | 'system';

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
    case 'globe':     return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>;
    case 'layout':    return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>;
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
    className={`toggle-track w-12 h-7 rounded-full relative shrink-0 border
      ${on ? 'grad-brand border-transparent elev-brand-sm' : 'bg-track border-hairline'}`}>
    <span className={`toggle-dot absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-[var(--knob)] shadow-md ${on ? 'translate-x-5' : ''}`} />
  </button>
);

const NotifRow = ({ title, desc, on, onChange, icon }: {
  title: string; desc: string; on: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode;
}) => (
  <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
    {icon && (
      <div className="w-9 h-9 rounded-lg bg-tint-sunken border border-hairline-soft flex items-center justify-center shrink-0">
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
      <div className="absolute left-0 right-0 h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(135deg, var(--brand-1) 0%, var(--brand-2) 100%)',
          }}
        />
      </div>
      {/* Thumb */}
      <div
        className="absolute w-[18px] h-[18px] rounded-full pointer-events-none"
        style={{
          left: `calc(${pct}% - 9px)`,
          background: 'linear-gradient(135deg, var(--brand-light-1) 0%, var(--brand-light-2) 100%)',
          boxShadow: '0 0 0 4px rgb(var(--brand-1-rgb) / 0.22), 0 2px 6px rgba(0,0,0,0.5)',
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
const passwordStrength = (pw: string): { score: number; pct: number; label: string } => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const pct = (score / 5) * 100;
  if (!pw)        return { score: 0, pct: 0, label: '' };
  if (score <= 1) return { score, pct, label: 'Muy débil' };
  if (score === 2) return { score, pct, label: 'Débil' };
  if (score === 3) return { score, pct, label: 'Media' };
  if (score === 4) return { score, pct, label: 'Fuerte' };
  return { score, pct, label: 'Muy fuerte' };
};

/* ── Requisito de contraseña ──────────────────────────────────────── */
const ReqItem = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <div className="flex items-center gap-2.5">
    <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition
      ${ok ? 'bg-emerald-500/15 border-emerald-400/25 text-emerald-300' : 'border-hairline-strong text-transparent'}`}>
      <Icon name="check" className="w-3 h-3" />
    </span>
    <span className={`text-xs transition ${ok ? 'text-white/80' : 'text-white/40'}`}>{children}</span>
  </div>
);

/* ── Barra de nivel de seguridad (colores de marca) ───────────────── */
const StrengthBar = ({ pw }: { pw: string }) => {
  const { pct, label } = passwordStrength(pw);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/45">Nivel de seguridad</span>
        <span className={`text-xs font-medium ${pw ? 'text-grad-brand' : 'text-white/30'}`}>{pw ? label : '—'}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
        <div className="h-full rounded-full grad-brand transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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

/** Botón de guardado por sección: fuerza el envío de los cambios pendientes
    del debounce de PreferencesContext y confirma el resultado. */
const SaveBar = ({ label = 'Guardar cambios' }: { label?: string }) => {
  const { flush, status } = usePreferences();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const onSave = async () => {
    setSaving(true);
    await flush();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const busy = saving || status === 'syncing';

  return (
    <div className="pt-2 flex items-center justify-end gap-3">
      {status === 'error' && (
        <span className="text-xs text-rose-300">No se pudo sincronizar — reintenta</span>
      )}
      <button
        onClick={onSave}
        disabled={busy}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-semibold elev-brand hover:elev-brand-hi transition disabled:opacity-50"
      >
        <Icon name={busy ? 'loader' : saved ? 'check' : 'save'} className="w-4 h-4" />
        {busy ? 'Guardando…' : saved ? 'Guardado' : label}
      </button>
    </div>
  );
};

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
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwMsg, setPwMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  /* Requisitos de la nueva contraseña — validados en vivo */
  const reqs = {
    length:  newPw.length >= 8,
    upper:   /[A-Z]/.test(newPw),
    digit:   /[0-9]/.test(newPw),
    special: /[^A-Za-z0-9]/.test(newPw),
    match:   newPw !== '' && newPw === confirmPw,
  };
  const reqsOk = Object.values(reqs).every(Boolean);

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
      <div className="flex items-center gap-4 pb-6 border-b border-line">
        <div className="w-16 h-16 rounded-2xl grad-brand flex items-center justify-center text-white text-2xl font-bold elev-brand shrink-0">
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

      {/* ── Sección: Información Personal ── */}
      <div className="space-y-5">
        <SectionTitle>Información Personal</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <Field label="Correo Electrónico *">
          <GlassInput icon={<Icon name="mail" />} type="email" value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com" />
        </Field>

        {profileMsg && <Feedback ok={profileMsg.ok} msg={profileMsg.text} />}

        <div className="flex justify-end">
          <button
            onClick={handleSaveProfile}
            disabled={updateProfile.isPending}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl grad-brand text-white text-sm font-semibold elev-brand hover:elev-brand-hi transition disabled:opacity-50"
          >
            <Icon name={updateProfile.isPending ? 'loader' : 'save'} className="w-4 h-4" />
            {updateProfile.isPending ? 'Guardando…' : 'Guardar Perfil'}
          </button>
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Sección: Cambiar Contraseña ── */}
      <div className="space-y-5">
        <SectionTitle>Cambiar Contraseña</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Izquierda: formulario */}
          <div className="space-y-5">
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
            </Field>

            <Field label="Confirmar Nueva Contraseña *">
              <GlassInput icon={<Icon name="key" />} type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPw(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className={confirmPw && newPw !== confirmPw ? 'border-rose-500/40' : ''}
                suffix={
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="text-white/50 hover:text-white transition">
                    <Icon name={showConfirm ? 'eyeOff' : 'eye'} />
                  </button>
                }
              />
            </Field>

            {pwMsg && <Feedback ok={pwMsg.ok} msg={pwMsg.text} />}

            <button
              onClick={handleChangePassword}
              disabled={changePassword.isPending || !currentPw || !reqsOk}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl glass-soft text-white/85 row-hit text-sm font-semibold transition disabled:opacity-40"
            >
              <Icon name={changePassword.isPending ? 'loader' : 'shield'} className="w-4 h-4" />
              {changePassword.isPending ? 'Actualizando…' : 'Cambiar Contraseña'}
            </button>
          </div>

          {/* Derecha: requisitos + nivel de seguridad */}
          <div className="glass-soft rounded-xl p-4 self-start space-y-4">
            <div className="text-xs text-white/55 font-medium">Requisitos de la nueva contraseña</div>

            <div className="space-y-2.5">
              <ReqItem ok={reqs.length}>Mínimo 8 caracteres</ReqItem>
              <ReqItem ok={reqs.upper}>Al menos una letra mayúscula</ReqItem>
              <ReqItem ok={reqs.digit}>Al menos un número</ReqItem>
              <ReqItem ok={reqs.special}>Al menos un carácter especial</ReqItem>
              <ReqItem ok={reqs.match}>Las contraseñas coinciden</ReqItem>
            </div>

            <div className="border-t border-line" />
            <StrengthBar pw={newPw} />
          </div>
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
  <div className="flex items-start gap-4 py-3 border-b border-line last:border-0">
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
          className="h-7 px-3 rounded-lg glass-soft text-xs text-white/65 hover:text-white row-hit transition"
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
      <div className="glass-soft rounded-xl p-4 flex items-start gap-3">
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

/* ── Helpers de sesión ────────────────────────────────────────────── */
/** `app`: sesión de la app de escritorio, marcada por el backend con `StartCodePanel/<versión>`. */
function parseUserAgent(ua: string): { browser: string; os: string; app: boolean } {
  const desktop = /StartCodePanel\/([\w.+-]+)/.exec(ua);
  const browser = desktop ? `App de escritorio v${desktop[1]}` :
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari' : 'Navegador';
  /* Móviles antes: el UA de iOS dice «Mac OS X» y el de Android, «Linux». */
  const os =
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Windows NT/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : 'SO desconocido';
  return { browser: desktop ? browser : `${browser} (web)`, os, app: Boolean(desktop) };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Días completos desde el último cambio de contraseña, en palabras. */
const agoDays = (days: number) => (days === 0 ? 'hoy' : `hace ${plural(days, 'día', 'días')}`);

/** Sesiones guardadas antes de normalizar la IP en el backend: `::ffff:1.2.3.4` → `1.2.3.4`. */
const displayIp = (ip: string) => (ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, '$1'));

/* ── Pane: Seguridad ──────────────────────────────────────────────── */
const SecurityPane = () => {
  const { user, logout } = useAuth();

  /* 2FA — leer estado real del usuario */
  const [tf, setTf]                     = useState(user?.twoFactorEnabled ?? false);
  const [setupData, setSetupData]       = useState<TwoFactorSetupResponse | null>(null);
  const [tfCode, setTfCode]             = useState('');
  const [disCode, setDisCode]           = useState('');
  const [disPwd, setDisPwd]             = useState('');
  const [showDis, setShowDis]           = useState(false);
  const [tfMsg, setTfMsg]               = useState('');
  const [tfErr, setTfErr]               = useState('');

  /* Códigos de respaldo: se ven una única vez, al generarlos. */
  const [backupCodes, setBackupCodes]   = useState<string[] | null>(null);
  const [showRegen, setShowRegen]       = useState(false);
  const [regenCode, setRegenCode]       = useState('');
  const [regenPwd, setRegenPwd]         = useState('');

  /* Sincronizar cuando el usuario se recarga */
  React.useEffect(() => { setTf(user?.twoFactorEnabled ?? false); }, [user?.twoFactorEnabled]);

  const setupMutation   = useTwoFactorSetup();
  const enableMutation  = useTwoFactorEnable();
  const disableMutation = useTwoFactorDisable();
  const regenMutation   = useRegenerateBackupCodes();

  const errorText = (e: unknown, fallback: string) => {
    if (typeof e === 'object' && e !== null && 'message' in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === 'string' && m.trim()) return m;
    }
    return fallback;
  };

  const copyCodes = (codes: string[]) => navigator.clipboard.writeText(codes.join('\n'));

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob(
      [`Códigos de respaldo — StartCode Panel\nCuenta: ${user?.email ?? ''}\n\n${codes.join('\n')}\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'startcode-codigos-respaldo.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSetup = async () => {
    setTfErr(''); setTfMsg('');
    try { const d = await setupMutation.mutateAsync(); setSetupData(d); setTfCode(''); }
    catch (e: unknown) { setTfErr(errorText(e, 'Error al iniciar 2FA')); }
  };

  const handleEnable = async () => {
    if (tfCode.length !== 6) return;
    setTfErr('');
    try {
      const res = await enableMutation.mutateAsync(tfCode);
      setTf(true); setSetupData(null); setTfCode('');
      setBackupCodes(res.backupCodes ?? []);
      setTfMsg('2FA activado correctamente');
    } catch (e: unknown) { setTfErr(errorText(e, 'Código inválido')); }
  };

  const handleDisable = async () => {
    if (disCode.length !== 6 || !disPwd) return;
    setTfErr('');
    try {
      await disableMutation.mutateAsync({ code: disCode, password: disPwd });
      setTf(false); setShowDis(false); setDisCode(''); setDisPwd('');
      setBackupCodes(null);
      setTfMsg('2FA desactivado correctamente');
    } catch (e: unknown) { setTfErr(errorText(e, 'Contraseña o código inválidos')); }
  };

  const handleRegenerate = async () => {
    if (regenCode.length !== 6 || !regenPwd) return;
    setTfErr('');
    try {
      const res = await regenMutation.mutateAsync({ code: regenCode, password: regenPwd });
      setBackupCodes(res.backupCodes ?? []);
      setShowRegen(false); setRegenCode(''); setRegenPwd('');
      setTfMsg('Códigos de respaldo regenerados');
    } catch (e: unknown) { setTfErr(errorText(e, 'Contraseña o código inválidos')); }
  };

  /* Configuración de sesión */
  /* A diferencia del resto de paneles, Seguridad NO guarda al vuelo: se edita
     un borrador y solo el botón lo envía. Cambiar el tiempo de inactividad sin
     querer cerraría la sesión en el acto. */
  const { settings: saved, setSettings: setSaved } = useSecuritySettings();
  const { flush } = usePreferences();
  const [sec, setSec] = useState(saved);
  const [savingSec, setSavingSec] = useState(false);
  const [savedSec, setSavedSec] = useState(false);

  /* Si llegan valores nuevos del servidor (hidratación u otra pestaña) y no hay
     nada a medio editar, el borrador los adopta. */
  const secDirty =
    sec.sessionTimeout !== saved.sessionTimeout ||
    sec.passwordExpiration !== saved.passwordExpiration;
  const dirtyRef = React.useRef(secDirty);
  dirtyRef.current = secDirty;

  React.useEffect(() => {
    if (!dirtyRef.current) setSec(saved);
  }, [saved]);

  const handleSaveSecurity = async () => {
    setSavingSec(true);
    setSaved(sec);
    await flush();
    setSavingSec(false);
    setSavedSec(true);
    setTimeout(() => setSavedSec(false), 3000);
  };
  const pwdAge = passwordAgeDays(user?.passwordChangedAt);
  const pwdExpired = sec.passwordExpiration > 0 && pwdAge !== null && pwdAge >= sec.passwordExpiration;
  const pwdWarn    = sec.passwordExpiration > 0 && pwdAge !== null && pwdAge >= sec.passwordExpiration * 0.85;

  /* Sesiones reales del servidor (con sesión única, será una) */
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions();
  const revokeSession = useRevokeSession();

  return (
    <div className="space-y-8">

      {/* ── 2FA ─────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Autenticación de dos factores (2FA)</SectionTitle>

        {tfMsg && (
          <div className="mt-4 glass-soft rounded-xl p-3 text-emerald-300 text-sm flex items-center gap-2 border border-emerald-400/20">
            <Icon name="check" className="w-4 h-4 shrink-0" />{tfMsg}
          </div>
        )}
        {tfErr && (
          <div className="mt-4 glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">{tfErr}</div>
        )}

        {!tf && !setupData && (
          <div className="glass-soft rounded-xl p-4 mt-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-400/15 flex items-center justify-center text-amber-300">
              <Icon name="shieldOff" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">2FA desactivado</div>
              <div className="text-xs text-white/55 mt-0.5">Usa Google Authenticator, Authy o cualquier app TOTP</div>
            </div>
            <button onClick={handleSetup} disabled={setupMutation.isPending}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium elev-brand transition disabled:opacity-50">
              <Icon name={setupMutation.isPending ? 'loader' : 'shield'} className="w-4 h-4" />
              Activar 2FA
            </button>
          </div>
        )}

        {!tf && setupData && (
          <div className="glass-soft rounded-xl p-5 mt-4 space-y-4">
            <p className="text-sm text-white/70"><strong className="text-white">Paso 1:</strong> Escanea el QR con tu app autenticadora.</p>
            <div className="flex justify-center">
              <img src={setupData.qrCodeDataUrl} alt="QR 2FA" className="w-44 h-44 rounded-xl border border-hairline" />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-black/30 border border-hairline">
              <code className="text-xs text-violet-300 font-mono flex-1 break-all">{setupData.secret}</code>
              <button onClick={() => navigator.clipboard.writeText(setupData.secret)}
                className="text-white/45 hover:text-white shrink-0"><Icon name="copy" className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-white/70"><strong className="text-white">Paso 2:</strong> Ingresa el código de 6 dígitos que muestra la app.</p>
            <div className="flex gap-2">
              <div className="glass-input flex-1 rounded-xl h-12 flex items-center px-3.5">
                <input type="text" inputMode="numeric" maxLength={6} value={tfCode}
                  onChange={e => setTfCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-transparent outline-none text-center text-xl font-mono tracking-widest text-white placeholder:text-white/30" />
              </div>
              <button onClick={handleEnable} disabled={tfCode.length !== 6 || enableMutation.isPending}
                className="h-12 px-4 rounded-xl grad-brand text-white font-semibold text-sm transition disabled:opacity-50 flex items-center gap-2">
                <Icon name={enableMutation.isPending ? 'loader' : 'check'} className="w-4 h-4" />Confirmar
              </button>
            </div>
            <button onClick={() => { setSetupData(null); setTfCode(''); setTfErr(''); }}
              className="text-sm text-white/45 hover:text-white transition">Cancelar</button>
          </div>
        )}

        {tf && (
          <div className="glass-soft rounded-xl p-4 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center text-emerald-300">
                  <Icon name="shieldCheck" />
                </div>
                <div>
                  <div className="text-sm font-medium">2FA activado</div>
                  <div className="text-xs text-white/55 mt-0.5">Tu cuenta está protegida con TOTP</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    Tras verificar el código, este equipo no lo vuelve a pedir durante 7 días. Cambiar la contraseña o reactivar el 2FA lo pide de nuevo.
                  </div>
                </div>
              </div>
              <button onClick={() => { setShowDis(v => !v); setDisCode(''); setDisPwd(''); setTfErr(''); }}
                className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20">
                <Icon name="shieldOff" className="w-4 h-4" />Desactivar
              </button>
            </div>

            {/* Códigos de respaldo */}
            <div className="border-t border-line pt-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Códigos de respaldo</div>
                <div className="text-xs text-white/55 mt-0.5">
                  {(user?.backupCodesRemaining ?? 0) > 0
                    ? `Te quedan ${user?.backupCodesRemaining} de 10 sin usar.`
                    : 'No te quedan códigos: regenéralos para no perder el acceso.'}
                </div>
              </div>
              <button onClick={() => { setShowRegen(v => !v); setRegenCode(''); setRegenPwd(''); setTfErr(''); }}
                className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-xs font-medium">
                <Icon name="refresh" className="w-4 h-4" />Regenerar
              </button>
            </div>

            {(user?.backupCodesRemaining ?? 0) > 0 && (user?.backupCodesRemaining ?? 0) <= 3 && (
              <div className="glass-soft rounded-xl p-3 flex items-center gap-3 border border-amber-400/20">
                <Icon name="alert" className="w-4 h-4 text-amber-300 shrink-0" />
                <p className="text-xs text-amber-200/80">
                  Quedan pocos códigos de respaldo. Regenéralos y guárdalos en un sitio seguro.
                </p>
              </div>
            )}

            {showRegen && (
              <div className="border-t border-line pt-4 space-y-3">
                <p className="text-sm text-white/70">
                  Los códigos actuales dejarán de servir. Confirma con tu contraseña y el código de la app:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <GlassInput icon={<Icon name="key" />} type="password" value={regenPwd}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegenPwd(e.target.value)}
                    placeholder="Contraseña actual" />
                  <div className="flex gap-2">
                    <div className="glass-input flex-1 rounded-xl h-11 flex items-center px-3.5">
                      <input type="text" inputMode="numeric" maxLength={6} value={regenCode}
                        onChange={e => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full bg-transparent outline-none text-center text-lg font-mono tracking-widest text-white placeholder:text-white/30" />
                    </div>
                    <button onClick={handleRegenerate}
                      disabled={regenCode.length !== 6 || !regenPwd || regenMutation.isPending}
                      className="mo-tab h-11 px-4 rounded-xl grad-brand text-white font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
                      <Icon name={regenMutation.isPending ? 'loader' : 'check'} className="w-4 h-4" />Generar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showDis && (
              <div className="border-t border-line pt-4 space-y-3">
                <p className="text-sm text-white/70">
                  Desactivar exige contraseña y código: con el móvil robado, el código solo no basta.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <GlassInput icon={<Icon name="key" />} type="password" value={disPwd}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisPwd(e.target.value)}
                    placeholder="Contraseña actual" />
                  <div className="flex gap-2">
                    <div className="glass-input flex-1 rounded-xl h-11 flex items-center px-3.5">
                      <input type="text" inputMode="numeric" maxLength={6} value={disCode}
                        onChange={e => setDisCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full bg-transparent outline-none text-center text-lg font-mono tracking-widest text-white placeholder:text-white/30" />
                    </div>
                    <button onClick={handleDisable}
                      disabled={disCode.length !== 6 || !disPwd || disableMutation.isPending}
                      className="mo-tab h-11 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
                      <Icon name={disableMutation.isPending ? 'loader' : 'shieldOff'} className="w-4 h-4" />Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Los códigos en claro solo existen aquí: el servidor guarda sus hashes. */}
        {backupCodes && (
          <div className="glass-soft rounded-xl p-5 mt-4 space-y-4 border border-amber-400/25">
            <div className="flex items-start gap-3">
              <Icon name="alert" className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold">Guarda estos códigos ahora</div>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  Es la única vez que se muestran. Cada uno sirve una sola vez y permite entrar
                  si pierdes el acceso a la app autenticadora.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {backupCodes.map(c => (
                <code key={c} className="text-center text-sm font-mono tracking-wider py-2 rounded-lg bg-black/30 border border-hairline text-violet-200">
                  {c}
                </code>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => copyCodes(backupCodes)}
                className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
                <Icon name="copy" className="w-4 h-4" />Copiar
              </button>
              <button onClick={() => downloadCodes(backupCodes)}
                className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
                <Icon name="download" className="w-4 h-4" />Descargar
              </button>
              <button onClick={() => setBackupCodes(null)}
                className="mo-tab ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium">
                <Icon name="check" className="w-4 h-4" />Ya los guardé
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sesión ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Configuración de sesión</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Field label="Tiempo de inactividad" hint={sec.sessionTimeout === 0 ? 'Desactivado (sin cierre automático)' : `Cierra sesión tras ${sec.sessionTimeout} min sin actividad`}>
            <div className="flex items-center gap-3">
              <GlassInput icon={<Icon name="clock" />} type="number"
                value={sec.sessionTimeout}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSec(s => ({ ...s, sessionTimeout: Math.max(0, +e.target.value) }))}
                className="flex-1" />
              <span className="text-sm text-white/55 shrink-0">minutos</span>
            </div>
            <RangeSlider min={0} max={120} value={sec.sessionTimeout}
              onChange={v => setSec(s => ({ ...s, sessionTimeout: v }))} className="w-full mt-3" />
          </Field>
          <Field label="Expiración de contraseña" hint={sec.passwordExpiration === 0 ? 'Sin expiración' : `Aviso tras ${sec.passwordExpiration} días sin cambiar`}>
            <div className="flex items-center gap-3">
              <GlassInput icon={<Icon name="key" />} type="number"
                value={sec.passwordExpiration}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSec(s => ({ ...s, passwordExpiration: Math.max(0, +e.target.value) }))}
                className="flex-1" />
              <span className="text-sm text-white/55 shrink-0">días</span>
            </div>
            <RangeSlider min={0} max={365} value={sec.passwordExpiration}
              onChange={v => setSec(s => ({ ...s, passwordExpiration: v }))} className="w-full mt-3" />
          </Field>
        </div>

        {/* Estado de contraseña */}
        {pwdAge !== null && sec.passwordExpiration > 0 && (
          <div className={`mt-4 glass-soft rounded-xl p-3 flex items-center gap-3 border ${pwdExpired ? 'border-rose-400/25' : pwdWarn ? 'border-amber-400/20' : 'border-emerald-400/15'}`}>
            <Icon name={pwdExpired ? 'alert' : pwdWarn ? 'alert' : 'check'}
              className={`w-4 h-4 shrink-0 ${pwdExpired ? 'text-rose-300' : pwdWarn ? 'text-amber-300' : 'text-emerald-300'}`} />
            <p className={`text-xs ${pwdExpired ? 'text-rose-200/80' : pwdWarn ? 'text-amber-200/80' : 'text-white/60'}`}>
              {pwdExpired
                ? `Contraseña expirada — fue cambiada ${agoDays(pwdAge)}. Cámbiala en la pestaña Perfil.`
                : pwdWarn
                ? `La contraseña expirará en ${plural(sec.passwordExpiration - pwdAge, 'día', 'días')}. Cambiada ${agoDays(pwdAge)}.`
                : `Contraseña al día — cambiada ${agoDays(pwdAge)}; expira en ${plural(sec.passwordExpiration - pwdAge, 'día', 'días')}.`}
            </p>
          </div>
        )}
      </div>

      <div className="pt-2 flex items-center justify-end gap-3">
        {secDirty && (
          <span className="text-xs text-amber-300 mr-auto flex items-center gap-2">
            <Icon name="alert" className="w-3.5 h-3.5" />
            Cambios sin guardar
          </span>
        )}
        <button
          onClick={() => setSec(saved)}
          disabled={!secDirty || savingSec}
          className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          onClick={() => void handleSaveSecurity()}
          disabled={!secDirty || savingSec}
          className="mo-tab inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-semibold elev-brand hover:elev-brand-hi disabled:opacity-50"
        >
          <Icon name={savingSec ? 'loader' : savedSec ? 'check' : 'save'} className="w-4 h-4" />
          {savingSec ? 'Guardando…' : savedSec ? 'Guardado' : 'Guardar cambios'}
        </button>
      </div>

      {/* ── Sesiones Activas ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Sesiones activas</SectionTitle>
          <button onClick={() => logout()}
            className="mo-tab text-xs text-rose-300 hover:text-rose-200 flex items-center gap-1.5">
            <Icon name="shieldOff" className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>

        <div className="space-y-2.5">
          {sessionsLoading && (
            <div className="glass-soft rounded-xl p-4 flex items-center gap-3 text-sm text-white/45">
              <Icon name="loader" className="w-4 h-4" />Cargando sesiones…
            </div>
          )}

          {!sessionsLoading && sessions.map(session => {
            const ua = parseUserAgent(session.userAgent ?? '');
            return (
              <div key={session.id} className="glass-soft rounded-xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border
                  ${session.current
                    ? 'bg-emerald-500/10 border-emerald-400/15 text-emerald-300'
                    : 'bg-tint-sunken border-hairline-soft text-white/50'}`}>
                  <Icon name={ua.app ? 'monitor' : 'globe'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{ua.os} · {ua.browser}</div>
                  <div className="text-xs text-white/55 mt-0.5">
                    {session.ip ? <span className="font-mono" title="IP desde la que se inició la sesión">IP {displayIp(session.ip)}</span> : 'IP desconocida'}
                    {' · activa '}{timeAgo(session.lastUsed)}
                  </div>
                </div>
                {session.current ? (
                  <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20 font-medium shrink-0">
                    Sesión actual
                  </span>
                ) : (
                  <button onClick={() => revokeSession.mutate(session.id)}
                    disabled={revokeSession.isPending}
                    className="mo-tab text-xs px-3 h-9 rounded-xl text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 disabled:opacity-50">
                    Revocar
                  </button>
                )}
              </div>
            );
          })}

          {!sessionsLoading && sessions.length === 0 && (
            <div className="glass-soft rounded-xl p-4 text-sm text-white/45">
              No hay sesiones registradas.
            </div>
          )}
        </div>

        <p className="text-xs text-white/35 mt-3">
          Solo puede haber una sesión abierta por cuenta: al entrar desde otro equipo, el anterior
          se cierra al instante. Cerrar sesión revoca sus tokens en el servidor, no solo en este equipo.
        </p>
      </div>

    </div>
  );
};

/* ── Pane: Monitoreo ──────────────────────────────────────────────── */

/* Espejo de METRICS_RETENTION_DAYS en el backend (metrics-retention.service.ts): si cambia uno, cambia el otro. */
const METRICS_RETENTION_DAYS = 30;

const MonitoringPane = () => {
  const { settings, update } = useMonitoringSettings();
  const { setThresholds } = useNotifications();
  const { data: rtData, connected: wsConnected } = useRealtimeMetrics();
  const { data: servers } = useServers();

  /* Live overview from WebSocket */
  const onlineServers = Object.values(rtData).filter(s => s.status === 'online');
  const registeredCount = servers?.length ?? 0;
  const onlineCount     = onlineServers.length;
  const offlineCount    = registeredCount - onlineCount;

  /* Persist thresholds to NotificationContext immediately on slider change */
  const handleThreshold = (key: 'cpuThreshold' | 'memoryThreshold' | 'diskThreshold', v: number) => {
    const next = { ...settings, [key]: v };
    update(next);
    setThresholds({ cpuThreshold: next.cpuThreshold, memoryThreshold: next.memoryThreshold, diskThreshold: next.diskThreshold });
  };

  return (
    <div className="space-y-8">

      {/* ── Estado en tiempo real ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Estado en Tiempo Real</SectionTitle>
          <div className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-emerald-300' : 'text-white/35'}`}>
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 glow-ok' : 'bg-white/20'}`} />
            {wsConnected ? 'WebSocket activo' : 'Sin conexión'}
          </div>
        </div>

        <div className="glass-soft rounded-xl p-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center py-2">
              <div className="text-2xl font-bold text-white">{registeredCount}</div>
              <div className="text-xs text-white/45 mt-1">Servidores registrados</div>
            </div>
            <div className="text-center py-2 border-x border-line">
              <div className={`text-2xl font-bold ${onlineCount > 0 ? 'text-emerald-300' : 'text-white/35'}`}>{onlineCount}</div>
              <div className="text-xs text-white/45 mt-1">Agentes activos</div>
            </div>
            <div className="text-center py-2">
              <div className={`text-2xl font-bold ${offlineCount > 0 ? 'text-rose-300' : 'text-white/35'}`}>{offlineCount}</div>
              <div className="text-xs text-white/45 mt-1">Sin agente / offline</div>
            </div>
          </div>
          {registeredCount === 0 && (
            <p className="text-xs text-white/35 text-center mt-3 pt-3 border-t border-line">
              Sin servidores registrados — agrega uno desde la sección Servidores
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Intervalo de actualización ── */}
      <div>
        <SectionTitle>Intervalo de Actualización</SectionTitle>
        <div className="mt-4 flex items-center gap-3">
          <div className="glass-input rounded-xl h-11 flex items-center gap-2 px-3.5">
            <span className="text-white/45"><Icon name="refresh" /></span>
            <select
              value={settings.refreshInterval}
              onChange={e => update({ refreshInterval: +e.target.value })}
              className="bg-transparent outline-none text-sm text-white/90 pr-2"
            >
              <option value={5}>5 segundos</option>
              <option value={15}>15 segundos</option>
              <option value={30}>30 segundos</option>
              <option value={60}>1 minuto</option>
              <option value={300}>5 minutos</option>
            </select>
          </div>
          <div className="text-xs text-white/45 leading-relaxed">
            Intervalo de polling HTTP. El WebSocket entrega métricas en tiempo real independientemente.
          </div>
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Umbrales de alerta ── */}
      <div>
        <SectionTitle>Umbrales de Alerta</SectionTitle>
        <p className="text-xs text-white/40 mt-1 mb-4">Se aplican a cada servidor por separado: se notifica cuando cualquiera de ellos supera el umbral.</p>
        <div className="space-y-6">
          {([
            { label: 'CPU',     key: 'cpuThreshold'    as const, icon: 'cpu' },
            { label: 'Memoria', key: 'memoryThreshold' as const, icon: 'ram' },
            { label: 'Disco',   key: 'diskThreshold'   as const, icon: 'disk' },
          ] as const).map(({ label, key, icon }) => {
            const val = settings[key];
            return (
              <div key={key} className="glass-soft rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white/55"><Icon name={icon} className="w-4 h-4" /></span>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className="text-sm font-mono tabular-nums font-semibold text-white">{val}%</span>
                </div>
                <RangeSlider min={10} max={100} value={val} onChange={v => handleThreshold(key, v)} className="w-full" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Historial de métricas: informativo, la retención la aplica el backend ── */}
      <div>
        <SectionTitle>Historial de Métricas</SectionTitle>
        <p className="text-xs text-white/40 mt-1 mb-4">
          Cada servidor guarda un punto de CPU, memoria y disco por reporte del agente. Lo usa el gráfico del dashboard.
        </p>
        <div className="glass-soft rounded-xl divide-y divide-line">
          {[
            { label: 'Datos conservados', value: `${METRICS_RETENTION_DAYS} días` },
            { label: 'Limpieza automática', value: 'Cada día a las 03:30 (hora del servidor)' },
            { label: 'Gráfico del dashboard', value: 'Últimas 24 horas' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-white/55">{label}</span>
              <span className="text-sm text-white/90 font-mono text-right">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/35 mt-3">Lo anterior a {METRICS_RETENTION_DAYS} días se elimina; el estado actual de cada servidor no se ve afectado.</p>
      </div>

      <SaveBar label="Guardar monitoreo" />
    </div>
  );
};

/* ── Pane: Sistema ────────────────────────────────────────────────── */
const SystemPane = () => {
  const { prefs } = usePreferences();
  const { data: health, isLoading, dataUpdatedAt, appVersion } = useSystemInfo();
  const updater = useUpdater();
  const [showLogs, setShowLogs] = useState(false);

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const handleClearCache = () => {
    queryClient.clear();
    const keep = new Set([STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN, STORAGE_KEYS.USER_DATA,
      'startcode:prefs']);
    Object.keys(localStorage).forEach(k => { if (!keep.has(k)) localStorage.removeItem(k); });
    notify.success('Caché limpiado', 'Se eliminaron todos los datos en caché de la aplicación');
  };

  const handleExportConfig = () => {
    const config = {
      exportDate: new Date().toISOString(),
      appVersion,
      backendVersion: health?.version,
      environment: health?.environment,
      security:      prefs.security,
      notifications: prefs.notifications,
      monitoring:    prefs.monitoring,
      appearance:    prefs.appearance,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `startcode-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success('Configuración exportada');
  };

  const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-white/55">{label}</span>
      <span>{children}</span>
    </div>
  );

  const Mono = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <span className={`text-sm text-white/90 font-mono ${className}`}>{children}</span>
  );

  const SBadge = ({ color, children }: { color: 'amber' | 'emerald' | 'rose' | 'violet'; children: React.ReactNode }) => {
    const map = {
      amber:   'bg-amber-500/15 text-amber-300 ring-amber-400/20',
      emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
      rose:    'bg-rose-500/15 text-rose-300 ring-rose-400/20',
      violet:  'bg-violet-500/15 text-violet-300 ring-violet-400/20',
    };
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-md ring-1 ${map[color]}`}>{children}</span>;
  };

  const envColor = health?.environment === 'production' ? 'emerald' : health?.environment === 'development' ? 'amber' : 'violet';
  const envLabel = health?.environment === 'production' ? 'Producción' : health?.environment === 'development' ? 'Desarrollo' : health?.environment ?? '—';

  return (
    <div className="space-y-8">

      {/* ── Sistema + DB en la misma fila ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <SectionTitle>Información del Sistema</SectionTitle>
          <div className="glass-soft rounded-xl mt-4 divide-y divide-line">
            <InfoRow label="Versión app"><Mono>{appVersion !== '—' ? `v${appVersion}` : '—'}</Mono></InfoRow>
            <InfoRow label="Versión backend"><Mono>{isLoading ? '…' : health?.version ? `v${health.version}` : '—'}</Mono></InfoRow>
            <InfoRow label="Entorno">
              {isLoading ? <Mono>…</Mono> : <SBadge color={envColor as any}>{envLabel}</SBadge>}
            </InfoRow>
          </div>
        </div>

        <div>
          <SectionTitle>Base de Datos</SectionTitle>
          <div className="glass-soft rounded-xl mt-4 divide-y divide-line">
            <InfoRow label="Motor">
              <Mono>{isLoading ? '…' : health?.database?.engine ?? 'PostgreSQL'}</Mono>
            </InfoRow>
            <InfoRow label="Estado">
              {isLoading
                ? <Mono>…</Mono>
                : health?.database?.status === 'connected'
                  ? <SBadge color="emerald">Conectada</SBadge>
                  : <SBadge color="rose">Desconectada</SBadge>}
            </InfoRow>
            <InfoRow label="Base de datos">
              <Mono>{isLoading ? '…' : health?.database?.name ?? '—'}</Mono>
            </InfoRow>
          </div>
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Actualización ── */}
      <div>
        <SectionTitle>Actualización</SectionTitle>
        <div className="space-y-3 mt-4">

          <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-400/20 flex items-center justify-center text-violet-300 shrink-0">
              <Icon name="download" className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Versión instalada</div>
              <div className="text-xs text-white/50 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{appVersion !== '—' ? `v${appVersion}` : '—'}</span>
                {lastChecked && <span className="text-white/30">· Actualizado {lastChecked}</span>}
              </div>
            </div>
            {updater.available && updater.info && (
              <SBadge color="violet">v{updater.info.version} {updater.ready ? 'lista' : 'disponible'}</SBadge>
            )}
            {!updater.available && !updater.checking && updater.info === null && (
              <div className="flex items-center gap-1.5 text-emerald-300 shrink-0 text-xs">
                <Icon name="checkCircle" className="w-4 h-4" />Al día
              </div>
            )}
          </div>

          {updater.available && updater.info && (
            <div className="glass-soft rounded-xl p-4 border border-violet-400/15 space-y-3">
              <div className="text-sm font-medium text-violet-200">Nueva versión disponible: v{updater.info.version}</div>
              {updater.info.body && <p className="text-xs text-white/55 leading-relaxed whitespace-pre-line">{updater.info.body}</p>}
              {updater.downloading ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-white/55">
                    <span>Descargando…</span><span>{updater.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-track overflow-hidden">
                    <div className="h-full grad-brand rounded-full transition-all duration-300" style={{ width: `${updater.progress}%` }} />
                  </div>
                </div>
              ) : updater.ready ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => void updater.installUpdate()}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl grad-brand text-white text-xs font-semibold elev-brand-sm transition">
                    <Icon name="refresh" className="w-3.5 h-3.5" />Reiniciar ahora
                  </button>
                  <span className="text-xs text-white/50">Descargada; se aplica al reiniciar la app.</span>
                </div>
              ) : (
                <button onClick={() => void updater.installUpdate()}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl grad-brand text-white text-xs font-semibold elev-brand-sm transition">
                  <Icon name="download" className="w-3.5 h-3.5" />Instalar actualización
                </button>
              )}
            </div>
          )}

          {updater.error && (
            <div className="glass-soft rounded-xl p-3 border border-rose-400/20 text-xs text-rose-300 flex items-center gap-2">
              <Icon name="alertCircle" className="w-4 h-4 shrink-0" />{updater.error}
            </div>
          )}

          <NotifRow
            icon={<span className="text-violet-300"><Icon name="refresh" /></span>}
            title="Actualizaciones automáticas"
            desc="Descargar las actualizaciones en segundo plano; se aplican al reiniciar la app"
            on={updater.prefs.auto} onChange={v => updater.setPref('auto', v)}
          />
          <NotifRow
            icon={<span className="text-sky-300"><Icon name="bell" /></span>}
            title="Notificar nuevas versiones"
            desc="Mostrar un aviso cuando haya una versión nueva o esté lista para aplicar"
            on={updater.prefs.notify} onChange={v => updater.setPref('notify', v)}
          />

          <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-tint-sunken border border-hairline-soft flex items-center justify-center text-white/50 shrink-0">
              <Icon name={updater.checking ? 'loader' : 'refresh'} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Comprobar actualizaciones</div>
              <div className="text-xs text-white/50 mt-0.5">
                {updater.checking ? 'Buscando actualizaciones…'
                  : updater.ready ? 'Actualización descargada, pendiente de reiniciar'
                    : updater.available ? 'Hay una actualización disponible'
                      : 'Se comprueba al abrir la app y cada 6 horas'}
              </div>
            </div>
            <button onClick={() => void updater.checkForUpdates()} disabled={updater.checking || updater.downloading || updater.ready}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl grad-brand text-white text-xs font-semibold elev-brand-sm transition disabled:opacity-60 shrink-0">
              {updater.checking
                ? <><Icon name="loader" className="w-3.5 h-3.5" />Comprobando…</>
                : <><Icon name="refresh" className="w-3.5 h-3.5" />Comprobar</>}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Novedades ── */}
      <div>
        <SectionTitle>Novedades</SectionTitle>
        <div className="mt-4">
          <ReleaseNotes installedVersion={appVersion} />
        </div>
      </div>

      <div className="border-t border-line" />

      {/* ── Acciones del sistema ── */}
      <div>
        <SectionTitle>Acciones del Sistema</SectionTitle>
        <div className="flex flex-wrap gap-3 mt-4">
          <button onClick={handleClearCache}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium transition">
            <Icon name="refresh" className="w-4 h-4" /> Limpiar caché
          </button>
          <button onClick={handleExportConfig}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium transition">
            <Icon name="database" className="w-4 h-4" /> Exportar configuración
          </button>
          <button onClick={() => setShowLogs(v => !v)}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium transition
              ${showLogs ? 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20' : 'glass-soft text-white/85 row-hit'}`}>
            <Icon name="terminal" className="w-4 h-4" /> {showLogs ? 'Ocultar estado' : 'Ver estado'}
          </button>
        </div>

        {showLogs && health && (
          <div className="mt-4 bg-black/40 rounded-xl border border-hairline overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-tint-sunken">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 glow-ok" />
              <span className="text-xs text-white/55 font-mono">sistema — estado en tiempo real</span>
              <span className="ml-auto text-xs text-white/30 font-mono">{lastChecked}</span>
            </div>
            <div className="p-4 space-y-1.5 font-mono text-xs">
              {[
                { t: 'INFO',  msg: `Backend v${health.version} — ${health.environment}` },
                { t: health.database.status === 'connected' ? 'OK' : 'ERR',
                  msg: health.database.status === 'connected'
                    ? 'PostgreSQL conectado'
                    : 'PostgreSQL desconectado' },
              ].map(({ t, msg }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`shrink-0 ${t === 'OK' ? 'text-emerald-400' : t === 'ERR' ? 'text-rose-400' : 'text-violet-400'}`}>
                    [{t.padEnd(4, ' ')}]
                  </span>
                  <span className="text-white/70">{msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Pane: Aspecto ────────────────────────────────────────────────── */
/* ── Tipografías ──────────────────────────────────────────────────────
   Las tres familias van empaquetadas (src/assets/fonts) y se declaran en
   styles/fonts.css, así que el preview puede pintarse con la familia real
   aunque no sea la activa. */
const FONT_OPTIONS: { id: FontFamily; name: string; weight: string; desc: string; stack: string }[] = [
  {
    id: 'grotesk', name: 'Space Grotesk', weight: 'Delgada',
    desc: 'Geométrica de trazo fino, con aire técnico. La más compacta de las tres.',
    stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'mono', name: 'JetBrains Mono', weight: 'Media',
    desc: 'Monoespaciada de programación: todo alineado, cifras inconfundibles.',
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'rounded', name: 'Nunito', weight: 'Gruesa',
    desc: 'Terminales redondeados y trazo grueso. La más legible a tamaño pequeño.',
    stack: "'Nunito', ui-rounded, ui-sans-serif, system-ui, sans-serif",
  },
];

const FontPreview = ({ stack }: { stack: string }) => (
  <div className="h-[104px] rounded-xl glass-soft px-3.5 py-3 flex flex-col justify-center gap-1.5 overflow-hidden"
    style={{ fontFamily: stack }}>
    <div className="text-xl font-semibold leading-none">Aa Bb Cc</div>
    <div className="text-sm text-white/70 leading-none">cpu 47% · ram 2.1 GB</div>
    <div className="text-xs text-white/45 leading-none tracking-tight">0123456789 {'{ } ( ) [ ] & @ #'}</div>
  </div>
);

/* ── Temas ────────────────────────────────────────────────────────────
   Los literales de cada tarjeta son deliberados: el preview debe mostrar
   los tres temas a la vez, no el tema activo. Deben coincidir con los
   tokens de App.css. */
type ThemeSwatch = { bg: string; panel: string; accent: string; ink: string; border: string };

const THEME_OPTIONS: { id: Theme; name: string; desc: string; sw: ThemeSwatch }[] = [
  {
    id: 'dark', name: 'Nocturno', desc: 'El tema original: violeta y rosa sobre negro profundo.',
    sw: { bg: 'radial-gradient(ellipse at 20% 0%, #2a1352 0%, #150a2e 35%, #07050d 80%)',
          panel: 'rgba(255,255,255,0.07)', accent: 'linear-gradient(135deg, #a855f7, #ec4899)',
          ink: 'rgba(255,255,255,0.85)', border: 'rgba(255,255,255,0.10)' },
  },
  {
    id: 'aurora', name: 'Aurora', desc: 'Oscuro más claro y vivo, con acentos cian y azul eléctrico.',
    sw: { bg: 'radial-gradient(ellipse at 20% 0%, #102a4d 0%, #0a1a33 35%, #050d1a 80%)',
          panel: 'rgba(255,255,255,0.10)', accent: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
          ink: 'rgba(242,249,255,0.9)', border: 'rgba(255,255,255,0.14)' },
  },
  {
    id: 'solar', name: 'Solar', desc: 'Claro, sobre blanco cálido y con acentos anaranjados.',
    sw: { bg: 'radial-gradient(ellipse at 20% 0%, #ffe8d1 0%, #fff4e8 35%, #fdfaf6 80%)',
          panel: 'rgba(255,255,255,0.85)', accent: 'linear-gradient(135deg, #f97316, #fb923c)',
          ink: 'rgba(42,26,12,0.75)', border: 'rgba(124,45,18,0.16)' },
  },
];

const ThemePreview = ({ sw }: { sw: ThemeSwatch }) => (
  <div className="h-[104px] rounded-xl overflow-hidden border p-2.5 flex gap-2"
    style={{ background: sw.bg, borderColor: sw.border }}>
    <div className="rounded-lg p-1.5 flex flex-col gap-1.5 shrink-0 w-[42px] border"
      style={{ background: sw.panel, borderColor: sw.border }}>
      <div className="w-3 h-3 rounded" style={{ background: sw.accent }} />
      {[0, 1, 2].map(i => (
        <div key={i} className="h-1.5 rounded-full" style={{ background: sw.ink, opacity: i === 0 ? 0.55 : 0.25 }} />
      ))}
    </div>
    <div className="flex-1 rounded-lg p-2 flex flex-col gap-2 border"
      style={{ background: sw.panel, borderColor: sw.border }}>
      <div className="h-1.5 w-2/3 rounded-full" style={{ background: sw.ink, opacity: 0.45 }} />
      <div className="h-2 w-full rounded-full" style={{ background: sw.accent }} />
      <div className="h-1.5 w-1/2 rounded-full" style={{ background: sw.ink, opacity: 0.25 }} />
    </div>
  </div>
);

const SidebarPreview = ({ mode }: { mode: SidebarMode }) => (
  <div className="sb-preview h-[104px] rounded-xl bg-black/25 border border-hairline p-2.5 flex gap-2">
    <div
      className="rounded-lg bg-tint-active border border-hairline-soft p-1.5 flex flex-col gap-1.5 shrink-0 overflow-hidden"
      style={{ width: mode === 'collapsed' ? 24 : 58, transition: 'width 220ms cubic-bezier(0.32,0.72,0,1)' }}
    >
      <div className="h-3 flex items-center gap-1">
        <div className="w-3 h-3 rounded grad-brand shrink-0" />
        <div className="h-1 flex-1 rounded-full bg-white/25" style={{ opacity: mode === 'expanded' ? 1 : 0 }} />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className={`h-3 rounded flex items-center gap-1 ${i === 0 ? 'grad-brand-soft' : ''}`}>
          <div className="w-3 h-3 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-sm bg-white/50" />
          </div>
          <div className="h-1 flex-1 rounded-full bg-white/20" style={{ opacity: mode === 'expanded' ? 1 : 0 }} />
        </div>
      ))}
    </div>
    <div className="flex-1 rounded-lg bg-tint-sunken border border-hairline-soft" />
  </div>
);

const SIDEBAR_OPTIONS: [SidebarMode, string, string][] = [
  ['expanded',  'Expandida', 'Íconos y etiquetas siempre visibles. Recomendado en ventanas amplias.'],
  ['collapsed', 'Compacta',  'Sólo íconos, con el nombre al pasar el cursor. Libera 170 px de ancho.'],
];

const AppearancePane = () => {
  const { theme, setTheme, font, setFont, sidebarMode, setSidebarMode, reducedMotion, setReducedMotion } = useAppearance();

  return (
    <div className="space-y-8">
      <Group title="Tema">
        <div role="radiogroup" aria-label="Tema de la aplicación" className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ id, name, desc, sw }) => {
            const selected = theme === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTheme(id)}
                className={`glass-soft rounded-xl p-3 text-left transition
                  ${selected ? 'ring-2 ring-violet-400/60 bg-tint-active' : 'row-hit'}`}
              >
                <ThemePreview sw={sw} />
                <div className="mt-3 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0
                    ${selected ? 'grad-brand border-transparent' : 'border-hairline-strong'}`}>
                    {selected && <Icon name="check" className="w-2.5 h-2.5" />}
                  </span>
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{desc}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40">
          El tema se guarda en tu cuenta y se aplica en todos tus equipos.
        </p>
      </Group>

      <Group title="Tipografía">
        <div role="radiogroup" aria-label="Tipografía de la aplicación" className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FONT_OPTIONS.map(({ id, name, weight, desc, stack }) => {
            const selected = font === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setFont(id)}
                className={`mo-tab glass-soft rounded-xl p-3 text-left
                  ${selected ? 'ring-2 ring-violet-400/60 bg-tint-active' : 'row-hit'}`}
              >
                <FontPreview stack={stack} />
                <div className="mt-3 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0
                    ${selected ? 'grad-brand border-transparent' : 'border-hairline-strong'}`}>
                    {selected && <Icon name="check" className="w-2.5 h-2.5" />}
                  </span>
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-white/40 ml-auto">{weight}</span>
                </div>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{desc}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40">
          Las tres fuentes viajan dentro de la aplicación: no se descargan de internet al abrirla.
          Las métricas y direcciones siguen en monoespaciada sea cual sea la elección.
        </p>
      </Group>

      <Group title="Barra lateral">
        <div role="radiogroup" aria-label="Modo de la barra lateral" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SIDEBAR_OPTIONS.map(([value, title, desc]) => {
            const selected = sidebarMode === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSidebarMode(value)}
                onKeyDown={e => {
                  if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    setSidebarMode(sidebarMode === 'expanded' ? 'collapsed' : 'expanded');
                  }
                }}
                className={`glass-soft rounded-xl p-3 text-left transition
                  ${selected ? 'ring-2 ring-violet-400/60 bg-tint-active' : 'row-hit'}`}
              >
                <SidebarPreview mode={value} />
                <div className="mt-3 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0
                    ${selected ? 'grad-brand border-transparent' : 'border-hairline-strong'}`}>
                    {selected && <Icon name="check" className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="text-sm font-medium">{title}</span>
                </div>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{desc}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40">
          La preferencia se guarda en tu cuenta y se aplica en todos tus equipos.
        </p>
      </Group>

      <Group title="Movimiento">
        <NotifRow
          icon={<span className="text-violet-300"><Icon name="monitor" /></span>}
          title="Reducir animaciones"
          desc="Desactiva las transiciones de la interfaz y detiene las auroras del fondo."
          on={reducedMotion}
          onChange={setReducedMotion}
        />
      </Group>
    </div>
  );
};

/* ── Settings page ────────────────────────────────────────────────── */
const TABS: [SettingsTab, string, string][] = [
  ['profile',       'Perfil',         'user'],
  ['appearance',    'Aspecto',        'layout'],
  ['notifications', 'Notificaciones', 'bell'],
  ['security',      'Seguridad',      'shield'],
  ['monitoring',    'Monitoreo',      'monitor'],
  ['system',        'Sistema',        'database'],
];

export const Settings: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="h-full min-h-0 flex flex-col gap-6">
      {/* ── Page header ── */}
      <Card className="px-6 py-5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate(ROUTES.DASHBOARD)}
          className="w-11 h-11 rounded-xl glass-soft text-white/75 hover:text-white row-hit flex items-center justify-center transition shrink-0"
        >
          <Icon name="arrowLeft" />
        </button>
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center elev-brand shrink-0">
          <Icon name="gear" className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-sm text-white/55 mt-0.5">Administra las preferencias del sistema</p>
        </div>
      </Card>

      {/* ── Two-column layout ── */}
      <div className="grid gap-5 flex-1 min-h-0" style={{ gridTemplateColumns: '260px 1fr' }}>
        {/* Tabs sidebar */}
        <Card className="p-3 self-start">
          <div className="space-y-1">
            {TABS.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`mo-tab w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium
                  ${activeTab === id
                    ? 'nav-active text-white'
                    : 'text-white/65 hover:text-white hover:bg-tint-hover'}`}
              >
                <Icon name={icon} className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </Card>

        {/* Content pane — único contenedor con scroll */}
        <Card className="min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto scroll-thin p-7">
            {/* key ⇒ React remonta al cambiar de pestaña y .mo-panel vuelve a animar */}
            <div key={activeTab} className="mo-panel">
              {activeTab === 'profile' && <ProfilePane />}
              {activeTab === 'appearance' && <AppearancePane />}
              {activeTab === 'notifications' && <NotifPane />}
              {activeTab === 'security' && <SecurityPane />}
              {activeTab === 'monitoring' && <MonitoringPane />}
              {activeTab === 'system' && <SystemPane />}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
