import { BadRequestException, Controller, Get, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '@/auth/auth.service';
import { cloudError } from '@/common/errors';
import { SECTIONS } from '@/common/sections';
import { fileTypeFromName, mimeFromName } from './file-types';
import { FilesService, openFileRange } from './files.service';
import { MediaService } from './media.service';

/**
 * Reproducción de video y audio. Sin `CloudAuthGuard`: `<video src>` no manda
 * `Authorization`, así que la URL lleva un ticket firmado (`POST
 * /files/stream-ticket`) que solo vale para ese archivo y mientras siga la
 * sesión que lo pidió. `stream` responde a `Range` con 206 para cargar a
 * tramos; `play` envía lo que ffmpeg va generando (formatos que el webview no
 * reproduce tal cual).
 */
@Controller('files')
export class StreamController {
  constructor(
    private readonly auth: AuthService,
    private readonly files: FilesService,
    private readonly media: MediaService,
  ) {}

  /* Sin límite: el reproductor pide muchos tramos seguidos al saltar. */
  @Get('stream')
  @SkipThrottle()
  async stream(@Query('ticket') ticket: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { principal, section, path, cap } = await this.verify(ticket);
    const found = await this.files.resolveFile(principal.username, section, path);

    /* Si ya se convirtió una vez, se sirve la copia (a tramos, sin ffmpeg). */
    let source = { full: found.full, size: found.size, type: mimeFromName(found.name) };
    if (fileTypeFromName(found.name) === 'video') {
      const decision = await this.media.decide(found, cap);
      if (decision.cached && decision.cacheKey) {
        const full = this.media.cachePath(decision.cacheKey);
        const size = await this.files.sizeOf(full);
        if (size !== null) {
          source = { full, size, type: 'video/mp4' };
          void this.media.touchCache(decision.cacheKey);
        }
      }
    }
    const file = openFileRange(source.full, source.size, source.type, req.headers.range);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', file.type);
    /* Mismo ticket, mismos bytes: el reproductor puede reusar lo ya cargado. */
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (file.range === null) {
      res.status(416).setHeader('Content-Range', `bytes */${file.size}`);
      res.end();
      return;
    }
    if (file.range) {
      res.status(206).setHeader('Content-Range', `bytes ${file.start}-${file.end}/${file.size}`);
    } else {
      res.status(200);
    }
    const stream = file.stream;
    res.setHeader('Content-Length', String(stream ? file.end - file.start + 1 : 0));
    if (req.method === 'HEAD' || !stream) {
      stream?.destroy();
      res.end();
      return;
    }
    /* Al saltar, el reproductor corta la petición anterior: se suelta el archivo. */
    res.on('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /**
   * MP4 que ffmpeg genera mientras se ve, desde `start` segundos. Sin `Range`:
   * para saltar, el reproductor la vuelve a pedir con otro `start` y la
   * conversión anterior se corta.
   */
  @Get('play')
  @SkipThrottle()
  async play(
    @Query('ticket') ticket: string | undefined,
    @Query('start') rawStart: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { principal, section, path, sid, cap } = await this.verify(ticket);
    const file = await this.files.resolveFile(principal.username, section, path);
    const decision = await this.media.decide(file, cap);
    if (!decision.ffmpeg) {
      throw cloudError(BadRequestException, 'FFMPEG_MISSING', 'La nube no tiene ffmpeg para convertir este video.', 'Instala ffmpeg en el servidor de la nube.');
    }
    const start = Math.max(0, Number(rawStart) || 0);
    this.media.play(sid, file, decision, start, res);
  }

  /** Punto real desde el que `play` empezará al saltar a `t` (fotograma clave si se re-empaqueta). */
  @Get('seek-point')
  @SkipThrottle()
  async seekPoint(@Query('ticket') ticket: string | undefined, @Query('t') rawT: string | undefined): Promise<{ start: number }> {
    const { principal, section, path, cap } = await this.verify(ticket);
    const file = await this.files.resolveFile(principal.username, section, path);
    const decision = await this.media.decide(file, cap);
    return { start: await this.media.seekPoint(file, decision.plan, Math.max(0, Number(rawT) || 0)) };
  }

  private async verify(ticket: string | undefined) {
    if (!ticket) throw cloudError(BadRequestException, 'TICKET_MISSING', 'Falta el enlace de reproducción.');
    const verified = await this.auth.verifyStreamTicket(ticket);
    if (!SECTIONS.includes(verified.section)) throw cloudError(BadRequestException, 'TICKET_INVALID', 'El enlace de reproducción no es válido.');
    return verified;
  }
}
