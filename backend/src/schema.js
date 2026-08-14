import { pool } from './db.js';
import { ADMIN_ROLE, DEFAULT_ROLE, ROLE_NAMES } from './roles.js';

// Простая идемпотентная миграция: выполняется при каждом старте.
// Для сложных изменений схемы стоит перейти на полноценный инструмент миграций.
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT        NOT NULL,
      password_hash TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Уникальность по нормализованному e-mail: Bob@Example.com и bob@example.com —
  // один и тот же пользователь.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
    ON users (lower(email))
  `);

  // Роль появилась позже таблицы, поэтому добавляется отдельно: у всех уже
  // заведённых пользователей она станет DEFAULT_ROLE.
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '${DEFAULT_ROLE}'
  `);

  // Список допустимых ролей берётся из roles.js, чтобы схема не разошлась с кодом.
  // Ограничение пересоздаётся, иначе после добавления новой роли в ROLES старый
  // CHECK продолжил бы её отвергать.
  const allowed = ROLE_NAMES.map((name) => `'${name}'`).join(', ');
  await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN (${allowed}))
  `);
}

// Сколько администраторов есть в системе. Нужно, чтобы не дать снять права
// с последнего — иначе управлять ролями станет некому.
export async function countAdmins(client = pool) {
  const { rows } = await client.query(
    'SELECT count(*)::int AS count FROM users WHERE role = $1',
    [ADMIN_ROLE],
  );
  return rows[0].count;
}
