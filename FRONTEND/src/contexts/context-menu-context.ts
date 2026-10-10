import { createContext } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

export interface ContextMenuItem {
	id: string;
	label: string;
	icon?: ReactNode;
	/** Atajo de teclado que se muestra a la derecha (solo informativo). */
	shortcut?: string;
	disabled?: boolean;
	/** Línea de separación encima de la opción (agrupa las acciones). */
	separator?: boolean;
	/** Acción destructiva: se pinta en rojo. */
	danger?: boolean;
	onSelect: () => void;
}

export interface ContextMenuContextValue {
	/**
	 * Abre el menú propio con estas opciones en la posición del clic derecho.
	 * Sin opciones no se abre nada (y tampoco el del sistema).
	 */
	openContextMenu: (event: ReactMouseEvent, items: ContextMenuItem[]) => void;
}

export const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);
