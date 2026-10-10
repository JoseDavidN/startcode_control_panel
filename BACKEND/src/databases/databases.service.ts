import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DatabaseConnection,
  DatabaseConnectionStatus,
  DatabaseEngine,
} from './entities/database-connection.entity';
import { CreateDatabaseConnectionDto } from './dto/create-database-connection.dto';
import { UpdateDatabaseConnectionDto } from './dto/update-database-connection.dto';
import { TestDatabaseConnectionDto } from './dto/test-database-connection.dto';
import {
  DatabaseConnectionResponseDto,
  DatabaseConnectionTestResponseDto,
} from './dto/database-connection-response.dto';
import { CredentialsCipherService } from './services/credentials-cipher.service';
import { DatabaseProbeService, ProbeTarget } from './services/database-probe.service';
import {
  DatabaseExplorerService,
  QueryResult,
  SchemaIndex,
  SchemaProcedure,
  SchemaTable,
  SchemaTrigger,
  UpdateRowInput,
} from './services/database-explorer.service';
import { findDangerousQuery } from './services/query-policy';
import { DatabaseSessionService } from './services/database-session.service';
import {
  DatabaseQueryAudit,
  DatabaseQueryAuditStatus,
} from './entities/database-query-audit.entity';


@Injectable()
export class DatabasesService {
  private readonly logger = new Logger(DatabasesService.name);

  constructor(
    @InjectRepository(DatabaseConnection)
    private readonly repo: Repository<DatabaseConnection>,
    @InjectRepository(DatabaseQueryAudit)
    private readonly auditRepo: Repository<DatabaseQueryAudit>,
    private readonly cipher: CredentialsCipherService,
    private readonly probe: DatabaseProbeService,
    private readonly explorer: DatabaseExplorerService,
    private readonly sessions: DatabaseSessionService,
  ) {}

  async findOne(userId: string, id: string): Promise<DatabaseConnectionResponseDto> {
    return toResponse(await this.findOwned(userId, id));
  }

  /* ── Vista de consultas ───────────────────────────────────────────────
     Al entrar se abre una sesión (una conexión que reutilizan el árbol y el
     editor) y al salir se cierra. Las llamadas llegan con su `sessionId`; sin
     él, cada una abre y cierra su propia conexión. */

  /** Abre la conexión de la vista de consultas y guarda la versión del motor. */
  async openSession(userId: string, id: string): Promise<{ sessionId: string; version: string | null }> {
    const conn = await this.findOwned(userId, id);
    if (conn.engine === DatabaseEngine.REDIS) {
      throw new BadRequestException('La gestión de Redis todavía no está disponible');
    }
    const opened = await this.sessions.open(userId, id, await this.toTarget(conn));
    if (opened.version && opened.version !== conn.version) {
      await this.repo.update(conn.id, { version: opened.version });
    }
    return opened;
  }

