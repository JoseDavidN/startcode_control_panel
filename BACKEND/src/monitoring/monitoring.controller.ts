import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { MonitoringService } from './services/monitoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { ServerMetricsDto, QuickStatsDto } from './dto/server-metrics.dto';
import { SSHDiagnosticDto } from './dto/ssh-diagnostic.dto';

@ApiTags('Monitoring')
@Controller('monitoring')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('server/:id/metrics')
  @ApiOperation({ summary: 'Obtener todas las métricas de un servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor', type: String })
  @ApiResponse({
    status: 200,
    description: 'Métricas del servidor',
    type: ServerMetricsDto,
  })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado' })
  @ApiResponse({ status: 403, description: 'No tienes acceso a este servidor' })
  async getServerMetrics(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ServerMetricsDto> {
    return await this.monitoringService.getServerMetrics(id, req.user);
  }

  @Get('servers/:id/quick-stats')
  @ApiOperation({ summary: 'Obtener estadísticas rápidas (CPU, RAM, Disco)' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas rápidas',
    type: QuickStatsDto,
  })
  async getQuickStats(
    @Param('id') id: string,
    @Request() req,
  ): Promise<QuickStatsDto> {
    return await this.monitoringService.getServerQuickStats(id, req.user);
  }

  @Get('servers/all/stats')
  @ApiOperation({ summary: 'Obtener estadísticas de todos los servidores' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas de todos los servidores del usuario',
  })
  async getAllServersStats(@Request() req) {
    return await this.monitoringService.getMultipleServersStats(req.user);
  }

  @Get('servers/:id/test-connection')
  @ApiOperation({ summary: 'Probar conexión SSH al servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Resultado de la prueba de conexión',
  })
  async testConnection(@Param('id') id: string, @Request() req) {
    return await this.monitoringService.testConnection(id, req.user);
  }

  @Get('servers/:id/processes')
  @ApiOperation({ summary: 'Obtener top procesos del servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['cpu', 'memory'],
    description: 'Tipo de ordenamiento',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad de procesos a mostrar',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de procesos',
  })
  async getTopProcesses(
    @Param('id') id: string,
    @Query('type') type: 'cpu' | 'memory' = 'cpu',
    @Query('limit') limit: number = 10,
    @Request() req,
  ) {
    return await this.monitoringService.getTopProcesses(
      id,
      req.user,
      type,
      limit,
    );
  }

  @Post('servers/:id/execute')
  @ApiOperation({ summary: 'Ejecutar comando personalizado en el servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          example: 'ls -la /var/www',
          description: 'Comando a ejecutar',
        },
      },
      required: ['command'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado del comando',
  })
  @ApiResponse({
    status: 403,
    description: 'Comando bloqueado por seguridad',
  })
  async executeCommand(
    @Param('id') id: string,
    @Body('command') command: string,
    @Request() req,
  ) {
    return await this.monitoringService.executeCustomCommand(
      id,
      req.user,
      command,
    );
  }

  @Get('servers/:id/ssh-diagnostic')
  @ApiOperation({
    summary: 'Diagnóstico completo de conexión SSH',
    description:
      'Realiza múltiples pruebas para diagnosticar problemas de conexión',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Diagnóstico de conexión SSH',
    type: SSHDiagnosticDto,
  })
  async sshDiagnostic(
    @Param('id') id: string,
    @Request() req,
  ): Promise<SSHDiagnosticDto> {
    return await this.monitoringService.sshDiagnostic(id, req.user);
  }
}
