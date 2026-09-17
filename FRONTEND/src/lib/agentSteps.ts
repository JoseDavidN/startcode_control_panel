import type { AgentInstallStep, AgentStepStatus } from '@typings/agent.types';

/**
 * Las actividades que ve el usuario.
 *
 * El backend informa de nueve pasos finos, útiles para saber dónde falló algo,
 * pero una lista de nueve casillas no se lee: parece que no pasa nada. Aquí se
 * agrupan en cuatro o cinco actividades con sentido, y el detalle fino del paso
 * en curso viaja como subtítulo.
 */
export interface AgentActivity {
	id: string;
	label: string;
	/** Pasos del backend que cubre esta actividad */
	covers: string[];
}

export interface ResolvedActivity extends AgentActivity {
	status: AgentStepStatus;
	detail?: string;
}

export const INSTALL_ACTIVITIES: AgentActivity[] = [
	{ id: 'connect',  label: 'Conectando con el servidor', covers: ['ssh'] },
	{ id: 'prepare',  label: 'Comprobando el servidor',    covers: ['privileges', 'systemd', 'arch'] },
	{ id: 'download', label: 'Descargando el agente',      covers: ['download', 'checksum'] },
	{ id: 'install',  label: 'Instalando el servicio',     covers: ['config', 'service'] },
	{ id: 'verify',   label: 'Comprobando que reporta',    covers: ['verify', 'handshake'] },
];

export const UNINSTALL_ACTIVITIES: AgentActivity[] = [
	{ id: 'connect', label: 'Conectando con el servidor',    covers: ['ssh', 'privileges'] },
	{ id: 'stop',    label: 'Parando el agente',             covers: ['service'] },
	{ id: 'clean',   label: 'Borrando archivos',             covers: ['files'] },
	{ id: 'verify',  label: 'Comprobando que no queda nada', covers: ['verify'] },
];

/**
 * Traduce los pasos del backend a actividades.
 *
 * Una actividad se da por terminada cuando la siguiente ha empezado, o cuando
 * el proceso entero acabó bien: así la pantalla avanza de una en una en vez de
 * quedarse con media docena de casillas a medio marcar.
 */
export function resolveActivities(
	activities: AgentActivity[],
	steps: AgentInstallStep[],
	overall: 'running' | 'success' | 'error',
): ResolvedActivity[] {
	const byId = new Map(steps.map(s => [s.id, s]));

	const reported = activities.map(activity =>
		activity.covers.map(id => byId.get(id)).filter((s): s is AgentInstallStep => Boolean(s)),
	);

	/* La última actividad de la que se sabe algo: todo lo anterior ya pasó. */
	let current = -1;
	reported.forEach((steps, index) => {
		if (steps.length > 0) current = index;
	});

	return activities.map((activity, index) => {
		const covered = reported[index];
		const failed = covered.find(s => s.status === 'failed');
		const last = covered[covered.length - 1];

		let status: AgentStepStatus;
		if (failed) status = 'failed';
		else if (overall === 'success') status = 'done';
		else if (index < current) status = 'done';
		else if (index === current) status = 'running';
		else status = 'pending';

		return { ...activity, status, detail: failed?.detail ?? last?.detail };
	});
}
