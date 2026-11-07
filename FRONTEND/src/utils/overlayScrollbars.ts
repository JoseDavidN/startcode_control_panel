/**
 * Barras de desplazamiento propias para toda la app.
 *
 * WebKit (el webview de Tauri en Linux y macOS) pone siempre la flecha sobre
 * una barra nativa e ignora `cursor`, y dentro de un textarea a veces la
 * I de escritura. Por eso las nativas de `.scroll-thin`, `.scroll-area` y
 * `.modal-scroll` se ocultan en App.css y aquí se dibujan otras, en una capa
 * fija encima de todo: con la manito para agarrar, más visibles y más
 * gruesas al pasar el mouse.
 *
 * Rendimiento: un solo gestor en DOM, sin React. Escucha `pointerover` y
 * `scroll` (en captura) en el documento, no en cada elemento. Solo se
 * dibujan las barras de la zona bajo el mouse o que se está desplazando, y
 * la posición del thumb se mueve con `transform` dentro de un
 * `requestAnimationFrame`. Al salir de la zona, la barra se desvanece y se
 * suelta.
 */

const SELECTOR = '.scroll-thin, .scroll-area, .modal-scroll';
const MIN_THUMB = 28;
const INSET = 2;
/* Ancho de la zona que se puede agarrar; el thumb visible es más fino. */
const HIT = 12;
const HIDE_AFTER_LEAVE = 700;
const HIDE_AFTER_SCROLL = 1200;
/* Comprobación de tamaño del contenido mientras está activa (filas que llegan, texto pegado). */
const CONTENT_CHECK = 500;

type Axis = 'y' | 'x';

interface Bar {
  axis: Axis;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  /* Geometría del último dibujo, para el arrastre. */
  trackLen: number;
  thumbLen: number;
}

interface Active {
  el: HTMLElement;
  bars: Partial<Record<Axis, Bar>>;
  hovered: boolean;
  hideTimer?: number;
  lastSize: string;
  /** z-index de sus barras: por encima de su zona y por debajo de lo que flota sobre ella. */
  z: number;
}

/* Lo mínimo para quedar sobre cabeceras fijas de tablas (z-20) y bajo modales (z-50). */
const MIN_Z = 40;

/**
 * Nivel de una zona: el mayor z-index de ella y de sus ancestros, más uno.
 * Las barras van en `body` sin capa propia que las agrupe, así que compiten
 * con lo demás por este número: el menú de sugerencias del editor (z-70) o
 * un modal quedan por encima de las barras del editor, y la lista de un menú
 * flotante tiene sus barras por encima del menú.
 */
function levelOf(el: HTMLElement): number {
  let max = 0;
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const z = Number.parseInt(getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(z) && z > max) max = z;
  }
  return Math.max(MIN_Z, max + 1);
}

