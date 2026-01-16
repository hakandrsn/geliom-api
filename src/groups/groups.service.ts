import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { GroupsRepository } from './groups.repository';
import { generateUniqueInviteCode } from './helpers/invite-code.generator';

import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createGroup(userId: string, name: string) {
    const inviteCode = await generateUniqueInviteCode((code) =>
      this.groupsRepository.findByInviteCode(code).then((g) => !!g),
    );

    return this.groupsRepository.create({
      name,
      inviteCode,
      ownerId: userId,
    });
  }

  async joinGroup(userId: string, inviteCode: string) {
    const group = await this.groupsRepository.findByInviteCode(inviteCode);
    if (!group) {
      throw new NotFoundException('Grup bulunamadı');
    }

    const isMember = await this.groupsRepository.isMember(group.id, userId);
    if (isMember) {
      throw new ConflictException('Zaten bu grubun üyesisiniz');
    }

    return this.groupsRepository.addMember(group.id, userId);
  }

  async leaveGroup(userId: string, groupId: string) {
    const isMember = await this.groupsRepository.isMember(groupId, userId);
    if (!isMember) {
      throw new NotFoundException('Grup üyeliği bulunamadı');
    }

    return this.groupsRepository.removeMember(groupId, userId);
  }

  // Join Requests
  async requestToJoin(userId: string, groupId: string) {
    // Check if group exists
    const group = await this.groupsRepository.findById(groupId);
    if (!group) throw new NotFoundException('Grup bulunamadı');

    // Check if already a member
    const isMember = await this.groupsRepository.isMember(groupId, userId);
    if (isMember) throw new ConflictException('Zaten bu grubun üyesisiniz');

    // Check if pending request exists
    const pendingRequest = await this.groupsRepository.findPendingRequest(userId, groupId);
    if (pendingRequest) throw new ConflictException('Zaten bekleyen bir isteğiniz var');

    const joinRequest = await this.groupsRepository.createJoinRequest(userId, groupId);

    // Notify Group Owner
    const user = await this.usersService.findById(userId);
    const userName = user?.displayName || 'Bir kullanıcı';

    await this.notificationsService.sendNotificationToUser(
      group.ownerId,
      'Katılım İsteği',
      `${userName} grubunuza katılmak istiyor: ${group.name}`,
      { type: 'join_request', groupId, requestId: joinRequest.id },
    );

    return joinRequest;
  }

  async getGroupRequests(userId: string, groupId: string) {
    // Verify admin role
    const role = await this.groupsRepository.getMemberRole(groupId, userId);
    if (role !== 'ADMIN') throw new ConflictException('Bu işlem için yetkiniz yok');

    return this.groupsRepository.getGroupRequests(groupId, 'PENDING');
  }

  async respondToRequest(
    userId: string,
    groupId: string,
    requestId: string,
    response: 'APPROVED' | 'REJECTED',
  ) {
    // Verify admin role
    const role = await this.groupsRepository.getMemberRole(groupId, userId);
    if (role !== 'ADMIN') throw new ConflictException('Bu işlem için yetkiniz yok');

    const request = await this.groupsRepository.findJoinRequestById(requestId);
    if (!request) throw new NotFoundException('İstek bulunamadı');
    if (request.groupId !== groupId) throw new ConflictException('İstek bu gruba ait değil');
    if (request.status !== 'PENDING') throw new ConflictException('Bu istek zaten yanıtlanmış');

    if (response === 'APPROVED') {
      // Add member
      await this.groupsRepository.addMember(groupId, request.userId, 'MEMBER');

      // Notify User
      const group = await this.groupsRepository.findById(groupId);
      if (group) {
        await this.notificationsService.sendNotificationToUser(
          request.userId,
          'İstek Onaylandı',
          `${group.name} grubuna katılım isteğiniz onaylandı! 🎉`,
          { type: 'request_approved', groupId },
        );
      }
    }

    return this.groupsRepository.updateJoinRequestStatus(requestId, response);
  }
}
