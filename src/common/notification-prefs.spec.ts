import { GroupMemberEntry } from '../firebase/firestore.types';
import { resolveNotificationPrefs, shouldNotifyMember } from './notification-prefs';

const member = (over: Partial<GroupMemberEntry> = {}): GroupMemberEntry => ({
  role: 'MEMBER',
  displayName: 'A',
  photoUrl: null,
  customId: 'AAAA1111',
  isMuted: false,
  joinedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('notification prefs', () => {
  it('varsayılanlar: açık, her iki tür de açık, kimse sessizde değil', () => {
    expect(resolveNotificationPrefs(member())).toEqual({
      enabled: true,
      statusUpdates: true,
      moodUpdates: true,
      mutedUserIds: [],
    });
  });

  it('isMuted grubu tamamen susturur', () => {
    expect(shouldNotifyMember(member({ isMuted: true }), 'x', { status: true, mood: true })).toBe(
      false,
    );
  });

  it('sessize alınan gönderenden bildirim gelmez', () => {
    const m = member({
      notificationPrefs: { statusUpdates: true, moodUpdates: true, mutedUserIds: ['x'] },
    });
    expect(shouldNotifyMember(m, 'x', { status: true, mood: false })).toBe(false);
    expect(shouldNotifyMember(m, 'y', { status: true, mood: false })).toBe(true);
  });

  it('sadece mood değiştiyse ve mood bildirimi kapalıysa gitmez', () => {
    const m = member({
      notificationPrefs: { statusUpdates: true, moodUpdates: false, mutedUserIds: [] },
    });
    expect(shouldNotifyMember(m, 'x', { status: false, mood: true })).toBe(false);
    expect(shouldNotifyMember(m, 'x', { status: true, mood: true })).toBe(true);
  });

  it('hiçbir şey değişmediyse gitmez', () => {
    expect(shouldNotifyMember(member(), 'x', { status: false, mood: false })).toBe(false);
  });
});
