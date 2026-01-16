/**
 * 8 karakterlik benzersiz custom ID üreteci
 * handle_new_user.sql mantığının TypeScript implementasyonu
 *
 * Karakterler: A-Z (I ve O hariç) ve 1-9 (0 hariç)
 * Toplam: 24 harf + 9 rakam = 33 karakter
 * Olasılık: 33^8 = 1.406.408.618.241 (~1.4 trilyon)
 */

// Karıştırılabilecek karakterler hariç tutulmuş
// I/1, O/0 karışıklığını önlemek için
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
const ID_LENGTH = 8;

/**
 * Rastgele custom ID üret
 */
export function generateCustomId(): string {
  let result = '';

  for (let i = 0; i < ID_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CHARS.length);
    result += CHARS[randomIndex];
  }

  return result;
}

/**
 * Collision kontrolü ile benzersiz custom ID üret
 * @param existsCheck - ID'nin veritabanında var olup olmadığını kontrol eden fonksiyon
 * @param maxAttempts - Maksimum deneme sayısı (default: 10)
 */
export async function generateUniqueCustomId(
  existsCheck: (id: string) => Promise<boolean>,
  maxAttempts: number = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const customId = generateCustomId();
    const exists = await existsCheck(customId);

    if (!exists) {
      return customId;
    }
  }

  // Çok düşük olasılık ama yine de hata fırlat
  throw new Error(
    `Failed to generate unique custom ID after ${maxAttempts} attempts. This is extremely unlikely.`,
  );
}

/**
 * Custom ID formatını doğrula
 */
export function isValidCustomId(id: string): boolean {
  if (id.length !== ID_LENGTH) {
    return false;
  }

  for (const char of id) {
    if (!CHARS.includes(char)) {
      return false;
    }
  }

  return true;
}