  async closeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessions.close(userId, sessionId);
  }

  async listSchemas(userId: string, id: string, sessionId?: string): Promise<{ name: string; system: boolean }[]> {
    return this.explorer.listSchemas(await this.target(userId, id, sessionId));
  }

  async listTables(
    userId: string, id: string, schema: string, kind: 'table' | 'view' = 'table', sessionId?: string,
  ): Promise<SchemaTable[]> {
    return this.explorer.listTables(await this.target(userId, id, sessionId), schema, kind);
  }

  async listTriggers(userId: string, id: string, schema: string, sessionId?: string): Promise<SchemaTrigger[]> {
    return this.explorer.listTriggers(await this.target(userId, id, sessionId), schema);
  }

  async listIndexes(userId: string, id: string, schema: string, sessionId?: string): Promise<SchemaIndex[]> {
    return this.explorer.listIndexes(await this.target(userId, id, sessionId), schema);
  }

  async listProcedures(userId: string, id: string, schema: string, sessionId?: string): Promise<SchemaProcedure[]> {
    return this.explorer.listProcedures(await this.target(userId, id, sessionId), schema);
  }

  /* Con sesión, la suya (sin descifrar de nuevo la contraseña); sin ella, un
     destino para una conexión de un solo uso. */
  private async target(userId: string, id: string, sessionId?: string): Promise<ProbeTarget> {
    if (sessionId) return this.sessions.get(userId, id, sessionId);
    return this.toTarget(await this.findOwned(userId, id));
  }

  /**
   * Las sentencias peligrosas (`query-policy.ts`) responden 400
   * `DANGEROUS_QUERY` hasta que llegan con `confirm`; entonces se ejecutan y
   * quedan auditadas, también si el motor las rechaza.
   */
  async runQuery(
    userId: string,
    id: string,
    sql: string,
    schema?: string,
    confirm = false,
    sessionId?: string,
  ): Promise<QueryResult> {
    const conn = await this.findOwned(userId, id);
    const danger = findDangerousQuery(sql, conn.engine === DatabaseEngine.POSTGRESQL ? 'postgresql' : 'mysql');
    if (danger && !confirm) {
      throw new BadRequestException({
        code: 'DANGEROUS_QUERY',
        message: `Esta consulta ${danger.reason}.`,
        hint: 'Confírmala para ejecutarla de todas formas. Quedará registrada en la auditoría.',
      });
    }

    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    if (!danger) return this.explorer.runQuery(target, sql, schema || null);

    const started = Date.now();
    const audit = (status: DatabaseQueryAuditStatus, extra: Partial<DatabaseQueryAudit>) =>
      this.auditRepo
        .save(this.auditRepo.create({
          userId,
          connectionId: conn.id,
          schema: schema || conn.database,
          query: sql,
          reason: danger.reason,
          status,
          durationMs: Date.now() - started,
          ...extra,
        }))
        /* Un fallo al auditar no debe ocultar el resultado de la consulta. */
        .catch(err => this.logger.error(`No se pudo auditar la consulta: ${(err as Error).message}`));

    this.logger.warn(`[${conn.name}] consulta peligrosa confirmada (usuario ${userId}): ${sql.slice(0, 200)}`);
    try {
      const result = await this.explorer.runQuery(target, sql, schema || null);
      await audit(DatabaseQueryAuditStatus.OK, { affectedRows: result.affectedRows ?? result.rowCount });
      return result;
    } catch (err) {
      const message = err instanceof HttpException ? describeHttpError(err) : (err as Error).message;
      await audit(DatabaseQueryAuditStatus.ERROR, { error: message });
      throw err;
    }
  }

  /** Edición de una fila desde la tabla de resultados, por su clave primaria. */
  async updateRow(
    userId: string,
    id: string,
    input: UpdateRowInput,
    sessionId?: string,
  ): Promise<{ affectedRows: number }> {
    const conn = await this.findOwned(userId, id);
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    const result = await this.explorer.updateRow(target, input);
    this.logger.log(
      `[${conn.name}] fila editada en ${input.schema}.${input.namespace ? `${input.namespace}.` : ''}${input.table} (${Object.keys(input.changes).join(', ')}) por el usuario ${userId}`,
    );
    return result;
  }

  /** Últimas consultas peligrosas confirmadas sobre una conexión del usuario. */
  async listAudit(userId: string, id: string, limit = 50): Promise<DatabaseQueryAudit[]> {
    await this.findOwned(userId, id);
    return this.auditRepo.find({
      where: { connectionId: id, userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findAll(userId: string): Promise<DatabaseConnectionResponseDto[]> {
    const rows = await this.withPassword()
      .where('c.userId = :userId', { userId })
      .orderBy('c.createdAt', 'DESC')
      .getMany();
    return rows.map(toResponse);
  }

  async create(userId: string, dto: CreateDatabaseConnectionDto): Promise<DatabaseConnectionResponseDto> {
    const conn = this.repo.create({
      userId,
      name: dto.name.trim(),
      engine: dto.engine,
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username?.trim() ?? '',
      database: normalizeDatabase(dto.engine, dto.database),
      passwordEnc: dto.password ? this.cipher.encrypt(dto.password) : null,
      tag: dto.tag ?? null,
    });
    /* Guardar no conecta: el estado queda «sin comprobar» hasta que se pruebe
       o se entre a la vista de consultas. */
    return toResponse(await this.repo.save(conn));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateDatabaseConnectionDto,
  ): Promise<DatabaseConnectionResponseDto> {
    const conn = await this.findOwned(userId, id);
    const engine = dto.engine ?? conn.engine;
    const before = connectionFingerprint(conn);

    if (dto.name !== undefined) conn.name = dto.name.trim();
    if (dto.host !== undefined) conn.host = dto.host.trim();
    if (dto.port !== undefined) conn.port = dto.port;
    if (dto.username !== undefined) conn.username = dto.username.trim();
    /* La etiqueta no toca la conexión: queda fuera de la huella y no cierra sesiones. */
    if (dto.tag !== undefined) conn.tag = dto.tag;
    /* Cambiar de motor revalida la base: un índice de Redis no es un nombre SQL. */
    if (dto.database !== undefined || dto.engine !== undefined) {
      conn.database = normalizeDatabase(engine, dto.database ?? conn.database ?? undefined);
    }
    conn.engine = engine;
    /* Omitida: se conserva. Cadena vacía: se borra. */
    if (dto.password !== undefined) {
      conn.passwordEnc = dto.password ? this.cipher.encrypt(dto.password) : null;
    }

    /* Con otros datos de conexión el último estado ya no dice nada de la
       nueva: vuelve a «sin comprobar». Cambiar solo el nombre lo conserva. */
    if (connectionFingerprint(conn) !== before) {
      conn.status = DatabaseConnectionStatus.UNKNOWN;
      conn.lastError = null;
      conn.lastCheckedAt = null;
      /* Una vista de consultas abierta seguiría con los datos viejos. */
      await this.sessions.closeForConnection(conn.id);
    }
    return toResponse(await this.repo.save(conn));
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.repo.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Conexión no encontrada');
    await this.sessions.closeForConnection(id);
  }

  /** Única salida de la contraseña en claro hacia la app: el campo del formulario. */
  async revealPassword(userId: string, id: string): Promise<string> {
    const conn = await this.findOwned(userId, id);
    return conn.passwordEnc ? this.cipher.decrypt(conn.passwordEnc) : '';
  }

  /** Prueba datos sin guardarlos. */
  async test(userId: string, dto: TestDatabaseConnectionDto): Promise<DatabaseConnectionTestResponseDto> {
    return this.probe.probe(await this.formTarget(userId, dto));
  }

  /** Bases disponibles con datos del formulario, sin guardarlos (selector de base). */
  async previewDatabases(userId: string, dto: TestDatabaseConnectionDto): Promise<{ name: string; system: boolean }[]> {
    if (dto.engine === DatabaseEngine.REDIS) {
      throw new BadRequestException('En Redis la base es un índice de 0 a 15');
    }
    return this.explorer.listAvailableDatabases(await this.formTarget(userId, dto));
  }

  /* Datos del formulario de conexión. En una edición, sin `password` se usa la
     guardada: el usuario no tiene que revelarla para probar o listar bases. */
  private async formTarget(userId: string, dto: TestDatabaseConnectionDto): Promise<ProbeTarget> {
    let password = dto.password ?? null;
    if (dto.password === undefined && dto.connectionId) {
      const stored = await this.findOwned(userId, dto.connectionId);
      password = stored.passwordEnc ? this.cipher.decrypt(stored.passwordEnc) : null;
    }
    return {
      engine: dto.engine,
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username?.trim() ?? '',
      password,
      database: normalizeDatabase(dto.engine, dto.database),
    };
  }

  private async toTarget(conn: DatabaseConnection): Promise<ProbeTarget> {
    /* `passwordEnc` es `select: false`: si no vino en la consulta se pide aparte. */
    const enc = conn.passwordEnc !== undefined ? conn.passwordEnc : (await this.findOwned(conn.userId, conn.id)).passwordEnc;
    return {
      engine: conn.engine,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: enc ? this.cipher.decrypt(enc) : null,
      database: conn.database,
    };
  }

  private async findOwned(userId: string, id: string): Promise<DatabaseConnection> {
    const conn = await this.withPassword()
      .where('c.id = :id AND c.userId = :userId', { id, userId })
      .getOne();
    if (!conn) throw new NotFoundException('Conexión no encontrada');
    return conn;
  }

  private withPassword() {
    return this.repo.createQueryBuilder('c').addSelect('c.passwordEnc');
  }
}

function describeHttpError(err: HttpException): string {
  const res = err.getResponse();
  if (typeof res === 'string') return res;
  const msg = (res as { message?: string | string[] }).message;
  return Array.isArray(msg) ? msg.join('. ') : msg ?? err.message;
}

/** Lo que define a qué se conecta: host, puerto, credenciales, base y motor. */
function connectionFingerprint(c: DatabaseConnection): string {
  return [c.engine, c.host, c.port, c.username, c.database ?? '', c.passwordEnc ?? ''].join('\u0000');
}

/** Vacía ⇒ servidor completo; en Redis, índice 0–15 (vacía ⇒ 0). */
function normalizeDatabase(engine: DatabaseEngine, raw: string | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (engine !== DatabaseEngine.REDIS) return value || null;
  if (!value) return '0';
  if (!/^\d+$/.test(value) || Number(value) > 15) {
    throw new BadRequestException('En Redis la base es un índice entre 0 y 15');
  }
  return String(Number(value));
}

function toResponse(c: DatabaseConnection): DatabaseConnectionResponseDto {
  return {
    id: c.id,
    name: c.name,
    engine: c.engine,
    host: c.host,
    port: c.port,
    username: c.username,
    database: c.database,
    tag: c.tag,
    hasPassword: Boolean(c.passwordEnc),
    status: c.status,
    version: c.version,
    lastError: c.lastError,
    lastCheckedAt: c.lastCheckedAt,
    createdAt: c.createdAt,
  };
}
