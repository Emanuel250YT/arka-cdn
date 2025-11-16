import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaseoService } from './paseo.service';
import { UpdateStorageDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Paseo')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('paseo')
export class PaseoController {
  constructor(private readonly paseoService: PaseoService) { }

  @Get('network')
  @ApiOperation({
    summary: 'Obtener el estado actual de Paseo TestNet',
    description:
      'Devuelve informaci��n del RPC, explorador y datos b��sicos de la red Polkadot Hub TestNet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado consultado correctamente',
  })
  async getNetworkStatus() {
    const [metadata, status] = await Promise.all([
      this.paseoService.getNetworkMetadata(),
      this.paseoService.getNetworkStatus(),
    ]);

    return {
      success: true,
      data: {
        metadata,
        status,
      },
    };
  }

  @Get('storage')
  @ApiOperation({
    summary: 'Leer el valor almacenado en el contrato Storage',
    description:
      'Usa un cliente p��blico de Viem para consultar la funci��n `retrieve()` en Paseo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Valor on-chain recuperado',
  })
  async getStoredValue() {
    const value = await this.paseoService.readStoredNumber();
    return {
      success: true,
      data: {
        value: value.toString(),
      },
    };
  }

  @Post('storage')
  @ApiOperation({
    summary: 'Actualizar el valor del contrato Storage en Paseo',
    description:
      'Ejecuta la funci��n `store(uint256)` usando la clave configurada en `PASEO_PRIVATE_KEY`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transacci��n enviada a Paseo',
  })
  async updateStoredValue(@Body() payload: UpdateStorageDto) {
    const tx = await this.paseoService.updateStoredNumber(
      BigInt(payload.value),
    );

    return {
      success: true,
      message: 'Valor actualizado correctamente en Paseo',
      data: tx,
    };
  }
}
