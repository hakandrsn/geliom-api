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
  SUPPORT_MESSAGES: 'supportMessages',
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
  /** Uygulama içi genel bildirim tercihi (varsayılan açık). Sistem izni ayrı. */
  pushEnabled?: boolean;
  /** Premium'un bittiği an (yenilenince silinir) */
  premiumLapsedAt?: string | null;
  /** "Aboneliğin yenilenmedi" hatırlatmasının gönderileceği an */
  lapseReminderDueAt?: string | null;
  lapseReminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord extends UserDoc {
  id: string;
}

/** Üyenin bu grup için ince bildirim tercihleri; yoksa hepsi açık sayılır. */
export interface MemberNotificationPrefs {
  statusUpdates: boolean;
  moodUpdates: boolean;
  mutedUserIds: string[];
}

export interface GroupMemberEntry {
  role: GroupRole;
  displayName: string | null;
  photoUrl: string | null;
  customId: string;
  /** Grup bildirimleri tamamen kapalı (enabled = !isMuted) */
  isMuted: boolean;
  notificationPrefs?: MemberNotificationPrefs;
  joinedAt: string;
}

export interface StatusEntry {
  /** Durum metni ("İşte"). Ruh hali tek başına paylaşılabildiği için opsiyonel. */
  text?: string;
  emoji?: string;
  /** Ruh hali anahtarı ("happy" veya custom mood key'i) */
  mood?: string;
  updatedAt: string;
}

/** Grubun seçilebilir durum seçeneği. Varsayılanlar da listede tutulur (sahip silebilir). */
export interface GroupOption {
  id: string;
  text: string;
  emoji?: string;
  /** Uygulamanın hazır seçeneği mi ve hiç düzenlenmedi mi */
  isDefault: boolean;
  /** Yalnızca durum: bu duruma geçince üyelere push gitsin mi (yoksa true) */
  notifies?: boolean;
}

/** Ruh hali seçeneği — status kaydında `key` saklanır. */
export interface GroupMoodOption extends GroupOption {
  key: string;
}

/** @deprecated Eski model — normalizeGroupDoc ile moodOptions'a taşınır. */
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
  /** Grubun durum seçenekleri, sahibinin belirlediği sırada */
  statusOptions: GroupOption[];
  /** Grubun ruh hali seçenekleri, sahibinin belirlediği sırada */
  moodOptions: GroupMoodOption[];
  /**
   * Sahibinin aboneliği bittiği için grup duraklatıldı: canlı session,
   * bildirim ve üye etkileşimi kapalı; grup yalnızca anlık görüntü olarak okunur.
   */
  isPaused: boolean;
  pausedAt?: string | null;
  /** @deprecated Eski özel mood listesi — okunurken moodOptions'a taşınır */
  customMoods?: CustomMood[];
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
