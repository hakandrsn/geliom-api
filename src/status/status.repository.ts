import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

@Injectable()
export class StatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(
    userId: string,
    groupId: string,
    text: string,
    emoji?: string,
    mood?: string,
  ): Promise<UserStatus> {
    return this.prisma.userStatus.upsert({
      where: {
        userId_groupId: { userId, groupId },
      },
      update: {
        text,
        emoji,
        mood,
        updatedAt: new Date(),
      },
      create: {
        userId,
        groupId,
        text,
        emoji,
        mood,
      },
    });
  }

  async getStatus(userId: string, groupId: string): Promise<UserStatus | null> {
    return this.prisma.userStatus.findUnique({
      where: {
        userId_groupId: { userId, groupId },
      },
    });
  }
  async getGroupName(groupId: string): Promise<string | null> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });
    return group?.name || null;
  }
}
