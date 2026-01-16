import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersService } from '../users/users.service';
import { User } from '@prisma/client';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /**
   * Firebase token'dan kullanıcıyı doğrula veya oluştur (Lazy Sync)
   */
  async validateUser(decodedToken: admin.auth.DecodedIdToken): Promise<User> {
    const { uid: userId, email, name, picture } = decodedToken;

    this.logger.debug({ userId, email }, 'Validating user from Firebase Token');

    // Kullanıcıyı bul
    let user = await this.usersService.findById(userId);

    if (!user) {
      // İlk giriş - kullanıcıyı oluştur
      this.logger.info({ userId, email }, 'First login - creating new user');

      if (!email) {
        throw new Error('Email is required for user creation');
      }

      user = await this.usersService.create({
        id: userId,
        email: email,
        displayName: name,
        photoUrl: picture,
      });

      this.logger.info({ userId, customId: user.customId }, 'New user created');
    }

    return user;
  }
}
