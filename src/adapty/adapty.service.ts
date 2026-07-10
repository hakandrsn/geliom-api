import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionService } from '../session/session.service';
import { UsersRepository } from '../users/users.repository';

const PREMIUM_ON_EVENTS = new Set([
  'subscription_started',
  'subscription_renewed',
  'access_level_updated',
  'trial_started',
]);

const PREMIUM_OFF_EVENTS = new Set([
  'subscription_expired',
  'subscription_refunded',
  'access_revoked',
  'trial_expired',
]);

export interface AdaptyWebhookPayload {
  event_type?: string;
  customer_user_id?: string;
  [key: string]: unknown;
}

@Injectable()
export class AdaptyService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionService: SessionService,
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

    // Owner olduğu gruplarda denormalize ownerIsPremium'u tazele —
    // canlı session'lar premium.changed olarak anında görür
    for (const groupId of user.groupIds) {
      try {
        await this.sessionService.mutateGroup(groupId, (group) => {
          if (group.ownerId !== userId) return;
          group.ownerIsPremium = isPremium;
          return {
            event: 'premium.changed',
            patch: { ownerIsPremium: isPremium },
          };
        });
      } catch (error) {
        this.logger.warn({ groupId, err: error }, 'Failed to fan out premium change to group');
      }
    }

    // Kullanıcının kendi soketlerine anlık bildir
    this.sessionService.emitToUser(userId, 'premium:update', { isPremium });
  }
}
