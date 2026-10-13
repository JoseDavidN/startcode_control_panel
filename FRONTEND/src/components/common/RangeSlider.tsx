import { useState } from 'react';

const BRAND = 'linear-gradient(90deg, var(--brand-1) 0%, var(--brand-2) 100%)';

/**
 * Deslizador de la app: visuales propios con un `<input type="range">`
 * invisible encima, para que se vea igual en todos los webviews.
 * `buffered` (0–100) pinta lo ya cargado de un video bajo lo recorrido;
 * `compact` lo adelgaza y muestra el tirador solo al pasar por encima;
 * `tooltip` muestra, al pasar por encima, el valor de ese punto (el tiempo
 * en una barra de reproducción).
 */
export const RangeSlider = ({
  min = 0, max = 100, step = 1, value, onChange, onCommit, buffered, compact = false, tooltip, label, className = '',
}: {
  min?: number; max?: number; step?: number | 'any'; value: number;
  onChange: (v: number) => void;
  /** Al soltar el tirador (por ejemplo, para saltar en un video una sola vez). */
  onCommit?: () => void;
  buffered?: number;
  compact?: boolean;
  tooltip?: (v: number) => string;
  label?: string;
  className?: string;
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const thumb = compact ? 14 : 18;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tooltip) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return (
    <div className={`group/slider relative flex items-center ${className}`} style={{ height: compact ? 16 : 24 }}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {/* Track */}
      <div className={`absolute left-0 right-0 rounded-full overflow-hidden ${compact ? 'h-1 group-hover/slider:h-1.5 transition-[height]' : 'h-1.5'}`} style={{ background: 'var(--track)' }}>
        {buffered !== undefined && (
          <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, buffered))}%`, background: 'rgb(var(--brand-1-rgb) / 0.28)' }} />
        )}
        {/* Hasta donde apunta el ratón, más suave que lo recorrido */}
        {hover !== null && hover * 100 > pct && (
          <div className="absolute inset-y-0 rounded-full" style={{ left: `${pct}%`, width: `${hover * 100 - pct}%`, background: 'rgb(var(--brand-2-rgb) / 0.22)' }} />
        )}
        {/* Filled portion: el gradiente ocupa toda la pista y se recorta, así el color sigue la posición */}
        <div className="absolute inset-0 rounded-full"
          style={{ background: BRAND, clipPath: `inset(0 ${100 - pct}% 0 0 round 999px)` }} />
      </div>
      {/* Thumb */}
      <div
        className={`absolute rounded-full pointer-events-none ${compact ? 'opacity-0 scale-75 group-hover/slider:opacity-100 group-hover/slider:scale-100 group-focus-within/slider:opacity-100 group-focus-within/slider:scale-100 transition' : ''}`}
        style={{
          width: thumb, height: thumb,
          left: `calc(${pct}% - ${thumb / 2}px)`,
          background: 'linear-gradient(135deg, var(--brand-light-1) 0%, var(--brand-light-2) 100%)',
          boxShadow: '0 0 0 4px rgb(var(--brand-1-rgb) / 0.22), 0 0 12px rgb(var(--brand-2-rgb) / 0.55), 0 2px 6px rgba(0,0,0,0.5)',
          zIndex: 1,
        }}
      />
      {tooltip && hover !== null && max > min && (
        <span className="absolute bottom-full mb-2 -translate-x-1/2 px-2 py-0.5 rounded-md glass-float elev-float border border-hairline text-[11px] font-mono tabular-nums text-white/90 pointer-events-none whitespace-nowrap"
          style={{ left: `${hover * 100}%`, zIndex: 3 }}>
          {tooltip(min + hover * (max - min))}
        </span>
      )}
      {/* Native input invisible on top */}
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => onChange(+e.target.value)}
        onPointerUp={onCommit} onKeyUp={onCommit}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: 2 }}
      />
    </div>
  );
};
