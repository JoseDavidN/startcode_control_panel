import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { utils as sshUtils } from 'ssh2';
import {
  DatabaseConnection,
  DatabaseConnectionStatus,
  DatabaseEngine,
  DatabaseSshAuth,
  DatabaseSshMode,
} from './entities/database-connection.entity';
import { Server } from '@servers/entities/server.entity';
import type { SSHTarget } from '@monitoring/services/ssh.service';
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
  InsertColumn,
  InsertRowInput,
  TableRef,
  DeleteRowsInput,
  InsertRowResult,
} from './services/database-explorer.service';
import { findDangerousQuery, isReadOnlyQuery } from './services/query-policy';
import { DatabaseSessionService } from './services/database-session.service';
import { DatabaseTunnelService } from './services/database-tunnel.service';
import {
  RedisExplorerService,
  type RedisCommandResult,
  type RedisEditInput,
  type RedisKeyDetail,
  type RedisOverview,
  type RedisScanResult,
} from './services/redis-explorer.service';
import { checkCommand } from './services/redis-policy';
import { EXPORT_MAX_ROWS } from './services/explorer.common';
import {
  DatabaseQueryAudit,
  DatabaseQueryAuditStatus,
} from './entities/database-query-audit.entity';

/** Datos del túnel SSH, de la conexión guardada o del formulario, con el secreto en claro. */
interface TunnelConfig {
  mode: DatabaseSshMode;
  serverId: string | null;
  host: string | null;
  port: number | null;
  username: string | null;
  auth: DatabaseSshAuth | null;
  secret: string | null;
  fingerprint: string | null;
  algorithm: string | null;
}

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
    private readonly redis: RedisExplorerService,
    @InjectRepository(Server)
    private readonly servers: Repository<Server>,
    private readonly tunnels: DatabaseTunnelService,
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
    const opened = await this.sessions.open(userId, id, await this.toTarget(conn));
    if (opened.version && opened.version !== conn.version) {
      await this.repo.update(conn.id, { version: opened.version });
    }
    return opened;
  }

  /** Como el resto de rutas: con una conexión ajena o inexistente responde 404. */
  async closeSession(userId: string, id: string, sessionId: string): Promise<void> {
    if (!(await this.repo.existsBy({ id, userId }))) throw new NotFoundException('Conexión no encontrada');
    await this.sessions.close(userId, sessionId, id);
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
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(await this.findOwned(userId, id));
    assertSql(target.engine);
    return target;
  }

  /* ── Redis ────────────────────────────────────────────────────────────
     Mismo esquema que SQL: sesión de la vista y, sin ella, una conexión por
     llamada. Lo que borra (claves o comandos peligrosos) queda auditado. */

  private async redisTarget(userId: string, id: string, sessionId?: string): Promise<{ conn: DatabaseConnection; target: ProbeTarget }> {
    const conn = await this.findOwned(userId, id);
    if (conn.engine !== DatabaseEngine.REDIS) throw new BadRequestException('La conexión no es de Redis');
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    return { conn, target };
  }

  async redisOverview(userId: string, id: string, sessionId?: string): Promise<RedisOverview> {
    const { target } = await this.redisTarget(userId, id, sessionId);
    return this.redis.overview(target);
  }

  async redisScan(userId: string, id: string, db: number, pattern = '*', cursor = '0', type?: string, sessionId?: string): Promise<RedisScanResult> {
    const { target } = await this.redisTarget(userId, id, sessionId);
    return this.redis.scan(target, db, pattern, cursor, type);
  }

  async redisKey(userId: string, id: string, db: number, key: string, sessionId?: string): Promise<RedisKeyDetail> {
    const { target } = await this.redisTarget(userId, id, sessionId);
    return this.redis.getKey(target, db, key);
  }

  async redisEdit(userId: string, id: string, db: number, input: RedisEditInput, sessionId?: string): Promise<{ ok: true }> {
    const { conn, target } = await this.redisTarget(userId, id, sessionId);
    const result = await this.redis.edit(target, db, input);
    this.logger.log(`[${conn.name}] Redis db${db}: ${input.op} en «${input.key.slice(0, 200)}» por el usuario ${userId}`);
    return result;
  }

  async redisDeleteKeys(userId: string, id: string, db: number, keys: string[], sessionId?: string): Promise<{ deleted: number }> {
    const { conn, target } = await this.redisTarget(userId, id, sessionId);
    const shown = keys.slice(0, 20).map(k => JSON.stringify(k)).join(', ');
    const query = `UNLINK ${shown}${keys.length > 20 ? ` … (${keys.length} claves)` : ''}`;
    return this.audited(userId, conn, `db${db}`, query, 'borra claves desde el explorador', async () => {
      const result = await this.redis.deleteKeys(target, db, keys);
      this.logger.warn(`[${conn.name}] ${result.deleted} claves borradas de db${db} por el usuario ${userId}`);
      return { result, affected: result.deleted };
    });
  }

  /**
   * Una línea de la consola de Redis. Como en SQL, lo peligroso
   * (`redis-policy.ts`) responde 400 `DANGEROUS_QUERY` hasta que llega con
   * `confirm`, y entonces queda auditado.
   */
  async redisCommand(userId: string, id: string, db: number, line: string, confirm = false, sessionId?: string): Promise<RedisCommandResult> {
    const { conn, target } = await this.redisTarget(userId, id, sessionId);
    const args = this.redis.parseCommand(line);
    const check = checkCommand(args);
    if (check.kind !== 'dangerous') return this.redis.command(target, db, args);
    if (!confirm) {
      throw new BadRequestException({
        code: 'DANGEROUS_QUERY',
        message: `Este comando ${check.reason}.`,
        hint: 'Confírmalo para ejecutarlo de todas formas. Quedará registrado en la auditoría.',
      });
    }
    this.logger.warn(`[${conn.name}] comando de Redis peligroso confirmado (usuario ${userId}): ${line.slice(0, 200)}`);
    return this.audited(userId, conn, `db${db}`, line, check.reason, async () => {
      const result = await this.redis.command(target, db, args);
      return { result, affected: typeof result.reply === 'number' ? result.reply : null };
    });
  }

  /** Ejecuta y deja la fila de auditoría, también si falla. */
  private async audited<T>(
    userId: string, conn: DatabaseConnection, schema: string, query: string, reason: string,
    fn: () => Promise<{ result: T; affected: number | null }>,
  ): Promise<T> {
    const started = Date.now();
    const audit = (status: DatabaseQueryAuditStatus, extra: Partial<DatabaseQueryAudit>) =>
      this.auditRepo
        .save(this.auditRepo.create({ userId, connectionId: conn.id, schema, query, reason, status, durationMs: Date.now() - started, ...extra }))
        .catch(err => this.logger.error(`No se pudo auditar: ${(err as Error).message}`));
    try {
      const { result, affected } = await fn();
      await audit(DatabaseQueryAuditStatus.OK, { affectedRows: affected });
      return result;
    } catch (err) {
      const message = err instanceof HttpException ? describeHttpError(err) : (err as Error).message;
      await audit(DatabaseQueryAuditStatus.ERROR, { error: message });
      throw err;
    }
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
    assertSql(conn.engine);
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

  /**
   * Resultado completo para exportar: vuelve a ejecutar la consulta sin el
   * tope de filas de la vista (hasta `EXPORT_MAX_ROWS`). Solo consultas de
   * lectura: repetir una que escribe duplicaría su efecto.
   */
  async exportQuery(userId: string, id: string, sql: string, schema?: string, sessionId?: string): Promise<QueryResult> {
    const conn = await this.findOwned(userId, id);
    assertSql(conn.engine);
    if (!isReadOnlyQuery(sql, conn.engine === DatabaseEngine.POSTGRESQL ? 'postgresql' : 'mysql')) {
      throw new BadRequestException('Solo se puede exportar el resultado completo de consultas de lectura (SELECT, WITH, SHOW…)');
    }
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    return this.explorer.runQuery(target, sql, schema || null, EXPORT_MAX_ROWS);
  }

  /** Edición de una fila desde la tabla de resultados, por su clave primaria. */
  async updateRow(
    userId: string,
    id: string,
    input: UpdateRowInput,
    sessionId?: string,
  ): Promise<{ affectedRows: number }> {
    const conn = await this.findOwned(userId, id);
    assertSql(conn.engine);
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    const result = await this.explorer.updateRow(target, input);
    this.logger.log(
      `[${conn.name}] fila editada en ${input.schema}.${input.namespace ? `${input.namespace}.` : ''}${input.table} (${Object.keys(input.changes).join(', ')}) por el usuario ${userId}`,
    );
    return result;
  }

  /** Columnas de una tabla con su tipo y valor por defecto, para el formulario de fila nueva. */
  async tableColumns(userId: string, id: string, ref: TableRef, sessionId?: string): Promise<InsertColumn[]> {
    return this.explorer.tableColumns(await this.target(userId, id, sessionId), ref);
  }

  /** Fila nueva desde la tabla de resultados. */
  async insertRow(
    userId: string,
    id: string,
    input: InsertRowInput,
    sessionId?: string,
  ): Promise<InsertRowResult> {
    const conn = await this.findOwned(userId, id);
    assertSql(conn.engine);
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    const result = await this.explorer.insertRow(target, input);
    this.logger.log(
      `[${conn.name}] fila nueva en ${input.schema}.${input.namespace ? `${input.namespace}.` : ''}${input.table} (${Object.keys(input.values).join(', ') || 'valores por defecto'}) por el usuario ${userId}`,
    );
    return result;
  }

  /**
   * Borra filas desde los resultados, por su clave primaria. Queda en la
   * auditoría de la conexión como las consultas peligrosas confirmadas.
   */
  async deleteRows(userId: string, id: string, input: DeleteRowsInput, sessionId?: string): Promise<{ affectedRows: number }> {
    const conn = await this.findOwned(userId, id);
    assertSql(conn.engine);
    const target = sessionId ? this.sessions.get(userId, id, sessionId) : await this.toTarget(conn);
    const where = `${input.schema}.${input.namespace ? `${input.namespace}.` : ''}${input.table}`;
    const shown = input.keys.slice(0, 20).map(k => JSON.stringify(k)).join(', ');
    const query = `DELETE FROM ${where} — ${input.keys.length} ${input.keys.length === 1 ? 'fila' : 'filas'} por clave primaria: ${shown}${input.keys.length > 20 ? '…' : ''}`;
    const started = Date.now();
    const audit = (status: DatabaseQueryAuditStatus, extra: Partial<DatabaseQueryAudit>) =>
      this.auditRepo
        .save(this.auditRepo.create({
          userId, connectionId: conn.id, schema: input.schema, query, reason: 'borra filas desde los resultados',
          status, durationMs: Date.now() - started, ...extra,
        }))
        .catch(err => this.logger.error(`No se pudo auditar el borrado: ${(err as Error).message}`));
    try {
      const result = await this.explorer.deleteRows(target, input);
      await audit(DatabaseQueryAuditStatus.OK, { affectedRows: result.affectedRows });
      this.logger.warn(`[${conn.name}] ${result.affectedRows} filas borradas de ${where} por el usuario ${userId}`);
      return result;
    } catch (err) {
      const message = err instanceof HttpException ? describeHttpError(err) : (err as Error).message;
      await audit(DatabaseQueryAuditStatus.ERROR, { error: message });
      throw err;
    }
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
      sshMode: DatabaseSshMode.NONE,
    });
    await this.applyTunnel(userId, conn, dto);
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
    await this.applyTunnel(userId, conn, dto);

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
    const mode = dto.sshMode ?? DatabaseSshMode.NONE;
    let secret = dto.sshSecret || null;
    if (!secret && mode === DatabaseSshMode.CUSTOM && dto.connectionId) {
      const stored = await this.findOwned(userId, dto.connectionId);
      /* La guardada solo vale para el mismo tipo: una contraseña no es una llave. */
      if (stored.sshSecretEnc && stored.sshAuth === dto.sshAuth) secret = this.cipher.decrypt(stored.sshSecretEnc);
    }
    const host = dto.host.trim();
    return {
      engine: dto.engine,
      host,
      port: dto.port,
      username: dto.username?.trim() ?? '',
      password,
      database: normalizeDatabase(dto.engine, dto.database),
      tunnel: this.tunnelFor(userId, {
        mode,
        serverId: dto.sshServerId ?? null,
        host: dto.sshHost?.trim() || null,
        port: dto.sshPort ?? null,
        username: dto.sshUsername?.trim() || null,
        auth: dto.sshAuth ?? null,
        secret,
        fingerprint: dto.sshHostKeyFingerprint ?? null,
        algorithm: dto.sshHostKeyAlgorithm ?? null,
      }, host, dto.port),
    };
  }

  private async toTarget(conn: DatabaseConnection): Promise<ProbeTarget> {
    /* `passwordEnc` y `sshSecretEnc` son `select: false`: si no vinieron en la consulta se piden aparte. */
    const full = conn.passwordEnc !== undefined && conn.sshSecretEnc !== undefined
      ? conn
      : await this.findOwned(conn.userId, conn.id);
    return {
      engine: conn.engine,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: full.passwordEnc ? this.cipher.decrypt(full.passwordEnc) : null,
      database: conn.database,
      tunnel: this.tunnelFor(conn.userId, {
        mode: conn.sshMode,
        serverId: conn.sshServerId,
        host: conn.sshHost,
        port: conn.sshPort,
        username: conn.sshUsername,
        auth: conn.sshAuth,
        secret: full.sshSecretEnc ? this.cipher.decrypt(full.sshSecretEnc) : null,
        fingerprint: conn.sshHostKeyFingerprint,
        algorithm: conn.sshHostKeyAlgorithm,
      }, conn.host, conn.port),
    };
  }

  /* ── Túnel SSH ────────────────────────────────────────────────────────
     Con túnel, el driver se conecta a la boca local que abre
     `DatabaseTunnelService`, y el motor (`host`:`port`) se alcanza desde el
     servidor SSH. El túnel se abre al conectar, no al armar el destino. */

  private tunnelFor(userId: string, cfg: TunnelConfig, dstHost: string, dstPort: number): ProbeTarget['tunnel'] {
    if (cfg.mode === DatabaseSshMode.NONE) return undefined;
    return async () => this.tunnels.acquire({ ssh: await this.sshTarget(userId, cfg), dstHost, dstPort });
  }

  private async sshTarget(userId: string, cfg: TunnelConfig): Promise<SSHTarget> {
    if (cfg.mode === DatabaseSshMode.SERVER) {
      const server = cfg.serverId
        ? await this.servers
          .createQueryBuilder('s')
          .addSelect('s.privateKey')
          .where('s.id = :id AND s.ownerId = :userId', { id: cfg.serverId, userId })
          .getOne()
        : null;
      if (!server) throw new BadRequestException('El servidor del túnel SSH ya no existe: elige otro en la conexión');
      return {
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: CredentialsCipherService.isEncrypted(server.privateKey)
          ? this.cipher.decrypt(server.privateKey)
          : server.privateKey,
        hostKeyAlgorithm: server.hostKeyAlgorithm,
        hostKeyFingerprint: server.hostKeyFingerprint,
      };
    }
    const problem = tunnelProblem(cfg);
    if (problem) throw new BadRequestException(problem);
    return {
      name: `túnel ${cfg.host}`,
      host: cfg.host!,
      port: cfg.port!,
      username: cfg.username!,
      ...(cfg.auth === DatabaseSshAuth.KEY ? { privateKey: cfg.secret! } : { password: cfg.secret! }),
      hostKeyAlgorithm: cfg.algorithm,
      hostKeyFingerprint: cfg.fingerprint,
    };
  }

  /**
   * Copia el túnel del formulario a la conexión. Al cambiar de modo se borra
   * lo del anterior; con otro host o puerto SSH, la huella vieja deja de valer.
   */
  private async applyTunnel(
    userId: string,
    conn: DatabaseConnection,
    dto: CreateDatabaseConnectionDto | UpdateDatabaseConnectionDto,
  ): Promise<void> {
    const mode = dto.sshMode ?? conn.sshMode ?? DatabaseSshMode.NONE;
    conn.sshMode = mode;
    if (mode !== DatabaseSshMode.SERVER) conn.sshServerId = null;
    if (mode !== DatabaseSshMode.CUSTOM) {
      Object.assign(conn, {
        sshHost: null, sshPort: null, sshUsername: null, sshAuth: null,
        sshSecretEnc: null, sshHostKeyFingerprint: null, sshHostKeyAlgorithm: null,
      });
    }

    if (mode === DatabaseSshMode.SERVER) {
      if (dto.sshServerId !== undefined) conn.sshServerId = dto.sshServerId;
      if (!conn.sshServerId || !(await this.servers.existsBy({ id: conn.sshServerId, ownerId: userId }))) {
        throw new BadRequestException('Elige uno de tus servidores para el túnel SSH');
      }
    }

    if (mode === DatabaseSshMode.CUSTOM) {
      const before = { host: conn.sshHost, port: conn.sshPort, auth: conn.sshAuth };
      if (dto.sshHost !== undefined) conn.sshHost = dto.sshHost.trim();
      if (dto.sshPort !== undefined) conn.sshPort = dto.sshPort;
      if (dto.sshUsername !== undefined) conn.sshUsername = dto.sshUsername.trim();
      if (dto.sshAuth !== undefined) conn.sshAuth = dto.sshAuth;
      if (dto.sshHostKeyFingerprint !== undefined) {
        conn.sshHostKeyFingerprint = dto.sshHostKeyFingerprint;
        conn.sshHostKeyAlgorithm = dto.sshHostKeyAlgorithm ?? null;
      } else if (conn.sshHost !== before.host || conn.sshPort !== before.port) {
        conn.sshHostKeyFingerprint = null;
        conn.sshHostKeyAlgorithm = null;
      }
      if (dto.sshSecret) {
        conn.sshSecretEnc = this.cipher.encrypt(
          conn.sshAuth === DatabaseSshAuth.KEY ? normalizePrivateKey(dto.sshSecret) : dto.sshSecret,
        );
      } else if (conn.sshAuth !== before.auth) {
        conn.sshSecretEnc = null;
      }
      const problem = tunnelProblem({
        mode,
        serverId: null,
        host: conn.sshHost,
        port: conn.sshPort,
        username: conn.sshUsername,
        auth: conn.sshAuth,
        secret: conn.sshSecretEnc,
        fingerprint: conn.sshHostKeyFingerprint,
        algorithm: conn.sshHostKeyAlgorithm,
      });
      if (problem) throw new BadRequestException(problem);
    }
  }

  private async findOwned(userId: string, id: string): Promise<DatabaseConnection> {
    const conn = await this.withPassword()
      .where('c.id = :id AND c.userId = :userId', { id, userId })
      .getOne();
    if (!conn) throw new NotFoundException('Conexión no encontrada');
    return conn;
  }

  private withPassword() {
    return this.repo.createQueryBuilder('c').addSelect('c.passwordEnc').addSelect('c.sshSecretEnc');
  }
}

