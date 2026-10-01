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
import { SupportModule } from './support/support.module';
import { EmojiModule } from './emoji/emoji.module';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { FirebaseModule } from './firebase/firebase.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';

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
    SupportModule,
    EmojiModule,
  ],
  providers: [
    // Global guard sırası önemlidir: önce auth (request.user set edilir),
    // sonra rate limit (kullanıcı bazlı anahtar için request.user gerekir).
    // @Public() endpoint'lerde auth atlanır, rate limit IP bazlı çalışır.
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
