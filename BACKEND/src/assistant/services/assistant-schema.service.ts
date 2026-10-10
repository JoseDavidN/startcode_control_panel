import { Injectable, Logger } from '@nestjs/common';
import { DatabasesService } from '@/databases/databases.service';
import type { SchemaTable } from '@/databases/services/explorer.common';
import { ChatDatabaseRefDto } from '../dto/assistant-chat.dto';

/** Tope de la estructura que se adjunta a cada pregunta. */
const MAX_STRUCTURE_CHARS = 40_000;
/** Sin base activa se describen las de la conexión, hasta este número. */
const MAX_SCHEMAS = 8;

/**
 * Estructura real de la base que el usuario tiene abierta, leída del motor
 * justo antes de preguntar: tablas, vistas y columnas con su tipo. Así el
 * asistente escribe SQL con los nombres que existen (`tbl_students_total`)
 * y no con los que el usuario dijo de memoria («students total»).
 *
 * Usa `DatabasesService`, que comprueba que la conexión y la sesión son de
 * este usuario. Solo lee metadatos, nunca filas.
 */
@Injectable()
export class AssistantSchemaService {
  private readonly logger = new Logger(AssistantSchemaService.name);

  constructor(private readonly databases: DatabasesService) {}

  async describe(userId: string, ref: ChatDatabaseRefDto): Promise<string> {
    try {
      return await this.read(userId, ref, ref.sessionId);
    } catch (err) {
      /* La sesión de la vista pudo cerrarse: se intenta con una conexión de un solo uso. */
      if (!ref.sessionId) return this.failed(ref, err);
      try {
        return await this.read(userId, ref, undefined);
      } catch (retryErr) {
        return this.failed(ref, retryErr);
      }
    }
  }

  private failed(ref: ChatDatabaseRefDto, err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(`No se pudo leer la estructura de ${ref.connectionId}: ${message}`);
    return `No se pudo leer la estructura de la base (${message}).`;
  }

  private async read(userId: string, ref: ChatDatabaseRefDto, sessionId: string | undefined): Promise<string> {
    const schemas = ref.schema
      ? [ref.schema]
      : (await this.databases.listSchemas(userId, ref.connectionId, sessionId))
          .filter(s => !s.system)
          .map(s => s.name);

    const lines: string[] = [];
    if (schemas.length > MAX_SCHEMAS) {
      lines.push(`La conexión tiene ${schemas.length} bases; se describen las ${MAX_SCHEMAS} primeras. Resto: ${schemas.slice(MAX_SCHEMAS).join(', ')}`);
    }

    /* En serie: la sesión de la vista atiende una consulta a la vez. */
    for (const schema of schemas.slice(0, MAX_SCHEMAS)) {
      const tables = await this.databases.listTables(userId, ref.connectionId, schema, 'table', sessionId);
      const views = await this.databases.listTables(userId, ref.connectionId, schema, 'view', sessionId);
      lines.push(`## Base ${schema}`);
      lines.push(tables.length ? '### Tablas' : '### Tablas: ninguna');
      lines.push(...tables.map(describeTable));
      if (views.length) lines.push('### Vistas', ...views.map(describeTable));
    }

    const text = lines.join('\n');
    return text.length > MAX_STRUCTURE_CHARS ? `${text.slice(0, MAX_STRUCTURE_CHARS)}\n… [recortado]` : text;
  }
}

function describeTable(t: SchemaTable): string {
  const cols = t.columns
    .map(c => `${c.name} ${c.type}${c.key ? ` ${c.key}` : ''}${c.nullable ? '' : ' NOT NULL'}`)
    .join(', ');
  return `- ${t.namespace ? `${t.namespace}.` : ''}${t.name}${t.rows !== null ? ` (~${t.rows} filas)` : ''}: ${cols}`;
}
