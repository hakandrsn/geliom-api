import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const serviceAccountPath = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

        if (!serviceAccountPath) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not defined in .env');
        }

        // Initialize Firebase Admin if not already initialized
        if (admin.apps.length === 0) {
          return admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
          });
        }
        return admin.app();
      },
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
