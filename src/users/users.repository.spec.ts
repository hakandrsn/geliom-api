import { PremiumLimitException } from '../common/exceptions/premium-limit.exception';
import { UserDoc } from '../firebase/firestore.types';
import { UsersRepository } from './users.repository';

/** reserveMembership'in kullandığı yüzeyi taklit eden sahte Firestore. */
function fakeDb(user: Partial<UserDoc>) {
  const doc = { groupIds: [], isPremium: false, ...user } as UserDoc;
  const ref = { id: 'u1' };
  return {
    doc,
    db: {
      collection: () => ({ doc: () => ref }),
      runTransaction: async (fn: (tx: any) => Promise<void>) =>
        fn({
          get: async () => ({ exists: true, data: () => doc }),
          update: (_ref: unknown, data: { groupIds: { elements?: string[] } }) => {
            // FieldValue.arrayUnion sentinel'ini burada basitçe uygula
            doc.groupIds = [...doc.groupIds, 'NEW'];
            return data;
          },
        }),
    },
  };
}

describe('UsersRepository.reserveMembership', () => {
  it('ücretsiz kullanıcı ilk gruba katılabilir', async () => {
    const { db, doc } = fakeDb({ groupIds: [] });
    await new UsersRepository(db as any).reserveMembership('u1', 'g1');
    expect(doc.groupIds).toHaveLength(1);
  });

  it('ücretsiz kullanıcı ikinci grupta MEMBERSHIP_LIMIT alır', async () => {
    const { db } = fakeDb({ groupIds: ['g0'] });
    await expect(
      new UsersRepository(db as any).reserveMembership('u1', 'g1'),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_LIMIT' });
  });

  it('premium kullanıcı 7. gruba kadar katılabilir, 8. de reddedilir', async () => {
    const six = fakeDb({ isPremium: true, groupIds: ['1', '2', '3', '4', '5', '6'] });
    await new UsersRepository(six.db as any).reserveMembership('u1', 'g7');
    expect(six.doc.groupIds).toHaveLength(7);

    const seven = fakeDb({ isPremium: true, groupIds: ['1', '2', '3', '4', '5', '6', '7'] });
    const err = await new UsersRepository(seven.db as any)
      .reserveMembership('u1', 'g8')
      .catch((e) => e);
    expect(err).toBeInstanceOf(PremiumLimitException);
    expect(err.code).toBe('MEMBERSHIP_LIMIT');
  });

  it('zaten üyeyse limit kontrolü yapılmaz (no-op)', async () => {
    const { db, doc } = fakeDb({ groupIds: ['g1'] });
    await new UsersRepository(db as any).reserveMembership('u1', 'g1');
    expect(doc.groupIds).toEqual(['g1']);
  });
});
