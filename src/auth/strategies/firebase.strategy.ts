import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-firebase-jwt';
import { PinoLogger } from 'nestjs-pino';
import * as admin from 'firebase-admin';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: admin.app.App,
    private readonly authService: AuthService,
    private readonly logger: PinoLogger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
    this.logger.setContext(FirebaseStrategy.name);
  }

  async validate(token: string) {
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token);
    } catch (error) {
      // Token'ın kendisi loglanmaz; sadece Firebase'in hata kodu
      this.logger.warn({ code: error?.code }, 'Firebase token verification failed');
      throw new UnauthorizedException('Authentication failed');
    }

    try {
      // Sync user (Lazy creation)
      return await this.authService.validateUser(decodedToken);
    } catch (error) {
      this.logger.error({ userId: decodedToken.uid, err: error }, 'User validation failed');
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
