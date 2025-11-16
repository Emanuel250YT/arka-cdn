import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { UploadModule } from './upload/upload.module';
import { PaseoModule } from './paseo/paseo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    EmailModule,
    UploadModule,
    PaseoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
