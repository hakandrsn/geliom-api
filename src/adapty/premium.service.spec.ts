import { isAccessLevelActive } from './premium.service';

describe('isAccessLevelActive', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');

  it('expires_at yoksa (ömür boyu / panelden süresiz erişim) aktif', () => {
    expect(isAccessLevelActive({ access_level_id: 'premium', expires_at: null }, now)).toBe(true);
    expect(isAccessLevelActive({ access_level_id: 'premium' }, now)).toBe(true);
  });

  it('gelecekteki bitiş tarihi aktif, geçmiş pasif', () => {
    expect(isAccessLevelActive({ expires_at: '2026-11-02T12:00:00Z' }, now)).toBe(true);
    expect(isAccessLevelActive({ expires_at: '2026-09-02T12:00:00Z' }, now)).toBe(false);
  });

  it('grace period süresi geçmiş olsa da aktif', () => {
    expect(
      isAccessLevelActive({ expires_at: '2026-09-30T12:00:00Z', is_in_grace_period: true }, now),
    ).toBe(true);
  });

  it('bozuk tarih pasif', () => {
    expect(isAccessLevelActive({ expires_at: 'not-a-date' }, now)).toBe(false);
  });
});
