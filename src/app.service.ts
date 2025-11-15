import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to OpenLeague Backend - NestJS + Prisma + Hardhat';
  }
}
