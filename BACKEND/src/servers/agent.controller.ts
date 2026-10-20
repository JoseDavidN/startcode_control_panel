// src/servers/agent.controller.ts
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { User } from '@auth/entities/user.entity';
import { AgentInstallService } from './services/agent-install.service';
import { AgentTokenService } from '@servers/services/agent-token.service';
import { ServersService } from './servers.service';
import { InstallAgentDto, UninstallAgentDto } from './dto/agent-install.dto';
import type {
  AgentInstallResult,
  AgentUninstallResult,
} from './types/agent-install.types';

/**
 * Instalación del agente en la máquina remota.
 *
 * Va en su propio controlador: `servers.controller.ts` ya pasa de 400 líneas y
 * esto es un ciclo de vida distinto al del registro del servidor.
 */
@ApiTags('Agent')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('servers')
export class AgentController {
  constructor(
    private readonly agentInstall: AgentInstallService,
    private readonly servers: ServersService,
    private readonly agentTokens: AgentTokenService,
  ) {}

  @Post(':id/agent/install')
  @HttpCode(200)
  /* Abre SSH y baja 7 MB: no es una operación para repetir en bucle. */
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({
    summary: 'Instala el agente en el servidor',
    description:
      'Devuelve 200 también cuando la instalación falla: el intento se completó y su resultado (con los pasos y el error) es lo que la interfaz tiene que pintar.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Resultado del intento de instalación' })
  @ApiResponse({ status: 409, description: 'El agente ya está instalado' })
  async install(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallAgentDto,
    @Request() req: { user: User },
  ): Promise<AgentInstallResult> {
    const server = await this.servers.findOne(id, req.user);

    if (server.metadata?.agent?.state === 'installed' && dto.reinstall !== true) {
      throw new ConflictException(
        'El agente ya está instalado en este servidor. Usa «reinstalar» si quieres volver a desplegarlo.',
      );
    }

    return this.agentInstall.install(id, req.user, {
      sudoPassword: dto.sudoPassword,
      panelUrl: dto.panelUrl,
    });
  }

  @Delete(':id/agent')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({ summary: 'Desinstala el agente del servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  async uninstall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UninstallAgentDto,
    @Request() req: { user: User },
  ): Promise<AgentUninstallResult> {
    return this.agentInstall.uninstall(id, req.user, {
      sudoPassword: dto.sudoPassword,
      purge: dto.purge,
    });
  }

  @Post(':id/agent/token')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({
    summary: 'Regenera el token del agente',
    description:
      'Con el agente conectado lo rota por su socket (el anterior vale hasta el ACK y 10 min de gracia). Sin agente conectado lo revoca: hay que reinstalar.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: '`mode`: rotating | revoked' })
  @ApiResponse({ status: 409, description: 'Hay una instalación en curso' })
  async regenerateToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: User },
  ): Promise<{ mode: 'rotating' | 'revoked' }> {
    return this.agentInstall.regenerateAgentToken(id, req.user);
  }

  @Get(':id/agent')
  @ApiOperation({
    summary: 'Estado de instalación del agente',
    description: 'Lo que el panel sabe, sin abrir SSH.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  async state(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: User }) {
    const server = await this.servers.findOne(id, req.user);
    const agent = server.metadata?.agent;
    const token = await this.agentTokens.describe(id);

    return {
      serverId: id,
      state: agent?.state ?? 'not_installed',
      version: agent?.version ?? null,
      arch: agent?.arch ?? null,
      installedAt: agent?.installedAt ?? null,
      lastAttemptAt: agent?.lastAttemptAt ?? null,
      lastError: agent?.lastError ?? null,
      steps: agent?.steps ?? [],
      tokenIssuedAt: token.issuedAt?.toISOString() ?? null,
      tokenRotating: token.rotating,
    };
  }
}
