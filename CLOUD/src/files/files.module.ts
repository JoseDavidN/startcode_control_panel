import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PathsModule } from '@/paths/paths.module';
import { FilesController } from './files.controller';
import { StreamController } from './stream.controller';
import { FilesService } from './files.service';
import { MediaService } from './media.service';
import { ThumbnailService } from '@/files/thumbnail.service';

@Module({
  imports: [AuthModule, PathsModule],
  controllers: [FilesController, StreamController],
  providers: [FilesService, MediaService, ThumbnailService],
})
export class FilesModule {}
