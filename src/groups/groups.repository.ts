import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  GroupDoc,
  GroupMemberEntry,
  GroupRecord,
  GroupRole,
  InviteCodeDoc,
  JoinRequestDoc,
  JoinRequestRecord,
  JoinRequestStatus,
  nowIso,
  UserDoc,
  UserRecord,
} from '../firebase/firestore.types';
import { SessionService } from '../session/session.service';
import { ERROR_MESSAGES, PREMIUM_LIMITS } from '../common/constants/premium.constants';
import { PremiumLimitException } from '../common/exceptions/premium-limit.exception';
import { UsersRepository } from '../users/users.repository';
import { generateInviteCode } from './helpers/invite-code.generator';
import { defaultMoodOptions, defaultStatusOptions } from '../common/group-options';

@Injectable()
export class GroupsRepository {
  constructor(
    @Inject('FIRESTORE') private readonly db: Firestore,
    private readonly sessionService: SessionService,
    private readonly usersRepository: UsersRepository,
  ) {}

  private groupRef(groupId: string) {
    return this.db.collection(COLLECTIONS.GROUPS).doc(groupId);
  }

  private requestsRef(groupId: string) {
    return this.groupRef(groupId).collection(COLLECTIONS.JOIN_REQUESTS);
  }

  async findById(groupId: string): Promise<GroupRecord | null> {
    return this.sessionService.getGroup(groupId);
  }

  async findByInviteCode(inviteCode: string): Promise<GroupRecord | null> {
    const lookup = await this.db.collection(COLLECTIONS.INVITE_CODES).doc(inviteCode).get();
    if (!lookup.exists) return null;
    return this.sessionService.getGroup((lookup.data() as InviteCodeDoc).groupId);
  }

  /**
   * Grubu, inviteCodes lookup'ını ve owner'ın groupIds güncellemesini tek
   * transaction'da oluşturur. Invite code çakışırsa yeni kod ile tekrar dener.
   */
  async create(data: { name: string; owner: UserRecord }): Promise<GroupRecord> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const inviteCode = generateInviteCode();
      const groupRef = this.db.collection(COLLECTIONS.GROUPS).doc();
      const now = nowIso();

