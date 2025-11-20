import { Module } from '@nestjs/common';
import { UploadController, DataController } from './upload.controller';
import { UploadService } from './upload.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadPoolModule } from './upload-pool.module';

@Module({
  imports: [PrismaModule, UploadPoolModule],
  controllers: [UploadController, DataController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule { }
