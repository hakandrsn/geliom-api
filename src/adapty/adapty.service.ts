import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from '../users/users.repository';
import { PremiumService } from './premium.service';

const PREMIUM_ON_EVENTS = new Set([
  'subscription_started',
  'subscription_renewed',
  'trial_started',
  'trial_converted',
  'non_subscription_purchase',
]);

const PREMIUM_OFF_EVENTS = new Set([
  'subscription_expired',
  'subscription_refunded',
  'access_revoked',
  'trial_expired',
  'subscription_paused',
  'non_subscription_purchase_refunded',
]);

export interface AdaptyWebhookPayload {
  event_type?: string;
  customer_user_id?: string;
  event_properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Event içinden erişim durumu (yalnızca Adapty API'ye ulaşılamazsa yedek).
 * `access_level_updated` hem kazanımda hem kayıpta gelir; karar verilemezse null.
 */
function resolveAccessLevelActive(props: Record<string, unknown> | undefined): boolean | null {
  if (!props) return null;

  if (typeof props.profile_has_access_level === 'boolean') return props.profile_has_access_level;
  if (typeof props.is_active === 'boolean') return props.is_active;
  if (props.is_lifetime === true) return true;

  const expiresAt =
    props.expires_at ?? props.access_level_expires_at ?? props.subscription_expires_at;
  if (typeof expiresAt === 'string') {
    const ts = Date.parse(expiresAt);
    if (!Number.isNaN(ts)) return ts > Date.now();
  }

  return null;
}

function resolveFromEvent(
  eventType: string,
  props: Record<string, unknown> | undefined,
): boolean | null {
  if (PREMIUM_ON_EVENTS.has(eventType)) return true;
  if (PREMIUM_OFF_EVENTS.has(eventType)) return false;
  return resolveAccessLevelActive(props);
}

@Injectable()
export class AdaptyService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly premiumService: PremiumService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdaptyService.name);
  }

  /**
   * Webhook yalnızca "bu kullanıcıda bir şey değişti" sinyalidir: karar
   * Adapty server API'sinden okunan güncel profille verilir (panelden verilen
   * erişim, yenileme, iade — hepsi aynı yoldan). API'ye ulaşılamazsa event
   * içeriğine düşülür.
   */
  async handleEvent(payload: AdaptyWebhookPayload): Promise<void> {
    const eventType = payload.event_type;
    const userId = payload.customer_user_id;

    if (!eventType || !userId) {
      this.logger.warn({ payload }, 'Adapty webhook missing event_type or customer_user_id');
      return;
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      this.logger.warn({ userId, eventType }, 'Adapty webhook for unknown user');
      return;
    }

    const fromAdapty = await this.premiumService.fetchFromAdapty(userId);
    const isPremium = fromAdapty ?? resolveFromEvent(eventType, payload.event_properties);
    if (isPremium === null) {
      this.logger.warn(
        { userId, eventType, props: payload.event_properties },
        'Adapty event without resolvable access state — ignored',
      );
      return;
    }

    await this.premiumService.setPremium(user, isPremium, eventType);
  }
}
