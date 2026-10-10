import { useContext } from 'react';
import { ContextMenuContext, type ContextMenuContextValue } from '@contexts/context-menu-context';

/** Menú contextual propio de la app (`ContextMenuProvider`). */
export function useContextMenu(): ContextMenuContextValue {
	const ctx = useContext(ContextMenuContext);
	if (!ctx) throw new Error('useContextMenu debe usarse dentro de <ContextMenuProvider>');
	return ctx;
}
