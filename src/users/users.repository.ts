import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  CustomIdDoc,
  nowIso,
  UserDoc,
  UserRecord,
} from '../firebase/firestore.types';

@Injectable()
export class UsersRepository {
  constructor(@Inject('FIRESTORE') private readonly db: Firestore) {}

  private userRef(id: string) {
    return this.db.collection(COLLECTIONS.USERS).doc(id);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const snap = await this.userRef(id).get();
    if (!snap.exists) return null;
    return { id, ...(snap.data() as UserDoc) };
  }

  async findByCustomId(customId: string): Promise<UserRecord | null> {
    const lookup = await this.db.collection(COLLECTIONS.CUSTOM_IDS).doc(customId).get();
    if (!lookup.exists) return null;
    return this.findById((lookup.data() as CustomIdDoc).userId);
  }

  async customIdExists(customId: string): Promise<boolean> {
    const snap = await this.db.collection(COLLECTIONS.CUSTOM_IDS).doc(customId).get();
    return snap.exists;
  }

  /**
   * Kullanıcıyı ve customIds lookup'ını tek transaction'da oluşturur.
   * customId çakışırsa ALREADY_EXISTS fırlar — çağıran retry eder.
   */
  async create(data: {
    id: string;
    email: string;
    customId: string;
    displayName?: string;
    photoUrl?: string;
  }): Promise<UserRecord> {
    const now = nowIso();
    const doc: UserDoc = {
      email: data.email,
      customId: data.customId,
      displayName: data.displayName ?? null,
      photoUrl: data.photoUrl ?? null,
      isPremium: false,
      subscriptionStatus: null,
      groupIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.runTransaction(async (tx) => {
      tx.create(this.db.collection(COLLECTIONS.CUSTOM_IDS).doc(data.customId), {
        userId: data.id,
      });
      tx.create(this.userRef(data.id), doc);
    });

    return { id: data.id, ...doc };
  }

  async update(
    id: string,
    data: Partial<Pick<UserDoc, 'displayName' | 'photoUrl' | 'isPremium' | 'subscriptionStatus'>>,
  ): Promise<UserRecord> {
    await this.userRef(id).update({ ...data, updatedAt: nowIso() });
    const user = await this.findById(id);
    if (!user) throw new ConflictException('Kullanıcı güncellenemedi');
    return user;
  }

  /** Kullanıcı dokümanını ve customIds lookup'ını siler. */
  async delete(user: UserRecord): Promise<void> {
    const batch = this.db.batch();
    batch.delete(this.db.collection(COLLECTIONS.CUSTOM_IDS).doc(user.customId));
    batch.delete(this.userRef(user.id));
    await batch.commit();
  }

  async addGroupToUser(userId: string, groupId: string): Promise<void> {
    await this.userRef(userId).update({
      groupIds: FieldValue.arrayUnion(groupId),
      updatedAt: nowIso(),
    });
  }

  async removeGroupFromUser(userId: string, groupId: string): Promise<void> {
    await this.userRef(userId).update({
      groupIds: FieldValue.arrayRemove(groupId),
      updatedAt: nowIso(),
    });
  }
}
