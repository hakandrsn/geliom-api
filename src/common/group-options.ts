import { randomUUID } from 'crypto';
import { GroupDoc, GroupMoodOption, GroupOption } from '../firebase/firestore.types';

/** Bir listede en fazla bu kadar ÖZEL (varsayılan olmayan) seçenek olabilir. */
export const MAX_CUSTOM_OPTIONS = 10;
export const OPTION_TEXT_MAX = 40;

export const DEFAULT_STATUS_OPTIONS: GroupOption[] = [
  { id: 'default-0', text: 'Müsait', emoji: '🟢', isDefault: true },
  { id: 'default-1', text: 'Meşgul', emoji: '⛔', isDefault: true },
  { id: 'default-4', text: 'İşte', emoji: '💼', isDefault: true },
  { id: 'default-3', text: 'Okulda', emoji: '📚', isDefault: true },
  { id: 'default-2', text: 'Toplantıda', emoji: '🗓️', isDefault: true },
  { id: 'default-7', text: 'Yolda', emoji: '🚗', isDefault: true },
  { id: 'default-6', text: 'Spor yapıyor', emoji: '🏃', isDefault: true },
  { id: 'default-5', text: 'Uykuda', emoji: '😴', isDefault: true },
];

export const DEFAULT_MOOD_OPTIONS: GroupMoodOption[] = [
  { id: 'mood-default-0', key: 'happy', text: 'Mutlu', emoji: '😊', isDefault: true },
  { id: 'mood-default-2', key: 'relaxed', text: 'Rahat', emoji: '😌', isDefault: true },
  { id: 'mood-default-4', key: 'energetic', text: 'Enerjik', emoji: '⚡', isDefault: true },
  { id: 'mood-default-6', key: 'excited', text: 'Heyecanlı', emoji: '🤩', isDefault: true },
  { id: 'mood-default-3', key: 'tired', text: 'Yorgun', emoji: '🥱', isDefault: true },
  { id: 'mood-default-7', key: 'stressed', text: 'Stresli', emoji: '😣', isDefault: true },
  { id: 'mood-default-5', key: 'sad', text: 'Üzgün', emoji: '😔', isDefault: true },
  { id: 'mood-default-8', key: 'bored', text: 'Sıkkın', emoji: '😐', isDefault: true },
];

const clone = <T>(items: T[]): T[] => items.map((i) => ({ ...i }));

export function defaultStatusOptions(): GroupOption[] {
  return clone(DEFAULT_STATUS_OPTIONS);
}

export function defaultMoodOptions(): GroupMoodOption[] {
  return clone(DEFAULT_MOOD_OPTIONS);
}

export function newOptionId(prefix: 'status' | 'mood'): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

/**
 * Eski/eksik dokümanları güncel modele getirir (yerinde değiştirir):
 *  - statusOptions / moodOptions yoksa varsayılanlarla doldurulur
 *  - eski customMoods, moodOptions'ın başına taşınır ve alan silinir
 *  - isPaused yoksa false
 * Firestore'dan her okunuşta çağrılır; persist edilince kalıcılaşır.
 */
export function normalizeGroupDoc<T extends Partial<GroupDoc>>(doc: T): T & GroupDoc {
  const d = doc as T & GroupDoc;
  if (!Array.isArray(d.statusOptions)) d.statusOptions = defaultStatusOptions();
  if (!Array.isArray(d.moodOptions)) {
    const legacy: GroupMoodOption[] = (d.customMoods ?? []).map((m) => ({
      id: m.id,
      key: m.mood,
      text: m.text,
      emoji: m.emoji,
      isDefault: false,
    }));
    d.moodOptions = [...legacy, ...defaultMoodOptions()];
  }
  if ('customMoods' in d) delete d.customMoods;
  if (typeof d.isPaused !== 'boolean') d.isPaused = false;
  return d;
}
