// Раннер SQL-миграций.
//
// Файлы лежат в backend/migrations и применяются по возрастанию имени, каждый
// ровно один раз — применённые записываются в таблицу schema_migrations.
// Запускается автоматически при старте backend и вручную:
//
//   docker compose exec backend npm run migrate
//
// Взят простой раннер на чистом SQL, а не библиотека миграций: команде видно,
// что именно уйдёт в базу, и не нужно изучать отдельный формат описания.
//
// Правила: файл, попавший в main, больше не редактируют — изменения вносят
// новой миграцией. Иначе у того, кто её уже применил, база останется старой.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Произвольный, но постоянный идентификатор блокировки. Разные проекты в одной
// БД должны использовать разные значения.
const LOCK_ID = 8_014_233;

export async function runMigrations() {
  const client = await pool.connect();
  let locked = false;

  try {
    // Блокировка уровня БД: если backend поднимается в нескольких экземплярах
    // или деплой накладывается на предыдущий, миграции применит только один,
    // остальные дождутся и увидят их уже применёнными.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('Миграции: всё применено');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Вся миграция в одной транзакции: при ошибке не останется половины.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Миграция применена: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${file} не применилась: ${err.message}`);
      }
    }
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }
    client.release();
  }
}

// Прямой запуск: node src/migrate.js
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
