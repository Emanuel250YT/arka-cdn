import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyOtpDto, AddWalletDto, CreateOpenLeagueWalletDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'El email ya está registrado',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con email/contraseña o wallet',
    description:
      'Si se proporciona email y contraseña, retorna tokens JWT. Si se proporciona walletAddress, envía un código OTP al email vinculado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso o OTP enviado',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet no encontrada',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar código OTP y completar login con wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
  })
  @ApiResponse({
    status: 401,
    description: 'Código OTP inválido o expirado',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtpAndLogin(verifyOtpDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refrescar access token usando refresh token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Access token renovado',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido o expirado',
  })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Post('create-open-league-wallet')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear wallet con proveedor Open League usando Coinbase CDP',
    description:
      'Crea una wallet usando Coinbase CDP con el proveedor "open league" y la vincula automáticamente al usuario. No requiere OTP, solo email, password y accessToken de Coinbase.',
  })
  @ApiResponse({
    status: 201,
    description: 'Wallet de Open League creada y vinculada exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o token de Coinbase inválido',
  })
  @ApiResponse({
    status: 409,
    description: 'La wallet ya está vinculada a una cuenta',
  })
  async createOpenLeagueWallet(
    @Body() createOpenLeagueWalletDto: CreateOpenLeagueWalletDto,
  ) {
    return this.authService.createOpenLeagueWallet(createOpenLeagueWalletDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión (revocar token)' })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada exitosamente',
  })
  async logout(@Headers('authorization') authorization: string) {
    const token = authorization?.replace('Bearer ', '');
    await this.authService.logout(token);
    return { message: 'Sesión cerrada exitosamente' };
  }

  @Post('wallets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincular una wallet a la cuenta' })
  @ApiResponse({
    status: 201,
    description: 'Wallet vinculada exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'Esta wallet ya está vinculada a una cuenta',
  })
  async addWallet(@GetUser('id') userId: string, @Body() addWalletDto: AddWalletDto) {
    return this.authService.addWallet(userId, addWalletDto);
  }

  @Get('wallets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todas las wallets del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Lista de wallets del usuario',
  })
  async getWallets(@GetUser('id') userId: string) {
    return this.authService.getUserWallets(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener información del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Información del usuario',
  })
  async getProfile(@GetUser() user: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