/* Las rutas de SQL no valen para Redis (y al revés: ver `redisTarget`). */
function assertSql(engine: DatabaseEngine): void {
  if (engine === DatabaseEngine.REDIS) throw new BadRequestException('Redis no usa SQL: usa el explorador de claves o la consola');
}

function describeHttpError(err: HttpException): string {
  const res = err.getResponse();
  if (typeof res === 'string') return res;
  const msg = (res as { message?: string | string[] }).message;
  return Array.isArray(msg) ? msg.join('. ') : msg ?? err.message;
}

/** Lo que define a qué se conecta: host, puerto, credenciales, base y motor. */
function connectionFingerprint(c: DatabaseConnection): string {
  return [
    c.engine, c.host, c.port, c.username, c.database ?? '', c.passwordEnc ?? '',
    c.sshMode, c.sshServerId ?? '', c.sshHost ?? '', c.sshPort ?? '', c.sshUsername ?? '',
    c.sshAuth ?? '', c.sshSecretEnc ?? '', c.sshHostKeyFingerprint ?? '',
  ].join('\u0000');
}

/** Lo que falta en un túnel con credenciales propias; null si está completo. */
function tunnelProblem(cfg: TunnelConfig): string | null {
  if (cfg.mode !== DatabaseSshMode.CUSTOM) return null;
  if (!cfg.host || !cfg.port || !cfg.username || !cfg.auth) return 'Completa el host, el puerto y el usuario del servidor SSH del túnel';
  if (!cfg.secret) {
    return cfg.auth === DatabaseSshAuth.KEY ? 'Pega la llave privada SSH del túnel' : 'Escribe la contraseña SSH del túnel';
  }
  if (!cfg.fingerprint) return 'Confirma la huella del servidor SSH del túnel';
  return null;
}

/** Llave privada con saltos de línea normales; falla si no se puede leer o lleva frase de paso. */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.includes('\\n') && !key.includes('\n')) key = key.replace(/\\n/g, '\n');
  key = key.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).join('\n') + '\n';
  const parsed = sshUtils.parseKey(key);
  if (parsed instanceof Error) {
    throw new BadRequestException(
      /encrypted|passphrase/i.test(parsed.message)
        ? 'La llave privada SSH tiene frase de paso: usa una sin frase de paso'
        : 'La llave privada SSH no es válida',
    );
  }
  return key;
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
    sshMode: c.sshMode,
    sshServerId: c.sshServerId,
    sshHost: c.sshHost,
    sshPort: c.sshPort,
    sshUsername: c.sshUsername,
    sshAuth: c.sshAuth,
    hasSshSecret: Boolean(c.sshSecretEnc),
    sshHostKeyFingerprint: c.sshHostKeyFingerprint,
    sshHostKeyAlgorithm: c.sshHostKeyAlgorithm,
    status: c.status,
    version: c.version,
    lastError: c.lastError,
    lastCheckedAt: c.lastCheckedAt,
    createdAt: c.createdAt,
  };
}
