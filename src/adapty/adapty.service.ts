import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionService } from '../session/session.service';
import { UsersRepository } from '../users/users.repository';
import { GroupPlanService } from '../groups/group-plan.service';

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
 * `access_level_updated` hem erişim kazanıldığında hem kaybedildiğinde gelir;
 * event tipinden değil, payload'daki erişim bilgisinden karar verilir.
 * Karar verilemezse null döner ve event yok sayılır.
 */
function resolveAccessLevelActive(props: Record<string, unknown> | undefined): boolean | null {
  if (!props) return null;

  if (typeof props.is_active === 'boolean') return props.is_active;
  if (props.is_lifetime === true) return true;

  const expiresAt = props.expires_at ?? props.access_level_expires_at;
  if (typeof expiresAt === 'string') {
    const ts = Date.parse(expiresAt);
    if (!Number.isNaN(ts)) return ts > Date.now();
  }

  return null;
}

@Injectable()
export class AdaptyService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionService: SessionService,
    private readonly groupPlanService: GroupPlanService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdaptyService.name);
  }

  async handleEvent(payload: AdaptyWebhookPayload): Promise<void> {
    const eventType = payload.event_type;
    const userId = payload.customer_user_id;

    if (!eventType || !userId) {
      this.logger.warn({ payload }, 'Adapty webhook missing event_type or customer_user_id');
      return;
    }

    let isPremium: boolean;
    if (PREMIUM_ON_EVENTS.has(eventType)) {
      isPremium = true;
    } else if (PREMIUM_OFF_EVENTS.has(eventType)) {
      isPremium = false;
    } else if (eventType === 'access_level_updated') {
      const active = resolveAccessLevelActive(payload.event_properties);
      if (active === null) {
        this.logger.warn(
          { userId, props: payload.event_properties },
          'access_level_updated without resolvable access state — ignored',
        );
        return;
      }
      isPremium = active;
    } else {
      this.logger.debug({ eventType }, 'Ignoring unhandled Adapty event');
      return;
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      this.logger.warn({ userId, eventType }, 'Adapty webhook for unknown user');
      return;
    }

    if (user.isPremium === isPremium) {
      // Durum değişmedi, sadece subscriptionStatus'u tazele
      await this.usersRepository.update(userId, { subscriptionStatus: eventType });
      return;
    }

    await this.usersRepository.update(userId, { isPremium, subscriptionStatus: eventType });
    this.logger.info({ userId, isPremium, eventType }, 'User premium status changed');

    // Sahibi olduğu gruplar: ownerIsPremium tazelenir; premium bittiyse
    // ücretsiz hak dışındaki gruplar duraklatılır, açıldıysa aktifleşir
    await this.groupPlanService.applyOwnerPremium(userId, isPremium);

    // Kullanıcının kendi soketlerine anlık bildir
    this.sessionService.emitToUser(userId, 'premium:update', { isPremium });
  }
}
