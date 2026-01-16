import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';

interface ConnectedUser {
  socketId: string;
  userId: string;
  rooms: Set<string>;
}

@Injectable()
export class SocketService {
  private server: Server | null = null;
  private connectedUsers = new Map<string, ConnectedUser>(); // socketId -> user
  private userSockets = new Map<string, Set<string>>(); // userId -> socketIds

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(SocketService.name);
  }

  setServer(server: Server) {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  /**
   * Kullanıcı bağlandığında kaydet
   */
  addConnection(socketId: string, userId: string) {
    // Connected user ekle
    this.connectedUsers.set(socketId, {
      socketId,
      userId,
      rooms: new Set(),
    });

    // User sockets mapping
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);

    this.logger.debug({ socketId, userId }, 'User connected');
  }

  /**
   * Kullanıcı ayrıldığında kaldır
   */
  removeConnection(socketId: string) {
    const user = this.connectedUsers.get(socketId);
    if (!user) return;

    // User sockets'dan kaldır
    const userSocketSet = this.userSockets.get(user.userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(user.userId);
      }
    }

    // Connected users'dan kaldır
    this.connectedUsers.delete(socketId);

    this.logger.debug({ socketId, userId: user.userId }, 'User disconnected');
  }

  /**
   * Socket'i bir odaya ekle
   */
  joinRoom(socketId: string, roomName: string) {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      user.rooms.add(roomName);
    }
  }

  /**
   * Socket'i bir odadan çıkar
   */
  leaveRoom(socketId: string, roomName: string) {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      user.rooms.delete(roomName);
    }
  }

  /**
   * Kullanıcının bağlı olup olmadığını kontrol et
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Kullanıcının socket ID'lerini al
   */
  getUserSocketIds(userId: string): string[] {
    return Array.from(this.userSockets.get(userId) || []);
  }

  /**
   * Belirli bir odaya mesaj gönder
   */
  emitToRoom(roomName: string, event: string, data: unknown) {
    if (this.server) {
      this.server.to(roomName).emit(event, data);
    }
  }

  /**
   * Belirli bir kullanıcıya mesaj gönder
   */
  emitToUser(userId: string, event: string, data: unknown) {
    const socketIds = this.getUserSocketIds(userId);
    if (this.server && socketIds.length > 0) {
      socketIds.forEach((socketId) => {
        this.server!.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * Bağlı kullanıcı sayısını al
   */
  getConnectedCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Online kullanıcı ID'lerini al
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }
}
