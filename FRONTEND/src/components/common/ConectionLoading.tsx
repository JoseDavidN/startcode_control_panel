import { useEffect, useRef } from 'react';
import type { ResolvedActivity } from '@lib/agentSteps';

export type ConnectionStatus = 'running' | 'success' | 'error';

interface ConnectionLoadingProps {
  /** 'running' mientras se trabaja, 'success' al terminar, 'error' si algo falló. */
  status: ConnectionStatus;
  /** Actividades del proceso; solo se pinta la que está en curso. */
  activities: ResolvedActivity[];
  title?: string;
  subtitle?: string;
  successTitle?: string;
  successSubtitle?: string;
  /** Se dispara un momento después del éxito, para que se vea el visto bueno. */
  onComplete?: () => void;
}

/** Tiempo que se mantiene el estado final antes de avisar al padre. */
const HOLD_AFTER_SUCCESS = 1200;

/**
 * Pantalla de proceso: **una sola actividad a la vista**, la que está pasando.
 *
 * Una lista con todos los pasos a la vez no se lee —parece que no avanza nada—,
 * así que aquí se enseña la actividad en curso, la anterior ya resuelta en
 * pequeño, y cuánto falta. Los estados los manda quien la usa: este componente
 * no inventa progreso con temporizadores.
 */
export const ConnectionLoading = ({
  status,
  activities,
  title,
  subtitle,
  successTitle = 'Listo',
  successSubtitle,
  onComplete,
}: ConnectionLoadingProps) => {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => onCompleteRef.current?.(), HOLD_AFTER_SUCCESS);
    return () => clearTimeout(timer);
  }, [status]);

  const done = activities.filter(a => a.status === 'done').length;
  const failed = activities.find(a => a.status === 'failed');
  const running = activities.find(a => a.status === 'running');

  /* Qué se enseña en grande: lo que falló, lo que está pasando, o el final. */
  const current = failed ?? running ?? activities[activities.length - 1];
  const previous = (() => {
    const index = activities.findIndex(a => a.id === current?.id);
    for (let i = index - 1; i >= 0; i--) {
      if (activities[i].status === 'done') return activities[i];
    }
    return null;
  })();

  const isError = status === 'error' || Boolean(failed);
  const isDone = status === 'success';
  const percent = (done / Math.max(1, activities.length)) * 100;

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="glass rounded-2xl grain p-7">
        {/* Indicador */}
        <div className="flex justify-center mb-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
            {isDone ? (
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/60" />
            ) : isError ? (
              <div className="absolute inset-0 rounded-full border-2 border-rose-400/60" />
            ) : (
              <div className="absolute inset-0 rounded-full border-2 border-transparent
                border-t-violet-400 border-r-pink-400 animate-spin" />
            )}

            <div className={`absolute inset-0 flex items-center justify-center ${
              isDone ? 'text-emerald-300' : isError ? 'text-rose-300' : 'text-white/60'
            }`}>
              {isDone ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : isError ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <rect x="3" y="4" width="18" height="7" rx="1.5" />
                  <rect x="3" y="13" width="18" height="7" rx="1.5" />
                  <path d="M7 7.5h.01M7 16.5h.01" />
                </svg>
              )}
            </div>
          </div>
        </div>

        <h3 className="text-base font-semibold text-white text-center mb-1">
          {isDone ? successTitle : title ?? 'Trabajando en el servidor'}
        </h3>
        {(isDone ? successSubtitle : subtitle) && (
          <p className="text-xs text-white/45 text-center mb-5">
            {isDone ? successSubtitle : subtitle}
          </p>
        )}

        {/* Actividad en curso: una sola, la que importa ahora */}
        {!isDone && current && (
          <div className={`rounded-xl border p-3.5 mb-3 ${
            isError ? 'bg-rose-500/[0.07] border-rose-400/25' : 'glass-soft border-violet-400/25'
          }`}>
            <div className="flex items-center gap-3">
              {isError ? (
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/40 border-t-violet-300 animate-spin shrink-0" />
              )}
              <span className={`text-sm font-medium truncate ${isError ? 'text-rose-300' : 'text-white'}`}>
                {current.label}
              </span>
            </div>
            {current.detail && (
              <p className="text-[11px] text-white/45 font-mono mt-1.5 ml-6 truncate" title={current.detail}>
                {current.detail}
              </p>
            )}
          </div>
        )}

        {/* La anterior, ya resuelta: da la sensación de avance sin llenar la caja */}
        {!isDone && previous && (
          <div className="flex items-center gap-2 mb-4 ml-1 text-emerald-300/80">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-xs truncate">{previous.label}</span>
          </div>
        )}

        {/* Progreso */}
        <div className="bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${Math.max(isError ? 0 : 4, percent)}%`,
              background: isError
                ? 'linear-gradient(90deg, rgb(251 113 133), rgb(249 115 22))'
                : 'linear-gradient(90deg, var(--brand-1), var(--brand-2))',
            }}
          />
        </div>

        <p className="text-[10px] text-white/30 text-center mt-3 tabular-nums">
          {isDone
            ? `${activities.length} de ${activities.length} completadas`
            : `${done} de ${activities.length} completadas`}
        </p>
      </div>
    </div>
  );
};
