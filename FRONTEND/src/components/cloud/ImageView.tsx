import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const STEP = 1.25;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ZoomOutIcon = () => <svg {...sp} className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></svg>;
const ZoomInIcon = () => <svg {...sp} className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6M11 8v6" /></svg>;
const FitIcon = () => <svg {...sp} className="w-4 h-4"><path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" /></svg>;
const ChevronIcon = ({ dir }: { dir: 'left' | 'right' }) => <svg {...sp} className="w-5 h-5"><path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>;

const ToolButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
    className="mo-tab w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-tint-hover flex items-center justify-center disabled:opacity-35">
    {children}
  </button>
);

/**
 * Imagen del lector de Cloud. Empieza ajustada a la ventana (sin agrandar las
 * pequeñas). Rueda: zoom hacia el puntero. Arrastrar: mover cuando no cabe.
 * Doble clic: alterna entre ajustada y tamaño real. Teclas + − 0 y 1.
 * Con `onPrev`/`onNext`, flechas para pasar por las imágenes de la carpeta.
 */
export const ImageView = ({ src, name, position, onPrev, onNext, onError }: {
  src: string;
  name: string;
  /** «3 / 12» entre las imágenes de la carpeta; sin él no hay navegación. */
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  onError: () => void;
}) => {
  const frame = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState(1);
  /* null: ajustada a la ventana (sigue al tamaño del lector). */
  const [zoom, setZoom] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const scale = zoom ?? fit;

  /* Escala que hace caber la imagen; se recalcula si cambia el tamaño del lector. */
  useEffect(() => {
    const el = frame.current;
    if (!el || !natural) return;
    const update = () => setFit(Math.min(1, el.clientWidth / natural.w, el.clientHeight / natural.h));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  /* Imagen nueva: vuelve a ajustada y centrada. */
  useEffect(() => {
    setNatural(null);
    setZoom(null);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  /** Zoom manteniendo fijo el punto `at` (relativo al centro del marco). */
  const zoomTo = useCallback((next: number, at = { x: 0, y: 0 }) => {
    const s2 = clamp(next, MIN_SCALE, MAX_SCALE);
    setOffset(o => ({ x: at.x - (at.x - o.x) * (s2 / scale), y: at.y - (at.y - o.y) * (s2 / scale) }));
    setZoom(s2);
  }, [scale]);

  const reset = useCallback(() => { setZoom(null); setOffset({ x: 0, y: 0 }); }, []);

  /* La rueda no debe desplazar el modal: listener no pasivo para poder cancelarla. */
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '+' || e.key === '=') zoomTo(scale * STEP);
      else if (e.key === '-') zoomTo(scale / STEP);
      else if (e.key === '0') reset();
      else if (e.key === '1') zoomTo(1);
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scale, zoomTo, reset, onPrev, onNext]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || zoom === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const navButton = 'mo-tab absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl glass-float elev-float border border-hairline text-white/75 hover:text-white flex items-center justify-center';

  return (
    <div className="relative h-full min-h-[320px] rounded-xl border border-line bg-tint-sunken overflow-hidden select-none">
      <div ref={frame}
        className={`absolute inset-0 ${zoom === null ? 'cursor-zoom-in' : dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onDoubleClick={e => {
          if (zoom !== null) { reset(); return; }
          const r = e.currentTarget.getBoundingClientRect();
          zoomTo(Math.max(1, fit * 2), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
        }}>
        <img src={src} alt={name} draggable={false}
          onLoad={e => setNatural({ w: e.currentTarget.naturalWidth || 800, h: e.currentTarget.naturalHeight || 600 })}
          onError={onError}
          style={natural ? {
            width: natural.w, height: natural.h, maxWidth: 'none',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          } : { visibility: 'hidden' }}
          className={`absolute left-1/2 top-1/2 origin-center ${dragging ? '' : 'transition-transform duration-100'}`} />
      </div>

      {onPrev && <button type="button" onClick={onPrev} aria-label="Imagen anterior" title="Anterior (←)" className={`${navButton} left-3`}><ChevronIcon dir="left" /></button>}
      {onNext && <button type="button" onClick={onNext} aria-label="Imagen siguiente" title="Siguiente (→)" className={`${navButton} right-3`}><ChevronIcon dir="right" /></button>}

      {/* Barra de zoom */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1 rounded-xl glass-float elev-float border border-hairline">
        <ToolButton label="Alejar (−)" onClick={() => zoomTo(scale / STEP)} disabled={scale <= MIN_SCALE}><ZoomOutIcon /></ToolButton>
        <button type="button" onClick={() => zoomTo(1)} title="Tamaño real (1)"
          className="mo-tab h-8 min-w-[56px] px-2 rounded-lg text-xs font-mono tabular-nums text-white/75 hover:text-white hover:bg-tint-hover">
          {Math.round(scale * 100)}%
        </button>
        <ToolButton label="Acercar (+)" onClick={() => zoomTo(scale * STEP)} disabled={scale >= MAX_SCALE}><ZoomInIcon /></ToolButton>
        <span className="w-px h-5 bg-line mx-1" />
        <ToolButton label="Ajustar a la ventana (0)" onClick={reset} disabled={zoom === null}><FitIcon /></ToolButton>
        {(natural || position) && (
          <span className="px-2 text-[11px] text-white/45 font-mono tabular-nums whitespace-nowrap">
            {natural && `${natural.w} × ${natural.h}`}
            {natural && position && <span className="text-white/20"> · </span>}
            {position && `${position.index + 1} / ${position.total}`}
          </span>
        )}
      </div>
    </div>
  );
};
