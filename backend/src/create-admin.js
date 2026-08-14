// Создание администратора из командной строки.
//
//   docker compose exec backend node src/create-admin.js admin@example.com
//   docker compose exec -e ADMIN_PASSWORD=... backend node src/create-admin.js admin@example.com
//
// Если пользователь с таким e-mail уже есть — он повышается до администратора,
// пароль при этом меняется только когда передан явно. Скрипт идемпотентен:
// повторный запуск на том же адресе ничего не ломает.
//
// Регистрация через сайт всегда создаёт обычного пользователя, поэтому первый
// администратор заводится только так — это единственный вход в систему прав.

import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { hashPassword } from './password.js';
import { ADMIN_ROLE } from './roles.js';
import { initSchema } from './schema.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function generatePassword() {
  // 18 байт base64url — примерно 24 символа, достаточно для случайного пароля.
  return randomBytes(18).toString('base64url');
}

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);

  if (!emailArg || !EMAIL_RE.test(emailArg.trim())) {
    console.error('Использование: node src/create-admin.js <email> [пароль]');
    console.error('Пароль можно передать и через переменную окружения ADMIN_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const explicitPassword = process.env.ADMIN_PASSWORD || passwordArg || null;

  if (explicitPassword && explicitPassword.length < MIN_PASSWORD) {
    console.error(`Пароль должен быть не короче ${MIN_PASSWORD} символов`);
    process.exitCode = 1;
    return;
  }

  await initSchema();

  const { rows: existing } = await pool.query(
    'SELECT id, email, role FROM users WHERE lower(email) = $1',
    [email],
  );

  if (existing[0]) {
    const user = existing[0];
    const fields = ['role = $1'];
    const values = [ADMIN_ROLE];

    if (explicitPassword) {
      fields.push(`password_hash = $${values.length + 1}`);
      values.push(await hashPassword(explicitPassword));
    }
    values.push(user.id);

    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`,
      values,
    );

    const wasAdmin = user.role === ADMIN_ROLE;
    console.log(
      wasAdmin
        ? `Пользователь ${user.email} уже был администратором (id=${user.id}).`
        : `Пользователь ${user.email} повышен до администратора (id=${user.id}).`,
    );
    if (explicitPassword) console.log('Пароль обновлён.');
    return;
  }

  const password = explicitPassword || generatePassword();
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
    [email, hash, ADMIN_ROLE],
  );

  console.log(`Создан администратор ${rows[0].email} (id=${rows[0].id}).`);
  if (!explicitPassword) {
    console.log(`Сгенерированный пароль: ${password}`);
    console.log('Сохраните его — второй раз он не показывается.');
  }
}

main()
  .catch((err) => {
    console.error('Не удалось создать администратора:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
