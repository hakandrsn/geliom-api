import { selectGroupsToPause } from './group-plan';
import { normalizeGroupDoc } from './group-options';

describe('selectGroupsToPause', () => {
  it('tek ve küçük grup aktif kalır', () => {
    expect(selectGroupsToPause([{ id: 'a', createdAt: '1', memberCount: 3 }])).toEqual({
      keepActiveId: 'a',
      pauseIds: [],
    });
  });

  it('en eski uygun grup kalır, diğerleri duraklar', () => {
    const r = selectGroupsToPause([
      { id: 'new', createdAt: '3', memberCount: 2 },
      { id: 'old', createdAt: '1', memberCount: 4 },
      { id: 'mid', createdAt: '2', memberCount: 2 },
    ]);
    expect(r.keepActiveId).toBe('old');
    expect(r.pauseIds.sort()).toEqual(['mid', 'new']);
  });

  it('5 kişiyi aşan grup ücretsiz hakka sığmaz', () => {
    const r = selectGroupsToPause([
      { id: 'big', createdAt: '1', memberCount: 12 },
      { id: 'small', createdAt: '2', memberCount: 5 },
    ]);
    expect(r.keepActiveId).toBe('small');
    expect(r.pauseIds).toEqual(['big']);
  });

  it('hiçbiri uymuyorsa hepsi duraklar', () => {
    const r = selectGroupsToPause([{ id: 'big', createdAt: '1', memberCount: 9 }]);
    expect(r).toEqual({ keepActiveId: null, pauseIds: ['big'] });
  });
});

describe('normalizeGroupDoc', () => {
  it('eksik listeleri varsayılanla doldurur, eski customMoods başa taşınır', () => {
    const doc = normalizeGroupDoc({
      customMoods: [{ id: 'm1', text: 'Kahve', emoji: '☕', mood: 'kahve', createdAt: 'x' }],
    } as any);
    expect(doc.statusOptions.length).toBeGreaterThan(0);
    expect(doc.moodOptions[0]).toMatchObject({ id: 'm1', key: 'kahve', isDefault: false });
    expect('customMoods' in doc).toBe(false);
    expect(doc.isPaused).toBe(false);
  });
});
