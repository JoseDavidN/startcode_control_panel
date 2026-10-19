// src/servers/servers.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  Put,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ServersService } from './servers.service';
import { AuthService } from '@auth/auth.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdatePrivateKeyDto } from './dto/update-private-key.dto';
import { SetFavoriteDto } from './dto/set-favorite.dto';
import { ServerResponseDto } from './dto/server-response.dto';
import { ServerStatsDto } from './dto/server-stats.dto';
import { DeleteServerDto } from './dto/agent-install.dto';
import { AgentInstallService } from './services/agent-install.service';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@auth/types/authenticated-request.type';
import { ServerStatus, ServerOs } from './entities/server.entity';

@ApiTags('Servers')
@Controller('servers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ServersController {
  constructor(
    private readonly serversService: ServersService,
    private readonly authService: AuthService,
    private readonly agentInstall: AgentInstallService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo servidor',
    description:
      'Registra un nuevo servidor en el sistema con sus credenciales SSH',
  })
  @ApiResponse({
    status: 201,
    description: 'Servidor creado exitosamente',
    type: ServerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un servidor con ese host',
  })
  async create(
    @Body() createServerDto: CreateServerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto> {
    return await this.serversService.create(createServerDto, req.user);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener todos los servidores',
    description:
      'Retorna lista de todos los servidores del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de servidores',
    type: [ServerResponseDto],
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto[]> {
    return await this.serversService.findAll(req.user);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de servidores',
    description: 'Retorna contadores de servidores por estado',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas de servidores',
    type: ServerStatsDto,
  })
  async getStats(@Request() req: AuthenticatedRequest): Promise<ServerStatsDto> {
    return await this.serversService.getStats(req.user);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Buscar servidores',
    description: 'Busca servidores por nombre u host',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Término de búsqueda',
    example: 'produccion',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidores encontrados',
    type: [ServerResponseDto],
  })
  async search(
    @Query('q') query: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto[]> {
    return await this.serversService.search(query, req.user);
  }

  @Get('filter/status/:status')
  @ApiOperation({
    summary: 'Filtrar servidores por estado',
    description: 'Retorna servidores filtrados por su estado',
  })
  @ApiParam({
    name: 'status',
    enum: ServerStatus,
    description: 'Estado del servidor',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidores filtrados',
    type: [ServerResponseDto],
  })
  async filterByStatus(
    @Param('status') status: ServerStatus,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto[]> {
    return await this.serversService.filterByStatus(status, req.user);
  }

  @Get('filter/os/:os')
  @ApiOperation({
    summary: 'Filtrar servidores por sistema operativo',
    description: 'Retorna servidores filtrados por SO',
  })
  @ApiParam({
    name: 'os',
    enum: ServerOs,
    description: 'Sistema operativo',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidores filtrados',
    type: [ServerResponseDto],
  })
  async filterByOS(
    @Param('os') os: ServerOs,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto[]> {
    return await this.serversService.filterByOS(os, req.user);
  }

  @Post(':id/agent-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar token de autenticación para el agente',
    description:
      'Genera un JWT de larga duración para que el agente de monitoreo se autentique en el WebSocket Gateway',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor (UUID)', type: 'string' })
  @ApiResponse({ status: 200, description: 'Token generado exitosamente' })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos sobre este servidor' })
  async generateAgentToken(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ token: string; serverId: string; expiresIn: string }> {
    const server = await this.serversService.findOne(id, req.user);
    const token = this.authService.generateAgentToken(server.id, server.name);
    return { token, serverId: server.id, expiresIn: '365d' };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un servidor específico',
    description: 'Retorna los detalles de un servidor por su ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del servidor (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidor encontrado',
    type: ServerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Servidor no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para acceder a este servidor',
  })
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto> {
    return await this.serversService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un servidor',
    description:
      'Actualiza los datos de un servidor (excepto la llave privada)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del servidor',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidor actualizado exitosamente',
    type: ServerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Servidor no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para modificar este servidor',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto con host existente',
  })
  async update(
    @Param('id') id: string,
    @Body() updateServerDto: UpdateServerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto> {
    return await this.serversService.update(id, updateServerDto, req.user);
  }

  @Put(':id/private-key')
  @ApiOperation({
    summary: 'Actualizar llave privada SSH',
    description: 'Actualiza únicamente la llave privada SSH del servidor',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del servidor',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Llave privada actualizada',
  })
  @ApiResponse({
    status: 404,
    description: 'Servidor no encontrado',
  })
  async updatePrivateKey(
    @Param('id') id: string,
    @Body() updatePrivateKeyDto: UpdatePrivateKeyDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return await this.serversService.updatePrivateKey(
      id,
      updatePrivateKeyDto,
      req.user,
    );
  }

  @Put(':id/favorite')
  @ApiOperation({
    summary: 'Marcar o quitar un servidor de favoritos',
    description: 'Hasta 3 favoritos por usuario; la vista de servidores los muestra primero.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor', type: 'string' })
  @ApiResponse({ status: 200, description: 'Favorito actualizado', type: ServerResponseDto })
  @ApiResponse({ status: 409, description: 'Ya hay 3 servidores favoritos' })
  async setFavorite(
    @Param('id') id: string,
    @Body() dto: SetFavoriteDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto> {
    return await this.serversService.setFavorite(id, dto.favorite, req.user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Actualizar estado del servidor',
    description: 'Cambia manualmente el estado del servidor',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del servidor',
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    enum: ServerStatus,
    description: 'Nuevo estado',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado',
    type: ServerResponseDto,
  })
  async updateStatus(
    @Param('id') id: string,
    @Query('status') status: ServerStatus,
    @Request() req: AuthenticatedRequest,
  ): Promise<ServerResponseDto> {
    return await this.serversService.updateStatus(id, status, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un servidor',
    description: 'Elimina permanentemente un servidor del sistema',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del servidor',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidor eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Servidor no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para eliminar este servidor',
  })
  @ApiResponse({
    status: 409,
    description:
      'El agente no se pudo desinstalar; el servidor NO se eliminó. Repite con force para hacerlo de todos modos.',
  })
  async remove(
    @Param('id') id: string,
    @Body() dto: DeleteServerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string; warning?: string }> {
    const server = await this.serversService.findOne(id, req.user);
    const agentState = server.metadata?.agent?.state;
    /* Un servidor que nunca tuvo agente se borra sin abrir SSH: si no, un host
       apagado dado de alta por error sería imposible de quitar sin forzar. */
    const hasAgent =
      agentState === 'installed' || agentState === 'failed' || agentState === 'installing';

    let warning: string | undefined;

    if (hasAgent) {
      const result = await this.agentInstall.uninstall(id, req.user, {
        sudoPassword: dto.sudoPassword,
      });

      if (!result.ok) {
        if (dto.force !== true) {
          throw new ConflictException({
            message: 'No se pudo desinstalar el agente, así que el servidor no se eliminó',
            agentError: result.error,
            canForce: true,
          });
        }
        warning = `El servidor se eliminó, pero el agente sigue instalado en la máquina: ${result.error?.message ?? 'no se pudo desinstalar'}`;
      }
    }

    const removed = await this.serversService.remove(id, req.user);
    return warning ? { ...removed, warning } : removed;
  }
}
