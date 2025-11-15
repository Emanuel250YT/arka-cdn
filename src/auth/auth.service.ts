import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, VerifyOtpDto, AddWalletDto, CreateOpenLeagueWalletDto } from './dto';
import { JwtPayload, AuthResponse } from './interfaces/auth.interface';
import { CdpClient } from '@coinbase/cdp-sdk';

@Injectable()
export class AuthService {
  private cdpClient: CdpClient;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {
    // Inicializar Coinbase CDP Client
    const cdpApiKeyId = this.configService.get('CDP_API_KEY_ID');
    const cdpApiKeySecret = this.configService.get('CDP_API_KEY_SECRET');

    if (cdpApiKeyId && cdpApiKeySecret) {
      this.cdpClient = new CdpClient({
        apiKeyId: cdpApiKeyId,
        apiKeySecret: cdpApiKeySecret,
      });
    }
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const { email, password, name } = registerDto;

    // Verificar si el usuario ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
      include: {
        wallets: true,
      },
    });

    // Enviar email de bienvenida
    try {
      await this.emailService.sendWelcomeEmail(email, name || 'Usuario');
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }

    // Generar tokens
    return this.generateAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse | { requiresOtp: boolean }> {
    const { email, password, walletAddress } = loginDto;

    // Login con wallet
    if (walletAddress) {
      return this.initiateWalletLogin(walletAddress);
    }

    // Login con email y contraseña
    if (!email || !password) {
      throw new BadRequestException(
        'Debe proporcionar email y contraseña, o una dirección de wallet',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        wallets: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.generateAuthResponse(user);
  }

  private async initiateWalletLogin(
    walletAddress: string,
  ): Promise<{ requiresOtp: boolean }> {
    // Buscar wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: { address: walletAddress },
      include: { user: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet no encontrada. Debe registrarse primero.');
    }

    // Generar código OTP
    const code = this.generateOtpCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Expira en 10 minutos

    // Guardar OTP en la base de datos
    await this.prisma.otpCode.create({
      data: {
        code,
        purpose: 'wallet_login',
        expiresAt,
        userId: wallet.userId,
      },
    });

    // Enviar OTP por email
    await this.emailService.sendOtpEmail(wallet.user.email, code, 'wallet_login');

    return { requiresOtp: true };
  }

  async verifyOtpAndLogin(verifyOtpDto: VerifyOtpDto): Promise<AuthResponse> {
    const { walletAddress, code } = verifyOtpDto;

    // Buscar wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: { address: walletAddress },
      include: { user: { include: { wallets: true } } },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet no encontrada');
    }

    // Buscar OTP válido
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: wallet.userId,
        code,
        purpose: 'wallet_login',
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('Código OTP inválido o expirado');
    }

    // Marcar OTP como usado
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    return this.generateAuthResponse(wallet.user);
  }

  async addWallet(userId: string, addWalletDto: AddWalletDto) {
    const { address, network, currency, provider, isDefault } = addWalletDto;

    // Verificar si la wallet ya existe
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { address },
    });

    if (existingWallet) {
      throw new ConflictException('Esta wallet ya está vinculada a una cuenta');
    }

    // Si es la wallet predeterminada, desmarcar las demás
    if (isDefault) {
      await this.prisma.wallet.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    // Crear wallet
    return this.prisma.wallet.create({
      data: {
        address,
        network,
        currency,
        provider,
        isDefault: isDefault || false,
        userId,
      },
    });
  }

  async getUserWallets(userId: string) {
    return this.prisma.wallet.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async revokeToken(token: string): Promise<void> {
    await this.prisma.token.updateMany({
      where: { token },
      data: { isRevoked: true },
    });
  }

  async validateToken(token: string): Promise<boolean> {
    const tokenRecord = await this.prisma.token.findUnique({
      where: { token },
    });

    if (!tokenRecord) {
      return false;
    }

    if (tokenRecord.isRevoked) {
      return false;
    }

    if (new Date() > tokenRecord.expiresAt) {
      return false;
    }

    return true;
  }

  private async generateAuthResponse(user: any): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
    });

    const refreshPayload: JwtPayload = { ...payload, type: 'refresh' };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
    });

    // Guardar tokens en la base de datos
    const accessExpiresAt = new Date();
    accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + 15);

    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    await this.prisma.token.createMany({
      data: [
        {
          token: accessToken,
          type: 'ACCESS',
          expiresAt: accessExpiresAt,
          userId: user.id,
        },
        {
          token: refreshToken,
          type: 'REFRESH',
          expiresAt: refreshExpiresAt,
          userId: user.id,
        },
      ],
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        wallets: user.wallets.map((w) => ({
          address: w.address,
          network: w.network,
          currency: w.currency,
          isDefault: w.isDefault,
        })),
      },
    };
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token inválido');
      }

      // Verificar si el token está revocado
      const isValid = await this.validateToken(refreshToken);
      if (!isValid) {
        throw new UnauthorizedException('Token revocado o expirado');
      }

      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        type: 'access',
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
      });

      // Guardar el nuevo access token
      const accessExpiresAt = new Date();
      accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + 15);

      await this.prisma.token.create({
        data: {
          token: accessToken,
          type: 'ACCESS',
          expiresAt: accessExpiresAt,
          userId: payload.sub,
        },
      });

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async logout(token: string): Promise<void> {
    await this.revokeToken(token);
  }

  async createOpenLeagueWallet(
    createOpenLeagueWalletDto: CreateOpenLeagueWalletDto,
  ): Promise<AuthResponse> {
    const { email, password, accessToken } = createOpenLeagueWalletDto;

    if (!this.cdpClient) {
      throw new BadRequestException(
        'Coinbase CDP no está configurado. Debe configurar CDP_API_KEY_ID y CDP_API_KEY_SECRET',
      );
    }

    // Verificar el usuario con email y password
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { wallets: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    try {
      // Validar el access token de Coinbase
      // Tipamos la respuesta como `any` porque la forma exacta puede variar
      const endUser: any = await this.cdpClient.endUser.validateAccessToken({
        accessToken,
      });

      if (!endUser) {
        throw new UnauthorizedException('Token de Coinbase inválido');
      }

      // Extraer la dirección de la wallet con varios fallbacks seguros
      // La estructura devuelta por Coinbase CDP puede variar según la integración,
      // así que probamos varios caminos comunes antes de fallar.
      const walletAddress =
        endUser?.wallets?.[0]?.address ||
        endUser?.data?.wallets?.[0]?.address ||
        endUser?.wallet?.address ||
        endUser?.address ||
        endUser?.id ||
        endUser?.sub ||
        endUser?.userId ||
        null;

      if (!walletAddress) {
        throw new BadRequestException(
          'No se pudo obtener la dirección de la wallet de Coinbase',
        );
      }

      // Verificar si la wallet ya existe
      const existingWallet = await this.prisma.wallet.findUnique({
        where: { address: walletAddress },
      });

      if (existingWallet) {
        throw new ConflictException('Esta wallet ya está vinculada a una cuenta');
      }

      // Crear wallet con proveedor "open league"
      await this.prisma.wallet.create({
        data: {
          address: walletAddress,
          network: 'ethereum', // Puedes ajustar según la configuración
          currency: 'ETH',
          provider: 'open league',
          isDefault: user.wallets.length === 0, // Primera wallet es default
          userId: user.id,
        },
      });

      // Actualizar el usuario con la nueva wallet
      const updatedUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: { wallets: true },
      });

      // Generar tokens de autenticación
      return this.generateAuthResponse(updatedUser);
    } catch (error) {
      if (error instanceof ConflictException || error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error al crear wallet de Open League: ${error.message || 'Error desconocido'}`,
      );
    }
  }
}
