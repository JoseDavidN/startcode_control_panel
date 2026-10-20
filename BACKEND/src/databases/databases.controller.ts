import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { DatabasesService } from './databases.service';
import { CreateDatabaseConnectionDto } from './dto/create-database-connection.dto';
import { UpdateDatabaseConnectionDto } from './dto/update-database-connection.dto';
import { TestDatabaseConnectionDto } from './dto/test-database-connection.dto';
import { RunQueryDto } from './dto/run-query.dto';
import { UpdateRowDto } from './dto/update-row.dto';
import { DeleteRowsDto, InsertRowDto, TableRefDto } from './dto/insert-row.dto';
import { RedisCommandDto, RedisDeleteKeysDto, RedisEditDto, RedisKeyDto, RedisScanDto } from './dto/redis.dto';
import type {
  RedisCommandResult,
  RedisKeyDetail,
  RedisOverview,
  RedisScanResult,
} from './services/redis-explorer.service';
import type {
  QueryResult,
  SchemaIndex,
  SchemaProcedure,
  SchemaTable,
  SchemaTrigger,
  InsertColumn,
  InsertRowResult,
} from './services/database-explorer.service';
import {
  DatabaseConnectionPasswordResponseDto,
  DatabaseConnectionResponseDto,
  DatabaseConnectionTestResponseDto,
} from './dto/database-connection-response.dto';

/** Lo que deja `JwtAuthGuard` en la petición. */
interface AuthedRequest {
  user: { id: string };
}

/* Todas las rutas trabajan sobre las conexiones del usuario autenticado:
   una conexión de otro usuario responde 404, como si no existiera. */
