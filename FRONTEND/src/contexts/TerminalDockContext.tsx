import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAssistant } from '@hooks/useAssistantBridge';
import {
	TerminalDockContext,
	type TerminalDockContextValue,
	type TerminalSession,
	type TerminalStatus,
} from './terminal-dock-context';

/* Bajo demanda: xterm solo se descarga al abrir la primera terminal. */
const ServerTerminal = lazy(() =>
	import('@components/servers/ServerTerminal').then(m => ({ default: m.ServerTerminal })));

/* El color del punto resume las pestañas: con una conectada, verde. */
const toneOf = (statuses: TerminalStatus[]) =>
	statuses.includes('ready') ? 'bg-emerald-400' :
	statuses.includes('connecting') ? 'bg-amber-400 animate-pulse' :
	statuses.includes('error') ? 'bg-rose-400' : 'bg-white/30';

/* El asistente ocupa 440 px a la derecha más su margen: abierto, la barra se corre a su izquierda. */
const ASSISTANT_SPACE = 460;

/**
 * Terminal SSH global: vive en el layout, así que sus sesiones siguen abiertas
 * al salir del detalle del servidor. Oculta se minimiza en una barra abajo
 * a la derecha desde la que se vuelve a abrir sobre cualquier vista. Una sola
 * a la vez: entrar al detalle de otro servidor la cierra (`useTerminalDockViewing`).
 */
export const TerminalDockProvider = ({ children }: { children: ReactNode }) => {
	const { open: assistantOpen } = useAssistant();
	const [session, setSession] = useState<TerminalSession | null>(null);
	const [open, setOpen] = useState(false);
	const [viewing, setViewing] = useState<string | null>(null);
	const [statuses, setStatuses] = useState<TerminalStatus[]>([]);

	const openTerminal = useCallback((serverId: string, serverName: string) => {
		setSession(prev => (prev?.serverId === serverId ? prev : { serverId, serverName }));
		setOpen(true);
	}, []);
	const minimize = useCallback(() => setOpen(false), []);
	const end = useCallback(() => {
		setOpen(false);
		setSession(null);
		setStatuses([]);
	}, []);

	const value = useMemo<TerminalDockContextValue>(
		() => ({ session, open, openTerminal, minimize, end, setViewing }),
		[session, open, openTerminal, minimize, end],
	);

	/* En su propio detalle no hace falta: ahí está el botón «Volver a la terminal». */
	const docked = session !== null && !open && viewing !== session.serverId;
	const count = statuses.length;

	return (
		<TerminalDockContext.Provider value={value}>
			{children}

			{session && (
				<Suspense fallback={null}>
					<ServerTerminal
						key={session.serverId}
						serverId={session.serverId}
						serverName={session.serverName}
						open={open}
						onClose={minimize}
						onEnd={end}
						onStatuses={setStatuses}
					/>
				</Suspense>
			)}

			{/* Al body: `.mo-view` y `.glass` hacen de bloque contenedor y un `fixed` dentro quedaría encerrado. */}
			{docked && createPortal(
				<div
					role="region"
					aria-label="Terminal minimizada"
					className="fixed bottom-7 z-40 flex items-center gap-1 p-1 glass glass-float elev-float rounded-xl animate-slideUp transition-[right] duration-200"
					style={{ right: 28 + (assistantOpen ? ASSISTANT_SPACE : 0) }}
				>
					<button
						type="button"
						onClick={() => setOpen(true)}
						title="Abrir la terminal"
						className="mo-tab h-9 pl-3 pr-3.5 rounded-lg flex items-center gap-2.5 text-sm text-white/85 hover:text-white hover:bg-tint-hover"
					>
						<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneOf(statuses)}`} />
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-300" aria-hidden>
							<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
						</svg>
						<span className="font-medium max-w-[16rem] truncate">{session.serverName}</span>
						{count > 1 && <span className="text-xs text-white/45 font-mono">{count} terminales</span>}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-white/45" aria-hidden>
							<path d="M18 15l-6-6-6 6" />
						</svg>
					</button>
					<button
						type="button"
						onClick={end}
						aria-label="Terminar sesiones"
						title={count > 1 ? 'Terminar todas las sesiones SSH' : 'Terminar la sesión SSH'}
						className="mo-tab w-9 h-9 rounded-lg flex items-center justify-center text-white/45 hover:text-rose-300 hover:bg-rose-500/10"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="w-4 h-4" aria-hidden>
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>,
				document.body,
			)}
		</TerminalDockContext.Provider>
	);
};
