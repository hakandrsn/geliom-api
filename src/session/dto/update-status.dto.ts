export interface UpdateStatusPayload {
  text: string;
  emoji?: string;
  mood?: string;
}

/**
 * Socket payload doğrulaması — HTTP ValidationPipe socket handler'larında
 * çalışmadığı için elle yapılır. Hata mesajı ack ile client'a döner.
 */
export function validateStatusPayload(payload: unknown): UpdateStatusPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Geçersiz payload');
  }
  const { text, emoji, mood } = payload as Record<string, unknown>;

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('text zorunludur');
  }
  if (text.length > 200) {
    throw new Error('text en fazla 200 karakter olabilir');
  }
  if (emoji !== undefined && (typeof emoji !== 'string' || emoji.length > 16)) {
    throw new Error('emoji geçersiz');
  }
  if (mood !== undefined && (typeof mood !== 'string' || mood.length > 50)) {
    throw new Error('mood geçersiz');
  }

  return {
    text: text.trim(),
    emoji: emoji as string | undefined,
    mood: mood as string | undefined,
  };
}
