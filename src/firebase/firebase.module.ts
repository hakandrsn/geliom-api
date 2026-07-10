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
        if (admin.apps.length > 0) {
          return admin.app();
        }

        // Emülatör modunda (lokal geliştirme/test) service account gerekmez
        const usingEmulator =
          !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
        if (usingEmulator) {
          return admin.initializeApp({
            projectId:
              configService.get<string>('FIREBASE_PROJECT_ID') ||
              process.env.GCLOUD_PROJECT ||
              'demo-geliom',
          });
        }

        const serviceAccountPath = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
        if (!serviceAccountPath) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not defined in .env');
        }

        return admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
      },
    },
    {
      provide: 'FIRESTORE',
      inject: ['FIREBASE_ADMIN'],
      useFactory: (app: admin.app.App) => {
        const db = app.firestore();
        db.settings({ ignoreUndefinedProperties: true });
        return db;
      },
    },
  ],
  exports: ['FIREBASE_ADMIN', 'FIRESTORE'],
})
export class FirebaseModule {}
