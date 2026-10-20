import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { CloudAuthGuard } from '@/auth/cloud-auth.guard';
import { AuthService } from '@/auth/auth.service';
import type { AuthedRequest } from '@/auth/auth.types';
import { cloudError } from '@/common/errors';
import { SECTIONS, type Section } from '@/common/sections';
import { CreateFolderDto, MoveDto, RenameDto, SectionPathQuery, StreamTicketDto, UploadQuery } from './dto/files.dto';
import { fileTypeFromName, isStreamable } from './file-types';
import { MediaService } from './media.service';
import { contentDisposition, FilesService } from './files.service';

const SECTION_ENUM = Object.fromEntries(SECTIONS.map(s => [s, s]));

@Controller()
@UseGuards(CloudAuthGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly auth: AuthService,
    private readonly media: MediaService,
  ) {}

  @Get('tree/:section')
  tree(@Req() req: AuthedRequest, @Param('section', new ParseEnumPipe(SECTION_ENUM)) section: Section) {
    return this.files.tree(req.user.username, section);
  }

  @Get('storage')
  storage(@Req() req: AuthedRequest) {
    return this.files.storage(req.user.username);
  }

  /** Resumen para el dashboard: por sección, por tipo, actividad de 30 días y los más grandes. */
  @Get('stats')
  stats(@Req() req: AuthedRequest) {
    return this.files.stats(req.user.username);
  }

  @Post('folders')
  createFolder(@Req() req: AuthedRequest, @Body() dto: CreateFolderDto) {
    return this.files.createFolder(req.user.username, dto.section, dto.parent, dto.name);
  }

  /* Cuerpo crudo (application/octet-stream), en streaming. Sin límite de
     peticiones: una carpeta grande son cientos de subidas seguidas. */
  @Put('files')
  @SkipThrottle()
  @HttpCode(201)
  upload(@Req() req: AuthedRequest, @Query() q: UploadQuery) {
    return this.files.upload(req.user.username, q.section, q.parent, q.relPath, q.size, req);
  }

  @Get('files/content')
  @SkipThrottle()
  async content(@Req() req: AuthedRequest, @Query() q: SectionPathQuery): Promise<StreamableFile> {
    const file = await this.files.content(req.user.username, q.section, q.path ?? '');
    return new StreamableFile(file.stream, { type: file.type, length: file.size, disposition: contentDisposition(file.name) });
  }

  /**
   * URL para reproducir con `<video src>` (ver `StreamController`). En videos,
   * ffprobe decide si va directo, re-empaquetado o convertido (`mode`):
   * - `direct`: `/files/stream`, a tramos (`Range`); también los ya convertidos en caché.
   * - `remux`/`transcode`: `/files/play`, MP4 que se genera mientras se ve; para
   *   saltar, el reproductor la vuelve a pedir con `&start=segundos`.
   */
  @Post('files/stream-ticket')
  @HttpCode(200)
  async streamTicket(@Req() req: AuthedRequest, @Body() dto: StreamTicketDto) {
    const path = dto.path ?? '';
    /* Se comprueba ya que el archivo existe: el error sale aquí y no en el reproductor. */
    const file = await this.files.resolveFile(req.user.username, dto.section, path);
    /* Solo video y audio: otro tipo (SVG, HTML…) servido sin descarga podría
       ejecutarse si alguien abre la URL en un navegador. */
    if (!isStreamable(file.name)) {
      throw cloudError(BadRequestException, 'NOT_MEDIA', 'Solo se reproducen videos y audios.', 'Abre o descarga el archivo.');
    }
    const cap = dto.client ?? {};
    const decision = fileTypeFromName(file.name) === 'video' ? await this.media.decide(file, cap) : null;
    const { ticket, expiresAt } = await this.auth.streamTicket(req.user, dto.section, path, { sid: randomUUID(), cap });
    const mode = decision?.cached ? 'direct' : decision?.plan.mode ?? 'direct';
    const endpoint = mode === 'direct' ? 'stream' : 'play';
    return {
      url: `/api/v1/files/${endpoint}?ticket=${encodeURIComponent(ticket)}`,
      mode,
      /* Convertido una vez y guardado: se sirve sin ffmpeg. */
      cached: decision?.cached ?? false,
      duration: decision?.plan.duration ?? null,
      /* Sin ffmpeg, un formato que el webview no admite no se podrá ver. */
      ffmpeg: decision?.ffmpeg ?? null,
      size: file.size,
      expiresAt,
    };
  }

  @Get('files/zip')
  @SkipThrottle()
  async zip(@Req() req: AuthedRequest, @Query() q: SectionPathQuery, @Res() res: Response): Promise<void> {
    await this.files.zip(req.user.username, q.section, q.path, res);
  }

  @Patch('entries/rename')
  rename(@Req() req: AuthedRequest, @Body() dto: RenameDto) {
    return this.files.rename(req.user.username, dto.section, dto.path, dto.name);
  }

  @Post('entries/move')
  @HttpCode(200)
  move(@Req() req: AuthedRequest, @Body() dto: MoveDto) {
    return this.files.move(req.user.username, dto.section, dto.path, dto.toSection, dto.toParent);
  }

  @Delete('entries')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Query() q: SectionPathQuery): Promise<void> {
    await this.files.remove(req.user.username, q.section, q.path ?? '');
  }
}
