/**
 * Unidades systemd que el panel no deja parar ni deshabilitar.
 *
 * Todo lo que el panel hace en la máquina —métricas, terminal, SFTP, las
 * propias acciones de servicio— viaja por SSH: parar `sshd` deja el servidor
 * incomunicado y desde aquí no se podría deshacer. El backend las rechaza
 * igualmente; esta copia es para no ofrecer un botón que no va a funcionar.
 */
export const PROTECTED_UNITS = ['sshd', 'ssh', 'startcode-agent'];

/** Compara nombres de unidad tolerando el sufijo `.service`. */
export const unitName = (unit: string): string => unit.replace(/\.service$/, '');

export const isProtectedUnit = (unit: string): boolean =>
	PROTECTED_UNITS.includes(unitName(unit));
