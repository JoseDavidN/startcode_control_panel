import { useContext, useEffect, useRef } from 'react';
import { AssistantContext, type AssistantContextValue } from '@contexts/assistant-context';
import type { AssistantSourceType, AssistantTargetKind } from '@typings/assistant.types';

/** Estado y registro del asistente global (`AssistantProvider`). */
export function useAssistant(): AssistantContextValue {
	const ctx = useContext(AssistantContext);
	if (!ctx) throw new Error('useAssistant debe usarse dentro de <AssistantProvider>');
	return ctx;
}

/**
 * Ofrece al asistente algo de la pantalla para leer mientras el componente
 * esté montado. `read` puede cambiar en cada render: se guarda en una ref y
 * el registro solo se rehace si cambian el id, el tipo o el título.
 */
export function useAssistantSource(
	id: string,
	type: AssistantSourceType,
	title: string,
	read: () => string,
	enabled = true,
) {
	const ctx = useContext(AssistantContext);
	const readRef = useRef(read);
	readRef.current = read;
	const register = ctx?.registerSource;

	useEffect(() => {
		if (!register || !enabled) return;
		return register({ id, type, title, read: () => readRef.current() });
	}, [register, id, type, title, enabled]);
}

/** Registra un sitio donde pegar bloques de la respuesta. Pegar no ejecuta. */
export function useAssistantTarget(
	id: string,
	kind: AssistantTargetKind,
	label: string,
	paste: (text: string) => void,
	enabled = true,
) {
	const ctx = useContext(AssistantContext);
	const pasteRef = useRef(paste);
	pasteRef.current = paste;
	const register = ctx?.registerTarget;

	useEffect(() => {
		if (!register || !enabled) return;
		return register({ id, kind, label, paste: text => pasteRef.current(text) });
	}, [register, id, kind, label, enabled]);
}
