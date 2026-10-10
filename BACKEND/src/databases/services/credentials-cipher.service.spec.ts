import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { CredentialsCipherService } from './credentials-cipher.service';

const KEY = 'a'.repeat(64);
const make = (key?: string) =>
  new CredentialsCipherService({ get: () => key } as unknown as ConfigService);

describe('CredentialsCipherService', () => {
  it('descifra lo que cifra y no guarda el texto en claro', () => {
    const cipher = make(KEY);
    const enc = cipher.encrypt('s3cr3t-ñ');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('s3cr3t');
    expect(cipher.decrypt(enc)).toBe('s3cr3t-ñ');
  });

  it('usa un IV distinto en cada cifrado', () => {
    const cipher = make(KEY);
    expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
  });

  it('rechaza un valor alterado o cifrado con otra clave', () => {
    const enc = make(KEY).encrypt('x');
    const [v, iv, tag, data] = enc.split(':');
    const tampered = [v, iv, tag, Buffer.from('y').toString('base64') + data].join(':');
    expect(() => make(KEY).decrypt(tampered)).toThrow(InternalServerErrorException);
    expect(() => make('b'.repeat(64)).decrypt(enc)).toThrow(InternalServerErrorException);
  });

  it('falla con un mensaje claro si no hay clave válida', () => {
    expect(() => make(undefined).encrypt('x')).toThrow(/DB_CREDENTIALS_KEY/);
    expect(() => make('corta').encrypt('x')).toThrow(/DB_CREDENTIALS_KEY/);
  });
});
