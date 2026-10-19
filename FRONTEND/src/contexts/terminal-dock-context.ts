import { createContext } from 'react';

/* Tipos y contexto de la terminal global, aparte del proveedor
   (TerminalDockContext.tsx) para que ese archivo solo exporte componentes. */

export type TerminalStatus = 'connecting' | 'ready' | 'closed' | 'error';

/** Servidor con terminal abierta. Una sola a la vez, con sus pestañas. */
export interface TerminalSession {
	serverId: string;
	serverName: string;
}

export interface TerminalDockContextValue {
	session: TerminalSession | null;
	/** Ventana de la terminal a la vista; oculta queda minimizada abajo. */
	open: boolean;
	/** Abre (o vuelve a mostrar) la terminal de un servidor. */
	openTerminal: (serverId: string, serverName: string) => void;
	/** Minimiza sin cerrar las sesiones SSH. */
	minimize: () => void;
	/** Cierra todas las sesiones SSH. */
	end: () => void;
	/** El detalle de servidor que está en pantalla, o null. */
	setViewing: (serverId: string | null) => void;
}

export const TerminalDockContext = createContext<TerminalDockContextValue | null>(null);
