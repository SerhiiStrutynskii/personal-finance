import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

let dummyHash: Promise<string> | undefined;

/**
 * Перевіряє пароль. Якщо хеша немає (невідомий email), усе одно виконує перевірку з фіктивним
 * хешем, щоб час відповіді не видавав, чи зареєстрований користувач.
 */
export async function verifyPassword(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!hash) {
    dummyHash ??= hashPassword('fake-password-for-timing');
    await argon2.verify(await dummyHash, password);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
