import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, HttpStatus, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { AssistantService } from './assistant.service';
import { UpsertAssistantConfigDto } from './dto/upsert-assistant-config.dto';
import { AssistantConfigResponseDto } from './dto/assistant-config-response.dto';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { ListModelsDto } from './dto/list-models.dto';

/** Lo que deja `JwtAuthGuard` en la petición. */
interface AuthedRequest {
  user: { id: string };
}

/* Cada usuario tiene su propio asistente: todas las rutas leen y escriben
   solo la configuración y los datos de la cuenta autenticada. */
@ApiTags('Assistant')
@Controller('assistant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('config')
  @ApiOperation({ summary: 'Configuración del asistente del usuario (sin la clave)' })
  @ApiResponse({ status: 200, type: AssistantConfigResponseDto })
  getConfig(@Request() req: AuthedRequest): Promise<AssistantConfigResponseDto | null> {
    return this.assistantService.getConfig(req.user.id);
  }

  @Put('config')
  @ApiOperation({ summary: 'Conectar o actualizar el asistente', description: 'La clave se guarda cifrada y no vuelve nunca al cliente.' })
  @ApiResponse({ status: 200, type: AssistantConfigResponseDto })
  upsertConfig(@Request() req: AuthedRequest, @Body() dto: UpsertAssistantConfigDto): Promise<AssistantConfigResponseDto> {
    return this.assistantService.upsertConfig(req.user.id, dto);
  }

  @Delete('config')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desconectar el asistente y borrar la clave' })
  deleteConfig(@Request() req: AuthedRequest): Promise<void> {
    return this.assistantService.deleteConfig(req.user.id);
  }

  @Post('models')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Modelos disponibles del proveedor',
    description: 'Los pide al proveedor con la clave indicada (o la guardada si es del mismo proveedor). Caché de 10 minutos salvo `refresh`.',
  })
  listModels(@Request() req: AuthedRequest, @Body() dto: ListModelsDto) {
    return this.assistantService.listModels(req.user.id, dto);
  }

  @Post('config/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({ summary: 'Probar la conexión con el proveedor' })
  test(@Request() req: AuthedRequest): Promise<{ ok: true; reply: string; model: string }> {
    return this.assistantService.test(req.user.id);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Preguntar al asistente',
    description: 'Solo responde texto: no ejecuta comandos ni consultas. Recibe los datos del panel del usuario, lo que adjunte de la pantalla (sin llaves ni contraseñas) y la memoria de la conversación. Guarda la pregunta y la respuesta.',
  })
  chat(@Request() req: AuthedRequest, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat(req.user.id, dto);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Conversación guardada del usuario, de la más antigua a la más nueva' })
  history(
    @Request() req: AuthedRequest,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.assistantService.history(req.user.id, Math.min(Math.max(limit, 1), 400));
  }

  @Get('memory')
  @ApiOperation({ summary: 'Qué recuerda el asistente: resumen a largo plazo y número de mensajes guardados' })
  memory(@Request() req: AuthedRequest) {
    return this.assistantService.memoryStatus(req.user.id);
  }

  @Post('memory/summarize')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({
    summary: 'Resumir la conversación en la memoria y vaciar el chat (/resume)',
    description: 'Condensa con el proveedor todos los mensajes aún sin resumir, los añade al resumen a largo plazo y borra la conversación. Si el resumen falla no se borra nada.',
  })
  summarizeMemory(@Request() req: AuthedRequest): Promise<{ summary: string; summarized: number }> {
    return this.assistantService.summarizeMemory(req.user.id);
  }

  @Delete('memory')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar la conversación y la memoria del asistente' })
  clearMemory(@Request() req: AuthedRequest): Promise<void> {
    return this.assistantService.clearMemory(req.user.id);
  }
}
