/* eslint-disable @typescript-eslint/no-unused-vars */
import { IsOptional, IsBoolean, IsArray, IsString } from 'class-validator';
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
    description: 'Habilitar conversión a formato DASH para streaming adaptativo',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableDash?: boolean = true;

  @ApiPropertyOptional({
    description: 'Resoluciones a generar para DASH streaming',
    default: ['1080p', '720p', '480p', '360p'],
    example: ['1080p', '720p', '480p'],
    isArray: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resolutions?: string[] = ['1080p', '720p', '480p', '360p'];

  @ApiPropertyOptional({
    description: 'Comprimir el video antes de procesar',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  compress?: boolean = true;
}
