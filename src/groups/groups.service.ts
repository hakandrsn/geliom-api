import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupMoodOption, GroupOption, GroupRecord, nowIso } from '../firebase/firestore.types';
import {
  DEFAULT_MOOD_OPTIONS,
  DEFAULT_STATUS_OPTIONS,
  MAX_OPTIONS,
  newOptionId,
} from '../common/group-options';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionService } from '../session/session.service';
import { UsersService } from '../users/users.service';
import { ERROR_MESSAGES, PREMIUM_LIMITS } from '../common/constants/premium.constants';
import { PremiumLimitException } from '../common/exceptions/premium-limit.exception';
import { GroupsRepository } from './groups.repository';
import { GroupPlanService } from './group-plan.service';
import { UpdateNotificationsDto, UpdateOptionsDto } from './dto';
import { GroupNotificationPrefs, resolveNotificationPrefs } from '../common/notification-prefs';
import { isCatalogEmoji } from '../emoji/emoji';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly notificationsService: NotificationsService,
    private readonly groupPlanService: GroupPlanService,
  ) {}

  async createGroup(userId: string, name: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    this.assertMembershipLimit(user.groupIds.length, user.isPremium);

    return this.groupsRepository.create({ name, owner: user });
  }

  async joinGroup(userId: string, inviteCode: string) {
    const found = await this.groupsRepository.findByInviteCode(inviteCode);
    if (!found) throw new NotFoundException('Grup bulunamadı');
    const group = await this.withOwnerPlan(found);

    const user = await this.usersService.findByIdOrThrow(userId);

    if (group.members[userId]) {
      throw new ConflictException('Zaten bu grubun üyesisiniz');
    }

    this.assertNotPaused(group);
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
      const otherMemberCount = Object.keys(group.members).filter((id) => id !== userId).length;

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
      throw new ConflictException('Kendinizi çıkaramazsınız — gruptan ayrılmayı kullanın');
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
    const found = await this.groupsRepository.findById(groupId);
    if (!found) throw new NotFoundException('Grup bulunamadı');
    const group = await this.withOwnerPlan(found);

    if (group.members[userId]) {
      throw new ConflictException('Zaten bu grubun üyesisiniz');
    }

    this.assertNotPaused(group);

    const pendingRequest = await this.groupsRepository.findPendingRequest(groupId, userId);
    if (pendingRequest) throw new ConflictException('Zaten bekleyen bir isteğiniz var');

    const user = await this.usersService.findByIdOrThrow(userId);
    // Onaylansa bile katılamayacak kullanıcı istek göndermesin
    this.assertMembershipLimit(user.groupIds.length, user.isPremium);
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
    const group = await this.withOwnerPlan(await this.assertAdmin(groupId, userId));

    const request = await this.groupsRepository.findJoinRequestById(groupId, requestId);
    if (!request) throw new NotFoundException('İstek bulunamadı');
    if (request.status !== 'PENDING') throw new ConflictException('Bu istek zaten yanıtlanmış');

    if (response === 'APPROVED') {
      this.assertNotPaused(group);
      this.assertGroupCapacity(group);

      const requester = await this.usersService.findById(request.userId);
      if (!requester) throw new NotFoundException('İstek sahibi kullanıcı bulunamadı');

      try {
        await this.groupsRepository.addMember(groupId, requester);
      } catch (error) {
        // Onaylanan kişinin kendi limiti dolu: admin'e onun durumunu anlatan kod
        if (error instanceof PremiumLimitException && error.code === 'MEMBERSHIP_LIMIT') {
          const limit = requester.isPremium
            ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
            : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;
          throw new PremiumLimitException(
            'REQUESTER_MEMBERSHIP_LIMIT',
            ERROR_MESSAGES.PREMIUM.REQUESTER_MAX_GROUPS(limit),
            { limit },
          );
        }
        throw error;
      }

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

  /**
   * Grubun durum / ruh hali listelerini sahibin gönderdiği sırayla yazar.
   * Yalnızca grup sahibi ve Premium. Her liste toplam MAX_OPTIONS seçenek
   * tutar; varsayılanlar dahil her seçenek düzenlenebilir, listede olmayan
   * silinmiş sayılır.
   */
  async updateOptions(userId: string, groupId: string, dto: UpdateOptionsDto) {
    const group = await this.withOwnerPlan(await this.assertAdmin(groupId, userId));
    if (!group.ownerIsPremium) {
      throw new PremiumLimitException(
        'OPTIONS_PREMIUM',
        ERROR_MESSAGES.PREMIUM.OPTIONS_RESTRICTED,
        { isPremium: false },
      );
    }

    const updated = await this.sessionService.mutateGroup(groupId, (g) => {
      if (!g.ownerIsPremium) {
        throw new PremiumLimitException(
          'OPTIONS_PREMIUM',
          ERROR_MESSAGES.PREMIUM.OPTIONS_RESTRICTED,
        );
      }
      const patch: { statusOptions?: GroupOption[]; moodOptions?: GroupMoodOption[] } = {};
      if (dto.statusOptions) {
        g.statusOptions = resolveOptions(
          dto.statusOptions,
          g.statusOptions,
          DEFAULT_STATUS_OPTIONS,
          'status',
        );
        patch.statusOptions = g.statusOptions;
      }
      if (dto.moodOptions) {
        g.moodOptions = resolveOptions(
          dto.moodOptions,
          g.moodOptions,
          DEFAULT_MOOD_OPTIONS,
          'mood',
        ) as GroupMoodOption[];
        patch.moodOptions = g.moodOptions;
      }
      // Diziler client'ta olduğu gibi değiştirilir — tam liste gönderilir
      return { event: 'options.updated', patch };
    });

    return { statusOptions: updated.statusOptions, moodOptions: updated.moodOptions };
  }

  /**
   * Üyenin bu grup için bildirim tercihlerini günceller. Yalnızca gönderilen
   * alanlar değişir. Değişiklik session'a members.{uid} patch'i olarak yansır.
   */
  async updateNotificationPrefs(
    userId: string,
    groupId: string,
    dto: UpdateNotificationsDto,
  ): Promise<{ groupId: string; notifications: GroupNotificationPrefs }> {
    const group = await this.groupsRepository.findById(groupId);
    if (!group || !group.members[userId]) {
      throw new NotFoundException('Grup üyeliği bulunamadı');
    }

    let resolved: GroupNotificationPrefs | null = null;
    await this.sessionService.mutateGroup(groupId, (g) => {
      const member = g.members[userId];
      if (!member) return;

      if (dto.enabled !== undefined) member.isMuted = !dto.enabled;

      const current = resolveNotificationPrefs(member);
      member.notificationPrefs = {
        statusUpdates: dto.statusUpdates ?? current.statusUpdates,
        moodUpdates: dto.moodUpdates ?? current.moodUpdates,
        // Sessize alınanlar yalnızca hâlâ üye olanlarla sınırlı tutulur
        mutedUserIds: (dto.mutedUserIds ?? current.mutedUserIds).filter(
          (id) => id !== userId && !!g.members[id],
        ),
      };

      resolved = resolveNotificationPrefs(member);
      return {
        event: 'group.updated',
        patch: {
          members: {
            [userId]: { isMuted: member.isMuted, notificationPrefs: member.notificationPrefs },
          },
        },
      };
    });

    return { groupId, notifications: resolved! };
  }

  /** Geriye dönük: eski mute ucu — enabled = !isMuted. */
  async muteGroup(userId: string, groupId: string, isMuted: boolean) {
    const result = await this.updateNotificationPrefs(userId, groupId, { enabled: !isMuted });
    return { groupId, userId, isMuted: !result.notifications.enabled };
  }

  // ---------------------------------------------------------------
  // Kural kontrolleri
  // ---------------------------------------------------------------

  private assertMembershipLimit(currentCount: number, isPremium: boolean) {
    const limit = isPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
      : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;

    if (currentCount >= limit) {
      throw new PremiumLimitException(
        'MEMBERSHIP_LIMIT',
        ERROR_MESSAGES.PREMIUM.MAX_GROUPS_REACHED(currentCount, limit),
        { limit, isPremium },
      );
    }
  }

  private assertNotPaused(group: GroupRecord) {
    if (group.isPaused) {
      throw new PremiumLimitException('GROUP_PAUSED', ERROR_MESSAGES.PREMIUM.GROUP_PAUSED);
    }
  }

  private assertGroupCapacity(group: GroupRecord) {
    const limit = group.ownerIsPremium
      ? PREMIUM_LIMITS.PREMIUM.MAX_GROUP_MEMBERS
      : PREMIUM_LIMITS.FREE.MAX_GROUP_MEMBERS;

    if (Object.keys(group.members).length >= limit) {
      throw new PremiumLimitException(
        'GROUP_CAPACITY',
        ERROR_MESSAGES.PREMIUM.MAX_MEMBERS_REACHED(limit),
        { limit, isPremium: group.ownerIsPremium },
      );
    }
  }

  /**
   * Gruptaki ownerIsPremium yalnızca sahibin users.isPremium'unun kopyasıdır.
   * Kopya kaymışsa (webhook kaçtı, kayıt elle düzeltildi) kural uygulanmadan
   * önce sahibin gerçek durumuna hizalanır — "drawer'da premium, grupta değil"
   * durumu oluşamaz.
   */
  private async withOwnerPlan(group: GroupRecord): Promise<GroupRecord> {
    const owner = await this.usersService.findById(group.ownerId);
    if (!owner) return group;
    const drifted =
      owner.isPremium !== group.ownerIsPremium || (owner.isPremium && group.isPaused);
    if (!drifted) return group;

    await this.groupPlanService.applyOwnerPremium(owner.id, owner.isPremium);
    return (await this.groupsRepository.findById(group.id)) ?? group;
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

/**
 * Gönderilen listeyi mevcut + varsayılan seçeneklere göre çözümler.
 * Var olan seçenek (varsayılan dahil) id'si ve mood key'i korunarak
 * düzenlenir — üyelerin mevcut durum kayıtları kopmaz. Düzenlenen varsayılan
 * artık "varsayılan" sayılmaz. Bilinmeyen id yeni seçenektir.
 */
export function resolveOptions(
  input: { id?: string; text: string; emoji?: string; notifies?: boolean }[],
  current: GroupOption[],
  defaults: GroupOption[],
  kind: 'status' | 'mood',
): GroupOption[] {
  const known = new Map<string, GroupOption>();
  for (const o of [...defaults, ...current]) known.set(o.id, o);

  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const result: GroupOption[] = [];

  for (const item of input) {
    const text = item.text.trim();
    const existing = item.id ? known.get(item.id) : undefined;

    // Yeni seçilen emoji ortak katalogdan olmalı; eski kayıtlardaki
    // katalog dışı emojiler değişmedikçe korunur.
    if (item.emoji && item.emoji !== existing?.emoji && !isCatalogEmoji(item.emoji)) {
      throw new BadRequestException(`"${text}" için seçilen emoji desteklenmiyor`);
    }

    const emoji = item.emoji || undefined;
    let option: GroupOption;
    if (existing) {
      const changed = existing.text !== text || (existing.emoji || undefined) !== emoji;
      option = {
        ...existing,
        text,
        emoji,
        isDefault: existing.isDefault && !changed,
      };
    } else {
      const id = newOptionId(kind);
      option = { id, text, emoji, isDefault: false };
      if (kind === 'mood') {
        (option as GroupMoodOption).key = `${slugify(text)}_${id.slice(-4)}`;
      }
    }
    if (kind === 'status') {
      option.notifies = item.notifies ?? existing?.notifies ?? true;
    } else {
      delete option.notifies;
    }

    const textKey = option.text.toLocaleLowerCase('tr-TR');
    if (seenIds.has(option.id) || seenTexts.has(textKey)) {
      throw new BadRequestException(`"${option.text}" listede birden fazla kez var`);
    }
    seenIds.add(option.id);
    seenTexts.add(textKey);
    result.push(option);
  }

  if (result.length > MAX_OPTIONS) {
    throw new PremiumLimitException(
      'OPTIONS_LIMIT',
      ERROR_MESSAGES.PREMIUM.MAX_OPTIONS(MAX_OPTIONS),
      { limit: MAX_OPTIONS },
    );
  }
  return result;
}

function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return (
    text
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'mood'
  );
}
