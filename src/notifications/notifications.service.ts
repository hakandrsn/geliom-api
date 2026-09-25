import { Inject, Injectable, Logger } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, UserDoc } from '../firebase/firestore.types';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appId: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('FIRESTORE') private readonly db: Firestore,
  ) {
    this.appId = this.configService.get<string>('ONESIGNAL_APP_ID') || '';
    this.apiKey = this.configService.get<string>('ONESIGNAL_API_KEY') || '';
  }

  /** Hedefleme external user ID (= Firebase UID) ile yapılır — mobil login'de set eder. */
  async sendNotificationToUsers(
    userIds: string[],
    title: string,
    message: string,
    data?: any,
    options: { force?: boolean } = {},
  ) {
    if (!userIds.length) return;

    // Uygulama içi genel bildirim tercihi (sunucuda). force: işlemsel
    // bildirimler (abonelik hatırlatması) tercihten bağımsız gider;
    // sistem izni kapalıysa OneSignal zaten teslim edemez.
    if (!options.force) {
      const refs = userIds.map((id) => this.db.collection(COLLECTIONS.USERS).doc(id));
      const snaps = await this.db.getAll(...refs);
      userIds = snaps
        .filter((snap) => (snap.data() as UserDoc | undefined)?.pushEnabled !== false)
        .map((snap) => snap.id);
      if (!userIds.length) return;
    }

    const payload = {
      app_id: this.appId,
      include_external_user_ids: userIds,
      headings: { en: title },
      contents: { en: message },
      data,
    };

    return this.sendToOneSignal(payload);
  }

  async sendNotificationToUser(
    userId: string,
    title: string,
    message: string,
    data?: any,
    options: { force?: boolean } = {},
  ) {
    return this.sendNotificationToUsers([userId], title, message, data, options);
  }

  private async sendToOneSignal(payload: any) {
    if (!this.appId || !this.apiKey) {
      this.logger.warn('OneSignal credentials not set. Skipping notification.');
      return;
    }

    try {
      const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
      });
      this.logger.log(`Notification sent: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error sending notification', error.response?.data || error.message);
    }
  }
}
