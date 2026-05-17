import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentDataService } from './agent-data.service';
import { AgentMetrics } from '../entities/agent-metrics.entity';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';
import { Server, ServerStatus, ServerOs } from '@servers/entities/server.entity';
import { AgentGateway } from '../gateways/agent.gateway';

const mockServer: Partial<Server> = {
  id: 'server-uuid-1',
  name: 'Producción',
  host: '192.168.1.100',
  status: ServerStatus.ONLINE,
  os: ServerOs.UBUNTU,
  ownerId: 'user-uuid-1',
  lastSeen: new Date('2024-06-01T12:00:00Z'),
};

const mockMetrics: Partial<AgentMetrics> = {
  server_id: 'server-uuid-1',
  timestamp: new Date('2024-06-01T12:00:00Z'),
  cpu_usage: 45.5,
  memory_usage_percent: 72.3,
  disk_filesystems: [{ mount: '/', usagePercent: 60 }] as any,
  system_hostname: 'prod-server-01',
  system_platform: 'linux',
  system_distro: 'Ubuntu 22.04',
  system_kernel: '5.15.0',
  system_uptime: 86400,
  system_boot_time: new Date('2024-05-31T12:00:00Z'),
  network_public_ip: '203.0.113.1',
  network_private_ips: ['192.168.1.100'] as any,
  agent_version: '1.0.0',
};

describe('AgentDataService', () => {
  let service: AgentDataService;
  let metricsRepo: Record<string, jest.Mock>;
  let historyRepo: Record<string, jest.Mock>;
  let serversRepo: Record<string, jest.Mock>;
  let agentGateway: { isAgentConnected: jest.Mock };

  beforeEach(async () => {
    metricsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    historyRepo = {
      find: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    serversRepo = {
      findOne: jest.fn(),
    };

    agentGateway = {
      isAgentConnected: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDataService,
        { provide: getRepositoryToken(AgentMetrics), useValue: metricsRepo },
        { provide: getRepositoryToken(AgentMetricsHistory), useValue: historyRepo },
        { provide: getRepositoryToken(Server), useValue: serversRepo },
        { provide: AgentGateway, useValue: agentGateway },
      ],
    }).compile();

    service = module.get<AgentDataService>(AgentDataService);
  });

  describe('getLatestMetrics', () => {
    it('retorna null cuando no existen métricas para el servidor', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      const result = await service.getLatestMetrics('server-uuid-1');

      expect(result).toBeNull();
    });

    it('retorna las métricas cuando existen', async () => {
      metricsRepo.findOne.mockResolvedValue(mockMetrics);

      const result = await service.getLatestMetrics('server-uuid-1');

      expect(result).toEqual(mockMetrics);
      expect(result?.cpu_usage).toBe(45.5);
    });
  });

  describe('getSystemInfo', () => {
    it('retorna null si no hay métricas registradas', async () => {
      metricsRepo.findOne.mockResolvedValue(null);

      const result = await service.getSystemInfo('server-uuid-1');

      expect(result).toBeNull();
    });

    it('mapea correctamente los campos de sistema', async () => {
      metricsRepo.findOne.mockResolvedValue(mockMetrics);

      const result = await service.getSystemInfo('server-uuid-1');

      expect(result?.hostname).toBe('prod-server-01');
      expect(result?.distro).toBe('Ubuntu 22.04');
      expect(result?.publicIP).toBe('203.0.113.1');
    });
  });

  describe('getAgentConnectionStatus', () => {
    it('lanza NotFoundException si el servidor no existe', async () => {
      serversRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getAgentConnectionStatus('nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('retorna connected=true cuando el agente está conectado', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      metricsRepo.findOne.mockResolvedValue(mockMetrics);
      agentGateway.isAgentConnected.mockReturnValue(true);

      const result = await service.getAgentConnectionStatus('server-uuid-1');

      expect(result.connected).toBe(true);
      expect(result.agentVersion).toBe('1.0.0');
    });

    it('retorna connected=false cuando el agente está desconectado', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      metricsRepo.findOne.mockResolvedValue(null);
      agentGateway.isAgentConnected.mockReturnValue(false);

      const result = await service.getAgentConnectionStatus('server-uuid-1');

      expect(result.connected).toBe(false);
      expect(result.agentVersion).toBeNull();
    });

    it('expone la fecha de última conexión del servidor', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      metricsRepo.findOne.mockResolvedValue(null);
      agentGateway.isAgentConnected.mockReturnValue(false);

      const result = await service.getAgentConnectionStatus('server-uuid-1');

      expect(result.lastSeen).toEqual(mockServer.lastSeen);
    });
  });

  describe('cleanOldMetrics', () => {
    it('retorna la cantidad de registros eliminados del historial', async () => {
      historyRepo.delete.mockResolvedValue({ affected: 12 });

      const deleted = await service.cleanOldMetrics(30);

      expect(deleted).toBe(12);
      expect(historyRepo.delete).toHaveBeenCalledTimes(1);
    });

    it('retorna 0 cuando no hay registros que eliminar', async () => {
      historyRepo.delete.mockResolvedValue({ affected: 0 });

      const deleted = await service.cleanOldMetrics(30);

      expect(deleted).toBe(0);
    });
  });

  describe('getMetricsLastHours', () => {
    it('llama a getHistoricalMetrics con el rango de tiempo correcto', async () => {
      const spy = jest
        .spyOn(service, 'getHistoricalMetrics')
        .mockResolvedValue({
          serverId: 'server-uuid-1',
          cpu: [],
          memory: [],
          disk: [],
          startTime: new Date(),
          endTime: new Date(),
        });

      const before = Date.now();
      await service.getMetricsLastHours('server-uuid-1', 6);
      const after = Date.now();

      expect(spy).toHaveBeenCalledTimes(1);
      const [, startTime, endTime] = spy.mock.calls[0];
      expect(endTime.getTime()).toBeGreaterThanOrEqual(before);
      expect(endTime.getTime()).toBeLessThanOrEqual(after);
      expect(endTime.getTime() - startTime.getTime()).toBeCloseTo(
        6 * 60 * 60 * 1000,
        -3,
      );
    });
  });
});
