import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateStorageDto {
  @ApiProperty({
    description: 'Valor entero sin signo que se almacenará en Paseo',
    example: 42,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  value: number;
}
