import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';
import { ConnectionLoading } from '@components/common/ConectionLoading';
import type { ConnectionStatus } from '@components/common/ConectionLoading';
import { INSTALL_ACTIVITIES, UNINSTALL_ACTIVITIES, resolveActivities } from '@lib/agentSteps';
import {
  useAgentInstallProgress,
  useAgentState,
  useAgentTokenRotated,
  useInstallAgent,
  useRegenerateAgentToken,
  useUninstallAgent,
} from '@hooks/useAgentInstall';
import { timeAgo } from '@utils/time';
import type { AgentInstallError, AgentTokenRegenerateResult } from '@typings/agent.types';

interface AgentCardProps {
  serverId: string;
  serverName: string;
}

const STATE_BADGE: Record<string, { label: string; className: string }> = {
  installed:    { label: 'Instalado',  className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' },
  installing:   { label: 'Instalando', className: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' },
  uninstalling: { label: 'Quitando',   className: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' },
  failed:       { label: 'Error',      className: 'bg-rose-500/15 text-rose-300 ring-rose-400/20' },
  not_installed:{ label: 'Sin instalar', className: 'bg-tint-active text-white/55 ring-hairline' },
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
  const regenerateMutation = useRegenerateAgentToken();
  useAgentTokenRotated(serverId);

  /* «Regenerar token»: confirmación y resultado en su propio modal. */
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenResult, setTokenResult] = useState<AgentTokenRegenerateResult | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [action, setAction] = useState<'install' | 'uninstall' | null>(null);
  /* 'form' = pidiendo lo que haga falta antes de empezar; 'process' = trabajando. */
  const [phase, setPhase] = useState<'form' | 'process'>('form');
  const [status, setStatus] = useState<ConnectionStatus>('running');
  const [error, setError] = useState<AgentInstallError | null>(null);
  const [sudoPassword, setSudoPassword] = useState('');

  const state = agent?.state ?? 'not_installed';
  const badge = STATE_BADGE[state] ?? STATE_BADGE.not_installed;
  const busy = installMutation.isPending || uninstallMutation.isPending || regenerateMutation.isPending;

  const openToken = () => {
    setTokenResult(null);
    setTokenError(null);
    setTokenOpen(true);
  };

  const regenerate = async () => {
    setTokenError(null);
    try {
      setTokenResult(await regenerateMutation.mutateAsync({ id: serverId }));
    } catch (err: unknown) {
      const fromResponse = (err as { response?: { data?: { message?: unknown } } }).response
        ?.data?.message;
      setTokenError(
        typeof fromResponse === 'string'
          ? fromResponse
          : err instanceof Error
            ? err.message
            : 'No se pudo regenerar el token',
      );
    }
  };

  const closeToken = () => {
    if (regenerateMutation.isPending) return;
    setTokenOpen(false);
  };

  /* Sin agente conectado el token quedó revocado: el siguiente paso es reinstalar. */
  const reinstallAfterRevoke = () => {
    setTokenOpen(false);
    open('install');
  };

  /* Abrir no lanza nada: primero se pregunta la contraseña de sudo, que en la
     mayoría de servidores hace falta y antes solo aparecía tras fallar. */
  const open = (kind: 'install' | 'uninstall') => {
    setAction(kind);
    setPhase('form');
    setStatus('running');
    setError(null);
    progress.reset();
  };

  const start = () => {
    if (!action) return;
    setPhase('process');
    setStatus('running');
    setError(null);
    progress.reset();
    void run(action, sudoPassword);
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

      progress.applyResult(result.steps);

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
    setPhase('form');
    setError(null);
    setStatus('running');
    progress.reset();
  };

  const activities = resolveActivities(
    action === 'uninstall' ? UNINSTALL_ACTIVITIES : INSTALL_ACTIVITIES,
    progress.steps,
    status,
  );

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
              <span className="text-sm font-semibold text-white">Agente StartCode</span>
              <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${badge.className}`}>
                {isLoading ? '…' : badge.label}
              </span>
            </div>
            <p className="text-xs text-white/45 font-mono truncate">
              {agent?.version
                ? `${agent.version}${agent.arch ? ` · ${agent.arch}` : ''}${agent.installedAt ? ` · instalado ${timeAgo(agent.installedAt)}` : ''}${
                    agent.tokenRotating
                      ? ' · rotando token'
                      : agent.tokenIssuedAt
                        ? ` · token ${timeAgo(agent.tokenIssuedAt)}`
                        : ''
                  }`
                : 'Sin agente: este servidor no reporta métricas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => open('install')}
            disabled={busy}
            className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85
              row-hit text-sm font-medium disabled:opacity-50"
          >
            {state === 'installed' ? 'Reinstalar' : 'Instalar agente'}
          </button>
          {state === 'installed' && (
            <button
              onClick={openToken}
              disabled={busy}
              title="Regenerar token del agente"
              className="mo-tab h-9 px-3.5 rounded-xl glass-soft text-white/85 row-hit
                text-sm font-medium disabled:opacity-50"
            >
              Regenerar token
            </button>
          )}
          {state === 'installed' && (
            <button
              onClick={() => open('uninstall')}
              disabled={busy}
              className="mo-tab h-9 px-3.5 rounded-xl glass-soft text-rose-300 row-hit
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
        {phase === 'form' ? (
          /* Antes de tocar nada se pregunta lo que hace falta. */
          <div className="space-y-5">
            <p className="text-sm text-white/70 leading-relaxed">
              {action === 'uninstall'
                ? `Se parará el servicio y se borrarán el binario, la unidad de systemd y la configuración de ${serverName}.`
                : `El panel se conectará por SSH a ${serverName}, descargará el agente y lo dejará corriendo como servicio de systemd.`}
            </p>

            <div>
              <div className="text-xs text-white/55 font-medium mb-1.5">
                Contraseña de sudo <span className="text-white/35">(opcional)</span>
              </div>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={sudoPassword}
                  onChange={e => setSudoPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') start(); }}
                  placeholder="Solo si el usuario SSH no es root"
                  className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
                />
              </div>
              <p className="text-[11px] text-white/40 mt-1.5">
                Se usa para esta operación y no se guarda. Si el usuario es root o tiene sudo
                sin contraseña, déjalo vacío.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
              <button onClick={close}
                className="h-10 px-4 rounded-xl glass-soft text-white/75 hover:text-white text-sm font-medium transition">
                Cancelar
              </button>
              <button onClick={start}
                className={`h-10 px-4 rounded-xl text-white text-sm font-semibold transition ${
                  action === 'uninstall' ? 'bg-rose-500/80 hover:bg-rose-500' : 'grad-brand'
                }`}>
                {action === 'uninstall' ? 'Desinstalar agente' : 'Instalar agente'}
              </button>
            </div>
          </div>
        ) : (
        <div className="flex flex-col items-center gap-4 py-2">
          <ConnectionLoading
            status={status}
            activities={activities}
            title={
              status === 'error'
                ? 'La operación no se completó'
                : action === 'uninstall'
                  ? 'Quitando el agente'
                  : 'Instalando el agente'
            }
            subtitle={serverName}
            successTitle={action === 'uninstall' ? 'Agente desinstalado' : 'Agente instalado'}
            successSubtitle={serverName}
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
                      autoFocus
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
                  onClick={start}
                  disabled={busy}
                  className="h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium transition disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </Modal>

      <Modal
        isOpen={tokenOpen}
        onClose={closeToken}
        title={`Regenerar token del agente · ${serverName}`}
        size="sm"
      >
        {tokenResult ? (
          <div className="space-y-5">
            {tokenResult.mode === 'rotating' ? (
              <p className="text-sm text-white/70 leading-relaxed">
                Se envió un token nuevo al agente. Lo guarda en su configuración y lo confirma en
                unos segundos; el anterior deja de valer entonces, con unos minutos de margen para
                los mensajes en camino.
              </p>
            ) : (
              <div className="glass-soft rounded-xl p-4 border border-amber-400/20 space-y-1.5">
                <p className="text-sm font-semibold text-amber-300">El agente no estaba conectado</p>
                <p className="text-xs text-white/60 leading-relaxed">
                  El token quedó revocado y no hay por dónde enviarle uno nuevo. Reinstala el agente
                  para que vuelva a reportar.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
              <button onClick={closeToken}
                className="h-10 px-4 rounded-xl glass-soft text-white/75 hover:text-white text-sm font-medium transition">
                Cerrar
              </button>
              {tokenResult.mode === 'revoked' && (
                <button onClick={reinstallAfterRevoke}
                  className="h-10 px-4 rounded-xl grad-brand text-white text-sm font-semibold transition">
                  Reinstalar agente
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-white/70 leading-relaxed">
              Si el agente está conectado, recibe un token nuevo por su conexión y el actual deja de
              valer en cuanto lo confirma. Si no lo está, el token actual se revoca y tendrás que
              reinstalar el agente.
            </p>
            <p className="text-xs text-white/45 leading-relaxed">
              Úsalo si crees que el token pudo filtrarse. Quedará registrado en tus notificaciones.
            </p>

            {tokenError && (
              <div className="glass-soft rounded-xl p-3 border border-rose-400/20">
                <p className="text-xs text-rose-200/80">{tokenError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
              <button onClick={closeToken} disabled={regenerateMutation.isPending}
                className="h-10 px-4 rounded-xl glass-soft text-white/75 hover:text-white text-sm font-medium transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={() => void regenerate()} disabled={regenerateMutation.isPending}
                className="h-10 px-4 rounded-xl grad-brand text-white text-sm font-semibold transition disabled:opacity-50">
                {regenerateMutation.isPending ? 'Regenerando…' : 'Regenerar token'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
