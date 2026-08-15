import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;
const SALT_LEN = 16;
// Параметры scrypt. N=2^15 — заметно медленнее дефолтных 2^14, что и нужно
// для паролей; maxmem поднят, иначе Node откажется считать с таким N.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// Случайный пароль для учётной записи, которую заводит администратор:
// 18 байт base64url — около 24 символов.
export function generatePassword() {
  return randomBytes(18).toString('base64url');
}

export async function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, KEY_LEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });

    // Сравнение за постоянное время — обычное === утекает информацию по таймингу.
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
