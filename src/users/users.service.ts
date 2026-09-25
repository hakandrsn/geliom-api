import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as admin from 'firebase-admin';
import { UserRecord } from '../firebase/firestore.types';
import { SessionService } from '../session/session.service';
import { UsersRepository } from './users.repository';
import { generateUniqueCustomId } from './helpers/custom-id.generator';
import { resolveNotificationPrefs } from '../common/notification-prefs';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionService: SessionService,
    private readonly logger: PinoLogger,
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: admin.app.App,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.usersRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<UserRecord> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }
    return user;
  }

  async findByCustomId(customId: string): Promise<UserRecord | null> {
    return this.usersRepository.findByCustomId(customId);
  }

  async create(data: {
    id: string;
    email: string;
    displayName?: string;
    photoUrl?: string;
  }): Promise<UserRecord> {
    // customId benzersizliği transaction'daki tx.create ile garanti;
    // çakışmada yeni ID üretilip tekrar denenir.
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const customId = await generateUniqueCustomId((id) =>
        this.usersRepository.customIdExists(id),
      );
      try {
        this.logger.info({ userId: data.id, customId }, 'Creating new user');
        return await this.usersRepository.create({ ...data, customId });
      } catch (error) {
        if (error.code !== 6 /* ALREADY_EXISTS */) throw error;

        // İlk girişte mobil birden fazla isteği paralel atabilir (GET /users/me +
        // PATCH /users/me gibi); ikinci istek kullanıcıyı oluşturulmuş bulur.
        const existing = await this.usersRepository.findById(data.id);
        if (existing) return existing;

        // Kullanıcı yoksa çakışan customId'dir — yeni ID ile tekrar dene
        if (attempt < maxAttempts - 1) continue;
        throw error;
      }
    }
    throw new Error('Failed to create user with unique custom ID');
  }

  async update(
    id: string,
    data: { displayName?: string; photoUrl?: string | null; pushEnabled?: boolean },
  ): Promise<UserRecord> {
    const user = await this.usersRepository.update(id, data);
    // Yalnızca bildirim tercihi değiştiyse gruplara yayın gereksiz
    if (data.displayName === undefined && data.photoUrl === undefined) return user;

    // Gruplardaki denormalize üye bilgisini tazele
    for (const groupId of user.groupIds) {
      try {
        await this.sessionService.mutateGroup(groupId, (group) => {
          const member = group.members[id];
          if (!member) return;
          member.displayName = user.displayName;
          member.photoUrl = user.photoUrl;
          return {
            event: 'group.updated',
            patch: {
              members: {
                [id]: { displayName: user.displayName, photoUrl: user.photoUrl },
              },
            },
          };
        });
      } catch (error) {
        this.logger.warn({ groupId, err: error }, 'Failed to fan out profile update to group');
      }
    }

    return user;
  }

  async getUserGroups(userId: string) {
    const user = await this.findByIdOrThrow(userId);

    const groups = await Promise.all(
      user.groupIds.map((groupId) => this.sessionService.getGroup(groupId)),
    );

    return groups
      .filter((group): group is NonNullable<typeof group> => group !== null)
      .map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        inviteCode: group.inviteCode,
        ownerId: group.ownerId,
        role: group.members[userId]?.role ?? 'MEMBER',
        notifications: group.members[userId]
          ? resolveNotificationPrefs(group.members[userId])
          : null,
        isPaused: group.isPaused,
        ownerIsPremium: group.ownerIsPremium,
        memberCount: Object.keys(group.members).length,
        joinedAt: group.members[userId]?.joinedAt ?? null,
      }));
  }

  /**
   * Hesap silme: kullanıcının üyesi olduğu gruplardan çıkar, sahibi olduğu
   * grupları tamamen siler, ardından kullanıcı dokümanını temizler.
   */
  async delete(id: string): Promise<void> {
    const user = await this.findByIdOrThrow(id);

    for (const groupId of [...user.groupIds]) {
      const group = await this.sessionService.getGroup(groupId);
      if (!group) continue;

      if (group.ownerId === id) {
        await this.sessionService.deleteGroup(groupId);
        // Diğer üyelerin groupIds listesinden düş
        await Promise.all(
          Object.keys(group.members)
            .filter((memberId) => memberId !== id)
            .map((memberId) => this.usersRepository.removeGroupFromUser(memberId, groupId)),
        );
      } else {
        this.sessionService.forceCloseUserSession(id, 'removed');
        await this.sessionService.mutateGroup(groupId, (g) => {
          delete g.members[id];
          delete g.statuses[id];
          return {
            event: 'member.left',
            removed: [`members.${id}`, `statuses.${id}`],
          };
        });
      }
    }

    await this.usersRepository.delete(user);

    // Firebase Auth kaydını da sil — silinmezse kullanıcı aynı UID ile tekrar
    // giriş yapıp lazy-create ile yeni hesap oluşturabilir (gerçek silme olmaz)
    try {
      await this.firebaseApp.auth().deleteUser(id);
    } catch (error) {
      this.logger.warn({ userId: id, err: error }, 'Firebase Auth user could not be deleted');
    }

    this.logger.info({ userId: id }, 'User account deleted');
  }
}
