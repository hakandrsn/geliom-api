import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByCustomId(customId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { customId },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async customIdExists(customId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { customId },
    });
    return count > 0;
  }

  async getUserGroups(userId: string) {
    return this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: true,
      },
    });
  }
}
