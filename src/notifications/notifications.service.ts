import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appId: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('ONESIGNAL_APP_ID') || '';
    this.apiKey = this.configService.get<string>('ONESIGNAL_API_KEY') || '';
  }

  /** Hedefleme external user ID (= Firebase UID) ile yapılır — mobil login'de set eder. */
  async sendNotificationToUsers(userIds: string[], title: string, message: string, data?: any) {
    if (!userIds.length) return;

    const payload = {
      app_id: this.appId,
      include_external_user_ids: userIds,
      headings: { en: title },
      contents: { en: message },
      data,
    };

    return this.sendToOneSignal(payload);
  }

  async sendNotificationToUser(userId: string, title: string, message: string, data?: any) {
    return this.sendNotificationToUsers([userId], title, message, data);
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
