import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from './logger/logger.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { SessionModule } from './session/session.module';
import { AdaptyModule } from './adapty/adapty.module';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { FirebaseModule } from './firebase/firebase.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    // Global Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // Global Modules
    LoggerModule,
    RateLimitModule,
    FirebaseModule,
    NotificationsModule,
    SessionModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    GroupsModule,
    AdaptyModule,
  ],
  providers: [
    // Global Firebase Guard - tüm endpoint'ler korunur, @Public() ile açılır
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
  ],
})
export class AppModule {}
