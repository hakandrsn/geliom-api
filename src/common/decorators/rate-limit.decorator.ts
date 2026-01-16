import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number; // Maximum requests
  windowSeconds: number; // Time window in seconds
}

/**
 * @RateLimit(5, 60) - 60 saniyede maksimum 5 istek
 */
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds } as RateLimitOptions);

/**
 * @SkipRateLimit() - Rate limit kontrolünü atla (status/mood için)
 */
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
