import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * RateLimitGuard burada APP_GUARD olarak KAYIT EDİLMEZ — global guard'lar
 * kayıt sırasıyla çalışır ve auth guard'dan önce çalışırsa request.user
 * henüz yoktur (tüm limitler IP bazlı olur). Sıralama AppModule'de yapılır.
 */
@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
