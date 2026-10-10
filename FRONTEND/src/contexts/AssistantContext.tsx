import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
	AssistantContext,
	type AssistantContextValue,
	type AssistantSource,
	type AssistantTarget,
} from './assistant-context';

/**
 * Estado global del asistente de IA: panel abierto y el registro de lo que
 * la pantalla actual ofrece para leer (fuentes) y para pegar (destinos). Cada componente registra lo suyo al montarse y lo retira
 * al desmontarse, así que el asistente nunca ve una terminal ya cerrada.
 * La conversación no vive aquí: es la memoria del backend (`useAssistantMessages`).
 */
export const AssistantProvider = ({ children }: { children: ReactNode }) => {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [sources, setSources] = useState<AssistantSource[]>([]);
	const [targets, setTargets] = useState<AssistantTarget[]>([]);

	/* Un asistente por usuario: al cambiar de cuenta (o salir) se cierra el panel. */
	useEffect(() => {
		setOpen(false);
	}, [user?.id]);

	const registerSource = useCallback((source: AssistantSource) => {
		setSources(prev => [...prev.filter(s => s.id !== source.id), source]);
		return () => setSources(prev => prev.filter(s => s !== source));
	}, []);

	const registerTarget = useCallback((target: AssistantTarget) => {
		setTargets(prev => [...prev.filter(t => t.id !== target.id), target]);
		return () => setTargets(prev => prev.filter(t => t !== target));
	}, []);

	const value = useMemo<AssistantContextValue>(
		() => ({ open, setOpen, sources, targets, registerSource, registerTarget }),
		[open, sources, targets, registerSource, registerTarget],
	);

	return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
};
