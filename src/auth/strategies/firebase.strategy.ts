import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-firebase-jwt';
import * as admin from 'firebase-admin';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: admin.app.App,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(token: string) {
    try {
      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token);

      if (!decodedToken) {
        throw new UnauthorizedException('Token invalid');
      }

      // Sync user (Lazy creation)
      const user = await this.authService.validateUser(decodedToken);

      return user;
    } catch (error) {
      console.error('Firebase Auth Error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
