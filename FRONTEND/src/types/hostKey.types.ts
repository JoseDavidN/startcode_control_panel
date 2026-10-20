// src/types/hostKey.types.ts

/** Código con el que el backend avisa de que la clave de host SSH cambió. */
export const HOST_KEY_MISMATCH = 'HOST_KEY_MISMATCH';
/** El servidor aún no tiene huella confirmada: no se conectó, hay que confirmarla. */
export const HOST_KEY_UNVERIFIED = 'HOST_KEY_UNVERIFIED';

/** Comando para comprobar la huella en el propio servidor. */
export const HOST_KEY_CHECK_COMMAND = 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub';

export interface HostKeyInfo {
	/** `ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`… */
	algorithm: string | null;
	/** `SHA256:<base64>`, como `ssh-keygen -lf`. */
	fingerprint: string;
}

/** Cuerpo `hostKey` del 409 (HTTP) o de `terminal:error` / `sftp:error`. */
export interface HostKeyMismatch {
	serverId: string;
	host: string;
	port: number;
	/** La que el panel tenía guardada; null si aún no tenía ninguna (`HOST_KEY_UNVERIFIED`). */
	expected: HostKeyInfo | null;
	/** La que presentó el servidor en este intento. */
	received: HostKeyInfo;
}
