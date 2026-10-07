import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommandService } from './command.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService } from './service-control.service';
import { ServersService } from '@servers/servers.service';
import { CommandAudit, CommandAuditStatus } from '../entities/command-audit.entity';

const MARK = '\u001e__SC__';
const done = (stdout: string, rc: number, pwd: string): SSHExecResult => ({
  stdout,
  stderr: `${MARK}${rc}\t${pwd}`,
  code: rc,
});

describe('CommandService', () => {
  let service: CommandService;
  let ssh: { createDedicatedClient: jest.Mock; execOnClient: jest.Mock };
  let control: { resolveSudo: jest.Mock; run: jest.Mock };
  let audit: { create: jest.Mock; save: jest.Mock };
  const conn = { end: jest.fn() };

  beforeEach(async () => {
    ssh = { createDedicatedClient: jest.fn().mockResolvedValue(conn), execOnClient: jest.fn() };
    control = { resolveSudo: jest.fn().mockResolvedValue({ kind: 'root' }), run: jest.fn() };
    audit = {
      create: jest.fn((row: Partial<CommandAudit>) => row),
      save: jest.fn((row: Partial<CommandAudit>) => Promise.resolve({ id: 'audit-1', ...row })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandService,
        { provide: getRepositoryToken(CommandAudit), useValue: audit },
        { provide: SSHService, useValue: ssh },
        { provide: ServiceControlService, useValue: control },
        {
          provide: ServersService,
          useValue: { findOneWithPrivateKey: jest.fn().mockResolvedValue({ name: 'prod', host: '10.0.0.1' }) },
        },
      ],
    }).compile();

    service = module.get(CommandService);
  });

  it('ejecuta en el directorio pedido, devuelve salida, código y directorio final, y audita', async () => {
    ssh.execOnClient.mockResolvedValueOnce(done('index.html\n', 0, '/var/www/html'));

    const result = await service.exec('s1', 'u1', { command: 'cd html && ls', cwd: '/var/www' });

    const [, remote, opts] = ssh.execOnClient.mock.calls[0] as [unknown, string, { input: string }];
    expect(remote).toMatch(/^timeout -k 5 60 bash -c '/);
    expect(remote).toContain("cd -- '\\''/var/www'\\''");
    expect(opts.input).toBe('');
    expect(result).toMatchObject({
      output: 'index.html',
      exitCode: 0,
      status: CommandAuditStatus.OK,
      nextCwd: '/var/www/html',
    });
    expect(audit.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', serverId: 's1', command: 'cd html && ls', status: 'ok' }),
    );
    expect(conn.end).toHaveBeenCalled();
  });

  it('marca error con código distinto de 0', async () => {
    ssh.execOnClient.mockResolvedValueOnce(done('ls: no such file', 2, '/root'));

    const result = await service.exec('s1', 'u1', { command: 'ls /nope' });

    expect(result.status).toBe(CommandAuditStatus.ERROR);
    expect(result.exitCode).toBe(2);
  });

  it('detecta el corte por tiempo cuando timeout mata el comando', async () => {
    ssh.execOnClient.mockResolvedValueOnce({ stdout: 'parcial', stderr: '', code: 124 });

    const result = await service.exec('s1', 'u1', { command: 'sleep 999' });

    expect(result.status).toBe(CommandAuditStatus.TIMEOUT);
    expect(result.output).toContain('cortado');
  });

  it('pide confirmación para comandos peligrosos sin abrir SSH', async () => {
    await expect(service.exec('s1', 'u1', { command: 'sudo reboot' })).rejects.toThrow(BadRequestException);
    await expect(service.exec('s1', 'u1', { command: 'rm -rf /' })).rejects.toThrow(BadRequestException);
    expect(ssh.createDedicatedClient).not.toHaveBeenCalled();
  });

  it('ejecuta un comando peligroso confirmado', async () => {
    ssh.execOnClient.mockResolvedValueOnce(done('', 0, '/root'));

    await service.exec('s1', 'u1', { command: 'reboot', confirm: true });

    expect(ssh.execOnClient).toHaveBeenCalled();
  });

  it('usa la escalera de sudo cuando se pide', async () => {
    control.run.mockResolvedValueOnce(done('ok', 0, '/root'));

    const result = await service.exec('s1', 'u1', { command: 'whoami', sudo: true, sudoPassword: 'x' });

    expect(control.resolveSudo).toHaveBeenCalledWith(conn, expect.anything(), 'x');
    expect(result.sudo).toBe(true);
  });

  it('audita como fallido si SSH no conecta', async () => {
    ssh.createDedicatedClient.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.exec('s1', 'u1', { command: 'uptime' })).rejects.toThrow('ECONNREFUSED');
    expect(audit.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
