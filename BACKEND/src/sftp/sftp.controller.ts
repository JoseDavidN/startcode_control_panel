// src/sftp/sftp.controller.ts
import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Request,
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
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { SftpSessionService } from './services/sftp-session.service';
import { SftpOperationsService } from './services/sftp-operations.service';
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
    });
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
