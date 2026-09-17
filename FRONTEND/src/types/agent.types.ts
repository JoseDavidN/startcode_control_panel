/** Instalación del agente en la máquina remota. Espejo de los tipos del backend. */

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface AgentInstallStep {
	id: string;
	/** Ya viene en castellano: la interfaz no traduce códigos. */
	label: string;
	status: AgentStepStatus;
	detail?: string;
}

export interface AgentInstallError {
	code: string;
	message: string;
	detail?: string;
}

export interface AgentInstallResult {
	ok: boolean;
	serverId: string;
	status: string;
	version?: string;
	arch?: 'amd64' | 'arm64';
	steps: AgentInstallStep[];
	error?: AgentInstallError;
	/** Instalado, pero con una pega que conviene contar (p. ej. no conectó aún). */
	warning?: string;
}

export interface AgentUninstallResult {
	ok: boolean;
	/** false = no había nada que quitar, que no es un fallo. */
	removed: boolean;
	steps: AgentInstallStep[];
	error?: AgentInstallError;
}

export type AgentInstallState =
	| 'not_installed'
	| 'installing'
	| 'installed'
	| 'failed'
	| 'uninstalling';

export interface AgentState {
	serverId: string;
	state: AgentInstallState;
	version: string | null;
	arch: 'amd64' | 'arm64' | null;
	installedAt: string | null;
	lastAttemptAt: string | null;
	lastError: (AgentInstallError & { at: string }) | null;
	steps: AgentInstallStep[];
}
