import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';

const TERMINAL_TEXT = '$ ERROR 404 — ruta no encontrada. Verifica la URL o vuelve al panel.';

export const NotFound = () => {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [glitch, setGlitch] = useState(false);

  /* Typing effect */
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (i <= TERMINAL_TEXT.length) { setTyped(TERMINAL_TEXT.slice(0, i)); i++; }
      else clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, []);

  /* Glitch effect */
  useEffect(() => {
    const id = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 180);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="glass rounded-2xl grain p-10 relative">

          {/* 404 number */}
          <div className="text-center mb-8">
            <div className="relative inline-block select-none">
              <span className={`text-[7rem] font-bold leading-none text-grad-brand ${glitch ? 'blur-[1px]' : ''} transition-all duration-75`}>
                404
              </span>
              {glitch && (
                <>
                  <span className="absolute inset-0 text-[7rem] font-bold leading-none text-violet-400 opacity-60"
                    style={{ transform: 'translate(-3px, 2px)' }}>404</span>
                  <span className="absolute inset-0 text-[7rem] font-bold leading-none text-pink-400 opacity-60"
                    style={{ transform: 'translate(3px, -2px)' }}>404</span>
                </>
              )}
            </div>
            <h2 className="text-xl font-semibold text-white mt-1 mb-2">Ruta no encontrada</h2>
            <p className="text-sm text-white/50">
              El recurso solicitado no existe o fue movido.
            </p>
          </div>

          {/* Terminal */}
          <div className="glass-soft rounded-xl p-4 mb-8 font-mono text-xs border border-rose-400/15">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-2 text-white/30">startcode://error</span>
            </div>
            <p className="text-rose-300 leading-relaxed">
              {typed}<span className="animate-pulse text-white/60">█</span>
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: 'Status',     value: 'Error',  icon: <path d="M12 8v4M12 16v.01"/>, circle: true },
              { label: 'Code',       value: '404',    icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/> },
              { label: 'Connection', value: 'Lost',   icon: <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20v.01"/> },
            ].map(({ label, value, icon, circle }) => (
              <div key={label} className="glass-soft rounded-xl p-3 text-center border border-white/[0.05]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 mx-auto mb-2">
                  {circle && <circle cx="12" cy="12" r="9"/>}
                  {icon}
                </svg>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl grad-brand text-white font-semibold text-sm shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M9 22V12h6v10"/>
              </svg>
              Volver al Panel
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl glass-soft text-white/80 hover:text-white hover:bg-white/[0.07] text-sm font-medium transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              Reintentar
            </button>
          </div>
        </div>

        {/* Glow */}
        <div className="mt-1 mx-auto w-2/3 h-3 blur-xl rounded-full opacity-30"
          style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }} />
      </div>
    </div>
  );
};
