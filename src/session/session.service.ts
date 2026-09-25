import {
  BeforeApplicationShutdown,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Firestore } from 'firebase-admin/firestore';
import { Server, Socket } from 'socket.io';
import { COLLECTIONS, GroupDoc, GroupRecord, nowIso } from '../firebase/firestore.types';
import { normalizeGroupDoc } from '../common/group-options';
import {
  GroupSession,
  SESSION_EVENTS,
  SessionClosedReason,
  SessionUpdate,
  sessionRoom,
} from './session.types';

const PERSIST_DEBOUNCE_MS = 1000; // bellek -> Firestore yazma birleştirme penceresi
const EVICT_DELAY_MS = 60_000; // son üye ayrıldıktan sonra bellekte tutma süresi

/**
 * Uygulamadaki TEK grup-yazma noktası.
 *
 * Grup dokümanına dokunan her şey (socket veya REST) mutateGroup'tan geçer:
 * session bellekteyse mutasyon bellek objesine uygulanır, session'daki herkese
 * yayınlanır ve Firestore'a coalesced olarak yazılır; session yoksa Firestore
 * transaction'ı ile uygulanır.
 */
@Injectable()
export class SessionService implements BeforeApplicationShutdown {
  private server: Server | null = null;

  private readonly sessions = new Map<string, GroupSession>();
  /** tek aktif session kuralı: userId -> groupId */
  private readonly userActiveGroup = new Map<string, string>();
  /** kimliği doğrulanmış tüm soketler: userId -> socketId'ler */
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    @Inject('FIRESTORE') private readonly db: Firestore,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SessionService.name);
  }

  attachServer(server: Server) {
    this.server = server;
  }

  // ---------------------------------------------------------------
  // Bağlantı yaşam döngüsü
  // ---------------------------------------------------------------

  registerSocket(userId: string, socketId: string) {
    let set = this.userSockets.get(userId);
    if (!set) {
      set = new Set();
      this.userSockets.set(userId, set);
    }
    set.add(socketId);
  }

  handleDisconnect(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) this.userSockets.delete(userId);
    }

    const groupId = this.userActiveGroup.get(userId);
    if (groupId) {
      this.leaveSession(userId, socketId, groupId);
    }
  }

  // ---------------------------------------------------------------
  // Session açma / kapama
  // ---------------------------------------------------------------

  async openSession(
    client: Socket,
    userId: string,
    groupId: string,
  ): Promise<{ group: GroupRecord; onlineUserIds: string[]; paused?: boolean }> {
    const previousGroupId = this.userActiveGroup.get(userId);

    // Başka grupta aktif session varsa otomatik kapat (switch)
    if (previousGroupId && previousGroupId !== groupId) {
      this.forceCloseUserSession(userId, 'switched');
    }

    let session = this.sessions.get(groupId);
    if (!session) {
      const group = await this.fetchGroup(groupId);
      if (!group) throw new NotFoundException('Grup bulunamadı');
      // fetch sırasında paralel open olabilir — tekrar kontrol et
      session = this.sessions.get(groupId) ?? {
        group,
        connections: new Map(),
        dirty: false,
      };
      this.sessions.set(groupId, session);
    }

    if (!session.group.members[userId]) {
      // Üye değilse session boşsa bellekte tutma
      if (session.connections.size === 0 && !session.dirty) this.sessions.delete(groupId);
      throw new ConflictException('Bu grubun üyesi değilsiniz');
    }

    // Duraklatılmış grup: yalnızca anlık görüntü döner; odaya katılım,
    // presence ve canlı yayın yok (status güncellemesi de aktif session gerektirir)
    if (session.group.isPaused) {
      const snapshot = session.group;
      if (session.connections.size === 0 && !session.dirty) this.sessions.delete(groupId);
      return { group: snapshot, onlineUserIds: [], paused: true };
    }

    if (session.evictTimer) {
      clearTimeout(session.evictTimer);
      session.evictTimer = undefined;
    }

    const firstSocketOfUser = !session.connections.has(userId);
    let userConnections = session.connections.get(userId);
    if (!userConnections) {
      userConnections = new Set();
      session.connections.set(userId, userConnections);
    }
    userConnections.add(client.id);

    this.userActiveGroup.set(userId, groupId);
    client.join(sessionRoom(groupId));

    if (firstSocketOfUser) {
      client.to(sessionRoom(groupId)).emit(SESSION_EVENTS.PRESENCE, { userId, online: true });
    }

    this.logger.info({ userId, groupId }, 'Session opened');

    return {
      group: session.group,
      onlineUserIds: Array.from(session.connections.keys()),
    };
  }

  closeSession(userId: string, socketId: string) {
    const groupId = this.userActiveGroup.get(userId);
    if (!groupId) return;
    this.getSocket(socketId)?.leave(sessionRoom(groupId));
    this.leaveSession(userId, socketId, groupId);
  }

  /**
   * Kullanıcının aktif session'ını tüm soketleriyle kapatır
   * (gruptan atılma, grup silinme, başka gruba geçiş).
   */
  forceCloseUserSession(userId: string, reason: SessionClosedReason) {
    const groupId = this.userActiveGroup.get(userId);
    if (!groupId) return;

    const session = this.sessions.get(groupId);
    const socketIds = session?.connections.get(userId);

    if (socketIds) {
      for (const socketId of socketIds) {
        const socket = this.getSocket(socketId);
        socket?.leave(sessionRoom(groupId));
        socket?.emit(SESSION_EVENTS.CLOSED, { reason });
      }
    }

    session?.connections.delete(userId);
    this.userActiveGroup.delete(userId);

    if (session) {
      if (session.connections.size > 0) {
        this.server
          ?.to(sessionRoom(groupId))
          .emit(SESSION_EVENTS.PRESENCE, { userId, online: false });
      } else {
        this.scheduleEviction(groupId, session);
      }
    }
  }

  private leaveSession(userId: string, socketId: string, groupId: string) {
    const session = this.sessions.get(groupId);
    if (!session) {
      this.userActiveGroup.delete(userId);
      return;
    }

    const userConnections = session.connections.get(userId);
    if (userConnections) {
      userConnections.delete(socketId);
      if (userConnections.size === 0) {
        session.connections.delete(userId);
        this.userActiveGroup.delete(userId);
        this.server
          ?.to(sessionRoom(groupId))
          .emit(SESSION_EVENTS.PRESENCE, { userId, online: false });
      }
    }

    if (session.connections.size === 0) {
      this.scheduleEviction(groupId, session);
    }
  }

  // ---------------------------------------------------------------
  // Grup okuma / yazma
  // ---------------------------------------------------------------

  /** Bellekteki canlı kopyayı, yoksa Firestore'dan okur. */
  async getGroup(groupId: string): Promise<GroupRecord | null> {
    const session = this.sessions.get(groupId);
    if (session) return session.group;
    return this.fetchGroup(groupId);
  }

  /**
   * Tek yazma noktası. mutator, grup objesini yerinde değiştirir ve
   * yayınlanacak SessionUpdate döner (void dönerse yayın yapılmaz).
   *
   * Not: session yokken mutator Firestore transaction'ı içinde çalışır ve
   * retry'da birden fazla kez çağrılabilir — yan etkisiz olmalıdır.
   */
  async mutateGroup(
    groupId: string,
    mutator: (group: GroupRecord) => SessionUpdate | void,
  ): Promise<GroupRecord> {
    const session = this.sessions.get(groupId);

    if (session) {
      const update = mutator(session.group);
      session.group.version += 1;
      session.group.updatedAt = nowIso();
      this.schedulePersist(groupId, session);

      if (update) {
        this.server?.to(sessionRoom(groupId)).emit(SESSION_EVENTS.UPDATE, {
          version: session.group.version,
          event: update.event,
          patch: update.patch,
          removed: update.removed,
        });
      }
      return session.group;
    }

    const ref = this.groupRef(groupId);
    let result: GroupRecord | null = null;
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundException('Grup bulunamadı');
      const group: GroupRecord = normalizeGroupDoc({ id: groupId, ...(snap.data() as GroupDoc) });
      mutator(group);
      group.version += 1;
      group.updatedAt = nowIso();
      const { id: _id, ...data } = group;
      tx.set(ref, data);
      result = group;
    });
    return result!;
  }

  /**
   * Grubu tamamen siler: canlı session'ları kapatır, dokümanı, invite code
   * lookup'ını ve join request alt koleksiyonunu temizler.
   */
  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) return;

    this.closeGroupSessions(groupId, 'deleted');

    const requests = await this.groupRef(groupId).collection(COLLECTIONS.JOIN_REQUESTS).get();
    const batch = this.db.batch();
    requests.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(this.db.collection(COLLECTIONS.INVITE_CODES).doc(group.inviteCode));
    batch.delete(this.groupRef(groupId));
    await batch.commit();

    this.logger.info({ groupId }, 'Group deleted');
  }

  /** Gruptaki tüm session'ları kapatır ve grubu bellekten düşürür. */
  closeGroupSessions(groupId: string, reason: SessionClosedReason) {
    const session = this.sessions.get(groupId);
    if (!session) return;

    this.server?.to(sessionRoom(groupId)).emit(SESSION_EVENTS.CLOSED, { reason });
    this.server?.socketsLeave(sessionRoom(groupId));

    for (const userId of session.connections.keys()) {
      if (this.userActiveGroup.get(userId) === groupId) {
        this.userActiveGroup.delete(userId);
      }
    }

    this.clearTimers(session);
    if (session.dirty && reason !== 'deleted') void this.persist(groupId, session);
    this.sessions.delete(groupId);
  }

  // ---------------------------------------------------------------
  // Sorgular / hedefli emit
  // ---------------------------------------------------------------

  getActiveGroupId(userId: string): string | undefined {
    return this.userActiveGroup.get(userId);
  }

  isUserInSession(groupId: string, userId: string): boolean {
    return this.sessions.get(groupId)?.connections.has(userId) ?? false;
  }

  /** Kullanıcının bağlı tüm soketlerine event gönderir (session şart değil). */
  emitToUser(userId: string, event: string, payload: unknown) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || !this.server) return;
    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, payload);
    }
  }

  // ---------------------------------------------------------------
  // Persist / eviction
  // ---------------------------------------------------------------

  private schedulePersist(groupId: string, session: GroupSession) {
    session.dirty = true;
    if (session.persistTimer) return;
    session.persistTimer = setTimeout(() => {
      session.persistTimer = undefined;
      void this.persist(groupId, session);
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persist(groupId: string, session: GroupSession) {
    if (!session.dirty) return;
    session.dirty = false;
    const { id: _id, ...data } = session.group;
    try {
      await this.groupRef(groupId).set(data);
    } catch (error) {
      session.dirty = true;
      this.logger.error({ groupId, err: error }, 'Failed to persist group session');
    }
  }

  private scheduleEviction(groupId: string, session: GroupSession) {
    if (session.persistTimer) {
      clearTimeout(session.persistTimer);
      session.persistTimer = undefined;
    }
    void this.persist(groupId, session);

    if (session.evictTimer) clearTimeout(session.evictTimer);
    session.evictTimer = setTimeout(() => {
      const current = this.sessions.get(groupId);
      if (current === session && current.connections.size === 0) {
        this.sessions.delete(groupId);
        this.logger.debug({ groupId }, 'Session evicted from memory');
      }
    }, EVICT_DELAY_MS);
  }

  private clearTimers(session: GroupSession) {
    if (session.persistTimer) clearTimeout(session.persistTimer);
    if (session.evictTimer) clearTimeout(session.evictTimer);
    session.persistTimer = undefined;
    session.evictTimer = undefined;
  }

  async beforeApplicationShutdown() {
    for (const [groupId, session] of this.sessions) {
      this.clearTimers(session);
      if (session.dirty) await this.persist(groupId, session);
    }
    this.sessions.clear();
  }

  // ---------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------

  private groupRef(groupId: string) {
    return this.db.collection(COLLECTIONS.GROUPS).doc(groupId);
  }

  private async fetchGroup(groupId: string): Promise<GroupRecord | null> {
    const snap = await this.groupRef(groupId).get();
    if (!snap.exists) return null;
    return normalizeGroupDoc({ id: groupId, ...(snap.data() as GroupDoc) });
  }

  private getSocket(socketId: string): Socket | undefined {
    return this.server?.sockets.sockets.get(socketId);
  }
}
