import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { CloudAuthGuard } from '@/auth/cloud-auth.guard';
import type { AuthedRequest } from '@/auth/auth.types';
import { UpdatePathsDto } from './dto/update-paths.dto';
import { PathsService } from './paths.service';

@Controller('config/paths')
@UseGuards(CloudAuthGuard)
export class PathsController {
  constructor(private readonly paths: PathsService) {}

  @Get()
  get(@Req() req: AuthedRequest) {
    return { paths: this.paths.get(req.user.username), allowedRoots: this.paths.allowedRoots };
  }

  @Put()
  async update(@Req() req: AuthedRequest, @Body() dto: UpdatePathsDto) {
    return { paths: await this.paths.set(req.user.username, dto), allowedRoots: this.paths.allowedRoots };
  }
}
