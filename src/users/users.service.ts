import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { User } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { generateUniqueCustomId } from './helpers/custom-id.generator';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async create(data: {
    id: string;
    email: string;
    displayName?: string;
    photoUrl?: string;
  }): Promise<User> {
    const customId = await generateUniqueCustomId((id) => this.usersRepository.customIdExists(id));

    this.logger.info({ userId: data.id, customId }, 'Creating new user');

    return this.usersRepository.create({
      id: data.id,
      email: data.email,
      customId,
      displayName: data.displayName,
      photoUrl: data.photoUrl,
    });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }
    return user;
  }

  async findByCustomId(customId: string): Promise<User | null> {
    return this.usersRepository.findByCustomId(customId);
  }

  async update(id: string, data: { displayName?: string; photoUrl?: string }): Promise<User> {
    return this.usersRepository.update(id, data);
  }

  async delete(id: string): Promise<User> {
    return this.usersRepository.delete(id);
  }

  async getUserGroups(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    // Simplistic version for now as requested
    return this.usersRepository.getUserGroups(userId);
  }
}
