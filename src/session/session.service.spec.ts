import { ConflictException } from '@nestjs/common';
import { SessionService } from './session.service';
import { GroupDoc } from '../firebase/firestore.types';

/**
 * Bellek içi sahte Firestore: yalnızca SessionService'in kullandığı yüzey
 * (collection().doc().get()/set(), runTransaction) taklit edilir.
 */
function createFakeFirestore(initial: Record<string, GroupDoc>) {
  const store = new Map<string, GroupDoc>(Object.entries(initial));
  let writes = 0;

  const docRef = (id: string) => ({
    id,
    get: async () => ({
      exists: store.has(id),
      data: () => store.get(id),
    }),
    set: async (data: GroupDoc) => {
      writes += 1;
      store.set(id, JSON.parse(JSON.stringify(data)));
    },
    collection: () => ({ get: async () => ({ docs: [] }) }),
  });

  const db = {
    collection: () => ({ doc: docRef }),
    runTransaction: async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: GroupDoc) => {
          writes += 1;
          store.set(ref.id, JSON.parse(JSON.stringify(data)));
        },
      };
      await fn(tx);
    },
    batch: () => ({ delete: () => undefined, commit: async () => undefined }),
  };

  return { db, store, writeCount: () => writes };
}

function createFakeServer() {
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
    socketsLeave: jest.fn(),
    sockets: { sockets: new Map() },
  };
  return { server, emitted };
}

function createFakeSocket(id: string) {
  const emitted: Array<{ event: string; payload: any }> = [];
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: (event: string, payload: any) => emitted.push({ event, payload }),
    to: () => ({ emit: jest.fn() }),
    emitted,
  };
}

const baseGroup = (): GroupDoc => ({
  name: 'Test',
  description: null,
  inviteCode: 'ABC123',
  ownerId: 'owner',
  ownerIsPremium: false,
  version: 0,
  members: {
    owner: {
      role: 'ADMIN',
      displayName: 'Owner',
      photoUrl: null,
      customId: 'OWNER123',
      isMuted: false,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  statuses: {},
  statusOptions: [],
  moodOptions: [],
  isPaused: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

describe('SessionService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('session yokken mutateGroup Firestore transaction ile yazar ve version artırır', async () => {
    const { db, store, writeCount } = createFakeFirestore({ g1: baseGroup() });
    const service = new SessionService(db as any, logger);

    const result = await service.mutateGroup('g1', (group) => {
      group.name = 'Yeni';
      return { event: 'group.updated', patch: { name: 'Yeni' } };
    });

    expect(result.version).toBe(1);
    expect(store.get('g1')?.name).toBe('Yeni');
    expect(writeCount()).toBe(1);
  });

  it('session açıkken mutateGroup bellekten çalışır, odaya yayınlar ve yazmayı 1 sn birleştirir', async () => {
    const { db, store, writeCount } = createFakeFirestore({ g1: baseGroup() });
    const { server, emitted } = createFakeServer();
    const service = new SessionService(db as any, logger);
    service.attachServer(server as any);

    const socket = createFakeSocket('s1');
    const { group, onlineUserIds } = await service.openSession(socket as any, 'owner', 'g1');
    expect(group.version).toBe(0);
    expect(onlineUserIds).toEqual(['owner']);

    await service.mutateGroup('g1', (g) => {
      g.statuses.owner = { text: 'a', updatedAt: 'x' };
      return { event: 'status.updated', patch: { statuses: { owner: g.statuses.owner } } };
    });
    await service.mutateGroup('g1', (g) => {
      g.statuses.owner = { text: 'b', updatedAt: 'y' };
      return { event: 'status.updated', patch: { statuses: { owner: g.statuses.owner } } };
    });

    // Yayınlar anında ve sıralı version ile gider
    const updates = emitted.filter((e) => e.event === 'session:update');
    expect(updates.map((u) => u.payload.version)).toEqual([1, 2]);

    // Firestore'a henüz yazılmadı; debounce dolunca tek yazma olur
    expect(writeCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(writeCount()).toBe(1);
    expect(store.get('g1')?.version).toBe(2);
    expect(store.get('g1')?.statuses.owner.text).toBe('b');
  });

  it('mutator hata fırlatırsa version artmaz ve yayın yapılmaz', async () => {
    const { db } = createFakeFirestore({ g1: baseGroup() });
    const { server, emitted } = createFakeServer();
    const service = new SessionService(db as any, logger);
    service.attachServer(server as any);
    await service.openSession(createFakeSocket('s1') as any, 'owner', 'g1');

    await expect(
      service.mutateGroup('g1', () => {
        throw new ConflictException('kapasite dolu');
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const group = await service.getGroup('g1');
    expect(group?.version).toBe(0);
    expect(emitted.filter((e) => e.event === 'session:update')).toHaveLength(0);
  });

  it('üye olmayan kullanıcı session açamaz', async () => {
    const { db } = createFakeFirestore({ g1: baseGroup() });
    const service = new SessionService(db as any, logger);

    await expect(
      service.openSession(createFakeSocket('s1') as any, 'stranger', 'g1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('son üye ayrılınca persist edilir ve 60 sn sonra bellekten düşer', async () => {
    const { db, writeCount } = createFakeFirestore({ g1: baseGroup() });
    const { server } = createFakeServer();
    const service = new SessionService(db as any, logger);
    service.attachServer(server as any);

    const socket = createFakeSocket('s1');
    await service.openSession(socket as any, 'owner', 'g1');
    await service.mutateGroup('g1', (g) => {
      g.name = 'X';
      return { event: 'group.updated', patch: { name: 'X' } };
    });

    service.handleDisconnect('owner', 's1');
    await Promise.resolve();
    expect(writeCount()).toBe(1);
    expect(service.isUserInSession('g1', 'owner')).toBe(false);

    await jest.advanceTimersByTimeAsync(60_000);
    // Bellekten düştüyse getGroup Firestore'dan okur; version korunmuş olmalı
    const group = await service.getGroup('g1');
    expect(group?.version).toBe(1);
  });
});
