import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DockerService } from './docker.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService } from './service-control.service';
import { ServersService } from '@servers/servers.service';

const ok = (stdout = ''): SSHExecResult => ({ stdout, stderr: '', code: 0 });
const fail = (stderr: string, code = 1): SSHExecResult => ({ stdout: '', stderr, code });

const PS_LINE = JSON.stringify({
  ID: 'abcdef1234567890abcdef',
  Names: 'web',
  Image: 'nginx:1.27',
  Command: '"/docker-entrypoint.sh nginx"',
  CreatedAt: '2026-10-01 10:00:00 +0000 UTC',
  RunningFor: '6 days ago',
  Status: 'Up 6 days (healthy)',
  State: 'running',
  Ports: '0.0.0.0:80->80/tcp, :::80->80/tcp',
  Networks: 'bridge,app_net',
  Mounts: '/srv/www',
  Labels: 'com.docker.compose.project=shop,com.docker.compose.service=web',
});

const STATS_LINE = JSON.stringify({
  ID: 'abcdef1234567890abcdef',
  CPUPerc: '1.25%',
  MemPerc: '3.40%',
  MemUsage: '64MiB / 1.9GiB',
  NetIO: '1.2MB / 800kB',
  BlockIO: '0B / 4kB',
  PIDs: '5',
});

describe('DockerService', () => {
  let service: DockerService;
  let ssh: { createDedicatedClient: jest.Mock; execOnClient: jest.Mock };
  let control: { resolveSudo: jest.Mock; run: jest.Mock };
  const conn = { end: jest.fn() };

  beforeEach(async () => {
    ssh = { createDedicatedClient: jest.fn().mockResolvedValue(conn), execOnClient: jest.fn() };
    control = { resolveSudo: jest.fn().mockResolvedValue({ kind: 'sudo-nopasswd' }), run: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DockerService,
        { provide: SSHService, useValue: ssh },
        { provide: ServiceControlService, useValue: control },
        {
          provide: ServersService,
          useValue: { findOneWithPrivateKey: jest.fn().mockResolvedValue({ host: '10.0.0.1' }) },
        },
      ],
    }).compile();

    service = module.get(DockerService);
  });

  it('combina docker ps y docker stats en una lista', async () => {
    ssh.execOnClient.mockResolvedValueOnce(ok(PS_LINE)).mockResolvedValueOnce(ok(STATS_LINE));

    const { containers } = await service.listContainers('s1', 'u1');

    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      id: 'abcdef123456',
      name: 'web',
      command: '/docker-entrypoint.sh nginx',
      ports: ['0.0.0.0:80->80/tcp', ':::80->80/tcp'],
      networks: ['bridge', 'app_net'],
      composeProject: 'shop',
      composeService: 'web',
      stats: { cpuPercent: 1.25, memPercent: 3.4, pids: 5 },
    });
    expect(conn.end).toHaveBeenCalled();
  });

  it('escala a sudo si el socket de docker niega el acceso', async () => {
    ssh.execOnClient.mockResolvedValueOnce(
      fail('permission denied while trying to connect to the Docker daemon socket'),
    );
    control.run.mockResolvedValueOnce(ok(PS_LINE)).mockResolvedValueOnce(ok(STATS_LINE));

    const { containers } = await service.listContainers('s1', 'u1', 'secreto');

    expect(control.resolveSudo).toHaveBeenCalledWith(conn, expect.anything(), 'secreto');
    expect(containers[0].stats?.memUsage).toBe('64MiB / 1.9GiB');
  });

  it('no pide docker stats si no hay contenedores', async () => {
    ssh.execOnClient.mockResolvedValueOnce(ok(''));

    const { containers } = await service.listContainers('s1', 'u1');

    expect(containers).toEqual([]);
    expect(ssh.execOnClient).toHaveBeenCalledTimes(1);
  });

  it('responde DOCKER_UNAVAILABLE si docker no está instalado', async () => {
    ssh.execOnClient.mockResolvedValueOnce(fail('bash: docker: command not found', 127));

    await expect(service.listContainers('s1', 'u1')).rejects.toThrow(ServiceUnavailableException);
  });
});
