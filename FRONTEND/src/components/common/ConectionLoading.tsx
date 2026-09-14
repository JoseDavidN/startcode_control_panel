import { useState, useEffect } from 'react';

const steps = [
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

export const ConnectionLoading = () => {
  const [completed, setCompleted] = useState<number[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timings = [1200, 2800, 4400, 6000];
    const timers = timings.map((delay, i) =>
      setTimeout(() => {
        setActive(i);
        if (i > 0) setCompleted(prev => [...prev, i - 1]);
      }, delay)
    );
    const done = setTimeout(() => setCompleted(prev => [...prev, 3]), 7200);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, []);

  const progress = (completed.length / steps.length) * 100;

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="glass rounded-2xl grain p-7">
        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 border-r-pink-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <rect x="3" y="4" width="18" height="7" rx="1.5"/>
                <rect x="3" y="13" width="18" height="7" rx="1.5"/>
                <path d="M7 7.5h.01M7 16.5h.01"/>
              </svg>
            </div>
          </div>
        </div>

        <h3 className="text-base font-semibold text-white text-center mb-1">Conectando al Servidor</h3>
        <p className="text-xs text-white/45 text-center mb-6">Estableciendo conexión segura SSH</p>

        {/* Steps */}
        <div className="space-y-2.5 mb-5">
          {steps.map((step, i) => {
            const isCompleted = completed.includes(i);
            const isActive = active === i && !isCompleted;
            return (
              <div key={i}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-500 ${
                  isCompleted
                    ? 'bg-emerald-500/[0.07] border-emerald-400/20'
                    : isActive
                      ? 'glass-soft border-violet-400/25'
                      : 'border-transparent opacity-40'
                }`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isCompleted ? 'text-emerald-300' : isActive ? 'text-violet-300' : 'text-white/30'
                }`}>
                  {isCompleted
                    ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9.5"/>
                      </svg>
                    )
                    : step.icon
                  }
                </div>
                <span className={`text-sm font-medium ${isCompleted ? 'text-emerald-300' : isActive ? 'text-white' : 'text-white/40'}`}>
                  {step.label}
                </span>
                {isActive && (
                  <div className="ml-auto shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/40 border-t-violet-300 animate-spin" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))' }}
          />
        </div>

        <p className="text-[10px] text-white/30 text-center mt-3">Conexión cifrada SSH</p>
      </div>
    </div>
  );
};
