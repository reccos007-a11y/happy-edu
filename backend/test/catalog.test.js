// Каталог учебного контента: доступ только вошедшим, витрина предметов со
// счётчиками и дерево разделов с темами в правильном порядке.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { createUser, makeClient, resetUsers, startServer } from './helpers.js';

let server;
let base;

before(async () => {
  await runMigrations();
  ({ server, base } = await startServer());
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

beforeEach(async () => {
  await resetUsers();
  await pool.query('TRUNCATE topics, sections, subjects RESTART IDENTITY CASCADE');
});

// Заводит вошедшего пользователя и возвращает готовый HTTP-клиент с сессией.
async function loggedInClient(role = 'user') {
  await createUser('student@example.com', 'password123', role);
  const call = makeClient(base);
  await call('POST', '/api/auth/login', {
    email: 'student@example.com',
    password: 'password123',
  });
  return call;
}

// Небольшой предмет с двумя разделами; темы намеренно вставлены не по порядку,
// чтобы проверить сортировку по order_index.
async function seedSubject() {
  const { rows: subj } = await pool.query(
    `INSERT INTO subjects (name, applies_to, order_index) VALUES ('Обществознание', 'oge', 0)
     RETURNING id`,
  );
  const subjectId = subj[0].id;

  const { rows: sec } = await pool.query(
    `INSERT INTO sections (subject_id, title, order_index)
     VALUES ($1, 'Человек и общество', 0), ($1, 'Экономика', 1) RETURNING id, order_index`,
    [subjectId],
  );
  const first = sec.find((s) => s.order_index === 0).id;

  await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index, codifier_code, difficulty)
     VALUES ($1, 9, 'Вторая тема', 1, '1.2', 'advanced'),
            ($1, 9, 'Первая тема', 0, '1.1', 'base')`,
    [first],
  );

  return { subjectId };
}

describe('каталог', () => {
  it('без сессии отвечает 401', async () => {
    const call = makeClient(base);
    const { status } = await call('GET', '/api/catalog/subjects');
    assert.equal(status, 401);
  });

  it('вошедший видит список предметов со счётчиками', async () => {
    await seedSubject();
    const call = await loggedInClient();

    const { status, data } = await call('GET', '/api/catalog/subjects');
    assert.equal(status, 200);
    assert.equal(data.subjects.length, 1);
    assert.equal(data.subjects[0].name, 'Обществознание');
    assert.equal(data.subjects[0].section_count, 2);
    assert.equal(data.subjects[0].topic_count, 2);
  });

  it('дерево предмета отдаёт разделы и темы по порядку', async () => {
    const { subjectId } = await seedSubject();
    const call = await loggedInClient();

    const { status, data } = await call('GET', `/api/catalog/subjects/${subjectId}`);
    assert.equal(status, 200);
    assert.equal(data.subject.name, 'Обществознание');
    assert.deepEqual(
      data.sections.map((s) => s.title),
      ['Человек и общество', 'Экономика'],
    );
    // Темы отсортированы по order_index, а не по порядку вставки.
    assert.deepEqual(
      data.sections[0].topics.map((t) => t.title),
      ['Первая тема', 'Вторая тема'],
    );
  });

  it('несуществующий предмет — 404, кривой id — 400', async () => {
    const call = await loggedInClient();

    const notFound = await call('GET', '/api/catalog/subjects/999999');
    assert.equal(notFound.status, 404);

    const bad = await call('GET', '/api/catalog/subjects/abc');
    assert.equal(bad.status, 400);
  });
});
