import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  // In-memory storage: Map<key, RateLimitEntry>
  private readonly store = new Map<string, RateLimitEntry>();

  // Cleanup interval (her 5 dakikada bir expired entry'leri temizle)
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(RateLimitService.name);

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Rate limit kontrolü yapar
   * @returns { allowed: boolean, remaining: number, resetAt: Date }
   */
  check(
    userId: string,
    action: string,
    limit: number,
    windowSeconds: number,
  ): { allowed: boolean; remaining: number; resetAt: Date } {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let entry = this.store.get(key);

    // Entry yoksa veya süresi dolmuşsa yeni oluştur
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.store.set(key, entry);

      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(entry.resetAt),
      };
    }

    // Limit aşılmış mı?
    if (entry.count >= limit) {
      this.logger.warn(
        { userId, action, limit, resetAt: new Date(entry.resetAt) },
        'Rate limit exceeded',
      );

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    // Counter'ı artır
    entry.count++;
    this.store.set(key, entry);

    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  /**
   * Manuel reset (test için veya admin işlemleri için)
   */
  reset(userId: string, action: string): void {
    const key = `${userId}:${action}`;
    this.store.delete(key);
  }

  /**
   * Expired entry'leri temizle
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug({ cleaned }, 'Rate limit cleanup completed');
    }
  }

  /**
   * Module destroy için cleanup interval'i temizle
   */
  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
