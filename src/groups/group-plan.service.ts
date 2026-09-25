import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { selectGroupsToPause } from '../common/group-plan';
import { GroupRecord, nowIso } from '../firebase/firestore.types';
import { SessionService } from '../session/session.service';
import { SESSION_EVENTS } from '../session/session.types';
import { UsersRepository } from '../users/users.repository';

/** Abonelik bittikten sonra hatırlatma push'unun gecikmesi */
export const LAPSE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sahibin premium durumu değişince sahip olduğu grupları günceller:
 *  - Premium açıldı → tüm grupları aktif (isPaused=false), ownerIsPremium=true
 *  - Premium bitti  → ücretsiz hakka sığan tek grup aktif kalır, diğerleri
 *                     duraklatılır; canlı session'lar 'paused' ile kapatılır
 * Grup silinmez, üye çıkarılmaz; sadece canlı etkileşim durur.
 */
@Injectable()
export class GroupPlanService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GroupPlanService.name);
  }

  async applyOwnerPremium(userId: string, isPremium: boolean): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) return;

    const owned: GroupRecord[] = [];
    for (const groupId of user.groupIds) {
      const group = await this.sessionService.getGroup(groupId);
      if (group && group.ownerId === userId) owned.push(group);
    }

    const pauseIds = new Set(
      isPremium
        ? []
        : selectGroupsToPause(
            owned.map((g) => ({
              id: g.id,
              createdAt: g.createdAt,
              memberCount: Object.keys(g.members).length,
            })),
          ).pauseIds,
    );

    for (const group of owned) {
      const shouldPause = pauseIds.has(group.id);
      const wasPaused = group.isPaused;
      try {
        await this.sessionService.mutateGroup(group.id, (g) => {
          g.ownerIsPremium = isPremium;
          g.isPaused = shouldPause;
          g.pausedAt = shouldPause ? (g.pausedAt ?? nowIso()) : null;
          return {
            event: 'plan.changed',
            patch: { ownerIsPremium: isPremium, isPaused: shouldPause },
          };
        });
      } catch (error) {
        this.logger.warn({ groupId: group.id, err: error }, 'Failed to apply plan to group');
        continue;
      }

      if (shouldPause && !wasPaused) {
        // Canlı session'ları kapat; üyeler tekrar açınca anlık görüntü alır
        this.sessionService.closeGroupSessions(group.id, 'paused');
      }
      if (shouldPause !== wasPaused) {
        // Session'da olmayan (veya kapatılan) üyelere de haber ver
        for (const memberId of Object.keys(group.members)) {
          this.sessionService.emitToUser(memberId, SESSION_EVENTS.PLAN_CHANGED, {
            groupId: group.id,
            isPaused: shouldPause,
          });
        }
      }
    }

    // Hatırlatma zamanlaması: bitişten 24 saat sonra (yenilenirse iptal)
    await this.usersRepository.updateLapseState(
      userId,
      isPremium
        ? { premiumLapsedAt: null, lapseReminderDueAt: null }
        : {
            premiumLapsedAt: nowIso(),
            lapseReminderDueAt: pauseIds.size
              ? new Date(Date.now() + LAPSE_REMINDER_DELAY_MS).toISOString()
              : null,
            lapseReminderSentAt: null,
          },
    );

    this.logger.info(
      { userId, isPremium, owned: owned.length, paused: pauseIds.size },
      'Owner plan applied to groups',
    );
  }
}
