import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { UserRecord } from '../firebase/firestore.types';
import { GroupPlanService } from '../groups/group-plan.service';
import { SessionService } from '../session/session.service';
import { UsersRepository } from '../users/users.repository';

const ADAPTY_PROFILE_URL = 'https://api.adapty.io/api/v2/server-side-api/profile/';
const ADAPTY_TIMEOUT_MS = 5000;

interface AdaptyAccessLevel {
  access_level_id?: string;
  expires_at?: string | null;
  is_in_grace_period?: boolean;
}

/** expires_at yoksa ömür boyu erişim; varsa gelecekte olmalı ya da grace period'da. */
export function isAccessLevelActive(level: AdaptyAccessLevel, now = Date.now()): boolean {
  if (level.is_in_grace_period) return true;
  if (!level.expires_at) return true;
  const ts = Date.parse(level.expires_at);
  return !Number.isNaN(ts) && ts > now;
}

/**
 * Premium'un TEK yöneticisi.
 *
 * Doğruluk kaynağı Adapty'dir (mağaza satın alması + panelden verilen erişim).
 * Firestore'daki `users.isPremium` ve gruplardaki `ownerIsPremium` yalnızca
 * bunun önbelleğidir ve SADECE `setPremium` üzerinden yazılır — böylece
 * kullanıcı ile sahibi olduğu gruplar asla birbirinden kopamaz.
 */
@Injectable()
export class PremiumService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly groupPlanService: GroupPlanService,
    private readonly sessionService: SessionService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PremiumService.name);
  }

  /**
   * Adapty server API'sinden kullanıcının aktif erişimi var mı.
   * Secret key yoksa, profil yoksa ya da Adapty'ye ulaşılamazsa null —
   * "bilinmiyor" ile "premium değil" karışmasın.
   */
  async fetchFromAdapty(userId: string): Promise<boolean | null> {
    const secretKey = this.configService.get<string>('ADAPTY_SECRET_KEY');
    if (!secretKey) return null;

    try {
      const res = await fetch(ADAPTY_PROFILE_URL, {
        headers: {
          Authorization: `Api-Key ${secretKey}`,
          'adapty-customer-user-id': userId,
        },
        signal: AbortSignal.timeout(ADAPTY_TIMEOUT_MS),
      });
      // Profil yok = bu kullanıcı Adapty'de hiç tanımlanmadı (identify yok)
      if (res.status === 404) return false;
      if (!res.ok) {
        this.logger.warn({ userId, status: res.status }, 'Adapty profile request failed');
        return null;
      }
      const body = (await res.json()) as { data?: { access_levels?: AdaptyAccessLevel[] } };
      const levels = body.data?.access_levels ?? [];
      return levels.some((level) => isAccessLevelActive(level));
    } catch (error) {
      this.logger.warn({ userId, err: error }, 'Adapty profile request error');
      return null;
    }
  }

  /**
   * Kullanıcıyı Adapty ile eşitler ve gruplarını kullanıcıya hizalar.
   * Adapty'ye ulaşılamazsa Firestore'daki değer korunur ama gruplar yine de
   * ona hizalanır (elle düzeltilen kayıtlar da kendini onarır).
   */
  async sync(userId: string, fallback?: boolean): Promise<UserRecord | null> {
    const user = await this.usersRepository.findById(userId);
    if (!user) return null;

    const fromAdapty = await this.fetchFromAdapty(userId);
    const isPremium = fromAdapty ?? fallback ?? user.isPremium;
    return this.setPremium(user, isPremium);
  }

  /** users.isPremium + gruplar + canlı bildirim — tek yazma yolu. */
  async setPremium(
    user: UserRecord,
    isPremium: boolean,
    subscriptionStatus?: string,
  ): Promise<UserRecord> {
    const userChanged = user.isPremium !== isPremium;
    const statusChanged =
      subscriptionStatus !== undefined && subscriptionStatus !== user.subscriptionStatus;

    let updated = user;
    if (userChanged || statusChanged) {
      updated = await this.usersRepository.update(user.id, {
        isPremium,
        ...(subscriptionStatus !== undefined && { subscriptionStatus }),
      });
    }

    // Kullanıcı aynı kalsa bile gruplardaki kopya kaymış olabilir
    if (userChanged || (await this.groupPlanService.hasOwnerPremiumDrift(user.id, isPremium))) {
      await this.groupPlanService.applyOwnerPremium(user.id, isPremium);
    }

    if (userChanged) {
      this.logger.info({ userId: user.id, isPremium, subscriptionStatus }, 'User premium changed');
      this.sessionService.emitToUser(user.id, 'premium:update', { isPremium });
    }
    return updated;
  }
}
