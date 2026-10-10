import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PathsModule } from '@/paths/paths.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, PathsModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
