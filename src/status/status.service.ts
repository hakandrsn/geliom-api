import { Injectable } from '@nestjs/common';
import { StatusRepository } from './status.repository';
import { SocketGateway } from '../socket/socket.gateway';
import { NotificationsService } from '../notifications/notifications.service';

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
    const result = await this.statusRepository.updateStatus(userId, groupId, text, emoji, mood);

    // Broadcast via socket
    this.socketGateway.broadcastStatusUpdate(groupId, userId, text, emoji, mood);

    // Send Notification
    const groupName = await this.statusRepository.getGroupName(groupId);
    if (groupName) {
      await this.notificationsService.sendNotificationToGroup(
        groupId,
        'Yeni Durum',
        `${userDisplayName}: ${text} ${emoji || ''}`,
        { userId, groupId, type: 'status_update' },
      );
    }

    return result;
  }

  async getStatus(userId: string, groupId: string) {
    return this.statusRepository.getStatus(userId, groupId);
  }
}
