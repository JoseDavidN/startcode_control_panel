import { useContext, useEffect } from 'react';
import { TerminalDockContext, type TerminalDockContextValue } from '@contexts/terminal-dock-context';

/** Terminal global (`TerminalDockProvider`): sigue viva al cambiar de vista. */
export function useTerminalDock(): TerminalDockContextValue {
	const ctx = useContext(TerminalDockContext);
	if (!ctx) throw new Error('useTerminalDock debe usarse dentro de <TerminalDockProvider>');
	return ctx;
}

/**
 * Marca el detalle de un servidor como en pantalla mientras esté montado.
 * Entrar al de otro servidor cierra la terminal que estaba minimizada.
 */
export function useTerminalDockViewing(serverId: string): void {
	const { session, end, setViewing } = useTerminalDock();
	const other = session !== null && session.serverId !== serverId;

	useEffect(() => {
		if (other) end();
	}, [other, end]);

	useEffect(() => {
		setViewing(serverId);
		return () => setViewing(null);
	}, [serverId, setViewing]);
}
