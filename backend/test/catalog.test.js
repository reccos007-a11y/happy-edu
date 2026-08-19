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
async function loggedInClient(role = 'user', email = 'student@example.com') {
  await createUser(email, 'password123', role);
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password: 'password123' });
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

describe('управление каталогом', () => {
  it('без права content:write запись запрещена (403)', async () => {
    const user = await loggedInClient('user');
    const { status } = await user('POST', '/api/catalog/subjects', { name: 'Физика' });
    assert.equal(status, 403);
  });

  it('администратор создаёт предмет, дубль отклоняется', async () => {
    const admin = await loggedInClient('admin');

    const created = await admin('POST', '/api/catalog/subjects', {
      name: 'Физика',
      applies_to: 'ege',
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.subject.name, 'Физика');
    assert.equal(created.data.subject.applies_to, 'ege');

    const dup = await admin('POST', '/api/catalog/subjects', { name: 'Физика' });
    assert.equal(dup.status, 409);
  });

  it('валидация: пустое имя и неизвестный тип экзамена — 400', async () => {
    const admin = await loggedInClient('admin');

    const empty = await admin('POST', '/api/catalog/subjects', { name: '   ' });
    assert.equal(empty.status, 400);

    const badExam = await admin('POST', '/api/catalog/subjects', {
      name: 'Химия',
      applies_to: 'wrong',
    });
    assert.equal(badExam.status, 400);
  });

  it('редактирование предмета меняет только переданные поля', async () => {
    const admin = await loggedInClient('admin');
    const { data } = await admin('POST', '/api/catalog/subjects', { name: 'Химия' });
    const id = data.subject.id;

    const patched = await admin('PATCH', `/api/catalog/subjects/${id}`, { applies_to: 'oge' });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.subject.applies_to, 'oge');
    assert.equal(patched.data.subject.name, 'Химия', 'имя не должно измениться');
  });

  it('раздел и тему нельзя привязать к отсутствующему родителю', async () => {
    const admin = await loggedInClient('admin');

    const noSubject = await admin('POST', '/api/catalog/sections', {
      subject_id: 999999,
      title: 'Раздел',
    });
    assert.equal(noSubject.status, 404);

    const noSection = await admin('POST', '/api/catalog/topics', {
      section_id: 999999,
      title: 'Тема',
      grade: 9,
    });
    assert.equal(noSection.status, 404);
  });

  it('тема: класс вне 8–11 отклоняется', async () => {
    const admin = await loggedInClient('admin');
    const subj = await admin('POST', '/api/catalog/subjects', { name: 'Биология' });
    const sec = await admin('POST', '/api/catalog/sections', {
      subject_id: subj.data.subject.id,
      title: 'Клетка',
    });

    const bad = await admin('POST', '/api/catalog/topics', {
      section_id: sec.data.section.id,
      title: 'Тема',
      grade: 7,
    });
    assert.equal(bad.status, 400);
  });

  it('удаление предмета каскадом прячет его разделы и темы', async () => {
    const admin = await loggedInClient('admin');
    const subj = await admin('POST', '/api/catalog/subjects', { name: 'География' });
    const subjectId = subj.data.subject.id;
    const sec = await admin('POST', '/api/catalog/sections', {
      subject_id: subjectId,
      title: 'Карты',
    });
    await admin('POST', '/api/catalog/topics', {
      section_id: sec.data.section.id,
      title: 'Масштаб',
      grade: 9,
    });

    const del = await admin('DELETE', `/api/catalog/subjects/${subjectId}`);
    assert.equal(del.status, 200);

    // Предмета больше нет в витрине.
    const list = await admin('GET', '/api/catalog/subjects');
    assert.equal(
      list.data.subjects.find((s) => Number(s.id) === Number(subjectId)),
      undefined,
    );

    // Разделы и темы тоже помечены удалёнными.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c FROM sections
       WHERE subject_id = $1 AND deleted_at IS NULL`,
      [subjectId],
    );
    assert.equal(rows[0].c, 0, 'разделы удалённого предмета должны быть скрыты');
  });
});
