import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Prisma connected to database');
    } catch (error) {
      console.log('⚠️  Prisma could not connect to database:', error.message);
      console.log('   Make sure DATABASE_URL is set correctly in .env file');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('👋 Prisma disconnected from database');
  }
}
