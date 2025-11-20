import { IsOptional, IsString, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryEntitiesDto {
  @ApiPropertyOptional({
    description: 'Filter by entity type',
    example: 'file',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by file name',
    example: 'document.pdf',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Include entity attributes in response',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false') return false;
    if (value === 'true') return true;
    return value !== false;
  })
  @IsBoolean()
  withAttributes?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include entity payload data in response',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value === true;
  })
  @IsBoolean()
  withPayload?: boolean = false;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return',
    example: 50,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(1000, { message: 'Limit cannot exceed 1000' })
  limit?: number = 50;
}