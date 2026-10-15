import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * Cifra los secretos que el panel guarda y tiene que volver a usar: las
 * contraseñas de las conexiones a bases de datos, las claves de API del
 * asistente y las llaves privadas SSH de los servidores.
 *
 * AES-256-GCM con IV aleatorio por valor: el mismo texto da un cifrado
 * distinto cada vez y la etiqueta de autenticación detecta cualquier
 * manipulación. Se guarda como `v1:<iv>:<tag>:<cifrado>` en base64; el
 * prefijo de versión deja cambiar de esquema sin migrar lo existente.
 *
 * La clave sale de `DB_CREDENTIALS_KEY` (32 bytes en hex o base64) y no de
 * `JWT_SECRET`: rotar el secreto de los tokens no debe dejar ilegibles las
 * contraseñas guardadas.
 */
@Injectable()
export class CredentialsCipherService implements OnModuleInit {
  private readonly logger = new Logger(CredentialsCipherService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = CredentialsCipherService.parseKey(config.get<string>('DB_CREDENTIALS_KEY'));
  }

  /* No se tumba el arranque: el resto del panel funciona sin esta clave y
     solo fallan las operaciones que tocan contraseñas de bases de datos. */
  onModuleInit() {
    if (!this.key) {
      this.logger.warn(
        'DB_CREDENTIALS_KEY no está definida o no mide 32 bytes: no se podrán guardar ni usar contraseñas de bases de datos. Genera una con `openssl rand -hex 32`.',
      );
    }
  }

  /** Hay clave válida: se puede cifrar y descifrar. */
  get ready(): boolean {
    return this.key !== null;
  }

  /** Valor ya cifrado por este servicio (y no un dato antiguo en claro). */
  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${VERSION}:`);
  }

  encrypt(plain: string): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const key = this.requireKey();
    const [version, iv, tag, data] = payload.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new InternalServerErrorException('La contraseña guardada tiene un formato desconocido');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      /* Clave distinta a la que la cifró, o el valor fue alterado. */
      throw new InternalServerErrorException(
        'No se pudo descifrar la contraseña guardada: DB_CREDENTIALS_KEY cambió o el dato está dañado',
      );
    }
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new InternalServerErrorException(
        'El servidor no tiene configurada DB_CREDENTIALS_KEY para cifrar contraseñas de bases de datos',
      );
    }
    return this.key;
  }

  private static parseKey(raw: string | undefined): Buffer | null {
    const value = raw?.trim();
    if (!value) return null;
    const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
    return key.length === 32 ? key : null;
  }
}
