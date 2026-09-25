import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { PinoLogger } from 'nestjs-pino';
import { COLLECTIONS, nowIso, UserRecord } from '../firebase/firestore.types';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';

@Injectable()
export class SupportService {
  constructor(
    @Inject('FIRESTORE') private readonly db: Firestore,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SupportService.name);
  }

  /**
   * Destek mesajını Firestore'a yazar. Kullanıcı kimliği token'dan gelir,
   * e-posta ile birlikte saklanır ki yanıt verilebilsin.
   */
  async create(user: UserRecord, dto: CreateSupportMessageDto) {
    const ref = this.db.collection(COLLECTIONS.SUPPORT_MESSAGES).doc();
    const doc = {
      userId: user.id,
      email: user.email,
      customId: user.customId,
      displayName: user.displayName,
      category: dto.category,
      message: dto.message,
      appInfo: dto.appInfo ?? null,
      status: 'OPEN' as const,
      createdAt: nowIso(),
    };
    await ref.set(doc);
    this.logger.info({ userId: user.id, category: dto.category }, 'Support message created');
    return { id: ref.id, createdAt: doc.createdAt };
  }
}
