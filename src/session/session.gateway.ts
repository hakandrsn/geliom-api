import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as admin from 'firebase-admin';
import { nowIso, StatusEntry } from '../firebase/firestore.types';
import { PushDebounceService } from '../notifications/push-debounce.service';
import { validateStatusPayload } from './dto/update-status.dto';
import { SessionService } from './session.service';
import { SESSION_EVENTS } from './session.types';

// status:update için basit per-socket token bucket (HTTP RateLimitGuard WS'i kapsamaz)
const STATUS_RATE_LIMIT = 10;
const STATUS_RATE_WINDOW_MS = 10_000;

type Ack<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

@WebSocketGateway({ cors: { origin: '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SessionGateway.name);

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: admin.app.App,
    private readonly sessionService: SessionService,
    private readonly pushDebounceService: PushDebounceService,
  ) {}

  afterInit(server: Server) {
    this.sessionService.attachServer(server);
  }

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token || (client.handshake.headers?.token as string | undefined);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token);
      client.data.userId = decodedToken.uid;
      client.data.statusRate = { count: 0, resetAt: 0 };
      this.sessionService.registerSocket(decodedToken.uid, client.id);
      this.logger.log(`Socket connected: ${client.id} (user: ${decodedToken.uid})`);
    } catch {
      this.logger.warn(`Socket auth failed: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      this.sessionService.handleDisconnect(userId, client.id);
    }
  }

  @SubscribeMessage(SESSION_EVENTS.OPEN)
  async onSessionOpen(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId?: string },
  ): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'Unauthorized' };
    if (!body?.groupId || typeof body.groupId !== 'string') {
      return { ok: false, error: 'groupId zorunludur' };
    }

    try {
      const { group, onlineUserIds } = await this.sessionService.openSession(
        client,
        userId,
        body.groupId,
      );

      const state = { group, version: group.version, onlineUserIds };
      client.emit(SESSION_EVENTS.STATE, state);
      return { ok: true, ...state };
    } catch (error) {
      return { ok: false, error: error.message || 'Session açılamadı' };
    }
  }

  @SubscribeMessage(SESSION_EVENTS.CLOSE)
  onSessionClose(@ConnectedSocket() client: Socket): Ack {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'Unauthorized' };

    this.sessionService.closeSession(userId, client.id);
    return { ok: true };
  }

  @SubscribeMessage(SESSION_EVENTS.STATUS_UPDATE)
  async onStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'Unauthorized' };

    if (!this.checkStatusRate(client)) {
      return { ok: false, error: 'Çok fazla istek. Lütfen yavaşlayın.' };
    }

    // groupId client'tan alınmaz — aktif session'dan çözülür
    const groupId = this.sessionService.getActiveGroupId(userId);
    if (!groupId) {
      return { ok: false, error: 'Aktif bir session yok. Önce session:open gönderin.' };
    }

    let payload;
    try {
      payload = validateStatusPayload(body);
    } catch (error) {
      return { ok: false, error: error.message };
    }

    const entry: StatusEntry = {
      text: payload.text,
      emoji: payload.emoji,
      mood: payload.mood,
      updatedAt: nowIso(),
    };

    try {
      await this.sessionService.mutateGroup(groupId, (group) => {
        group.statuses[userId] = entry;
        return {
          event: 'status.updated',
          patch: { statuses: { [userId]: entry } },
        };
      });
    } catch (error) {
      return { ok: false, error: error.message || 'Status güncellenemedi' };
    }

    this.pushDebounceService.notifyStatusChanged(groupId, userId);

    return { ok: true, status: entry };
  }

  private checkStatusRate(client: Socket): boolean {
    const rate = client.data.statusRate as { count: number; resetAt: number };
    const now = Date.now();
    if (now > rate.resetAt) {
      rate.count = 0;
      rate.resetAt = now + STATUS_RATE_WINDOW_MS;
    }
    rate.count += 1;
    return rate.count <= STATUS_RATE_LIMIT;
  }
}
