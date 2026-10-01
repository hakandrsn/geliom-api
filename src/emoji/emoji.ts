import { EMOJI_CATEGORIES } from './emoji-catalog';

/** Görsel dosya adı: FE0F'siz kod noktaları, '-' ile birleşik ("😮‍💨" → "1f62e-200d-1f4a8"). */
export function emojiCode(emoji: string): string {
  return Array.from(emoji)
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join('-');
}

const CATALOG_CODES = new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis.map((e) => e.code)));

/** Emoji ortak katalogda mı — seçenek kaydında katalog dışı emoji kabul edilmez. */
export function isCatalogEmoji(emoji: string): boolean {
  return CATALOG_CODES.has(emojiCode(emoji));
}