export function installOverlayScrollbars(): () => void {
  const layer = document.createElement('div');
  layer.className = 'osb-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  const active = new Map<HTMLElement, Active>();
  let frame = 0;
  let dragging: { a: Active; bar: Bar; start: number; startScroll: number; pointerId: number } | null = null;

  const scrollable = (el: HTMLElement, axis: Axis) => {
    const cs = getComputedStyle(el);
    const overflow = axis === 'y' ? cs.overflowY : cs.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') return false;
    return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
  };

  const makeBar = (a: Active, axis: Axis): Bar => {
    const track = document.createElement('div');
    track.className = `osb-track osb-${axis}`;
    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';
    track.appendChild(thumb);
    track.style.zIndex = String(a.z);
    layer.appendChild(track);
    const bar: Bar = { axis, track, thumb, trackLen: 0, thumbLen: 0 };

    thumb.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      dragging = {
        a, bar, pointerId: e.pointerId,
        start: axis === 'y' ? e.clientY : e.clientX,
        startScroll: axis === 'y' ? a.el.scrollTop : a.el.scrollLeft,
      };
      track.classList.add('osb-dragging');
      document.documentElement.classList.add('osb-grabbing');
    });
    /* Clic en la pista: una página hacia ese lado. */
    track.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target !== track) return;
      e.preventDefault();
      const r = thumb.getBoundingClientRect();
      const before = axis === 'y' ? e.clientY < r.top : e.clientX < r.left;
      const page = (axis === 'y' ? a.el.clientHeight : a.el.clientWidth) * 0.9;
      a.el.scrollBy({ [axis === 'y' ? 'top' : 'left']: before ? -page : page, behavior: 'smooth' });
    });
    return bar;
  };

  const removeBar = (a: Active, axis: Axis) => {
    a.bars[axis]?.track.remove();
    delete a.bars[axis];
  };

  const draw = (a: Active) => {
    const { el } = a;
    if (!el.isConnected) { release(a); return; }
    const rect = el.getBoundingClientRect();
    const left = rect.left + el.clientLeft;
    const top = rect.top + el.clientTop;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const hasY = scrollable(el, 'y');
    const hasX = scrollable(el, 'x');
    a.lastSize = `${el.scrollWidth}x${el.scrollHeight}x${w}x${h}`;

    for (const axis of ['y', 'x'] as Axis[]) {
      const has = axis === 'y' ? hasY : hasX;
      if (!has) { removeBar(a, axis); continue; }
      const bar = a.bars[axis] ?? (a.bars[axis] = makeBar(a, axis));
      /* Con las dos barras, cada una deja libre la esquina de la otra. */
      const corner = hasX && hasY ? HIT : 0;
      const trackLen = (axis === 'y' ? h : w) - INSET * 2 - corner;
      const view = axis === 'y' ? h : w;
      const content = axis === 'y' ? el.scrollHeight : el.scrollWidth;
      const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
      const thumbLen = Math.max(MIN_THUMB, Math.min(trackLen, (trackLen * view) / content));
      const max = content - view;
      const offset = max > 0 ? ((trackLen - thumbLen) * pos) / max : 0;
      bar.trackLen = trackLen;
      bar.thumbLen = thumbLen;
      const s = bar.track.style;
      if (axis === 'y') {
        /* Contra el borde de la caja, no del área de contenido: el editor SQL
           deja su margen derecho con un borde transparente y `clientWidth` no lo
           cuenta, así que la barra quedaba dentro, encima del texto. */
        s.left = `${rect.right - HIT}px`;
        s.top = `${top + INSET}px`;
        s.width = `${HIT}px`;
        s.height = `${trackLen}px`;
        bar.thumb.style.height = `${thumbLen}px`;
        bar.thumb.style.transform = `translateY(${offset}px)`;
      } else {
        s.left = `${left + INSET}px`;
        s.top = `${rect.bottom - HIT}px`;
        s.width = `${trackLen}px`;
        s.height = `${HIT}px`;
        bar.thumb.style.width = `${thumbLen}px`;
        bar.thumb.style.transform = `translateX(${offset}px)`;
      }
      bar.track.classList.add('osb-on');
    }
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      active.forEach(draw);
    });
  };

  const release = (a: Active) => {
    window.clearTimeout(a.hideTimer);
    removeBar(a, 'y');
    removeBar(a, 'x');
    active.delete(a.el);
  };

  /* Se desvanece y, terminada la transición, se suelta. */
  const hideLater = (a: Active, delay: number) => {
    window.clearTimeout(a.hideTimer);
    a.hideTimer = window.setTimeout(() => {
      if (a.hovered || dragging?.a === a) return;
      Object.values(a.bars).forEach(b => b?.track.classList.remove('osb-on'));
      a.hideTimer = window.setTimeout(() => { if (!a.hovered && dragging?.a !== a) release(a); }, 200);
    }, delay);
  };

  const activate = (el: HTMLElement) => {
    let a = active.get(el);
    if (!a) {
      a = { el, bars: {}, hovered: false, lastSize: '', z: levelOf(el) };
      active.set(el, a);
    }
    window.clearTimeout(a.hideTimer);
    return a;
  };

  /* Cadena de zonas con scroll bajo el elemento (la interior y las que la contienen). */
  const chainOf = (target: Element | null) => {
    const chain = new Set<HTMLElement>();
    let el = target?.closest<HTMLElement>(SELECTOR) ?? null;
    while (el) {
      chain.add(el);
      el = el.parentElement?.closest<HTMLElement>(SELECTOR) ?? null;
    }
    return chain;
  };

  const onOver = (e: PointerEvent) => {
    const target = e.target as Element | null;
    /* Sobre una barra propia: su zona sigue activa. */
    if (target && layer.contains(target)) return;
    const chain = chainOf(target);
    active.forEach(a => {
      if (!chain.has(a.el) && a.hovered) {
        a.hovered = false;
        hideLater(a, HIDE_AFTER_LEAVE);
      }
    });
    chain.forEach(el => { activate(el).hovered = true; });
    schedule();
  };

  const onLeaveWindow = (e: PointerEvent) => {
    if (e.relatedTarget) return;
    active.forEach(a => { a.hovered = false; hideLater(a, HIDE_AFTER_LEAVE); });
  };

  const onScroll = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.matches(SELECTOR)) {
      const a = activate(el);
      if (!a.hovered) hideLater(a, HIDE_AFTER_SCROLL);
    }
    /* Un scroll de fuera también mueve las zonas activas. */
    if (active.size) schedule();
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const { a, bar, start, startScroll } = dragging;
    const el = a.el;
    const content = bar.axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const room = bar.trackLen - bar.thumbLen;
    if (room <= 0) return;
    const delta = ((bar.axis === 'y' ? e.clientY : e.clientX) - start) * (content / room);
    if (bar.axis === 'y') el.scrollTop = startScroll + delta;
    else el.scrollLeft = startScroll + delta;
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const { a, bar } = dragging;
    bar.track.classList.remove('osb-dragging');
    document.documentElement.classList.remove('osb-grabbing');
    dragging = null;
    if (!a.hovered) hideLater(a, HIDE_AFTER_LEAVE);
  };

  /* Cambios de tamaño del contenido sin scroll ni redimensionar (filas nuevas, texto pegado). */
  const interval = window.setInterval(() => {
    active.forEach(a => {
      const size = `${a.el.scrollWidth}x${a.el.scrollHeight}x${a.el.clientWidth}x${a.el.clientHeight}`;
      if (size !== a.lastSize) schedule();
    });
  }, CONTENT_CHECK);

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  document.addEventListener('pointerover', onOver, opts);
  document.addEventListener('pointerout', onLeaveWindow, opts);
  document.addEventListener('scroll', onScroll, opts);
  document.addEventListener('pointermove', onMove, opts);
  document.addEventListener('pointerup', onUp, opts);
  document.addEventListener('pointercancel', onUp, opts);
  window.addEventListener('resize', schedule, { passive: true });

  return () => {
    document.removeEventListener('pointerover', onOver, opts);
    document.removeEventListener('pointerout', onLeaveWindow, opts);
    document.removeEventListener('scroll', onScroll, opts);
    document.removeEventListener('pointermove', onMove, opts);
    document.removeEventListener('pointerup', onUp, opts);
    document.removeEventListener('pointercancel', onUp, opts);
    window.removeEventListener('resize', schedule);
    window.clearInterval(interval);
    cancelAnimationFrame(frame);
    active.forEach(release);
    layer.remove();
  };
}
