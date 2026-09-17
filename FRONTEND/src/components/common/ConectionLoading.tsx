import { useState, useEffect, useRef } from 'react';

export type ConnectionStatus = 'running' | 'success' | 'error';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface ConnectionStepDef {
  id: string;
  label: string;
  detail?: string;
}

interface ConnectionLoadingProps {
  /** 'running' mientras se trabaja, 'success' cuando el backend respondió. */
  status?: ConnectionStatus;
  /** Se dispara cuando los pasos terminaron de mostrarse. */
  onComplete?: () => void;
  /**
   * Modo dirigido: con `steps` los pasos dejan de avanzar por temporizador y
   * reflejan `progress`, que viene del trabajo real. Sin ellos el componente se
   * comporta igual que siempre, así que sus otros usos no cambian.
   */
  steps?: ConnectionStepDef[];
  progress?: Record<string, StepStatus>;
  title?: string;
  subtitle?: string;
  errorMessage?: string;
}

const DEFAULT_STEPS = [
  {
    label: 'Iniciando conexión',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20v.01"/>
      </svg>
    ),
  },
  {
    label: 'Autenticación SSH',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
  },
  {
    label: 'Conectando al servidor',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="7" rx="1.5"/>
        <rect x="3" y="13" width="18" height="7" rx="1.5"/>
        <path d="M7 7.5h.01M7 16.5h.01"/>
      </svg>
    ),
  },
  {
    label: 'Obteniendo métricas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/>
      </svg>
    ),
  },
];

const LAST = DEFAULT_STEPS.length - 1;
/** Duración mínima de cada paso; el último además espera la respuesta del backend. */
const STEP_DURATION = [900, 1100, 1100, 800];
/** Tiempo que se mantiene el estado final completo antes de avisar al padre. */
const HOLD_AFTER_SUCCESS = 900;

/** Icono genérico para los pasos que no traen uno propio. */
const GenericIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/>
  </svg>
);

export const ConnectionLoading = ({
  status = 'running',
  onComplete,
  steps: controlledSteps,
  progress,
  title,
  subtitle,
  errorMessage,
}: ConnectionLoadingProps) => {
  const controlled = Boolean(controlledSteps);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  /* Avance de los pasos previos al último (solo en modo automático) */
  useEffect(() => {
    if (controlled || status === 'error' || step >= LAST) return;
    const t = setTimeout(() => setStep(s => s + 1), STEP_DURATION[step]);
    return () => clearTimeout(t);
  }, [step, status]);

  /* El último paso solo se completa cuando el servidor ya respondió */
  useEffect(() => {
    if (controlled || finished || status !== 'success' || step < LAST) return;
    const t = setTimeout(() => setFinished(true), STEP_DURATION[LAST]);
    return () => clearTimeout(t);
  }, [status, step, finished]);

  /* Estado final visible antes de cerrar */
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => onCompleteRef.current?.(), HOLD_AFTER_SUCCESS);
    return () => clearTimeout(t);
  }, [finished]);

  /* En modo dirigido el final lo marca el backend, no un temporizador. */
  useEffect(() => {
    if (!controlled || finished || status !== 'success') return;
    setFinished(true);
  }, [controlled, finished, status]);

  /* Los pasos: los del backend si vienen, si no los cuatro de siempre. */
  const visibleSteps: ConnectionStepDef[] =
    controlledSteps ?? DEFAULT_STEPS.map((s, i) => ({ id: String(i), label: s.label }));
  const iconOf = (index: number) =>
    controlled ? GenericIcon : DEFAULT_STEPS[index]?.icon ?? GenericIcon;

  const statusOf = (definition: ConnectionStepDef, index: number): StepStatus => {
    if (controlled) return progress?.[definition.id] ?? 'pending';
    if (finished || index < step) return 'done';
    return index === step ? 'running' : 'pending';
  };

  const completedCount = visibleSteps.filter((s, i) => statusOf(s, i) === 'done').length;
  const percent = (completedCount / Math.max(1, visibleSteps.length)) * 100;
  const isError = status === 'error';

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="glass rounded-2xl grain p-7">
        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
            {finished ? (
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/60" />
            ) : (
              <div className={`absolute inset-0 rounded-full border-2 border-transparent ${
                isError ? 'border-t-rose-400 border-r-rose-400' : 'border-t-violet-400 border-r-pink-400 animate-spin'
              }`} />
            )}
            <div className={`absolute inset-0 flex items-center justify-center ${finished ? 'text-emerald-300' : 'text-white/60'}`}>
              {finished ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <rect x="3" y="4" width="18" height="7" rx="1.5"/>
                  <rect x="3" y="13" width="18" height="7" rx="1.5"/>
                  <path d="M7 7.5h.01M7 16.5h.01"/>
                </svg>
              )}
            </div>
          </div>
        </div>

        <h3 className="text-base font-semibold text-white text-center mb-1">
          {title ?? (finished ? 'Servidor conectado' : 'Conectando al Servidor')}
        </h3>
        <p className="text-xs text-white/45 text-center mb-6">
          {subtitle ?? (finished
            ? 'El servidor quedó registrado y en monitoreo'
            : 'Estableciendo conexión segura SSH')}
        </p>

        {/* Steps */}
        <div className="space-y-2.5 mb-5">
          {visibleSteps.map((definition, i) => {
            const state = statusOf(definition, i);
            const isCompleted = state === 'done';
            const isActive = state === 'running';
            const isFailed = state === 'failed';
            const isSkipped = state === 'skipped';

            return (
              <div key={definition.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-500 ${
                  isCompleted
                    ? 'bg-emerald-500/[0.07] border-emerald-400/20'
                    : isFailed
                      ? 'bg-rose-500/[0.07] border-rose-400/25'
                      : isActive
                        ? 'glass-soft border-violet-400/25'
                        : 'border-transparent opacity-40'
                }`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isCompleted ? 'text-emerald-300'
                    : isFailed ? 'text-rose-300'
                    : isActive ? 'text-violet-300'
                    : 'text-white/30'
                }`}>
                  {isCompleted ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9.5"/>
                    </svg>
                  ) : isFailed ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                  ) : (
                    iconOf(i)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <span className={`text-sm font-medium block truncate ${
                    isCompleted ? 'text-emerald-300'
                      : isFailed ? 'text-rose-300'
                      : isActive ? 'text-white'
                      : 'text-white/40'
                  }`}>
                    {definition.label}
                  </span>
                  {/* El detalle lo manda el backend: arquitectura detectada, bytes… */}
                  {definition.detail && (
                    <span className="text-[11px] text-white/45 font-mono block truncate" title={definition.detail}>
                      {definition.detail}
                    </span>
                  )}
                  {isSkipped && <span className="text-[11px] text-white/35">omitido</span>}
                </div>

                {isActive && !isError && (
                  <div className="ml-auto shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/40 border-t-violet-300 animate-spin" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-200/80 leading-relaxed mb-4">{errorMessage}</p>
        )}

        {/* Progress bar */}
        <div className="bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percent}%`, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))' }}
          />
        </div>

        <p className="text-[10px] text-white/30 text-center mt-3">Conexión cifrada SSH</p>
      </div>
    </div>
  );
};
