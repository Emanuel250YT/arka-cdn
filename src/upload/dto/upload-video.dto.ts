/* eslint-disable @typescript-eslint/no-unused-vars */
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadVideoDto {
  @ApiPropertyOptional({
    description: 'Descripción del video',
    example: 'Video tutorial de NestJS',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Comprimir el video antes de procesar',
    default: true,
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  compress?: boolean = true;
}
