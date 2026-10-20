import { HttpStatus } from '@nestjs/common';
import {
  checkHostKey,
  createHostKeyGuard,
  describeHostKey,
  HOST_KEY_FINGERPRINT,
  HOST_KEY_MISMATCH,
  HostKeyError,
  HostKeyMismatchError,
  HostKeyUnverifiedError,
  HOST_KEY_UNVERIFIED,
  hostKeyAlgorithm,
  hostKeyErrorPayload,
  hostKeyFingerprint,
} from '@monitoring/services/host-key';

/* Blobs de dos claves ed25519 reales; las huellas son las de `ssh-keygen -lf`. */
const KEY_A = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIG+FP0YZEaUjAdGjK2sod8qE8rx3bA4tMW6IPtC4zzkM', 'base64');
const FP_A = 'SHA256:FOEznlvR3dc22Vo2GnaMi19lK9Z6GTSwCQlS0IH70wA';
const KEY_B = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIPZI1EN+ROpF0eEB3c2UKbGKZ4fhF4Gg5CpEMbEktqKh', 'base64');
const FP_B = 'SHA256:wBsg0trMaxDwxZWVC9V9Fiibvx3awLLCI8m5zH2y870';

describe('host-key', () => {
  it('calcula la huella como OpenSSH (SHA256 en base64 sin relleno)', () => {
    expect(hostKeyFingerprint(KEY_A)).toBe(FP_A);
    expect(hostKeyFingerprint(KEY_B)).toBe(FP_B);
    expect(FP_A).toMatch(HOST_KEY_FINGERPRINT);
  });

  it('lee el algoritmo del blob', () => {
    expect(hostKeyAlgorithm(KEY_A)).toBe('ssh-ed25519');
    expect(describeHostKey(KEY_A)).toEqual({ algorithm: 'ssh-ed25519', fingerprint: FP_A });
  });

  it('un blob corrupto no rompe: algoritmo desconocido', () => {
    expect(hostKeyAlgorithm(Buffer.from([0, 0]))).toBe('unknown');
    expect(hostKeyAlgorithm(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41]))).toBe('unknown');
  });

  describe('checkHostKey', () => {
    it('sin huella guardada es primer uso', () => {
      expect(checkHostKey(null, describeHostKey(KEY_A))).toBe('first-use');
      expect(checkHostKey(undefined, describeHostKey(KEY_A))).toBe('first-use');
    });
    it('la misma huella coincide', () => {
      expect(checkHostKey(FP_A, describeHostKey(KEY_A))).toBe('match');
    });
    it('otra huella no coincide', () => {
      expect(checkHostKey(FP_A, describeHostKey(KEY_B))).toBe('mismatch');
    });
  });

  describe('createHostKeyGuard (hostVerifier de ssh2)', () => {
    it('sin huella: rechaza (no se autentica a ciegas) y recuerda la recibida', () => {
      const guard = createHostKeyGuard(null);
      expect(guard.verifier(KEY_A)).toBe(false);
      expect(guard.result()).toBe('first-use');
      expect(guard.received()).toEqual({ algorithm: 'ssh-ed25519', fingerprint: FP_A });
    });
    it('sin huella en modo lectura (escaneo): deja terminar el intercambio', () => {
      const guard = createHostKeyGuard(null, true);
      expect(guard.verifier(KEY_A)).toBe(true);
      expect(guard.result()).toBe('first-use');
      expect(guard.received()).toEqual({ algorithm: 'ssh-ed25519', fingerprint: FP_A });
    });
    it('coincide: acepta', () => {
      const guard = createHostKeyGuard(FP_A);
      expect(guard.verifier(KEY_A)).toBe(true);
      expect(guard.result()).toBe('match');
    });
    it('no coincide: rechaza y guarda la recibida para el aviso', () => {
      const guard = createHostKeyGuard(FP_A);
      expect(guard.verifier(KEY_B)).toBe(false);
      expect(guard.result()).toBe('mismatch');
      expect(guard.received()?.fingerprint).toBe(FP_B);
    });
  });

  it('HostKeyMismatchError es un 409 con las dos huellas', () => {
    const details = {
      serverId: 's1',
      host: '10.0.0.1',
      port: 22,
      expected: { algorithm: 'ssh-ed25519', fingerprint: FP_A },
      received: { algorithm: 'ssh-ed25519', fingerprint: FP_B },
    };
    const err = new HostKeyMismatchError(details);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: HOST_KEY_MISMATCH, hostKey: details });
    expect(hostKeyErrorPayload(err)).toEqual({ code: HOST_KEY_MISMATCH, hostKey: details });
    expect(hostKeyErrorPayload(new Error('otro'))).toBeNull();
  });

  it('HostKeyUnverifiedError es un 409 con la recibida y sin esperada', () => {
    const details = {
      serverId: 's1',
      host: '10.0.0.1',
      port: 22,
      expected: null,
      received: { algorithm: 'ssh-ed25519', fingerprint: FP_A },
    };
    const err = new HostKeyUnverifiedError(details);
    expect(err).toBeInstanceOf(HostKeyError);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: HOST_KEY_UNVERIFIED, hostKey: details });
    expect(hostKeyErrorPayload(err)).toEqual({ code: HOST_KEY_UNVERIFIED, hostKey: details });
  });
});
