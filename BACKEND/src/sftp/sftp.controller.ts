// src/sftp/sftp.controller.ts
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response } from 'express';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { SftpSessionService } from './services/sftp-session.service';
import { SftpOperationsService } from './services/sftp-operations.service';
import { DownloadQueryDto } from './dto/download-query.dto';
import { UploadQueryDto } from './dto/upload-query.dto';

/**
 * Los bytes de los archivos van por HTTP y no por el socket: así el navegador
 * transmite el `File` en streaming (sin cargarlo en memoria en ninguno de los
 * dos extremos), `onUploadProgress` da progreso real por archivo y varias
 * subidas avanzan en paralelo sin multiplexarse en un único canal.
 */
@ApiTags('SFTP')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('sftp')
export class SftpController {
  constructor(
    private readonly sessions: SftpSessionService,
    private readonly ops: SftpOperationsService,
  ) {}

  @Put('sessions/:sessionId/file')
  /* Subir una carpeta de 300 archivos son 300 peticiones; con el límite
     global de 120/min la cola se llenaría de 429. */
  @SkipThrottle()
  @HttpCode(201)
  @ApiOperation({ summary: 'Sube un archivo a la sesión SFTP abierta' })
  @ApiParam({ name: 'sessionId', description: 'ID de la sesión SFTP' })
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 201, description: 'Archivo escrito en el servidor' })
  @ApiResponse({ status: 404, description: 'La sesión no existe o caducó' })
  @ApiResponse({ status: 409, description: 'El archivo ya existe' })
  @ApiResponse({ status: 413, description: 'El archivo supera el límite' })
  async uploadFile(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: UploadQueryDto,
    @Req() req: ExpressRequest,
    @Request() { user }: { user: { id: string } },
  ) {
    const session = this.sessions.get(sessionId, user.id);

    return this.ops.uploadStream(session, {
      destDir: query.destDir,
      relPath: query.relPath,
      source: req,
      overwrite: query.overwrite === true,
      declaredSize: query.size,
      offset: query.offset,
      total: query.total,
    });
  }

  /**
   * Comprueba que se puede descargar antes de empezar. La app la llama antes
   * de cada descarga: la hace el cliente HTTP normal, que renueva el token si
   * caducó, y da el error con su mensaje.
   */
  @Get('sessions/:sessionId/download/info')
  @SkipThrottle()
  @ApiOperation({ summary: 'Tipo y tamaño de lo que se va a descargar' })
  @ApiParam({ name: 'sessionId', description: 'ID de la sesión SFTP' })
  @ApiResponse({ status: 200, description: 'Se puede descargar' })
  @ApiResponse({ status: 400, description: 'La ruta no existe o no es un archivo ni una carpeta' })
  @ApiResponse({ status: 404, description: 'La sesión no existe o caducó' })
  downloadInfo(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: DownloadQueryDto,
    @Request() { user }: { user: { id: string } },
  ) {
    return this.ops.downloadInfo(this.sessions.get(sessionId, user.id), query.path);
  }

  /** Un archivo tal cual; una carpeta, como .zip que se comprime mientras se envía. */
  @Get('sessions/:sessionId/download')
  @SkipThrottle()
  @ApiOperation({ summary: 'Descarga un archivo o una carpeta (.zip) del servidor' })
  @ApiParam({ name: 'sessionId', description: 'ID de la sesión SFTP' })
  @ApiResponse({ status: 200, description: 'Contenido del archivo o del .zip' })
  @ApiResponse({ status: 400, description: 'La ruta no existe o no es un archivo ni una carpeta' })
  @ApiResponse({ status: 404, description: 'La sesión no existe o caducó' })
  async download(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: DownloadQueryDto,
    @Res() res: Response,
    @Request() { user }: { user: { id: string } },
  ): Promise<void> {
    await this.ops.download(this.sessions.get(sessionId, user.id), query.path, res);
  }

  @Post('sessions/:sessionId/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra la sesión SFTP' })
  closeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() { user }: { user: { id: string } },
  ) {
    this.sessions.get(sessionId, user.id);
    this.sessions.close(sessionId, 'cerrada por el usuario');
    return { closed: true };
  }
}
