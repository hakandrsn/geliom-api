/**
 * 6 karakterlik benzersiz invite code üreteci
 */

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Rastgele invite code üret
 */
export function generateInviteCode(): string {
  let result = '';

  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CHARS.length);
    result += CHARS[randomIndex];
  }

  return result;
}

/**
 * Collision kontrolü ile benzersiz invite code üret
 */
export async function generateUniqueInviteCode(
  existsCheck: (code: string) => Promise<boolean>,
  maxAttempts: number = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateInviteCode();
    const exists = await existsCheck(code);

    if (!exists) {
      return code;
    }
  }

  throw new Error(`Failed to generate unique invite code after ${maxAttempts} attempts`);
}
