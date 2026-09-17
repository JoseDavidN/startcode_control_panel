import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';
import { ConnectionLoading } from '@components/common/ConectionLoading';
import type { ConnectionStatus, ConnectionStepDef } from '@components/common/ConectionLoading';
import {
  useAgentInstallProgress,
  useAgentState,
  useInstallAgent,
  useUninstallAgent,
} from '@hooks/useAgentInstall';
import { timeAgo } from '@utils/time';
import type { AgentInstallError } from '@typings/agent.types';

interface AgentCardProps {
  serverId: string;
  serverName: string;
}

const INSTALL_STEPS: ConnectionStepDef[] = [
  { id: 'ssh',        label: 'Conexión SSH' },
  { id: 'privileges', label: 'Permisos de administrador' },
  { id: 'systemd',    label: 'Comprobando systemd' },
  { id: 'arch',       label: 'Arquitectura del servidor' },
  { id: 'download',   label: 'Descargando el agente' },
  { id: 'config',     label: 'Escribiendo la configuración' },
  { id: 'service',    label: 'Instalando el servicio' },
  { id: 'verify',     label: 'Comprobando que arrancó' },
  { id: 'handshake',  label: 'Conectando con el panel' },
];

const UNINSTALL_STEPS: ConnectionStepDef[] = [
  { id: 'ssh',        label: 'Conexión SSH' },
  { id: 'privileges', label: 'Permisos de administrador' },
  { id: 'service',    label: 'Parando el servicio' },
  { id: 'files',      label: 'Borrando archivos' },
  { id: 'verify',     label: 'Comprobando que no queda nada' },
];

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  installed:    { label: 'Instalado',  className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' },
  installing:   { label: 'Instalando', className: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' },
  uninstalling: { label: 'Quitando',   className: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' },
  failed:       { label: 'Error',      className: 'bg-rose-500/15 text-rose-300 ring-rose-400/20' },
  not_installed:{ label: 'Sin instalar', className: 'bg-white/[0.06] text-white/55 ring-white/10' },
};

/**
 * Estado del agente en la máquina y acciones para instalarlo o quitarlo.
 *
 * Reutiliza el mismo componente de pasos que el alta: es el mismo trabajo, así
 * que no tiene sentido pintarlo de dos maneras distintas.
 */
export const AgentCard: React.FC<AgentCardProps> = ({ serverId, serverName }) => {
  const { data: agent, isLoading } = useAgentState(serverId);
  const installMutation = useInstallAgent();
  const uninstallMutation = useUninstallAgent();
  const progress = useAgentInstallProgress(serverId);

  const [action, setAction] = useState<'install' | 'uninstall' | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('running');
  const [error, setError] = useState<AgentInstallError | null>(null);
  const [sudoPassword, setSudoPassword] = useState('');

  const state = agent?.state ?? 'not_installed';
  const badge = STATE_BADGE[state] ?? STATE_BADGE.not_installed;
  const busy = installMutation.isPending || uninstallMutation.isPending;

  const start = (kind: 'install' | 'uninstall') => {
    setAction(kind);
    setStatus('running');
    setError(null);
    progress.reset();
    void run(kind, sudoPassword);
  };

  const run = async (kind: 'install' | 'uninstall', password: string) => {
    try {
      const result =
        kind === 'install'
          ? await installMutation.mutateAsync({
              id: serverId,
              sudoPassword: password || undefined,
              reinstall: true,
            })
          : await uninstallMutation.mutateAsync({
              id: serverId,
              sudoPassword: password || undefined,
            });

      if (result.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setError(result.error ?? { code: 'UNKNOWN', message: 'La operación no se completó' });
      }
    } catch (err: unknown) {
      setStatus('error');
      const fromResponse = (err as { response?: { data?: { message?: unknown } } }).response
        ?.data?.message;
      const message =
        typeof fromResponse === 'string'
          ? fromResponse
          : err instanceof Error
            ? err.message
            : 'La operación no se completó';
      setError({ code: 'UNKNOWN', message });
    }
  };

  const close = () => {
    setAction(null);
    setError(null);
    setStatus('running');
    progress.reset();
  };

  const steps = (action === 'uninstall' ? UNINSTALL_STEPS : INSTALL_STEPS).map(s => {
    const live = progress.steps.find(x => x.id === s.id);
    return live ? { ...s, label: live.label, detail: live.detail } : s;
  });

  return (
    <>
      <div className="glass-soft rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-violet-300 shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
              <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Agente de monitoreo</span>
              <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${badge.className}`}>
                {isLoading ? '…' : badge.label}
              </span>
            </div>
            <p className="text-xs text-white/45 font-mono truncate">
              {agent?.version
                ? `${agent.version}${agent.arch ? ` · ${agent.arch}` : ''}${agent.installedAt ? ` · instalado ${timeAgo(agent.installedAt)}` : ''}`
                : 'Sin agente: este servidor no reporta métricas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => start('install')}
            disabled={busy}
            className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85
              hover:bg-white/[0.07] text-sm font-medium disabled:opacity-50"
          >
            {state === 'installed' ? 'Reinstalar' : 'Instalar agente'}
          </button>
          {state === 'installed' && (
            <button
              onClick={() => start('uninstall')}
              disabled={busy}
              className="mo-tab h-9 px-3.5 rounded-xl glass-soft text-rose-300 hover:bg-white/[0.07]
                text-sm font-medium disabled:opacity-50"
            >
              Desinstalar
            </button>
          )}
        </div>

        {agent?.lastError && state === 'failed' && (
          <div className="w-full glass rounded-xl p-3 border border-rose-400/20">
            <p className="text-xs text-rose-200/80">{agent.lastError.message}</p>
            {agent.lastError.detail && (
              <details className="mt-1.5">
                <summary className="text-[11px] text-white/45 cursor-pointer hover:text-white/70">Ver detalle</summary>
                <pre className="mt-1.5 text-[11px] font-mono text-white/55 whitespace-pre-wrap max-h-32 overflow-y-auto scroll-thin">
                  {agent.lastError.detail}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={action !== null}
        onClose={busy ? () => {} : close}
        title={action === 'uninstall' ? `Desinstalar agente · ${serverName}` : `Instalar agente · ${serverName}`}
        size="md"
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <ConnectionLoading
            status={status}
            steps={steps}
            progress={progress.progress}
            title={
              status === 'error'
                ? 'La operación no se completó'
                : action === 'uninstall'
                  ? 'Quitando el agente'
                  : 'Instalando el agente'
            }
            subtitle={serverName}
            onComplete={close}
          />

          {error && (
            <div className="w-full max-w-sm glass-soft rounded-xl p-4 border border-rose-400/20 space-y-3">
              <p className="text-sm font-semibold text-rose-300">{error.message}</p>
              {error.detail && (
                <details>
                  <summary className="text-xs text-white/50 cursor-pointer hover:text-white/75">Ver detalle</summary>
                  <pre className="mt-2 text-[11px] font-mono text-white/60 whitespace-pre-wrap max-h-40 overflow-y-auto scroll-thin">
                    {error.detail}
                  </pre>
                </details>
              )}

              {(error.code === 'NO_SUDO' || error.code === 'SUDO_PASSWORD') && (
                <div>
                  <div className="text-xs text-white/55 font-medium mb-1.5">Contraseña de sudo</div>
                  <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                    <input
                      type="password"
                      autoComplete="off"
                      value={sudoPassword}
                      onChange={e => setSudoPassword(e.target.value)}
                      placeholder="No se guarda en ninguna parte"
                      className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button onClick={close}
                  className="h-9 px-3.5 rounded-xl glass-soft text-white/75 hover:text-white text-sm font-medium transition">
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    setStatus('running');
                    setError(null);
                    progress.reset();
                    void run(action ?? 'install', sudoPassword);
                  }}
                  disabled={busy}
                  className="h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium transition disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
