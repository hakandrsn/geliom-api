import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DEFAULT_MOOD_LABELS, NOTIFICATION_RULES } from '../common/constants/premium.constants';
import { SessionService } from '../session/session.service';
import { NotificationsService } from './notifications.service';
import { shouldNotifyMember, StatusChangeFlags } from '../common/notification-prefs';

interface DebounceEntry {
  timer: NodeJS.Timeout;
  /** Pencere boyunca biriken değişiklik türleri (OR) */
  flags: StatusChangeFlags;
}

/**
 * Status/mood push bildirimleri için trailing debounce.
 *
 * Kural (docs/project.md #11): her değişimde değer tutulur ve 15 sn sonra
 * bildirim gönderilir; bu sürede yeni değişim gelirse süre sıfırlanır.
 * Gönderim anında en güncel status grup objesinden okunur ve hedef listesi
 * yeniden hesaplanır — arada session açan üyeye push gitmez, o zaten
 * socket'ten görmüştür.
 */
@Injectable()
export class PushDebounceService implements OnModuleDestroy {
  private readonly entries = new Map<string, DebounceEntry>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PushDebounceService.name);
  }

  /** Status değişiminde çağrılır; debounce süresi dolunca push atar. */
  notifyStatusChanged(groupId: string, senderId: string, flags: StatusChangeFlags) {
    const key = `${groupId}:${senderId}`;
    const existing = this.entries.get(key);
    if (existing) clearTimeout(existing.timer);

    const merged: StatusChangeFlags = {
      status: (existing?.flags.status ?? false) || flags.status,
      mood: (existing?.flags.mood ?? false) || flags.mood,
    };

    const timer = setTimeout(() => {
      const entry = this.entries.get(key);
      this.entries.delete(key);
      void this.fire(groupId, senderId, entry?.flags ?? merged);
    }, NOTIFICATION_RULES.STATUS_UPDATE_DEBOUNCE_MS);

    this.entries.set(key, { timer, flags: merged });
  }

  private async fire(groupId: string, senderId: string, flags: StatusChangeFlags) {
    try {
      const group = await this.sessionService.getGroup(groupId);
      if (!group || group.isPaused) return; // duraklatılmış grupta bildirim yok

      const status = group.statuses[senderId];
      const sender = group.members[senderId];
      if (!status || !sender) return; // gönderen bu arada gruptan çıkmış olabilir

      const targetUserIds = Object.entries(group.members)
        .filter(
          ([userId, member]) =>
            userId !== senderId &&
            shouldNotifyMember(member, senderId, flags) &&
            !this.sessionService.isUserInSession(groupId, userId),
        )
        .map(([userId]) => userId);

      if (targetUserIds.length === 0) return;

      const senderName = sender.displayName || 'Bir üye';
      const moodLabel = status.mood
        ? (group.moodOptions.find((m) => m.key === status.mood)?.text ??
          DEFAULT_MOOD_LABELS[status.mood])
        : undefined;
      // "İşte · Yorgun", yalnızca biri varsa o
      const body = [status.text, moodLabel].filter(Boolean).join(' · ');
      if (!body) return;
      const message = `${senderName}: ${body}${status.emoji ? ` ${status.emoji}` : ''}`;

      await this.notificationsService.sendNotificationToUsers(targetUserIds, group.name, message, {
        type: 'status_update',
        groupId,
        userId: senderId,
      });
    } catch (error) {
      this.logger.error({ groupId, senderId, err: error }, 'Failed to send debounced push');
    }
  }

  onModuleDestroy() {
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
  }
}
