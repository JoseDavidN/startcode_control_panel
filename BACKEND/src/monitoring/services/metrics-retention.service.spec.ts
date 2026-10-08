import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsRetentionService, METRICS_RETENTION_DAYS } from './metrics-retention.service';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';

describe('MetricsRetentionService', () => {
  let service: MetricsRetentionService;
  let execute: jest.Mock;
  let where: jest.Mock<{ execute: jest.Mock }, [string, { cutoff: Date; limit: number }]>;

  beforeEach(async () => {
    execute = jest.fn();
    where = jest.fn<{ execute: jest.Mock }, [string, { cutoff: Date; limit: number }]>(() => ({ execute }));
    const builder = { delete: () => ({ where }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsRetentionService,
        { provide: getRepositoryToken(AgentMetricsHistory), useValue: { createQueryBuilder: () => builder } },
      ],
    }).compile();

    service = module.get(MetricsRetentionService);
  });

  it('borra por tandas hasta que una sale incompleta', async () => {
    execute
      .mockResolvedValueOnce({ affected: 10_000 })
      .mockResolvedValueOnce({ affected: 10_000 })
      .mockResolvedValueOnce({ affected: 42 });

    await expect(service.purgeExpired()).resolves.toBe(20_042);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it(`corta en ${METRICS_RETENTION_DAYS} días`, async () => {
    execute.mockResolvedValueOnce({ affected: 0 });
    const before = Date.now();

    await service.purgeExpired();

    const { cutoff } = where.mock.calls[0][1];
    const days = (before - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(METRICS_RETENTION_DAYS);
  });

  it('no lanza si la base de datos falla', async () => {
    execute.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.purgeExpired()).resolves.toBe(0);
  });
});
