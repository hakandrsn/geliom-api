export interface UpdateStatusPayload {
  text?: string;
  emoji?: string;
  mood?: string;
}

/**
 * Socket payload doğrulaması — HTTP ValidationPipe socket handler'larında
 * çalışmadığı için elle yapılır. Hata mesajı ack ile client'a döner.
 *
 * Durum metni ve ruh hali birbirinden bağımsızdır: ikisinden en az biri
 * gönderilmelidir. Boş metin "metin yok" sayılır.
 */
export function validateStatusPayload(payload: unknown): UpdateStatusPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Geçersiz payload');
  }
  const { text, emoji, mood } = payload as Record<string, unknown>;

  let cleanText: string | undefined;
  if (text !== undefined && text !== null) {
    if (typeof text !== 'string') throw new Error('text geçersiz');
    if (text.length > 200) throw new Error('text en fazla 200 karakter olabilir');
    cleanText = text.trim() || undefined;
  }

  let cleanMood: string | undefined;
  if (mood !== undefined && mood !== null) {
    if (typeof mood !== 'string' || mood.length > 50) throw new Error('mood geçersiz');
    cleanMood = mood.trim() || undefined;
  }

  if (!cleanText && !cleanMood) {
    throw new Error('text veya mood zorunludur');
  }

  if (emoji !== undefined && emoji !== null && (typeof emoji !== 'string' || emoji.length > 16)) {
    throw new Error('emoji geçersiz');
  }

  return {
    text: cleanText,
    emoji: (emoji as string | undefined) || undefined,
    mood: cleanMood,
  };
}
