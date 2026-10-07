import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ServiceControlService } from './service-control.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { AgentDataService } from './agent-data.service';
import { AgentGateway } from '../gateways/agent.gateway';
import { ServersService } from '@servers/servers.service';
import { ServiceAction } from '../dto/service-action.dto';
import { Server, ServerOs, ServerStatus } from '@servers/entities/server.entity';

const mockServer: Partial<Server> = {
  id: 'server-uuid-1',
  name: 'Producción',
  host: '192.168.1.100',
  username: 'deploy',
  status: ServerStatus.ONLINE,
  os: ServerOs.UBUNTU,
  ownerId: 'user-uuid-1',
};

const ok = (stdout = ''): SSHExecResult => ({ stdout, stderr: '', code: 0 });
const fail = (stderr: string, code = 1): SSHExecResult => ({ stdout: '', stderr, code });

const SHOW_ACTIVE = [
  'ActiveState=active',
  'SubState=running',
  'MainPID=4321',
  'UnitFileState=enabled',
].join('\n');

describe('ServiceControlService', () => {
  let service: ServiceControlService;
  let ssh: { createDedicatedClient: jest.Mock; execOnClient: jest.Mock };
  let servers: { findOneWithPrivateKey: jest.Mock };
  let agentData: { patchServiceState: jest.Mock };
  let gateway: { emitToOwner: jest.Mock };
  const conn = { end: jest.fn() };

  /** Encola las respuestas de `execOnClient` en el orden en que se piden. */
  const queue = (...results: SSHExecResult[]) => {
    for (const result of results) ssh.execOnClient.mockResolvedValueOnce(result);
  };

  beforeEach(async () => {
    ssh = {
      createDedicatedClient: jest.fn().mockResolvedValue(conn),
      execOnClient: jest.fn(),
    };
    servers = { findOneWithPrivateKey: jest.fn().mockResolvedValue(mockServer) };
    agentData = { patchServiceState: jest.fn().mockResolvedValue(null) };
    gateway = { emitToOwner: jest.fn() };
    conn.end.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceControlService,
        { provide: SSHService, useValue: ssh },
        { provide: ServersService, useValue: servers },
        { provide: AgentDataService, useValue: agentData },
        { provide: AgentGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<ServiceControlService>(ServiceControlService);
  });

  it('rechaza nombres de servicio inválidos sin abrir SSH', async () => {
    await expect(
      service.executeAction('server-uuid-1', 'user-uuid-1', 'nginx; rm -rf /', ServiceAction.STOP),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ssh.createDedicatedClient).not.toHaveBeenCalled();
  });

  it('ejecuta la acción como root y devuelve el estado leído del servidor', async () => {
    queue(ok('0'), ok(), ok(SHOW_ACTIVE));

    const result = await service.executeAction(
      'server-uuid-1',
      'user-uuid-1',
      'nginx',
      ServiceAction.START,
    );

    expect(ssh.execOnClient).toHaveBeenNthCalledWith(2, conn, 'systemctl start nginx', expect.anything());
    expect(result).toMatchObject({
      success: true,
      action: 'start',
      service: 'nginx',
      state: 'active',
      subState: 'running',
      pid: 4321,
      enabled: true,
    });
    expect(conn.end).toHaveBeenCalled();
  });

  it('antepone sudo -n cuando el usuario no es root pero no necesita contraseña', async () => {
    queue(ok('1000'), ok(), ok(), ok(SHOW_ACTIVE));

    await service.executeAction('server-uuid-1', 'user-uuid-1', 'nginx', ServiceAction.RESTART);

    expect(ssh.execOnClient).toHaveBeenNthCalledWith(
      3,
      conn,
      'sudo -n systemctl restart nginx',
      expect.anything(),
    );
  });

  it('pide la contraseña con SUDO_REQUIRED cuando sudo la exige y no se envió', async () => {
    queue(ok('1000'), fail('sudo: a password is required'));

    await expect(
      service.executeAction('server-uuid-1', 'user-uuid-1', 'nginx', ServiceAction.STOP),
    ).rejects.toMatchObject({
      response: { code: 'SUDO_REQUIRED' },
    });
    expect(conn.end).toHaveBeenCalled();
  });

  it('rechaza una contraseña de sudo incorrecta antes de tocar el servicio', async () => {
    queue(ok('1000'), fail('sudo: a password is required'), fail('Sorry, try again.'));

    await expect(
      service.executeAction(
        'server-uuid-1',
        'user-uuid-1',
        'nginx',
        ServiceAction.STOP,
        'mala',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    /* id -u, sudo -n true y la comprobación de la contraseña: nada más. */
    expect(ssh.execOnClient).toHaveBeenCalledTimes(3);
  });

  it('propaga el motivo de systemctl cuando la acción falla', async () => {
    queue(
      ok('0'),
      fail('Failed to start nope.service: Unit nope.service not found.'),
      ok('ActiveState=inactive\nSubState=dead\nMainPID=0\nUnitFileState=disabled'),
    );

    const result = await service.executeAction(
      'server-uuid-1',
      'user-uuid-1',
      'nope',
      ServiceAction.START,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unit nope.service not found');
    expect(result.pid).toBeNull();
    expect(result.enabled).toBe(false);
  });

  it('no deja parar ni deshabilitar las unidades que sostienen el panel', async () => {
    for (const unit of ['sshd', 'ssh.service', 'startcode-agent']) {
      await expect(
        service.executeAction('server-uuid-1', 'user-uuid-1', unit, ServiceAction.STOP),
      ).rejects.toMatchObject({ response: { code: 'PROTECTED_UNIT' } });
    }

    /* Reiniciar sshd sí se permite: no corta las sesiones ya abiertas. */
    queue(ok('0'), ok(), ok(SHOW_ACTIVE));
    await expect(
      service.executeAction('server-uuid-1', 'user-uuid-1', 'sshd', ServiceAction.RESTART),
    ).resolves.toMatchObject({ success: true });
  });

  it('habilita el arranque automático leyendo UnitFileState', async () => {
    queue(ok('0'), ok(), ok(SHOW_ACTIVE));

    const result = await service.executeAction(
      'server-uuid-1',
      'user-uuid-1',
      'nginx',
      ServiceAction.ENABLE,
    );

    expect(ssh.execOnClient).toHaveBeenNthCalledWith(
      2,
      conn,
      'systemctl enable nginx',
      expect.anything(),
    );
    expect(result.enabled).toBe(true);
  });

  describe('killProcess', () => {
    it('envía SIGTERM sin -9 y sin sudo si el proceso es del usuario SSH', async () => {
      queue(ok('node\n'), ok(), ok());

      const result = await service.killProcess('server-uuid-1', 'user-uuid-1', 4321);

      expect(ssh.execOnClient).toHaveBeenNthCalledWith(2, conn, 'kill -TERM 4321', expect.anything());
      expect(ssh.execOnClient.mock.calls.some(([, cmd]) => String(cmd).includes('-9'))).toBe(false);
      expect(result).toEqual({ success: true, pid: 4321, name: 'node', exited: true });
    });

    it('escala a sudo cuando kill no tiene permiso', async () => {
      queue(ok('postgres'), fail('kill: (4321) - Operation not permitted'), ok('0'), ok(), fail('', 1));

      const result = await service.killProcess('server-uuid-1', 'user-uuid-1', 4321);

      expect(ssh.execOnClient).toHaveBeenNthCalledWith(4, conn, 'kill -TERM 4321', expect.anything());
      expect(result.exited).toBe(false);
    });

    it('no deja cerrar procesos que sostienen el panel', async () => {
      queue(ok('sshd'));

      await expect(service.killProcess('server-uuid-1', 'user-uuid-1', 800)).rejects.toThrow(
        BadRequestException,
      );
      expect(ssh.execOnClient).toHaveBeenCalledTimes(1);
    });

    it('rechaza PID 1 y PIDs inválidos sin abrir SSH', async () => {
      await expect(service.killProcess('server-uuid-1', 'user-uuid-1', 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(ssh.createDedicatedClient).not.toHaveBeenCalled();
    });
  });

  describe('readLogs', () => {
    it('lee el journal sin sudo cuando el usuario ya tiene permiso', async () => {
      queue(ok('ene 01 10:00:00 host nginx[1]: arrancado'));

      const result = await service.readLogs('server-uuid-1', 'user-uuid-1', 'nginx', {
        lines: 50,
      });

      expect(ssh.execOnClient).toHaveBeenCalledWith(
        conn,
        'journalctl -u nginx -n 50 --no-pager --output=short-iso',
        expect.anything(),
      );
      expect(result.lines).toContain('arrancado');
      /* Un solo exec: no se escala si no hace falta. */
      expect(ssh.execOnClient).toHaveBeenCalledTimes(1);
    });

    it('escala a sudo cuando el journal no deja leer', async () => {
      queue(fail('No journal files were opened due to insufficient permissions.'), ok('0'), ok('línea'));

      const result = await service.readLogs('server-uuid-1', 'user-uuid-1', 'nginx');

      expect(result.lines).toBe('línea');
    });

    it('acota las líneas pedidas al rango permitido', async () => {
      queue(ok('x'));

      await service.readLogs('server-uuid-1', 'user-uuid-1', 'nginx', { lines: 9000 });

      expect(ssh.execOnClient).toHaveBeenCalledWith(
        conn,
        'journalctl -u nginx -n 500 --no-pager --output=short-iso',
        expect.anything(),
      );
    });
  });

  it('emite el inventario parcheado al dueño del servidor', async () => {
    const services = [{ name: 'nginx', state: 'inactive' }];
    agentData.patchServiceState.mockResolvedValue(services);
    queue(ok('0'), ok(), ok('ActiveState=inactive\nSubState=dead\nMainPID=0\nUnitFileState=enabled'));

    await service.executeAction('server-uuid-1', 'user-uuid-1', 'nginx', ServiceAction.STOP);

    expect(agentData.patchServiceState).toHaveBeenCalledWith('server-uuid-1', {
      name: 'nginx',
      state: 'inactive',
      subState: 'dead',
      pid: null,
      enabled: true,
    });
    expect(gateway.emitToOwner).toHaveBeenCalledWith(
      'user-uuid-1',
      'server:services:updated',
      { serverId: 'server-uuid-1', services },
    );
  });
});
