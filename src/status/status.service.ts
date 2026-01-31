import { Injectable } from '@nestjs/common';
import { StatusRepository } from './status.repository';
import { SocketGateway } from '../socket/socket.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_RULES } from '../common/constants/premium.constants';

@Injectable()
export class StatusService {
  constructor(
    private readonly statusRepository: StatusRepository,
    private readonly socketGateway: SocketGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async updateStatus(
    userId: string,
    userDisplayName: string,
    groupId: string,
    text: string,
    emoji?: string,
    mood?: string,
  ) {
    const currentStatus = await this.statusRepository.getStatus(userId, groupId);
    const result = await this.statusRepository.updateStatus(userId, groupId, text, emoji, mood);

    // Broadcast via socket
    this.socketGateway.broadcastStatusUpdate(groupId, userId, text, emoji, mood);

    // 3. Notification Logic (15s Rule + Mute)
    const now = new Date();
    const lastUpdate = currentStatus?.updatedAt;
    const timeDiff = lastUpdate ? now.getTime() - lastUpdate.getTime() : Infinity;

    // Only notify if enough time passed (or first update)
    if (timeDiff >= NOTIFICATION_RULES.STATUS_UPDATE_DEBOUNCE_MS) {
      const groupName = await this.statusRepository.getGroupName(groupId);

      if (groupName) {
        // Get targets (Excludes sender and muted users)
        const targetUserIds = await this.statusRepository.getGroupNotificationTargets(
          groupId,
          userId,
        );

        if (targetUserIds.length > 0) {
          await this.notificationsService.sendNotificationToUsers(
            targetUserIds,
            'Yeni Durum',
            `${userDisplayName}: ${text} ${emoji || ''}`,
            { userId, groupId, type: 'status_update' },
          );
        }
      }
    }

    return result;
  }

  async getStatus(userId: string, groupId: string) {
    return this.statusRepository.getStatus(userId, groupId);
  }
}
