import { ConflictException } from '@nestjs/common';
import { HostKeyService } from '@servers/services/host-key.service';
import { NotificationSeverity, NotificationType } from '@/notifications/entities/notification.entity';
import type { User } from '@auth/entities/user.entity';

const OLD = 'SHA256:FOEznlvR3dc22Vo2GnaMi19lK9Z6GTSwCQlS0IH70wA';
const NEW = 'SHA256:wBsg0trMaxDwxZWVC9V9Fiibvx3awLLCI8m5zH2y870';
const user = { id: 'u1', email: 'u@test' } as User;

describe('HostKeyService.accept (POST servers/:id/host-key/accept)', () => {
  let repo: { update: jest.Mock };
  let servers: { findOne: jest.Mock };
  let ssh: { probeHostKey: jest.Mock };
  let notifications: { create: jest.Mock };
  let service: HostKeyService;

  beforeEach(() => {
    repo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    servers = {
      findOne: jest.fn().mockResolvedValue({
        id: 's1', name: 'web', host: '10.0.0.1', port: 22, username: 'root',
        hostKeyAlgorithm: 'ssh-ed25519', hostKeyFingerprint: OLD,
      }),
    };
    ssh = { probeHostKey: jest.fn().mockResolvedValue({ algorithm: 'ssh-ed25519', fingerprint: NEW }) };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new HostKeyService(repo as never, servers as never, ssh as never, notifications as never);
  });

  it('comprueba que el servidor es del usuario antes de nada', async () => {
    servers.findOne.mockRejectedValue(new Error('403'));
    await expect(service.accept('s1', user)).rejects.toThrow('403');
    expect(ssh.probeHostKey).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('relee la clave actual, la fija y lo deja en las notificaciones de seguridad', async () => {
    const result = await service.accept('s1', user, NEW);
    expect(ssh.probeHostKey).toHaveBeenCalledWith(expect.objectContaining({ host: '10.0.0.1', port: 22 }));
    expect(repo.update).toHaveBeenCalledWith(
      { id: 's1' },
      expect.objectContaining({ hostKeyAlgorithm: 'ssh-ed25519', hostKeyFingerprint: NEW, hostKeyVerifiedAt: expect.any(Date) as Date }),
    );
    expect(result).toMatchObject({ serverId: 's1', previous: { fingerprint: OLD }, hostKeyFingerprint: NEW });
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.SECURITY,
        severity: NotificationSeverity.WARNING,
        serverId: 's1',
        metadata: expect.objectContaining({ previousFingerprint: OLD, fingerprint: NEW }) as unknown,
      }),
    );
  });

  it('si el host presenta otra clave distinta de la que vio el usuario, no acepta nada', async () => {
    await expect(service.accept('s1', user, OLD)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('un fallo al notificar no deshace la aceptación', async () => {
    notifications.create.mockRejectedValue(new Error('db'));
    await expect(service.accept('s1', user)).resolves.toMatchObject({ hostKeyFingerprint: NEW });
    expect(repo.update).toHaveBeenCalled();
  });
});
