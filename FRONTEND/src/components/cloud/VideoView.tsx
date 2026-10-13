import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RangeSlider } from '@components/common/RangeSlider';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/* En vivo, cada salto reinicia ffmpeg en la nube: los toques seguidos se juntan en uno. */
const LIVE_SEEK_DEBOUNCE_MS = 350;
const VOLUME_KEY = 'startcode.cloud.videoVolume';
/* Sin mover el ratón mientras se reproduce, los controles se apartan. */
const IDLE_MS = 2_500;

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const PlayIcon = ({ className = 'w-4 h-4' }: { className?: string }) => <svg {...sp} className={className}><path d="M7 4.5v15a1 1 0 001.5.86l12-7.5a1 1 0 000-1.72l-12-7.5A1 1 0 007 4.5z" fill="currentColor" /></svg>;
const PauseIcon = () => <svg {...sp} className="w-4 h-4"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" /></svg>;
/* ±10 s: flecha circular con el número dentro. */
const SkipIcon = ({ dir }: { dir: 'back' | 'forward' }) => (
  <svg {...sp} className="w-[18px] h-[18px]">
    {dir === 'back'
      ? <><path d="M4 12a8 8 0 108-8 8 8 0 00-5.7 2.3L4 8.5" /><path d="M4 4v4.5h4.5" /></>
      : <><path d="M20 12a8 8 0 11-8-8 8 8 0 015.7 2.3L20 8.5" /><path d="M20 4v4.5h-4.5" /></>}
    <text x="12" y="15.2" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none" fontFamily="inherit">10</text>
  </svg>
);
const ReplayIcon = ({ className = 'w-4 h-4' }: { className?: string }) => <svg {...sp} className={className}><path d="M4 12a8 8 0 108-8 8 8 0 00-5.7 2.3L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>;
const VolumeIcon = ({ level }: { level: number }) => (
  <svg {...sp} className="w-4 h-4">
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    {level === 0 ? <path d="M22 9l-6 6M16 9l6 6" /> : <>
      <path d="M15.5 8.5a5 5 0 010 7" />
      {level > 0.5 && <path d="M18.5 5.5a9 9 0 010 13" />}
    </>}
  </svg>
);
const ExpandIcon = () => <svg {...sp} className="w-4 h-4"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></svg>;
const ShrinkIcon = () => <svg {...sp} className="w-4 h-4"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" /></svg>;

/** 75 → «1:15»; con horas, «1:02:03». */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* Cada control es una pieza propia sobre el video: superficie flotante del
   tema, borde que se acentúa al pasar y, activo, el tinte de marca. */
const chip = (active: boolean) =>
  `mo-tab glass-media elev-float border rounded-full flex items-center justify-center shrink-0 transition ${active
    ? 'grad-brand-soft border-hairline-strong text-white'
    : 'border-hairline hover:border-hairline-strong text-white/80 hover:text-white'}`;

const Control = ({ label, onClick, children, active = false }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={active || undefined}
    className={`${chip(active)} w-10 h-10`}>
    {children}
  </button>
);

const savedVolume = (): number => {
  const v = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null ? v : 1;
};

/**
 * Reproductor de video de Cloud. La nube lo sirve a tramos (`Range`): empieza
 * a verse sin descargarlo entero y saltar pide solo ese punto. Controles con
 * el tema: reproducir, ±10 s, barra con lo ya cargado, tiempo, volumen,
 * velocidad y pantalla completa (la de la ventana de Tauri). Teclado: espacio o K,
 * ← → (5 s), J L (10 s), ↑ ↓ (volumen), M (silencio), F (pantalla completa).
 *
 * Con `live`, la nube re-empaqueta o convierte el video mientras se ve: no
 * admite tramos, así que saltar vuelve a pedirlo desde ese segundo
 * (`&start=`) y el tiempo que se muestra suma ese desfase. La duración la
 * da la nube (ffprobe), porque el webview no la conoce de antemano.
 */
