import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { DashConverterService } from './dash-converter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadPoolModule } from './upload-pool.module';

@Module({
  imports: [PrismaModule, UploadPoolModule],
  controllers: [UploadController],
  providers: [UploadService, DashConverterService],
  exports: [UploadService],
})
export class UploadModule { }
