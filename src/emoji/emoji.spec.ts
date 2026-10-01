import { existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_MOOD_OPTIONS, DEFAULT_STATUS_OPTIONS } from '../common/group-options';
import { EMOJI_CATEGORIES } from './emoji-catalog';
import { emojiCode, isCatalogEmoji } from './emoji';

const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

describe('emoji catalog', () => {
  it('her kaydın görseli assets/emoji altında var', () => {
    const missing = all.filter(
      (e) => !existsSync(join(__dirname, '..', '..', 'assets', 'emoji', `${e.code}.png`)),
    );
    expect(missing.map((e) => e.emoji)).toEqual([]);
  });

  it('code alanı emojiden türetilir ve tekrarsızdır', () => {
    for (const e of all) expect(emojiCode(e.emoji)).toBe(e.code);
    expect(new Set(all.map((e) => e.code)).size).toBe(all.length);
  });

  it('varsayılan durum ve ruh hali emojileri katalogda', () => {
    for (const o of [...DEFAULT_STATUS_OPTIONS, ...DEFAULT_MOOD_OPTIONS]) {
      expect(isCatalogEmoji(o.emoji!)).toBe(true);
    }
  });

  it("FE0F'li ve FE0F'siz yazım aynı emojidir", () => {
    expect(emojiCode('🗓️')).toBe(emojiCode('🗓'));
    expect(emojiCode('😮‍💨')).toBe('1f62e-200d-1f4a8');
    expect(isCatalogEmoji('🦄')).toBe(false);
  });
});
