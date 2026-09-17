import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serverService } from '@services/server.service';
import { useRealtimeMetrics } from '@contexts/RealtimeMetricsContext';
import type {
	AgentInstallStep,
	AgentStepStatus,
	AgentState,
} from '@typings/agent.types';

/** Invalida lo que cambia al instalar o quitar el agente. */
function useAgentInvalidation() {
	const queryClient = useQueryClient();

	return useCallback(
		(serverId: string) => {
			void queryClient.invalidateQueries({ queryKey: ['servers'] });
			void queryClient.invalidateQueries({ queryKey: ['servers-summary'] });
			void queryClient.invalidateQueries({ queryKey: ['server', serverId] });
			void queryClient.invalidateQueries({ queryKey: ['agent-state', serverId] });
		},
		[queryClient],
	);
}

export function useInstallAgent() {
	const invalidate = useAgentInvalidation();

	return useMutation({
		mutationFn: (vars: {
			id: string;
			sudoPassword?: string;
			panelUrl?: string;
			reinstall?: boolean;
		}) =>
			serverService.installAgent(vars.id, {
				sudoPassword: vars.sudoPassword,
				panelUrl: vars.panelUrl,
				reinstall: vars.reinstall,
			}),
		onSettled: (_result, _error, vars) => invalidate(vars.id),
	});
}

export function useUninstallAgent() {
	const invalidate = useAgentInvalidation();

	return useMutation({
		mutationFn: (vars: { id: string; sudoPassword?: string; purge?: boolean }) =>
			serverService.uninstallAgent(vars.id, {
				sudoPassword: vars.sudoPassword,
				purge: vars.purge,
			}),
		onSettled: (_result, _error, vars) => invalidate(vars.id),
	});
}

export function useAgentState(serverId: string, enabled = true) {
	return useQuery<AgentState>({
		queryKey: ['agent-state', serverId],
		queryFn: () => serverService.getAgentState(serverId),
		enabled: enabled && Boolean(serverId),
		staleTime: 30_000,
		retry: false,
	});
}

/**
 * Progreso de la instalación en curso, paso a paso.
 *
 * Llega por el socket `/agent` al que el panel ya está conectado. El resultado
 * completo vuelve además en la respuesta HTTP, así que si el socket está caído
 * la operación sigue funcionando: solo se pierde la animación.
 */
export function useAgentInstallProgress(serverId: string | null) {
	const { socket } = useRealtimeMetrics();
	const [progress, setProgress] = useState<Record<string, AgentStepStatus>>({});
	const [steps, setSteps] = useState<AgentInstallStep[]>([]);
	const serverRef = useRef(serverId);
	serverRef.current = serverId;

	/* Se escucha en cuanto hay socket, sin esperar al `serverId`: al dar de alta
	   un servidor el id llega justo antes de instalar, y suscribirse entonces
	   perdía los primeros pasos (de ahí que el modal solo enseñara la conexión).
	   El filtro va dentro del handler, contra la referencia viva. */
	useEffect(() => {
		if (!socket) return;

		const onProgress = (payload: { serverId: string; step: AgentInstallStep }) => {
			if (!serverRef.current || payload.serverId !== serverRef.current) return;

			setProgress(prev => ({ ...prev, [payload.step.id]: payload.step.status }));
			setSteps(prev => {
				const next = prev.filter(s => s.id !== payload.step.id);
				return [...next, payload.step];
			});
		};

		socket.on('agent:install:progress', onProgress);
		return () => {
			socket.off('agent:install:progress', onProgress);
		};
	}, [socket]);

	const reset = useCallback(() => {
		setProgress({});
		setSteps([]);
	}, []);

	/* El resultado HTTP trae los pasos completos: si el socket se perdió alguno
	   —o estaba caído—, el final se pinta igualmente. */
	const applyResult = useCallback((finalSteps: AgentInstallStep[]) => {
		setSteps(prev => {
			const byId = new Map(prev.map(s => [s.id, s]));
			finalSteps.forEach(s => byId.set(s.id, s));
			return [...byId.values()];
		});
		setProgress(prev => {
			const next = { ...prev };
			finalSteps.forEach(s => { next[s.id] = s.status; });
			return next;
		});
	}, []);

	return { progress, steps, reset, applyResult };
}
