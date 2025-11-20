import { IsOptional, IsString, IsNumber, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEntityDto {
  @ApiPropertyOptional({
    description: 'Title of the entity',
    example: 'Updated Document Title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Content of the entity',
    example: 'This entity has been updated with new content',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Description of the entity',
    example: 'Updated description for this file',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Expiration time in hours for the updated entity',
    example: 24,
    minimum: 1,
    maximum: 8760, // 1 year
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Expiration must be at least 1 hour' })
  @Max(8760, { message: 'Expiration cannot exceed 1 year (8760 hours)' })
  expirationHours?: number = 24;

  @ApiPropertyOptional({
    description: 'Additional custom data for the entity',
    example: { category: 'documents', priority: 'high' },
  })
  @IsOptional()
  @IsObject()
  customData?: Record<string, any>;
}