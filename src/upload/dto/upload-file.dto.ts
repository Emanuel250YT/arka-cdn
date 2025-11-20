import { IsOptional, IsString, IsBoolean, IsNumber, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  compress?: boolean = true;

  @ApiPropertyOptional({
    description: 'Tiempo de vida del archivo en milisegundos (TTL). Después de este tiempo el archivo expirará.',
    example: 86400000,
    minimum: 60000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(60000, { message: 'El TTL debe ser al menos 60000ms (1 minuto)' })
  ttl?: number;
}
