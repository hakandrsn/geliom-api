import { DEFAULT_MOOD_OPTIONS, DEFAULT_STATUS_OPTIONS } from '../common/group-options';
import { GroupMoodOption } from '../firebase/firestore.types';
import { resolveOptions } from './groups.service';

const statusInput = () => DEFAULT_STATUS_OPTIONS.map(({ id, text, emoji }) => ({ id, text, emoji }));

describe('resolveOptions', () => {
  it('varsayılan seçenek düzenlenebilir; id korunur, artık varsayılan sayılmaz', () => {
    const input = statusInput();
    input[0] = { ...input[0], text: 'Çok müsait' };
    const result = resolveOptions(input, DEFAULT_STATUS_OPTIONS, DEFAULT_STATUS_OPTIONS, 'status');
    expect(result[0]).toMatchObject({ id: 'default-0', text: 'Çok müsait', isDefault: false });
    expect(result[1].isDefault).toBe(true);
  });

  it('düzenlenen varsayılan ruh hali key\'ini korur (mevcut durum kayıtları kopmaz)', () => {
    const input = DEFAULT_MOOD_OPTIONS.map(({ id, text, emoji }) => ({ id, text, emoji }));
    input[0] = { ...input[0], text: 'Keyifli' };
    const [first] = resolveOptions(
      input,
      DEFAULT_MOOD_OPTIONS,
      DEFAULT_MOOD_OPTIONS,
      'mood',
    ) as GroupMoodOption[];
    expect(first).toMatchObject({ key: 'happy', text: 'Keyifli' });
  });

  it('durumlarda notifies varsayılan true, gönderilen değer saklanır', () => {
    const input = [
      ...statusInput().slice(0, 8),
      { text: 'Kahve molası', notifies: false },
    ];
    const result = resolveOptions(input, DEFAULT_STATUS_OPTIONS, DEFAULT_STATUS_OPTIONS, 'status');
    expect(result[0].notifies).toBe(true);
    expect(result[8]).toMatchObject({ text: 'Kahve molası', notifies: false, isDefault: false });
  });

  it('listede toplam 10 seçenekten fazlası olamaz', () => {
    const input = [...statusInput(), { text: 'Bir' }, { text: 'İki' }, { text: 'Üç' }];
    expect(() =>
      resolveOptions(input, DEFAULT_STATUS_OPTIONS, DEFAULT_STATUS_OPTIONS, 'status'),
    ).toThrow();
    expect(
      resolveOptions(input.slice(0, 10), DEFAULT_STATUS_OPTIONS, DEFAULT_STATUS_OPTIONS, 'status'),
    ).toHaveLength(10);
  });
});
