import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class AddWalletDto {
  @ApiProperty({
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Dirección de la wallet',
  })
  @IsString()
  address: string;

  @ApiProperty({
    example: 'ethereum',
    description: 'Red de la blockchain (ethereum, polygon, bsc, etc.)',
  })
  @IsString()
  network: string;

  @ApiProperty({
    example: 'ETH',
    description: 'Moneda de la red (ETH, MATIC, BNB, etc.)',
  })
  @IsString()
  currency: string;

  @ApiProperty({
    example: 'metamask',
    description: 'Proveedor de la wallet (metamask, coinbase, walletconnect, open league, etc.)',
  })
  @IsString()
  provider: string;

  @ApiProperty({
    example: true,
    description: 'Establecer como wallet predeterminada',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
