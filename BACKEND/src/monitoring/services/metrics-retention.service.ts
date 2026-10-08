// src/monitoring/services/metrics-retention.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';

/** Días de historial que se conservan. El gráfico del dashboard usa 24 h. */
export const METRICS_RETENTION_DAYS = 30;

/* Por tandas: el primer borrado puede encontrarse con meses de filas (unas
   2.900 por servidor y día) y un DELETE único bloquearía la tabla mientras
   los agentes siguen insertando. */
const BATCH_SIZE = 10_000;

/**
 * Retención de `tbl_agent_metrics_history`: cada agente inserta un punto por
 * mensaje de métricas y nada más lo borra, así que una vez al día se eliminan
 * los anteriores a `METRICS_RETENTION_DAYS`. El snapshot actual
 * (`tbl_agent_metrics`) no se toca.
 */
@Injectable()
export class MetricsRetentionService {
  private readonly logger = new Logger(MetricsRetentionService.name);
  private running = false;

  constructor(
    @InjectRepository(AgentMetricsHistory)
    private readonly historyRepository: Repository<AgentMetricsHistory>,
  ) {}

  @Cron('0 30 3 * * *') // 03:30 cada día, fuera de horas de uso
  async purgeExpired(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    const cutoff = new Date(Date.now() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let total = 0;

    try {
      for (;;) {
        const { affected } = await this.historyRepository
          .createQueryBuilder()
          .delete()
          .where(
            `id IN (SELECT id FROM tbl_agent_metrics_history WHERE "timestamp" < :cutoff LIMIT :limit)`,
            { cutoff, limit: BATCH_SIZE },
          )
          .execute();

        total += affected ?? 0;
        if (!affected || affected < BATCH_SIZE) break;
      }

      if (total > 0) {
        this.logger.log(`Historial de métricas: ${total} registros de más de ${METRICS_RETENTION_DAYS} días eliminados`);
      }
    } catch (error) {
      this.logger.error(`Error purgando el historial de métricas: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }

    return total;
  }
}
