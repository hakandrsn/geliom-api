import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '@/prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: admin.app.App,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.token as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      client.data.userId = userId;

      // Join rooms for each group the user is in
      const memberships = await this.prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true },
      });

      for (const membership of memberships) {
        client.join(`group:${membership.groupId}`);
      }

      console.log(`User ${userId} connected to ${memberships.length} rooms`);
    } catch (error) {
      console.error('Socket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User ${client.data.userId} disconnected`);
  }

  broadcastStatusUpdate(
    groupId: string,
    userId: string,
    text: string,
    emoji?: string,
    mood?: string,
  ) {
    this.server.to(`group:${groupId}`).emit('statusUpdate', {
      userId,
      groupId,
      text,
      emoji,
      mood,
      updatedAt: new Date(),
    });
  }
}