@ApiTags('Databases')
@Controller('databases')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class DatabasesController {
  constructor(private readonly databasesService: DatabasesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar las conexiones del usuario' })
  @ApiResponse({ status: 200, type: [DatabaseConnectionResponseDto] })
  findAll(@Request() req: AuthedRequest): Promise<DatabaseConnectionResponseDto[]> {
    return this.databasesService.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una conexión',
    description: 'Guarda la contraseña cifrada. No conecta: el estado queda `unknown` hasta comprobarla (`POST /:id/check`) o probarla antes con `POST /test`.',
  })
  @ApiResponse({ status: 201, type: DatabaseConnectionResponseDto })
  create(@Request() req: AuthedRequest, @Body() dto: CreateDatabaseConnectionDto): Promise<DatabaseConnectionResponseDto> {
    return this.databasesService.create(req.user.id, dto);
  }

  /* Antes que `:id`: `test` y `schemas` no son ids. */
  @Post('schemas')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Bases disponibles con datos de conexión sin guardar',
    description: 'Para el selector de base del formulario. MySQL, MariaDB y PostgreSQL. Con `connectionId` y sin `password` usa la contraseña guardada.',
  })
  previewDatabases(
    @Request() req: AuthedRequest,
    @Body() dto: TestDatabaseConnectionDto,
  ): Promise<{ name: string; system: boolean }[]> {
    return this.databasesService.previewDatabases(req.user.id, dto);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Probar datos de conexión sin guardarlos' })
  @ApiResponse({ status: 200, type: DatabaseConnectionTestResponseDto })
  test(@Request() req: AuthedRequest, @Body() dto: TestDatabaseConnectionDto): Promise<DatabaseConnectionTestResponseDto> {
    return this.databasesService.test(req.user.id, dto);
  }

  @Post(':id/sessions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Abrir la conexión de la vista de consultas',
    description: 'Conecta y devuelve `sessionId` y la versión del motor. El árbol y el editor la reutilizan pasando el `sessionId`; se cierra con `DELETE` al salir de la vista o tras 30 min sin uso. Es la única conexión que el panel mantiene abierta.',
  })
  @ApiParam({ name: 'id' })
  openSession(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ sessionId: string; version: string | null }> {
    return this.databasesService.openSession(req.user.id, id);
  }

  @Delete(':id/sessions/:sessionId')
  @ApiOperation({ summary: 'Cerrar la conexión de la vista de consultas' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'sessionId' })
  async closeSession(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ closed: true }> {
    await this.databasesService.closeSession(req.user.id, id, sessionId);
    return { closed: true };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una conexión' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: DatabaseConnectionResponseDto })
  findOne(@Request() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<DatabaseConnectionResponseDto> {
    return this.databasesService.findOne(req.user.id, id);
  }

  @Get(':id/schemas')
  @ApiOperation({
    summary: 'Bases de la conexión',
    description: 'Si la conexión apunta a una base, solo esa; si no, todas las que ve el usuario. Por ahora MySQL y MariaDB.',
  })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'session', required: false, description: 'Sesión de la vista de consultas' })
  listSchemas(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('session') session?: string,
  ): Promise<{ name: string; system: boolean }[]> {
    return this.databasesService.listSchemas(req.user.id, id, session);
  }

  @Get(':id/schemas/:schema/tables')
  @ApiOperation({ summary: 'Tablas de una base, con sus columnas y filas estimadas' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'schema' })
  listTables(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schema') schema: string,
    @Query('session') session?: string,
  ): Promise<SchemaTable[]> {
    return this.databasesService.listTables(req.user.id, id, schema, 'table', session);
  }

  @Get(':id/schemas/:schema/views')
  @ApiOperation({ summary: 'Vistas de una base, con sus columnas' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'schema' })
  listViews(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schema') schema: string,
    @Query('session') session?: string,
  ): Promise<SchemaTable[]> {
    return this.databasesService.listTables(req.user.id, id, schema, 'view', session);
  }

  @Get(':id/schemas/:schema/triggers')
  @ApiOperation({ summary: 'Triggers de una base: momento, evento y tabla' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'schema' })
  listTriggers(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schema') schema: string,
    @Query('session') session?: string,
  ): Promise<SchemaTrigger[]> {
    return this.databasesService.listTriggers(req.user.id, id, schema, session);
  }

  @Get(':id/schemas/:schema/indexes')
  @ApiOperation({ summary: 'Índices de una base: tabla, unicidad, tipo y columnas' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'schema' })
  listIndexes(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schema') schema: string,
    @Query('session') session?: string,
  ): Promise<SchemaIndex[]> {
    return this.databasesService.listIndexes(req.user.id, id, schema, session);
  }

  @Get(':id/schemas/:schema/procedures')
  @ApiOperation({ summary: 'Procedimientos almacenados de una base, con sus parámetros' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'schema' })
  listProcedures(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schema') schema: string,
    @Query('session') session?: string,
  ): Promise<SchemaProcedure[]> {
    return this.databasesService.listProcedures(req.user.id, id, schema, session);
  }

  @Post(':id/query')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Ejecutar una sentencia SQL',
    description: 'Una sentencia por petición, 30 s como máximo. Devuelve hasta 1000 filas; `truncated` indica si había más. Un error de SQL responde 400 con el mensaje del motor. Las sentencias peligrosas responden 400 `DANGEROUS_QUERY` hasta que llegan con `confirm: true`, y entonces quedan auditadas.',
  })
  @ApiParam({ name: 'id' })
  runQuery(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunQueryDto,
  ): Promise<QueryResult> {
    return this.databasesService.runQuery(req.user.id, id, dto.sql, dto.schema, dto.confirm, dto.sessionId);
  }

  @Post(':id/query/export')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Resultado completo de una consulta para exportar',
    description: 'Vuelve a ejecutar la consulta sin el tope de 1000 filas de la vista (hasta 200 000; `truncated` indica si había más). Solo consultas de lectura: las demás responden 400. `confirm` se ignora.',
  })
  @ApiParam({ name: 'id' })
  exportQuery(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunQueryDto,
  ): Promise<QueryResult> {
    return this.databasesService.exportQuery(req.user.id, id, dto.sql, dto.schema, dto.sessionId);
  }

  @Post(':id/rows/update')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Editar una fila del resultado',
    description: 'UPDATE de una sola fila identificada por su clave primaria completa (`key`). Las columnas se validan contra la tabla y los valores van parametrizados.',
  })
  @ApiParam({ name: 'id' })
  updateRow(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRowDto,
  ): Promise<{ affectedRows: number }> {
    const { sessionId, ...input } = dto;
    return this.databasesService.updateRow(req.user.id, id, input, sessionId);
  }

  @Post(':id/tables/columns')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Columnas de una tabla para una fila nueva',
    description: 'Tipo, si admite NULL, valor por defecto literal (para precargar) y si lo calcula la base (autoincremento, identidad, expresión) o es generada.',
  })
  @ApiParam({ name: 'id' })
  tableColumns(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TableRefDto,
  ): Promise<InsertColumn[]> {
    const { sessionId, ...ref } = dto;
    return this.databasesService.tableColumns(req.user.id, id, ref, sessionId);
  }

  @Post(':id/rows/insert')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Insertar una fila',
    description: 'INSERT con las columnas recibidas (validadas contra la tabla; los valores van parametrizados). Las que no vienen toman su valor por defecto.',
  })
  @ApiParam({ name: 'id' })
  insertRow(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InsertRowDto,
  ): Promise<InsertRowResult> {
    const { sessionId, ...input } = dto;
    return this.databasesService.insertRow(req.user.id, id, input, sessionId);
  }

  @Post(':id/rows/delete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Borrar filas del resultado',
    description: 'DELETE por la clave primaria completa de cada fila (hasta 1000), en una transacción: o se borran todas o ninguna. Queda en la auditoría de la conexión.',
  })
  @ApiParam({ name: 'id' })
  deleteRows(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteRowsDto,
  ): Promise<{ affectedRows: number }> {
    const { sessionId, ...input } = dto;
    return this.databasesService.deleteRows(req.user.id, id, input, sessionId);
  }

  /* ── Redis ── */

  @Get(':id/redis/overview')
  @ApiOperation({ summary: 'Redis: versión, memoria, clientes y claves por base (INFO)' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'session', required: false })
  redisOverview(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('session') session?: string,
  ): Promise<RedisOverview> {
    return this.databasesService.redisOverview(req.user.id, id, session);
  }

  @Post(':id/redis/scan')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary: 'Redis: una página de claves',
    description: 'SCAN con `pattern` (MATCH) y `type` opcionales, nunca KEYS. Hasta 100 claves con su tipo y TTL en ms (-1 sin caducidad); `cursor` "0" indica que no hay más.',
  })
  @ApiParam({ name: 'id' })
  redisScan(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedisScanDto,
  ): Promise<RedisScanResult> {
    return this.databasesService.redisScan(req.user.id, id, dto.db, dto.pattern, dto.cursor, dto.type, dto.sessionId);
  }

  @Post(':id/redis/key')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary: 'Redis: valor de una clave',
    description: 'Según el tipo: texto (hasta 256 KB), hash, lista, conjunto y conjunto ordenado (hasta 500 elementos) o stream (las 200 entradas más recientes). `truncated` indica si se leyó solo una parte. 404 si no existe.',
  })
  @ApiParam({ name: 'id' })
  redisKey(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedisKeyDto,
  ): Promise<RedisKeyDetail> {
    return this.databasesService.redisKey(req.user.id, id, dto.db, dto.key, dto.sessionId);
  }

  @Post(':id/redis/edit')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary: 'Redis: crear o cambiar una clave',
    description: '`op`: create, set (conserva la caducidad), hset/hdel, lset/lpush/rpush/lremIndex, sadd/srem, zadd/zrem, xadd/xdel, expire (null quita la caducidad) y rename (409 si el nombre ya existe).',
  })
  @ApiParam({ name: 'id' })
  redisEdit(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedisEditDto,
  ): Promise<{ ok: true }> {
    const { sessionId, db, ...input } = dto;
    return this.databasesService.redisEdit(req.user.id, id, db, input, sessionId);
  }

  @Post(':id/redis/delete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Redis: borrar claves', description: 'UNLINK de hasta 1000 claves. Queda en la auditoría de la conexión.' })
  @ApiParam({ name: 'id' })
  redisDelete(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedisDeleteKeysDto,
  ): Promise<{ deleted: number }> {
    return this.databasesService.redisDeleteKeys(req.user.id, id, dto.db, dto.keys, dto.sessionId);
  }

  @Post(':id/redis/command')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Redis: ejecutar un comando de la consola',
    description: 'Una línea como en redis-cli (comillas y escapes). Los que bloquean o cambian la conexión (SUBSCRIBE, MONITOR, SELECT, MULTI, BLPOP…) responden 400 `REDIS_COMMAND_BLOCKED`. Los peligrosos (FLUSHDB, KEYS, CONFIG SET…) responden 400 `DANGEROUS_QUERY` hasta que llegan con `confirm: true`, y quedan auditados.',
  })
  @ApiParam({ name: 'id' })
  redisCommand(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedisCommandDto,
  ): Promise<RedisCommandResult> {
    return this.databasesService.redisCommand(req.user.id, id, dto.db, dto.command, dto.confirm, dto.sessionId);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Consultas peligrosas confirmadas sobre la conexión (últimas 50)' })
  @ApiParam({ name: 'id' })
  async audit(@Request() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.databasesService.listAudit(req.user.id, id);
    return rows.map(({ id: auditId, schema, query, reason, status, affectedRows, error, durationMs, createdAt }) => ({
      id: auditId, schema, query, reason, status, affectedRows, error, durationMs, createdAt,
    }));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una conexión',
    description: '`password` omitida conserva la actual; cadena vacía la borra. No conecta; si cambian los datos de conexión, el estado vuelve a `unknown`.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: DatabaseConnectionResponseDto })
  update(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDatabaseConnectionDto,
  ): Promise<DatabaseConnectionResponseDto> {
    return this.databasesService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar una conexión' })
  @ApiParam({ name: 'id' })
  async remove(@Request() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: true }> {
    await this.databasesService.remove(req.user.id, id);
    return { deleted: true };
  }

  @Get(':id/password')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Ver la contraseña guardada',
    description: 'Solo para el campo de contraseña del formulario de edición.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: DatabaseConnectionPasswordResponseDto })
  async password(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DatabaseConnectionPasswordResponseDto> {
    return { password: await this.databasesService.revealPassword(req.user.id, id) };
  }
}
