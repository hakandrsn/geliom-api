/**
 * Firestore doküman tipleri
 *
 * Tarihler ISO 8601 string olarak tutulur — socket üzerinden JSON olarak
 * taşınırken ekstra dönüşüm gerektirmez.
 */

export const COLLECTIONS = {
  USERS: 'users',
  GROUPS: 'groups',
  INVITE_CODES: 'inviteCodes',
  CUSTOM_IDS: 'customIds',
  JOIN_REQUESTS: 'joinRequests', // groups/{id} alt koleksiyonu
} as const;

export type GroupRole = 'ADMIN' | 'MEMBER';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// users/{uid} — doc ID = Firebase UID
export interface UserDoc {
  email: string;
  customId: string;
  displayName: string | null;
  photoUrl: string | null;
  isPremium: boolean;
  subscriptionStatus: string | null;
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord extends UserDoc {
  id: string;
}

export interface GroupMemberEntry {
  role: GroupRole;
  displayName: string | null;
  photoUrl: string | null;
  customId: string;
  isMuted: boolean;
  joinedAt: string;
}

export interface StatusEntry {
  text: string;
  emoji?: string;
  mood?: string;
  updatedAt: string;
}

export interface CustomMood {
  id: string;
  text: string;
  emoji?: string;
  mood: string;
  createdAt: string;
}

// groups/{groupId} — grup başına tek doküman; session objesinin kendisi
export interface GroupDoc {
  name: string;
  description: string | null;
  inviteCode: string;
  ownerId: string;
  ownerIsPremium: boolean;
  version: number;
  members: Record<string, GroupMemberEntry>;
  statuses: Record<string, StatusEntry>;
  customMoods: CustomMood[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupRecord extends GroupDoc {
  id: string;
}

// groups/{groupId}/joinRequests/{requestId}
export interface JoinRequestDoc {
  userId: string;
  displayName: string | null;
  status: JoinRequestStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface JoinRequestRecord extends JoinRequestDoc {
  id: string;
}

// inviteCodes/{CODE}
export interface InviteCodeDoc {
  groupId: string;
}

// customIds/{CUSTOMID}
export interface CustomIdDoc {
  userId: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}
