import { createContext } from 'react';
import type { AssistantDatabaseRef, AssistantSourceType, AssistantTargetKind } from '@typings/assistant.types';

/* Tipos y contexto del asistente, aparte del proveedor (AssistantContext.tsx)
   para que ese archivo solo exporte componentes. */

/**
 * Algo de la pantalla que el asistente puede leer: la terminal, la salida de
 * la línea de comandos, el editor o el resultado SQL. `read` se llama solo al
 * enviar una pregunta, así que siempre devuelve lo que se ve en ese momento.
 */
export interface AssistantSource {
	id: string;
	type: AssistantSourceType;
	title: string;
	read: () => string;
	/** En `schema`: de qué base lee el backend la estructura real. */
	database?: () => AssistantDatabaseRef | null;
}

/**
 * Sitio donde se puede pegar un bloque de la respuesta. `paste` solo escribe
 * el texto: ejecutarlo es siempre decisión del usuario.
 */
export interface AssistantTarget {
	id: string;
	kind: AssistantTargetKind;
	label: string;
	paste: (text: string) => void;
}

export interface AssistantContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	sources: AssistantSource[];
	targets: AssistantTarget[];
	registerSource: (source: AssistantSource) => () => void;
	registerTarget: (target: AssistantTarget) => () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);
