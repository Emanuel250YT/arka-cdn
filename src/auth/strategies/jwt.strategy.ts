import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'your-secret-key-change-this',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido');
    }

    // Extraer el token del header
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    // Verificar si el token está revocado
    const tokenRecord = await this.prisma.token.findUnique({
      where: { token },
    });

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw new UnauthorizedException('Token revocado');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Token expirado');
    }

    // Buscar usuario
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        wallets: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }
}
