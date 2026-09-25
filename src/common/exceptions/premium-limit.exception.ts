import { ConflictException } from '@nestjs/common';

/**
 * Makine tarafından okunabilir limit kodları — mobil bu koda göre paywall
 * açar ya da yalnızca bilgi verir (metne göre tahmin yürütmez).
 */
export type PremiumLimitCode =
  /** Kullanıcının üyelik limiti dolu (free 1 / premium 7) → kullanıcı premium alabilir */
  | 'MEMBERSHIP_LIMIT'
  /** Onaylanan kişinin üyelik limiti dolu → admin bir şey yapamaz */
  | 'REQUESTER_MEMBERSHIP_LIMIT'
  /** Grup kapasitesi dolu (free 5 / premium 20) → yalnızca grup sahibi premium alarak açabilir */
  | 'GROUP_CAPACITY'
  /** Özel ruh hali premium gerektirir → grup sahibi premium alabilir */
  | 'CUSTOM_MOOD_PREMIUM'
  /** Premium'da bile özel ruh hali limiti (10) dolu */
  | 'CUSTOM_MOOD_LIMIT'
  /** Seçenek listesi düzenleme premium gerektirir → grup sahibi premium alabilir */
  | 'OPTIONS_PREMIUM'
  /** Bir listede özel seçenek limiti (10) dolu */
  | 'OPTIONS_LIMIT'
  /** Grup duraklatılmış (sahibinin aboneliği bitti) */
  | 'GROUP_PAUSED';

export class PremiumLimitException extends ConflictException {
  constructor(
    code: PremiumLimitCode,
    message: string,
    extra: { limit?: number; isPremium?: boolean } = {},
  ) {
    super({ statusCode: 409, error: 'Conflict', code, message, ...extra });
  }

  get code(): PremiumLimitCode {
    return (this.getResponse() as { code: PremiumLimitCode }).code;
  }
}
