import { PREMIUM_LIMITS } from './constants/premium.constants';

export interface OwnedGroupInfo {
  id: string;
  createdAt: string;
  memberCount: number;
}

/**
 * Premium'u biten sahibin gruplarından hangileri duraklatılır?
 * Ücretsiz hak: tek grup, en fazla 5 üye. En eski ve kapasiteye uyan grup
 * aktif kalır; diğer tümü duraklatılır. Hiçbiri uymuyorsa hepsi duraklar.
 */
export function selectGroupsToPause(owned: OwnedGroupInfo[]): {
  keepActiveId: string | null;
  pauseIds: string[];
} {
  const sorted = [...owned].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const keep = sorted.find((g) => g.memberCount <= PREMIUM_LIMITS.FREE.MAX_GROUP_MEMBERS) ?? null;
  return {
    keepActiveId: keep?.id ?? null,
    pauseIds: sorted.filter((g) => g.id !== keep?.id).map((g) => g.id),
  };
}
