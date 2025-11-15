import { Module } from '@nestjs/common';
import { UploadPoolService } from './upload-pool.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UploadPoolService],
  exports: [UploadPoolService],
})
export class UploadPoolModule { }
