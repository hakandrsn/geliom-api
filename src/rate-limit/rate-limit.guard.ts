import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
  SKIP_RATE_LIMIT_KEY,
} from '../common/decorators/rate-limit.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

// Default rate limits (decorator yoksa)
const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW = 60; // 1 dakika

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Public endpoint'ler için de rate limit uygula (ama daha yüksek limit ile)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @SkipRateLimit() varsa bypass
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id || request.ip || 'anonymous';
    const action = `${request.method}:${context.getClass().name}:${context.getHandler().name}`;

    // Rate limit options
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const limit = options?.limit || (isPublic ? DEFAULT_LIMIT * 2 : DEFAULT_LIMIT);
    const windowSeconds = options?.windowSeconds || DEFAULT_WINDOW;

    const result = this.rateLimitService.check(userId, action, limit, windowSeconds);

    // Response header'larına rate limit bilgisi ekle
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