export const VideoView = ({ src, name, live, badge, onError }: {
  src: string;
  name: string;
  live?: { duration: number | null; seek: (t: number) => Promise<number> };
  /** Etiqueta discreta arriba a la izquierda (por ejemplo, «Convertido al vuelo»). */
  badge?: string;
  onError: () => void;
}) => {
  const video = useRef<HTMLVideoElement>(null);
  /* El reproductor vive en un nodo propio que se mueve entre su hueco del lector y
     el <body> (pantalla completa). Moverlo no lo vuelve a montar: el video sigue
     sin cortarse. Dentro del modal no puede ocupar la ventana: su `.glass`
     (backdrop-filter) y su animación encierran cualquier `position: fixed`. */
  const slot = useRef<HTMLDivElement>(null);
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.className = 'h-full';
    return el;
  });
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(savedVolume);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [ended, setEnded] = useState(false);
  /* Aviso breve en el centro al saltar con el teclado o los botones («+10 s»). */
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  /* En vivo: segundo del video en el que empieza lo que se está recibiendo. */
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  /* Salto pedido y aún sin aplicar (se juntan los seguidos); y lo que marca la barra al arrastrarla. */
  const pendingSeek = useRef<number | null>(null);
  const seekTimer = useRef<number | undefined>(undefined);
  const [scrub, setScrub] = useState<number | null>(null);

  const v = () => video.current;
  const liveRef = useRef(live);
  liveRef.current = live;
  const currentSrc = live ? `${src}&start=${offset.toFixed(3)}` : src;

  const toggle = useCallback(() => {
    const el = video.current;
    if (!el) return;
    /* En vivo lo recibido empieza en el último salto: volver a ver pide desde el principio. */
    if (el.ended && liveRef.current && offsetRef.current > 0) {
      pendingSeek.current = null;
      offsetRef.current = 0;
      setOffset(0);
      setTime(0);
      return;
    }
    if (el.paused || el.ended) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const seekTo = useCallback((t: number) => {
    const el = video.current;
    const lv = liveRef.current;
    if (!el) return;
    if (!lv) {
      el.currentTime = Math.min(Math.max(0, t), el.duration || 0);
      return;
    }
    const target = Math.min(Math.max(0, t), Math.max(0, (lv.duration ?? Infinity) - 0.5));
    pendingSeek.current = target;
    setTime(target);
    setWaiting(true);
    window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(() => {
      void lv.seek(target).catch(() => target).then(start => {
        if (pendingSeek.current !== target) return;
        pendingSeek.current = null;
        offsetRef.current = start;
        setOffset(start);
        setTime(start);
      });
    }, LIVE_SEEK_DEBOUNCE_MS);
  }, []);

  const seekBy = useCallback((d: number) => {
    const el = video.current;
    if (!el) return;
    setFlash({ text: `${d > 0 ? '+' : '−'}${Math.abs(d)} s`, key: Date.now() });
    const now = pendingSeek.current ?? (liveRef.current ? offsetRef.current + el.currentTime : el.currentTime);
    seekTo(now + d);
  }, [seekTo]);
  useEffect(() => () => window.clearTimeout(seekTimer.current), []);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 650);
    return () => window.clearTimeout(t);
  }, [flash]);

  const changeVolume = useCallback((next: number) => {
    const el = video.current;
    const vol = Math.min(1, Math.max(0, next));
    if (el) { el.volume = vol; el.muted = vol === 0; }
    setVolume(vol);
    setMuted(vol === 0);
    localStorage.setItem(VOLUME_KEY, String(vol));
  }, []);

  const toggleMute = useCallback(() => {
    const el = video.current;
    if (!el) return;
    /* Quitar el silencio con el volumen a cero lo sube a la mitad. */
    if (el.muted && volume === 0) { changeVolume(0.5); return; }
    el.muted = !el.muted;
    setMuted(el.muted);
  }, [volume, changeVolume]);

  /* Pantalla completa de Tauri: la ventana pasa a pantalla completa y el
     reproductor la ocupa entera, por encima de todo. */
  const fullscreenRef = useRef(false);
  const setFullscreenMode = useCallback((on: boolean) => {
    if (fullscreenRef.current === on) return;
    fullscreenRef.current = on;
    setFullscreen(on);
    if (on) {
      host.className = 'fixed inset-0 z-[100]';
      document.body.appendChild(host);
    } else {
      host.className = 'h-full';
      slot.current?.appendChild(host);
    }
    void getCurrentWindow().setFullscreen(on).catch(() => undefined);
  }, [host]);
  const toggleFullscreen = useCallback(() => setFullscreenMode(!fullscreenRef.current), [setFullscreenMode]);

  /* El nodo entra en su hueco al montar; al cerrar el lector, sale de donde esté y la ventana vuelve a su tamaño. */
  useEffect(() => {
    slot.current?.appendChild(host);
    return () => {
      host.remove();
      if (fullscreenRef.current) void getCurrentWindow().setFullscreen(false).catch(() => undefined);
    };
  }, [host]);

  /* Escape sale de la pantalla completa sin cerrar el lector (el modal escucha en document; esto va antes). */
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setFullscreenMode(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen, setFullscreenMode]);

  /* Si se sale de pantalla completa desde el sistema (atajo o botón de la ventana), el reproductor también. */
  useEffect(() => {
    if (!fullscreen) return;
    const win = getCurrentWindow();
    let alive = true;
    const unlisten = win.onResized(() => {
      void win.isFullscreen().then(on => { if (alive && !on) setFullscreenMode(false); });
    });
    return () => { alive = false; void unlisten.then(off => off()); };
  }, [fullscreen, setFullscreenMode]);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    const el = v();
    if (el) el.playbackRate = next;
    setSpeed(next);
  };

  /* Los controles reaparecen al mover el ratón y se apartan solos al reproducir. */
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  /* Video nuevo: desde el principio, con el volumen guardado. */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.volume = volume;
    window.clearTimeout(seekTimer.current);
    pendingSeek.current = null;
    offsetRef.current = 0;
    setOffset(0); setScrub(null);
    setTime(0); setDuration(liveRef.current?.duration ?? 0); setBuffered(0); setWaiting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de video
  }, [src]);

  /* Cada fuente nueva (otro video o, en vivo, otro punto de inicio) arranca sola si el webview lo permite. */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.playbackRate = speed;
    void el.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar la fuente
  }, [currentSrc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      if (e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      /* Espacio sobre un botón ya lo pulsa: no se alterna dos veces. */
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return;
      const el = video.current;
      if (!el) return;
      switch (e.key.toLowerCase()) {
        case ' ': case 'k': toggle(); break;
        case 'arrowleft': seekBy(-5); break;
        case 'arrowright': seekBy(5); break;
        case 'j': seekBy(-10); break;
        case 'l': seekBy(10); break;
        case 'arrowup': changeVolume(el.volume + 0.1); break;
        case 'arrowdown': changeVolume(el.volume - 0.1); break;
        case 'm': toggleMute(); break;
        case 'f': toggleFullscreen(); break;
        default: return;
      }
      e.preventDefault();
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, changeVolume, toggleMute, toggleFullscreen, wake]);

  /* Hasta dónde hay datos cargados a partir del punto actual. */
  const updateBuffered = () => {
    const el = v();
    const total = live ? duration : el?.duration;
    if (!el || !total || !Number.isFinite(total)) return;
    for (let i = 0; i < el.buffered.length; i++) {
      if (el.buffered.start(i) <= el.currentTime + 0.5 && el.currentTime <= el.buffered.end(i)) {
        setBuffered((((live ? offsetRef.current : 0) + el.buffered.end(i)) / total) * 100);
        return;
      }
    }
  };

  const hideControls = playing && idle;

  const player = (
    <div onMouseMove={wake} onMouseLeave={() => playing && setIdle(true)}
      className={`relative h-full min-h-[320px] overflow-hidden select-none ${fullscreen ? 'bg-black' : 'bg-tint-sunken rounded-xl border border-line'} ${hideControls ? 'cursor-none' : ''}`}>
      <video ref={video} src={currentSrc} preload={live ? 'auto' : 'metadata'} playsInline aria-label={name}
        className="absolute inset-0 w-full h-full object-contain"
        onClick={toggle} onDoubleClick={toggleFullscreen}
        onPlay={() => { setPlaying(true); setEnded(false); wake(); }}
        onEnded={() => setEnded(true)}
        onPause={() => { setPlaying(false); setIdle(false); }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => setWaiting(false)}
        onLoadedMetadata={e => { if (!live) setDuration(e.currentTarget.duration); setWaiting(false); }}
        onDurationChange={e => { if (!live) setDuration(e.currentTarget.duration); }}
        onTimeUpdate={e => {
          if (pendingSeek.current === null) setTime(offsetRef.current + e.currentTarget.currentTime);
          updateBuffered();
        }}
        onProgress={updateBuffered}
        onVolumeChange={e => setMuted(e.currentTarget.muted)}
        onError={onError} />

      {badge && (
        <span className={`absolute top-3 left-3 text-[11px] font-medium px-3 h-7 inline-flex items-center rounded-full glass-media elev-float border border-hairline text-white/75 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
          {badge}
        </span>
      )}

      {/* Salto con teclado o botones */}
      {flash && (
        <span key={flash.key} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-5 h-11 inline-flex items-center rounded-full glass-media elev-float border border-hairline-strong text-sm font-semibold font-mono tabular-nums text-white pointer-events-none animate-fadeIn">
          {flash.text}
        </span>
      )}

      {/* Cargando o en pausa, en el centro */}
      {!flash && (waiting && playing ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full border-[3px] border-violet-400/25 border-t-violet-400 animate-spin" />
        </div>
      ) : !playing && (
        <button type="button" onClick={toggle} aria-label={ended ? 'Volver a ver' : 'Reproducir'}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full grad-brand elev-brand hover:elev-brand-hi ring-4 ring-violet-400/20 flex items-center justify-center mo-tab transition"
          style={{ color: 'var(--on-brand)' }}>
          {ended ? <ReplayIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7 translate-x-0.5" />}
        </button>
      ))}

      {/* Controles: la barra en su propia superficie y cada botón aparte */}
      <div className={`absolute inset-x-3 bottom-3 space-y-2 transition-all duration-300 ${hideControls ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
        <div className="flex items-center gap-3 px-4 h-10 rounded-full glass-media elev-float border border-hairline">
          <span className="text-xs font-mono tabular-nums text-white/90 shrink-0">{clock(scrub ?? time)}</span>
          {/* En vivo se salta al soltar: cada salto reinicia la conversión en la nube. */}
          <RangeSlider compact min={0} max={duration || 0} step="any" value={scrub ?? time} buffered={buffered} label="Posición"
            tooltip={clock}
            onChange={t => { if (live) setScrub(t); else { seekTo(t); setTime(t); } }}
            onCommit={() => { if (live && scrub !== null) { seekTo(scrub); setScrub(null); } }}
            className="flex-1 min-w-0" />
          <span className="text-xs font-mono tabular-nums text-white/45 shrink-0">{clock(duration)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={toggle} title={playing ? 'Pausar (K)' : 'Reproducir (K)'} aria-label={playing ? 'Pausar' : 'Reproducir'}
            className="mo-tab w-11 h-11 rounded-full grad-brand elev-brand-sm hover:elev-brand flex items-center justify-center shrink-0 transition"
            style={{ color: 'var(--on-brand)' }}>
            {playing ? <PauseIcon /> : ended ? <ReplayIcon /> : <PlayIcon className="w-4 h-4 translate-x-px" />}
          </button>
          <Control label="Retroceder 10 s (J)" onClick={() => seekBy(-10)}><SkipIcon dir="back" /></Control>
          <Control label="Avanzar 10 s (L)" onClick={() => seekBy(10)}><SkipIcon dir="forward" /></Control>

          {/* Volumen: el deslizador se despliega dentro de su propia pieza */}
          <div className={`group/vol ${chip(false)} h-10 px-1`}>
            <button type="button" onClick={toggleMute} title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'} aria-label={muted ? 'Activar sonido' : 'Silenciar'}
              className="w-8 h-8 rounded-full flex items-center justify-center">
              <VolumeIcon level={muted ? 0 : volume} />
            </button>
            <RangeSlider compact min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={changeVolume} label="Volumen"
              className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 group-hover/vol:mr-2 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100 group-focus-within/vol:mr-2 transition-all" />
          </div>

          <span className="flex-1" />

          <button type="button" onClick={cycleSpeed} title="Velocidad de reproducción" aria-label={`Velocidad ${speed}×`}
            className={`${chip(speed !== 1)} h-10 px-3 text-xs font-semibold font-mono tabular-nums`}>
            {speed}×
          </button>
          <Control label={fullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'} onClick={toggleFullscreen} active={fullscreen}>
            {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
          </Control>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={slot} className="h-full">
      {createPortal(player, host)}
    </div>
  );
};
