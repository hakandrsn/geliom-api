import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Group, GroupMember } from '@prisma/client';

@Injectable()
export class GroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { id },
    });
  }

  async findByInviteCode(inviteCode: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { inviteCode },
    });
  }

  async create(data: { name: string; inviteCode: string; ownerId: string }): Promise<Group> {
    return this.prisma.group.create({
      data: {
        name: data.name,
        inviteCode: data.inviteCode,
        ownerId: data.ownerId,
        members: {
          create: {
            userId: data.ownerId,
            role: 'ADMIN',
          },
        },
      },
    });
  }

  async addMember(
    groupId: string,
    userId: string,
    role: 'ADMIN' | 'MEMBER' = 'MEMBER',
  ): Promise<GroupMember> {
    return this.prisma.groupMember.create({
      data: {
        groupId,
        userId,
        role,
      },
    });
  }

  async removeMember(groupId: string, userId: string): Promise<GroupMember> {
    return this.prisma.groupMember.delete({
      where: {
        userId_groupId: { userId, groupId },
      },
    });
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.groupMember.findUnique({
      where: {
        userId_groupId: { userId, groupId },
      },
    });
    return member !== null;
  }

  async getMemberRole(groupId: string, userId: string): Promise<'ADMIN' | 'MEMBER' | null> {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
      select: { role: true },
    });
    return member?.role as 'ADMIN' | 'MEMBER' | null;
  }

  // Join Requests
  async createJoinRequest(userId: string, groupId: string) {
    return this.prisma.joinRequest.create({
      data: {
        userId,
        groupId,
        status: 'PENDING',
      },
    });
  }

  async findPendingRequest(userId: string, groupId: string) {
    return this.prisma.joinRequest.findFirst({
      where: {
        userId,
        groupId,
        status: 'PENDING',
      },
    });
  }

  async findJoinRequestById(id: string) {
    return this.prisma.joinRequest.findUnique({
      where: { id },
    });
  }

  async getGroupRequests(groupId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
    return this.prisma.joinRequest.findMany({
      where: {
        groupId,
        status,
      },
      include: {
        user: true, // Include user details
      },
    });
  }

  async updateJoinRequestStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    return this.prisma.joinRequest.update({
      where: { id },
      data: { status },
    });
  }
}
