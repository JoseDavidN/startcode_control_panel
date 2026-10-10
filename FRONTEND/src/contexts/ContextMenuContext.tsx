import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ContextMenu, MenuIcon, type ContextMenuState } from '@components/common/ContextMenu';
import { copyText } from '@lib/clipboard';
import {
	copySelection, cutSelection, fieldSelection, pageSelection, pasteInto, textFieldAt,
} from '@lib/textEditing';
import { notify } from '@services/notification.service';
import { ContextMenuContext, type ContextMenuContextValue, type ContextMenuItem } from './context-menu-context';

/** Ejecuta una acción del menú y avisa si el portapapeles la rechaza. */
const safely = (action: () => Promise<void>, failure: string) => () => {
	action().catch(() => notify.error(failure, 'Usa el atajo de teclado (Ctrl + C, Ctrl + X o Ctrl + V).'));
};

/**
 * Opciones de texto: en un campo, cortar y copiar si hay selección y pegar
 * si es editable (las contraseñas no se copian ni se cortan); fuera de los
 * campos, copiar el texto seleccionado. Sin nada de eso, ninguna opción.
 */
function textItems(target: EventTarget | null): ContextMenuItem[] {
	const field = textFieldAt(target);
	if (field) {
		if (field.disabled) return [];
		const sel = fieldSelection(field);
		const hasSelection = sel.end > sel.start;
		const secret = field.type === 'password';
		const items: ContextMenuItem[] = [];
		if (hasSelection && !secret && !field.readOnly) {
			items.push({ id: 'cut', label: 'Cortar', shortcut: 'Ctrl+X', icon: <MenuIcon name="cut" />,
				onSelect: safely(() => cutSelection(sel), 'No se pudo cortar') });
		}
		if (hasSelection && !secret) {
			items.push({ id: 'copy', label: 'Copiar', shortcut: 'Ctrl+C', icon: <MenuIcon name="copy" />,
				onSelect: safely(() => copySelection(sel), 'No se pudo copiar') });
		}
		if (!field.readOnly) {
			items.push({ id: 'paste', label: 'Pegar', shortcut: 'Ctrl+V', icon: <MenuIcon name="paste" />,
				onSelect: safely(() => pasteInto(sel), 'No se pudo pegar') });
		}
		return items;
	}
	const text = pageSelection();
	if (!text.trim()) return [];
	return [{ id: 'copy', label: 'Copiar', shortcut: 'Ctrl+C', icon: <MenuIcon name="copy" />,
		onSelect: safely(() => copyText(text), 'No se pudo copiar') }];
}

/** Punto del menú; con la tecla de menú el evento no trae coordenadas. */
function pointOf(e: MouseEvent): { x: number; y: number } {
	if (e.clientX === 0 && e.clientY === 0 && e.target instanceof Element) {
		const r = e.target.getBoundingClientRect();
		return { x: r.left + 8, y: r.bottom };
	}
	return { x: e.clientX, y: e.clientY };
}

/**
 * Menú contextual de toda la app. El del sistema no se muestra nunca: el
 * clic derecho abre las opciones que haya registrado el componente bajo el
 * cursor (`useContextMenu().openContextMenu`) o, si no registró nada, las
 * de texto. Si no hay opciones, no aparece nada.
 *
 * El componente abre su menú desde `onContextMenu`, que React atiende en la
 * raíz antes de que el evento llegue al `document`; el evento queda marcado
 * y el manejador global ya no lo toca.
 */
export const ContextMenuProvider = ({ children }: { children: ReactNode }) => {
	const [menu, setMenu] = useState<ContextMenuState | null>(null);
	const handled = useRef(new WeakSet<Event>());
	const close = useCallback(() => setMenu(null), []);

	const openContextMenu = useCallback<ContextMenuContextValue['openContextMenu']>((event, items) => {
		event.preventDefault();
		handled.current.add(event.nativeEvent);
		setMenu(items.length ? { ...pointOf(event.nativeEvent), items } : null);
	}, []);

	useEffect(() => {
		const onContextMenu = (e: MouseEvent) => {
			/* En desarrollo, Mayús + clic derecho deja el menú del navegador (Inspeccionar). */
			if (import.meta.env.DEV && e.shiftKey) return;
			e.preventDefault();
			if (handled.current.has(e)) return;
			const items = textItems(e.target);
			setMenu(items.length ? { ...pointOf(e), items } : null);
		};
		document.addEventListener('contextmenu', onContextMenu);
		return () => document.removeEventListener('contextmenu', onContextMenu);
	}, []);

	const value = useMemo(() => ({ openContextMenu }), [openContextMenu]);

	return (
		<ContextMenuContext.Provider value={value}>
			{children}
			<ContextMenu menu={menu} onClose={close} />
		</ContextMenuContext.Provider>
	);
};
