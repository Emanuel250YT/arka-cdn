import { Module } from '@nestjs/common';
import { PaseoService } from './paseo.service';
import { PaseoController } from './paseo.controller';

@Module({
  controllers: [PaseoController],
  providers: [PaseoService],
})
export class PaseoModule { }
