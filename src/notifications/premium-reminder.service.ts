import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { PinoLogger } from 'nestjs-pino';
import { COLLECTIONS, nowIso, UserDoc } from '../firebase/firestore.types';
import { NotificationsService } from './notifications.service';

const SCAN_INTERVAL_MS = 10 * 60 * 1000; // 10 dk

/**
 * Aboneliği biten grup liderine 24 saat sonra tek seferlik hatırlatma.
 * Zamanlama Firestore'da (lapseReminderDueAt) tutulur; sunucu yeniden
 * başlasa da kaçmaz. Tek instance varsayımı: çoklu instance'ta çift gönderim
 * olmaması için gönderim öncesi alan transaction ile temizlenir.
 */
@Injectable()
export class PremiumReminderService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject('FIRESTORE') private readonly db: Firestore,
    private readonly notificationsService: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PremiumReminderService.name);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    // Açılışta bir kez: kapalıyken vadesi gelenler beklemesin
    setTimeout(() => void this.scan(), 15_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(): Promise<void> {
    try {
      const now = nowIso();
      const snap = await this.db
        .collection(COLLECTIONS.USERS)
        .where('lapseReminderDueAt', '<=', now)
        .limit(200)
        .get();

      for (const doc of snap.docs) {
        const claimed = await this.claim(doc.id, now);
        if (!claimed) continue;
        await this.notificationsService.sendNotificationToUsers(
          [doc.id],
          'Aboneliğin yenilenmedi',
          "Gruplarının canlı güncellemeleri ve bildirimleri durdu. Üyelerin seni bekliyor — Premium'u yenileyerek grubunu yeniden etkinleştir.",
          { type: 'premium_lapsed' },
          // İşlemsel bildirim: uygulama içi bildirim tercihinden bağımsız
          { force: true },
        );
        this.logger.info({ userId: doc.id }, 'Premium lapse reminder sent');
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Premium reminder scan failed');
    }
  }

  /** Hâlâ uygunsa hatırlatmayı "gönderildi" olarak işaretler (tek sefer). */
  private async claim(userId: string, now: string): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection(COLLECTIONS.USERS).doc(userId);
      const snap = await tx.get(ref);
      const user = snap.data() as UserDoc | undefined;
      if (!user || !user.lapseReminderDueAt || user.lapseReminderDueAt > now) return false;
      tx.update(ref, { lapseReminderDueAt: null, lapseReminderSentAt: now });
      // Bu arada yenilediyse gönderme
      return !user.isPremium;
    });
  }
}
