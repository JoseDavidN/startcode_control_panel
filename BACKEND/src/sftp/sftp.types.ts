// src/sftp/sftp.types.ts
import type { Client as SSHClient, SFTPWrapper } from 'ssh2';

/**
 * Una sesión = una conexión SSH dedicada con dos canales SFTP abiertos:
 * uno para metadatos y otro para los datos. Separarlos evita que navegar se
 * quede esperando detrás de una subida grande.
 */
export interface SftpSession {
  id: string;
  userId: string;
  serverId: string;
  serverName: string;
  host: string;
  username: string;
  ssh: SSHClient;
  meta: SFTPWrapper;
  data: SFTPWrapper;
  /** Directorio inicial (realpath de '.'), al que apunta también `~` */
  home: string;
  createdAt: number;
  lastUsedAt: number;
  activeUploads: number;
  /** Descargas en curso: como las subidas, mantienen viva la sesión sin socket */
  activeDownloads: number;
  /** Directorios ya creados en esta sesión: evita repetir mkdir por archivo */
  ensuredDirs: Set<string>;
  /**
   * Subidas por partes sin terminar: ruta absoluta → bytes confirmados. Solo
   * se puede continuar (o descartar) un archivo que esta sesión empezó.
   */
  partials: Map<string, number>;
  socketId: string | null;
  /** Momento en que se fue el socket: la sesión espera un rato a que vuelva */
  orphanedAt: number | null;
  closing: boolean;
}

export type SftpEntryType = 'dir' | 'file' | 'symlink' | 'other';

export interface SftpEntry {
  name: string;
  path: string;
  type: SftpEntryType;
  /** Destino de un symlink, cuando se pudo resolver */
  linkType?: SftpEntryType | 'broken';
  size: number;
  mode: number;
  permissions: string;
  /** Epoch en milisegundos */
  mtime: number;
  uid: number;
  gid: number;
}
