import { copyText } from '@lib/clipboard';

/* Copiar, cortar y pegar para el menú contextual propio: lo que hacía el
   menú del sistema sobre el texto seleccionado y los campos de texto. */

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Tipos de `<input>` que llevan texto editable con selección. */
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/** Campo de texto bajo el clic, si lo hay. */
export function textFieldAt(target: EventTarget | null): TextField | null {
	if (!(target instanceof Element)) return null;
	const el = target.closest('input, textarea');
	if (el instanceof HTMLTextAreaElement) return el;
	if (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type)) return el;
	return null;
}

/** Selección de un campo en el momento del clic: el menú puede mover el foco. */
export interface FieldSelection {
	field: TextField;
	start: number;
	end: number;
}

export function fieldSelection(field: TextField): FieldSelection {
	/* `number` no expone la selección (lanza o devuelve null). */
	let start = 0;
	let end = 0;
	try {
		start = field.selectionStart ?? 0;
		end = field.selectionEnd ?? 0;
	} catch { /* tipo sin selección */ }
	return { field, start, end };
}

export const selectedText = ({ field, start, end }: FieldSelection) => field.value.slice(start, end);

/**
 * Sustituye la selección por `text`. `execCommand` mantiene el deshacer del
 * campo y dispara `input`, así que el estado de React se entera; si el
 * webview no lo admite, se escribe a mano y se avisa con un evento `input`.
 */
function replaceSelection({ field, start, end }: FieldSelection, text: string): void {
	field.focus({ preventScroll: true });
	try { field.setSelectionRange(start, end); } catch { /* tipo sin selección */ }
	const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
	if (ok) return;
	field.setRangeText(text, start, end, 'end');
	field.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function copySelection(sel: FieldSelection): Promise<void> {
	await copyText(selectedText(sel));
	sel.field.focus({ preventScroll: true });
}

export async function cutSelection(sel: FieldSelection): Promise<void> {
	await copyText(selectedText(sel));
	replaceSelection(sel, '');
}

/** Lee el portapapeles; el webview puede negarlo y entonces queda Ctrl + V. */
export async function readClipboard(): Promise<string> {
	if (!navigator.clipboard?.readText) throw new Error('El portapapeles no está disponible');
	return navigator.clipboard.readText();
}

export async function pasteInto(sel: FieldSelection): Promise<void> {
	const text = await readClipboard();
	if (text) replaceSelection(sel, text);
}

/** Texto seleccionado fuera de los campos (párrafos, tablas, resultados). */
export function pageSelection(): string {
	return window.getSelection()?.toString() ?? '';
}