      const doc: GroupDoc = {
        name: data.name,
        description: null,
        inviteCode,
        ownerId: data.owner.id,
        ownerIsPremium: data.owner.isPremium,
        version: 0,
        members: {
          [data.owner.id]: {
            role: 'ADMIN',
            displayName: data.owner.displayName,
            photoUrl: data.owner.photoUrl,
            customId: data.owner.customId,
            isMuted: false,
            joinedAt: now,
          },
        },
        statuses: {},
        statusOptions: defaultStatusOptions(),
        moodOptions: defaultMoodOptions(),
        isPaused: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await this.db.runTransaction(async (tx) => {
          // Üyelik limiti transaction içinde, güncel kullanıcı dokümanıyla
          // kontrol edilir — paralel "oluştur" istekleri limiti aşamaz
          const userRef = this.db.collection(COLLECTIONS.USERS).doc(data.owner.id);
          const userSnap = await tx.get(userRef);
          const owner = userSnap.data() as UserDoc | undefined;
          if (!owner) throw new NotFoundException('Kullanıcı bulunamadı');
          const limit = owner.isPremium
            ? PREMIUM_LIMITS.PREMIUM.MAX_MEMBERSHIPS
            : PREMIUM_LIMITS.FREE.MAX_MEMBERSHIPS;
          if (owner.groupIds.length >= limit) {
            throw new PremiumLimitException(
              'MEMBERSHIP_LIMIT',
              ERROR_MESSAGES.PREMIUM.MAX_GROUPS_REACHED(owner.groupIds.length, limit),
              { limit, isPremium: owner.isPremium },
            );
          }
          // Premium durumu güncel dokümandan (webhook sonrası taze)
          doc.ownerIsPremium = owner.isPremium;

          tx.create(this.db.collection(COLLECTIONS.INVITE_CODES).doc(inviteCode), {
            groupId: groupRef.id,
          });
          tx.create(groupRef, doc);
          tx.update(userRef, {
            groupIds: FieldValue.arrayUnion(groupRef.id),
            updatedAt: now,
          });
        });
        return { id: groupRef.id, ...doc };
      } catch (error) {
        if (error.code === 6 /* ALREADY_EXISTS: invite code çakışması */) continue;
        throw error;
      }
    }

    throw new Error(`Failed to generate unique invite code after ${maxAttempts} attempts`);
  }

  /**
   * Üyeyi grup dokümanına ve kullanıcının groupIds listesine ekler.
   *
   * Kapasite kontrolü mutator İÇİNDE yapılır: dışarıda okunan grup ile
   * yazma anı arasında başka bir katılım olabilir (iki eş zamanlı onay).
   * Kapasite hesabı grubun o anki premium durumuna göre yapılır.
   */
  async addMember(groupId: string, user: UserRecord, role: GroupRole = 'MEMBER') {
    const entry: GroupMemberEntry = {
      role,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      customId: user.customId,
      isMuted: false,
      joinedAt: nowIso(),
    };

    // 1) Kullanıcının üyelik slotunu atomik ayır (üyelik limiti burada)
    await this.usersRepository.reserveMembership(user.id, groupId);

    // 2) Grup kapasitesini mutator içinde uygula; başarısızsa slotu geri ver
    try {
      await this.sessionService.mutateGroup(groupId, (group) => {
        if (group.members[user.id]) {
          throw new ConflictException(ERROR_MESSAGES.GROUP.ALREADY_MEMBER);
        }
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
        group.members[user.id] = entry;
        return {
          event: 'member.joined',
          patch: { members: { [user.id]: entry } },
        };
      });
    } catch (error) {
      await this.usersRepository.removeGroupFromUser(user.id, groupId).catch(() => undefined);
      throw error;
    }

    return { groupId, userId: user.id, ...entry };
  }

  /** Üyeyi (status'üyle birlikte) gruptan ve kullanıcının groupIds listesinden çıkarır. */
  async removeMember(groupId: string, userId: string) {
    await this.sessionService.mutateGroup(groupId, (group) => {
      delete group.members[userId];
      delete group.statuses[userId];
      return {
        event: 'member.left',
        removed: [`members.${userId}`, `statuses.${userId}`],
      };
    });

    await this.db
      .collection(COLLECTIONS.USERS)
      .doc(userId)
      .update({
        groupIds: FieldValue.arrayRemove(groupId),
        updatedAt: nowIso(),
      });

    return { groupId, userId };
  }

  /** Grup silindiğinde tüm üyelerin groupIds listesinden düşürür. */
  async detachGroupFromUsers(groupId: string, userIds: string[]) {
    if (!userIds.length) return;
    const batch = this.db.batch();
    for (const userId of userIds) {
      batch.update(this.db.collection(COLLECTIONS.USERS).doc(userId), {
        groupIds: FieldValue.arrayRemove(groupId),
        updatedAt: nowIso(),
      });
    }
    await batch.commit();
  }

  // ---------------------------------------------------------------
  // Join Requests (groups/{id}/joinRequests alt koleksiyonu)
  // ---------------------------------------------------------------

  async createJoinRequest(groupId: string, user: UserRecord): Promise<JoinRequestRecord> {
    const ref = this.requestsRef(groupId).doc();
    const doc: JoinRequestDoc = {
      userId: user.id,
      displayName: user.displayName,
      status: 'PENDING',
      createdAt: nowIso(),
      respondedAt: null,
    };
    await ref.set(doc);
    return { id: ref.id, ...doc };
  }

  async findPendingRequest(groupId: string, userId: string): Promise<JoinRequestRecord | null> {
    const snap = await this.requestsRef(groupId)
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...(doc.data() as JoinRequestDoc) };
  }

  async findJoinRequestById(groupId: string, requestId: string): Promise<JoinRequestRecord | null> {
    const snap = await this.requestsRef(groupId).doc(requestId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as JoinRequestDoc) };
  }

  async getGroupRequests(
    groupId: string,
    status: JoinRequestStatus = 'PENDING',
  ): Promise<JoinRequestRecord[]> {
    const snap = await this.requestsRef(groupId).where('status', '==', status).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as JoinRequestDoc) }));
  }

  async updateJoinRequestStatus(
    groupId: string,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    await this.requestsRef(groupId).doc(requestId).update({
      status,
      respondedAt: nowIso(),
    });
  }
}
