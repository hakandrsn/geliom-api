import { Inject, Injectable } from '@nestjs/common';
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
  UserRecord,
} from '../firebase/firestore.types';
import { SessionService } from '../session/session.service';
import { generateInviteCode } from './helpers/invite-code.generator';

@Injectable()
export class GroupsRepository {
  constructor(
    @Inject('FIRESTORE') private readonly db: Firestore,
    private readonly sessionService: SessionService,
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
        customMoods: [],
        createdAt: now,
        updatedAt: now,
      };

      try {
        await this.db.runTransaction(async (tx) => {
          tx.create(this.db.collection(COLLECTIONS.INVITE_CODES).doc(inviteCode), {
            groupId: groupRef.id,
          });
          tx.create(groupRef, doc);
          tx.update(this.db.collection(COLLECTIONS.USERS).doc(data.owner.id), {
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

  /** Üyeyi grup dokümanına ve kullanıcının groupIds listesine ekler. */
  async addMember(groupId: string, user: UserRecord, role: GroupRole = 'MEMBER') {
    const entry: GroupMemberEntry = {
      role,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      customId: user.customId,
      isMuted: false,
      joinedAt: nowIso(),
    };

    await this.sessionService.mutateGroup(groupId, (group) => {
      group.members[user.id] = entry;
      return {
        event: 'member.joined',
        patch: { members: { [user.id]: entry } },
      };
    });

    await this.db.collection(COLLECTIONS.USERS).doc(user.id).update({
      groupIds: FieldValue.arrayUnion(groupId),
      updatedAt: nowIso(),
    });

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

    await this.db.collection(COLLECTIONS.USERS).doc(userId).update({
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
