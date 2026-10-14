import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/* ── Barra de título propia ───────────────────────────────────────────
   Sustituye a la del sistema con el aspecto del tema (transparente sobre el
   fondo de la app) y los botones de ventana de cada sistema:

   - macOS: la ventana usa `titleBarStyle: "Overlay"` (tauri.macos.conf.json):
     los semáforos son los nativos y esta barra solo deja su hueco a la
     izquierda y hace de zona de arrastre.
   - Windows: sin decoraciones del sistema (`decorations: false`); botones
     rectangulares a la derecha como los de Windows 11, cerrar en rojo.
   - Linux: igual, con botones redondos a la derecha como los de GNOME.

   Arrastrar la barra mueve la ventana y el doble clic la maximiza
   (`data-tauri-drag-region`). En pantalla completa no se muestra. */

type Platform = 'mac' | 'windows' | 'linux';

const PLATFORM: Platform = /Mac/i.test(navigator.userAgent) ? 'mac'
  : /Windows/i.test(navigator.userAgent) ? 'windows' : 'linux';

/** Alto de la barra; también lo usa `trafficLightPosition` de macOS para centrar los semáforos. */
export const TITLEBAR_HEIGHT = 38;

const win = getCurrentWindow();

const sp = { viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true } as const;
const MinIcon = () => <svg {...sp} className="w-2.5 h-2.5"><path d="M0 5h10" /></svg>;
const MaxIcon = () => <svg {...sp} className="w-2.5 h-2.5"><rect x="0.5" y="0.5" width="9" height="9" /></svg>;
const RestoreIcon = () => <svg {...sp} className="w-2.5 h-2.5"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>;
const CloseIcon = () => <svg {...sp} className="w-2.5 h-2.5"><path d="M0 0l10 10M10 0L0 10" /></svg>;

/* Windows 11: 46 px de ancho, todo el alto, sin redondeo; cerrar se vuelve rojo. */
const WindowsControls = ({ maximized }: { maximized: boolean }) => {
  const base = 'w-[46px] h-full flex items-center justify-center text-white/70 transition-colors';
  return (
    <div className="flex h-full">
      <button type="button" aria-label="Minimizar" onClick={() => void win.minimize()} className={`${base} hover:bg-tint-hover hover:text-white`}><MinIcon /></button>
      <button type="button" aria-label={maximized ? 'Restaurar' : 'Maximizar'} onClick={() => void win.toggleMaximize()} className={`${base} hover:bg-tint-hover hover:text-white`}>
        {maximized ? <RestoreIcon /> : <MaxIcon />}
      </button>
      <button type="button" aria-label="Cerrar" onClick={() => void win.close()} className={`${base} hover:bg-[#c42b1c] hover:text-white`}><CloseIcon /></button>
    </div>
  );
};

/* GNOME (Adwaita): botones redondos de 24 px con fondo tenue, separados. */
const LinuxControls = ({ maximized }: { maximized: boolean }) => {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center bg-tint-active text-white/75 hover:bg-tint-hover hover:text-white transition-colors';
  return (
    <div className="flex items-center gap-2 px-3">
      <button type="button" aria-label="Minimizar" onClick={() => void win.minimize()} className={base}><MinIcon /></button>
      <button type="button" aria-label={maximized ? 'Restaurar' : 'Maximizar'} onClick={() => void win.toggleMaximize()} className={base}>
        {maximized ? <RestoreIcon /> : <MaxIcon />}
      </button>
      <button type="button" aria-label="Cerrar" onClick={() => void win.close()} className={base}><CloseIcon /></button>
    </div>
  );
};

export const TitleBar = () => {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /* El icono de maximizar/restaurar y la barra en pantalla completa siguen al estado real de la ventana. */
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const sync = () => {
      void win.isMaximized().then(setMaximized).catch(() => undefined);
      void win.isFullscreen().then(setFullscreen).catch(() => undefined);
    };
    sync();
    void win.onResized(sync).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  if (fullscreen) return null;

  return (
    <header
      data-tauri-drag-region
      className="titlebar shrink-0 relative z-[90] flex items-stretch select-none"
      style={{ height: TITLEBAR_HEIGHT }}
    >
      {/* macOS: hueco de los semáforos nativos (x 16 + tres botones). */}
      {PLATFORM === 'mac' && <div data-tauri-drag-region className="w-[78px] shrink-0" />}
      <div data-tauri-drag-region className={`flex-1 min-w-0 flex items-center ${PLATFORM === 'mac' ? 'justify-center' : 'px-4'}`}>
        <span data-tauri-drag-region className="text-xs font-medium tracking-tight text-white/75 truncate">StartCode Panel</span>
      </div>
      {PLATFORM === 'mac' && <div data-tauri-drag-region className="w-[78px] shrink-0" />}
      {PLATFORM === 'windows' && <WindowsControls maximized={maximized} />}
      {PLATFORM === 'linux' && <LinuxControls maximized={maximized} />}
    </header>
  );
};
