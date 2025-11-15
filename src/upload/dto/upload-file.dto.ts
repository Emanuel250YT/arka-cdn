import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiPropertyOptional({
    description: 'Descripción del archivo',
    example: 'Mi imagen de perfil',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Comprimir el archivo (solo para imágenes y videos)',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  compress?: boolean = true;

  @ApiPropertyOptional({
    description: 'Convertir video a formato streaming DASH (solo para videos)',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableDashStreaming?: boolean = false;
}
