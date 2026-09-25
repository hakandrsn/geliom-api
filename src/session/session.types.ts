import { GroupDoc, GroupRecord } from '../firebase/firestore.types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type SessionUpdateEvent =
  | 'status.updated'
  | 'status.cleared'
  | 'member.joined'
  | 'member.left'
  | 'group.updated'
  | 'mood.added'
  | 'mood.removed'
  | 'options.updated'
  | 'plan.changed'
  | 'premium.changed';

/**
 * mutateGroup'tan dönen yayın talimatı.
 * patch: GroupDoc deep-partial'ı — client merge eder (diziler olduğu gibi değiştirilir).
 * removed: silinen path'ler, örn. ['members.abc123', 'statuses.abc123'].
 */
export interface SessionUpdate {
  event: SessionUpdateEvent;
  patch?: DeepPartial<GroupDoc>;
  removed?: string[];
}

export type SessionClosedReason = 'removed' | 'deleted' | 'switched' | 'server' | 'paused';

export interface GroupSession {
  group: GroupRecord;
  /** userId -> bağlı socketId'ler (çoklu cihaz ref-count) */
  connections: Map<string, Set<string>>;
  dirty: boolean;
  persistTimer?: NodeJS.Timeout;
  evictTimer?: NodeJS.Timeout;
}

export const SESSION_EVENTS = {
  // server -> client
  STATE: 'session:state',
  UPDATE: 'session:update',
  CLOSED: 'session:closed',
  PRESENCE: 'presence:update',
  PREMIUM: 'premium:update',
  /** Grubun duraklatılma durumu değişti — üye session'ı yeniden açmalı */
  PLAN_CHANGED: 'group:plan-changed',
  // client -> server
  OPEN: 'session:open',
  CLOSE: 'session:close',
  STATUS_UPDATE: 'status:update',
  STATUS_CLEAR: 'status:clear',
} as const;

export function sessionRoom(groupId: string): string {
  return `session:${groupId}`;
}
