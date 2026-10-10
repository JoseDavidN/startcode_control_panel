import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { io, type Socket } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { TokenManager } from '@utils/tokenManager';
import { API_CONFIG } from '@utils/constants';
import { useAssistantSource, useAssistantTarget } from '@hooks/useAssistantBridge';
import { AssistantLauncher } from '@components/assistant/AssistantPanel';
import { toSingleLine } from '@utils/commands';

/* La terminal se pinta con su propia paleta —la de una consola— y no con los
   tokens del tema: un fondo claro con texto de color de marca no es legible
   para salida de comandos con códigos ANSI. */
const THEME = {
  background: '#07050d',
  foreground: '#e6e1f5',
  cursor: '#c084fc',
  selectionBackground: 'rgba(168,85,247,0.35)',
  black: '#1a1626', red: '#fb7185', green: '#34d399', yellow: '#fbbf24',
  blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e6e1f5',
  brightBlack: '#6b6480', brightRed: '#fda4af', brightGreen: '#6ee7b7',
  brightYellow: '#fcd34d', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9', brightWhite: '#ffffff',
};

const FONT_SIZE = 13;
/* Un glifo de cada archivo Nerd Font (powerline y Material Design): basta
   para que el navegador descargue ambos subconjuntos por su unicode-range. */
const NERD_SAMPLE = '\ue0b0\u{f0001}';

type Status = 'connecting' | 'ready' | 'closed' | 'error';

/** Líneas del final del búfer que lee el asistente. */
const ASSISTANT_LINES = 300;

/** Texto visible de la terminal: las últimas líneas del búfer, sin las vacías del final. */
function readBuffer(term: Terminal | null): string {
  if (!term) return '';
  const buf = term.buffer.active;
  const end = buf.length;
  const lines: string[] = [];
  for (let i = Math.max(0, end - ASSISTANT_LINES); i < end; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  return lines.join('\n').replace(/\s+$/, '');
}

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export const ServerTerminal: React.FC<Props> = ({ serverId, serverName, onClose }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [status, setStatus] = useState<Status>('connecting');
  const [message, setMessage] = useState('Conectando por SSH…');

  useAssistantSource(`terminal:${serverId}`, 'terminal', `Terminal · ${serverName}`, () => readBuffer(termRef.current));
  useAssistantTarget(`terminal:${serverId}`, 'terminal', 'la terminal', text => {
    const line = toSingleLine(text);
    if (!line || !socketRef.current?.connected) return;
    /* Se escribe como si se tecleara, sin Enter: ejecutar lo decide el usuario. */
    socketRef.current.emit('terminal:input', line);
    termRef.current?.focus();
  }, status === 'ready');

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;

    /* La pila tipográfica vive en fonts.css (--font-terminal): JetBrains Mono
       con los símbolos Nerd Font de respaldo, para que un prompt con iconos
       se vea igual que en la terminal del escritorio. */
    const fontFamily =
      getComputedStyle(host).getPropertyValue('--font-terminal').trim() ||
      'ui-monospace, SFMono-Regular, Menlo, monospace';

    const term = new Terminal({
      theme: THEME,
      fontFamily,
      fontSize: FONT_SIZE,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    /* Los glifos Nerd Font se descargan por unicode-range, después del primer
       pintado: el atlas ya cacheó cajas vacías, así que se rehace al llegar. */
    const onFontsLoaded = () => {
      term.clearTextureAtlas();
      term.refresh(0, term.rows - 1);
    };
    document.fonts.addEventListener('loadingdone', onFontsLoaded);
    void document.fonts.load(`${FONT_SIZE}px ${fontFamily}`, NERD_SAMPLE);

    const base = API_CONFIG.WS_URL;
    const socket = io(`${base}/terminal`, {
      transports: ['websocket'],
      auth: {
        token: TokenManager.getAccessToken(),
        serverId,
        cols: term.cols,
        rows: term.rows,
      },
    });
    socketRef.current = socket;

    socket.on('terminal:ready', (info: { user: string; host: string }) => {
      setStatus('ready');
      setMessage(`${info.user}@${info.host}`);
      term.focus();
    });

    socket.on('terminal:output', (data: string) => term.write(data));

    socket.on('terminal:error', (payload: { message: string }) => {
      setStatus('error');
      setMessage(payload?.message ?? 'No se pudo abrir la terminal');
      term.writeln(`\r\n\x1b[31m${payload?.message ?? 'Error de conexión'}\x1b[0m`);
    });

    socket.on('terminal:closed', (payload: { reason?: string }) => {
      setStatus('closed');
      setMessage(payload?.reason ?? 'Sesión terminada');
      term.writeln('\r\n\x1b[90m— sesión terminada —\x1b[0m');
    });

    socket.on('disconnect', () => {
      setStatus(prev => (prev === 'ready' ? 'closed' : prev));
    });

    const onData = term.onData(data => socket.emit('terminal:input', data));

    /* El tamaño de la shell remota debe seguir al del contenedor, o el
       redibujado de programas a pantalla completa (htop, vim) sale partido. */
    const resize = () => {
      try {
        fit.fit();
        socket.emit('terminal:resize', { cols: term.cols, rows: term.rows });
      } catch { /* el contenedor aún no tiene tamaño */ }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', onFontsLoaded);
      window.removeEventListener('resize', resize);
      onData.dispose();
      socket.removeAllListeners();
      socket.disconnect();
      term.dispose();
      termRef.current = null;
      socketRef.current = null;
    };
  }, [serverId]);

  const tone =
    status === 'ready' ? 'bg-emerald-400' :
    status === 'connecting' ? 'bg-amber-400 animate-pulse' :
    status === 'error' ? 'bg-rose-400' : 'bg-white/30';

  /* Al body, igual que el Modal común: un ancestro con `backdrop-filter` o con
     `transform` crea bloque contenedor y encerraría este overlay fijo dentro de
     la tarjeta desde la que se abrió. */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onClose} />

      <div
        className="relative w-full max-w-5xl h-[80vh] flex flex-col glass elev-modal grain rounded-2xl animate-slideUp overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${tone}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Terminal · {serverName}</div>
            <div className="text-xs text-white/45 font-mono truncate">{message}</div>
          </div>

          <div className="ml-auto"><AssistantLauncher compact /></div>
          <button
            onClick={() => termRef.current?.clear()}
            className="mo-tab h-9 px-3 rounded-xl glass-soft text-white/70 hover:text-white row-hit text-xs font-medium"
          >
            Limpiar
          </button>
          <button
            onClick={onClose}
            className="mo-tab w-9 h-9 rounded-xl glass-soft text-white/70 hover:text-white row-hit flex items-center justify-center"
            aria-label="Cerrar terminal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 p-3" style={{ background: THEME.background }}>
          <div ref={hostRef} className="w-full h-full" />
        </div>
      </div>
    </div>,
    document.body,
  );
};
