import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CloudAuthGuard } from '@/auth/cloud-auth.guard';
import type { AuthedRequest } from '@/auth/auth.types';
import { SECTIONS, type Section } from '@/common/sections';
import { CreateFolderDto, MoveDto, RenameDto, SectionPathQuery, UploadQuery } from './dto/files.dto';
import { contentDisposition, FilesService } from './files.service';

const SECTION_ENUM = Object.fromEntries(SECTIONS.map(s => [s, s]));

@Controller()
@UseGuards(CloudAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('tree/:section')
  tree(@Req() req: AuthedRequest, @Param('section', new ParseEnumPipe(SECTION_ENUM)) section: Section) {
    return this.files.tree(req.user.username, section);
  }

  @Get('storage')
  storage(@Req() req: AuthedRequest) {
    return this.files.storage(req.user.username);
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
