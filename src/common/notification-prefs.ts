import { GroupMemberEntry } from '../firebase/firestore.types';

/** Üyenin bir grup için çözümlenmiş bildirim tercihleri (varsayılanlar uygulanmış). */
export interface GroupNotificationPrefs {
  /** Bu gruptan hiç bildirim alma / al (isMuted'ın tersi) */
  enabled: boolean;
  /** Durum metni değişince bildir */
  statusUpdates: boolean;
  /** Ruh hali değişince bildir */
  moodUpdates: boolean;
  /** Bu kullanıcıların değişikliklerinden bildirim gelmesin */
  mutedUserIds: string[];
}

export function resolveNotificationPrefs(member: GroupMemberEntry): GroupNotificationPrefs {
  const prefs = member.notificationPrefs;
  return {
    enabled: !member.isMuted,
    statusUpdates: prefs?.statusUpdates ?? true,
    moodUpdates: prefs?.moodUpdates ?? true,
    mutedUserIds: prefs?.mutedUserIds ?? [],
  };
}

export interface StatusChangeFlags {
  status: boolean;
  mood: boolean;
}

/**
 * Bu üyeye, bu gönderenin bu değişikliği için push gitmeli mi?
 * Session'da olma kontrolü çağıranda — burada yalnızca tercihler.
 */
export function shouldNotifyMember(
  member: GroupMemberEntry,
  senderId: string,
  flags: StatusChangeFlags,
): boolean {
  const prefs = resolveNotificationPrefs(member);
  if (!prefs.enabled) return false;
  if (prefs.mutedUserIds.includes(senderId)) return false;
  if (flags.status && prefs.statusUpdates) return true;
  if (flags.mood && prefs.moodUpdates) return true;
  return false;
}
