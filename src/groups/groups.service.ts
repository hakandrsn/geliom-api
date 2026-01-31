import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { GroupsRepository } from './groups.repository';
import { generateUniqueInviteCode } from './helpers/invite-code.generator';

import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PREMIUM_LIMITS, ERROR_MESSAGES } from '../common/constants/premium.constants';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createGroup(userId: string, name: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    const membershipCount = await this.groupsRepository.countUserMemberships(userId);
    const limit = (user as any).isPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
      : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;

    if (membershipCount >= limit) {
      throw new ConflictException(
        ERROR_MESSAGES.PREMIUM.MAX_GROUPS_REACHED(membershipCount, limit),
      );
    }

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

    // 1. Check User Membership Limit
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    const membershipCount = await this.groupsRepository.countUserMemberships(userId);
    const userLimit = (user as any).isPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
      : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;

    if (membershipCount >= userLimit) {
      throw new ConflictException(
        ERROR_MESSAGES.PREMIUM.MAX_GROUPS_REACHED(membershipCount, userLimit),
      );
    }

    // 2. Check Group Capacity Limit
    const groupOwner = await this.usersService.findById(group.ownerId);
    if (!groupOwner) throw new NotFoundException('Grup sahibi bulunamadı');

    const memberCount = await this.groupsRepository.countMembers(group.id);
    const groupLimit = (groupOwner as any).isPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_GROUP_MEMBERS
      : PREMIUM_LIMITS.FREE.MAX_GROUP_MEMBERS;

    if (memberCount >= groupLimit) {
      throw new ConflictException(ERROR_MESSAGES.PREMIUM.MAX_MEMBERS_REACHED(groupLimit));
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
      // Check Group Capacity
      const groupToCheck = await this.groupsRepository.findById(groupId);
      if (!groupToCheck) throw new NotFoundException('Grup bulunamadı');

      const groupOwner = await this.usersService.findById(groupToCheck.ownerId);
      if (!groupOwner) throw new NotFoundException('Grup sahibi bulunamadı');

      const memberCount = await this.groupsRepository.countMembers(groupId);
      const limit = (groupOwner as any).isPremium
        ? PREMIUM_LIMITS.PREMIUM.MAX_GROUP_MEMBERS
        : PREMIUM_LIMITS.FREE.MAX_GROUP_MEMBERS;

      if (memberCount >= limit) {
        throw new ConflictException(ERROR_MESSAGES.PREMIUM.MAX_MEMBERS_REACHED(limit));
      }

      // Add member
      await this.groupsRepository.addMember(groupId, request.userId, 'MEMBER');

      // Notify User
      if (groupToCheck) {
        await this.notificationsService.sendNotificationToUser(
          request.userId,
          'İstek Onaylandı',
          `${groupToCheck.name} grubuna katılım isteğiniz onaylandı! 🎉`,
          { type: 'request_approved', groupId },
        );
      }
    }

    return this.groupsRepository.updateJoinRequestStatus(requestId, response);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    data: { name?: string; description?: string },
  ) {
    const role = await this.groupsRepository.getMemberRole(groupId, userId);
    if (role !== 'ADMIN') throw new ConflictException(ERROR_MESSAGES.GROUP.NOT_ADMIN);

    return this.groupsRepository.update(groupId, data);
  }
  async addCustomMood(
    userId: string,
    groupId: string,
    data: { text: string; emoji?: string; mood: string },
  ) {
    // 1. Verify Admin
    const role = await this.groupsRepository.getMemberRole(groupId, userId);
    if (role !== 'ADMIN') throw new ConflictException(ERROR_MESSAGES.GROUP.NOT_ADMIN);

    // 2. Verify Premium Logic
    const group = await this.groupsRepository.findById(groupId);
    if (!group) throw new NotFoundException('Grup bulunamadı');

    const owner = await this.usersService.findById(group.ownerId);
    if (!owner) throw new NotFoundException('Grup sahibi bulunamadı');

    const isPremium = (owner as any).isPremium;
    const config = isPremium ? PREMIUM_LIMITS.PREMIUM : PREMIUM_LIMITS.FREE;

    if (!config.CAN_ADD_CUSTOM_MOOD) {
      throw new ConflictException(ERROR_MESSAGES.PREMIUM.CUSTOM_MOOD_RESTRICTED);
    }

    // 3. Check Count Limit
    const count = await this.groupsRepository.countGroupMoods(groupId);
    if (count >= config.MAX_CUSTOM_MOODS) {
      throw new ConflictException(
        ERROR_MESSAGES.PREMIUM.MAX_CUSTOM_MOODS_REACHED(config.MAX_CUSTOM_MOODS),
      );
    }

    return this.groupsRepository.createGroupMood(groupId, data);
  }

  async muteGroup(userId: string, groupId: string, isMuted: boolean) {
    // Upsert notification setting
    // We need to access prisma directly or add a repo method.
    // Since we don't have a NotificationRepository, let's use GroupsRepository or quick prisma access if possible.
    // Better: Add to GroupsRepository.
    return this.groupsRepository.setGroupMuteStatus(userId, groupId, isMuted);
  }
}
