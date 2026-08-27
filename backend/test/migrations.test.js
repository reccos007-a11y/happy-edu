// Миграции обязаны безболезненно ложиться на боевую базу, где таблицы уже
// созданы прежней версией кода (она строила схему при каждом старте, без учёта
// применённого). Если это сломается, деплой уронит рабочий сайт.

import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

after(() => pool.end());

beforeEach(async () => {
  await pool.query(
    `DROP TABLE IF EXISTS test_attempts, question_options, questions, learning_materials,
       learning_plan_items, learning_plans, student_profiles, topics, sections, subjects,
       users, schema_migrations CASCADE`,
  );
});

describe('раннер миграций', () => {
  it('накатывает схему с нуля', async () => {
    await runMigrations();

    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(
      rows.map((r) => r.name),
      [
        '001_users.sql',
        '002_user_roles.sql',
        '003_catalog.sql',
        '004_student_profiles.sql',
        '005_learning_plans.sql',
        '006_learning_materials.sql',
        '007_testing.sql',
        '008_app_settings.sql',
      ],
    );
  });

  it('повторный запуск ничего не меняет', async () => {
    await runMigrations();
    await runMigrations();

    const { rows } = await pool.query('SELECT count(*)::int AS c FROM schema_migrations');
    assert.equal(rows[0].c, 8);
  });

  it('ложится на базу, созданную прежней версией, сохраняя данные', async () => {
    // Ровно то, что создавал прежний initSchema: таблица без колонки role
    // и без учёта миграций.
    await pool.query(`
      CREATE TABLE users (
        id            SERIAL PRIMARY KEY,
        email         TEXT        NOT NULL,
        password_hash TEXT        NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query('CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email))');
    await pool.query("INSERT INTO users (email, password_hash) VALUES ('old@example.com', 'hash')");

    await runMigrations();

    const { rows } = await pool.query('SELECT email, role FROM users');
    assert.equal(rows.length, 1, 'существующие пользователи не должны потеряться');
    assert.equal(rows[0].email, 'old@example.com');
    assert.equal(rows[0].role, 'user', 'у заведённых раньше пользователей роль по умолчанию');
  });

  it('CHECK-ограничение не пускает неизвестную роль', async () => {
    await runMigrations();
    await pool.query("INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'hash')");

    await assert.rejects(
      () => pool.query("UPDATE users SET role = 'superroot' WHERE email = 'a@example.com'"),
      /users_role_check/,
    );
  });
});
