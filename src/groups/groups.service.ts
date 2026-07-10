import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomMood, GroupRecord, nowIso } from '../firebase/firestore.types';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionService } from '../session/session.service';
import { UsersService } from '../users/users.service';
import { ERROR_MESSAGES, PREMIUM_LIMITS } from '../common/constants/premium.constants';
import { GroupsRepository } from './groups.repository';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createGroup(userId: string, name: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    this.assertMembershipLimit(user.groupIds.length, user.isPremium);

    return this.groupsRepository.create({ name, owner: user });
  }

  async joinGroup(userId: string, inviteCode: string) {
    const group = await this.groupsRepository.findByInviteCode(inviteCode);
    if (!group) throw new NotFoundException('Grup bulunamadı');

    const user = await this.usersService.findByIdOrThrow(userId);

    if (group.members[userId]) {
      throw new ConflictException('Zaten bu grubun üyesisiniz');
    }

    this.assertMembershipLimit(user.groupIds.length, user.isPremium);
    this.assertGroupCapacity(group);

    return this.groupsRepository.addMember(group.id, user);
  }

  async leaveGroup(userId: string, groupId: string) {
    const group = await this.groupsRepository.findById(groupId);
    if (!group || !group.members[userId]) {
      throw new NotFoundException('Grup üyeliği bulunamadı');
    }

    // Kural: admin gruptan ayrılamaz — önce tüm üyeleri çıkarmalıdır.
    // Grupta yalnız kaldıysa ayrılmak grubu tamamen siler.
    if (group.ownerId === userId) {
      const otherMemberCount = Object.keys(group.members).filter(
        (id) => id !== userId,
      ).length;

      if (otherMemberCount > 0) {
        throw new ConflictException(
          'Grup yöneticisi gruptan ayrılamaz. Önce tüm üyeleri çıkarmalısınız.',
        );
      }

      await this.sessionService.deleteGroup(groupId);
      await this.groupsRepository.detachGroupFromUsers(groupId, [userId]);
      return { groupId, userId, groupDeleted: true };
    }

    // Aktif session başka bir gruptaysa ona dokunma
    if (this.sessionService.getActiveGroupId(userId) === groupId) {
      this.sessionService.forceCloseUserSession(userId, 'removed');
    }
    return this.groupsRepository.removeMember(groupId, userId);
  }

  /** Admin: bir üyeyi gruptan çıkarır (kendini çıkaramaz — leave kullanılır). */
  async removeMember(adminId: string, groupId: string, targetUserId: string) {
    const group = await this.assertAdmin(groupId, adminId);

    if (targetUserId === adminId) {
      throw new ConflictException(
        'Kendinizi çıkaramazsınız — gruptan ayrılmayı kullanın',
      );
    }
    if (!group.members[targetUserId]) {
      throw new NotFoundException('Üye bulunamadı');
    }

    // Çıkarılan üyenin bu gruptaki aktif session'ı kapatılır (canlı bildirim)
    if (this.sessionService.getActiveGroupId(targetUserId) === groupId) {
      this.sessionService.forceCloseUserSession(targetUserId, 'removed');
    }

    return this.groupsRepository.removeMember(groupId, targetUserId);
  }

  // ---------------------------------------------------------------
  // Join Requests
  // ---------------------------------------------------------------

  async requestToJoin(userId: string, groupId: string) {
    const group = await this.groupsRepository.findById(groupId);
    if (!group) throw new NotFoundException('Grup bulunamadı');

    if (group.members[userId]) {
      throw new ConflictException('Zaten bu grubun üyesisiniz');
    }

    const pendingRequest = await this.groupsRepository.findPendingRequest(groupId, userId);
    if (pendingRequest) throw new ConflictException('Zaten bekleyen bir isteğiniz var');

    const user = await this.usersService.findByIdOrThrow(userId);
    const joinRequest = await this.groupsRepository.createJoinRequest(groupId, user);

    const userName = user.displayName || 'Bir kullanıcı';
    await this.notificationsService.sendNotificationToUser(
      group.ownerId,
      'Katılım İsteği',
      `${userName} grubunuza katılmak istiyor: ${group.name}`,
      { type: 'join_request', groupId, requestId: joinRequest.id },
    );

    return joinRequest;
  }

  async getGroupRequests(userId: string, groupId: string) {
    await this.assertAdmin(groupId, userId);
    return this.groupsRepository.getGroupRequests(groupId, 'PENDING');
  }

  async respondToRequest(
    userId: string,
    groupId: string,
    requestId: string,
    response: 'APPROVED' | 'REJECTED',
  ) {
    const group = await this.assertAdmin(groupId, userId);

    const request = await this.groupsRepository.findJoinRequestById(groupId, requestId);
    if (!request) throw new NotFoundException('İstek bulunamadı');
    if (request.status !== 'PENDING') throw new ConflictException('Bu istek zaten yanıtlanmış');

    if (response === 'APPROVED') {
      this.assertGroupCapacity(group);

      const requester = await this.usersService.findById(request.userId);
      if (!requester) throw new NotFoundException('İstek sahibi kullanıcı bulunamadı');

      await this.groupsRepository.addMember(groupId, requester);

      await this.notificationsService.sendNotificationToUser(
        request.userId,
        'İstek Onaylandı',
        `${group.name} grubuna katılım isteğiniz onaylandı! 🎉`,
        { type: 'request_approved', groupId },
      );
    }

    await this.groupsRepository.updateJoinRequestStatus(groupId, requestId, response);
    return { ...request, status: response, respondedAt: nowIso() };
  }

  // ---------------------------------------------------------------
  // Grup güncelleme / mood / mute
  // ---------------------------------------------------------------

  async updateGroup(
    userId: string,
    groupId: string,
    data: { name?: string; description?: string },
  ) {
    await this.assertAdmin(groupId, userId);

    return this.sessionService.mutateGroup(groupId, (group) => {
      if (data.name !== undefined) group.name = data.name;
      if (data.description !== undefined) group.description = data.description;
      return {
        event: 'group.updated',
        patch: { name: group.name, description: group.description },
      };
    });
  }

  async addCustomMood(
    userId: string,
    groupId: string,
    data: { text: string; emoji?: string; mood: string },
  ) {
    const group = await this.assertAdmin(groupId, userId);

    const config = group.ownerIsPremium ? PREMIUM_LIMITS.PREMIUM : PREMIUM_LIMITS.FREE;

    if (!config.CAN_ADD_CUSTOM_MOOD) {
      throw new ConflictException(ERROR_MESSAGES.PREMIUM.CUSTOM_MOOD_RESTRICTED);
    }
    if (group.customMoods.length >= config.MAX_CUSTOM_MOODS) {
      throw new ConflictException(
        ERROR_MESSAGES.PREMIUM.MAX_CUSTOM_MOODS_REACHED(config.MAX_CUSTOM_MOODS),
      );
    }

    const mood: CustomMood = {
      id: `mood_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: data.text,
      emoji: data.emoji,
      mood: data.mood,
      createdAt: nowIso(),
    };

    await this.sessionService.mutateGroup(groupId, (g) => {
      g.customMoods.push(mood);
      return {
        event: 'mood.added',
        patch: { customMoods: g.customMoods },
      };
    });

    return mood;
  }

  async removeCustomMood(userId: string, groupId: string, moodId: string) {
    const group = await this.assertAdmin(groupId, userId);

    if (!group.customMoods.some((m) => m.id === moodId)) {
      throw new NotFoundException('Mood bulunamadı');
    }

    await this.sessionService.mutateGroup(groupId, (g) => {
      const index = g.customMoods.findIndex((m) => m.id === moodId);
      // mutator transaction retry'ında tekrar çalışabilir — mood bu arada silinmiş olabilir
      if (index === -1) throw new NotFoundException('Mood bulunamadı');
      g.customMoods.splice(index, 1);
      return {
        event: 'mood.removed',
        // Diziler client'ta olduğu gibi değiştirilir — tam liste gönderilir
        patch: { customMoods: g.customMoods },
      };
    });

    return { id: moodId, deleted: true };
  }

  async muteGroup(userId: string, groupId: string, isMuted: boolean) {
    const group = await this.groupsRepository.findById(groupId);
    if (!group || !group.members[userId]) {
      throw new NotFoundException('Grup üyeliği bulunamadı');
    }

    await this.sessionService.mutateGroup(groupId, (g) => {
      const member = g.members[userId];
      if (!member) return;
      member.isMuted = isMuted;
      return {
        event: 'group.updated',
        patch: { members: { [userId]: { isMuted } } },
      };
    });

    return { groupId, userId, isMuted };
  }

  // ---------------------------------------------------------------
  // Kural kontrolleri
  // ---------------------------------------------------------------

  private assertMembershipLimit(currentCount: number, isPremium: boolean) {
    const limit = isPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
      : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;

    if (currentCount >= limit) {
      throw new ConflictException(ERROR_MESSAGES.PREMIUM.MAX_GROUPS_REACHED(currentCount, limit));
    }
  }

  private assertGroupCapacity(group: GroupRecord) {
    const limit = group.ownerIsPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_GROUP_MEMBERS
      : PREMIUM_LIMITS.FREE.MAX_GROUP_MEMBERS;

    if (Object.keys(group.members).length >= limit) {
      throw new ConflictException(ERROR_MESSAGES.PREMIUM.MAX_MEMBERS_REACHED(limit));
    }
  }

  private async assertAdmin(groupId: string, userId: string): Promise<GroupRecord> {
    const group = await this.groupsRepository.findById(groupId);
    if (!group) throw new NotFoundException('Grup bulunamadı');
    if (group.members[userId]?.role !== 'ADMIN') {
      throw new ConflictException(ERROR_MESSAGES.GROUP.NOT_ADMIN);
    }
    return group;
  }
}
