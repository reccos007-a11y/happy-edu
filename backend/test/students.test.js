// Управление учениками: доступ по праву, атомарное создание учётной записи
// с профилем, валидация и удаление.

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
  // Профили ссылаются на users — чистим их первыми.
  await pool.query('TRUNCATE student_profiles RESTART IDENTITY CASCADE');
  await resetUsers();
});

async function adminClient() {
  await createUser('admin@example.com', 'password123', 'admin');
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
  return call;
}

const VALID = { email: 'pupil@example.com', full_name: 'Иван Петров', grade: 9, exam_type: 'oge' };

describe('управление учениками', () => {
  it('без права users:write создание запрещено (403)', async () => {
    await createUser('user@example.com', 'password123', 'user');
    const call = makeClient(base);
    await call('POST', '/api/auth/login', { email: 'user@example.com', password: 'password123' });

    const { status } = await call('POST', '/api/admin/students', VALID);
    assert.equal(status, 403);
  });

  it('администратор заводит ученика с профилем и получает пароль', async () => {
    const admin = await adminClient();

    const created = await admin('POST', '/api/admin/students', VALID);
    assert.equal(created.status, 201);
    assert.equal(created.data.student.email, 'pupil@example.com');
    assert.equal(created.data.student.full_name, 'Иван Петров');
    assert.equal(created.data.student.grade, 9);
    assert.equal(created.data.student.exam_type, 'oge');
    assert.ok(created.data.generatedPassword, 'пароль показывается один раз');

    const list = await admin('GET', '/api/admin/students');
    assert.equal(list.status, 200);
    assert.equal(list.data.students.length, 1);

    // Учётная запись получила роль student.
    const { rows } = await pool.query('SELECT role FROM users WHERE email = $1', [
      'pupil@example.com',
    ]);
    assert.equal(rows[0].role, 'student');
  });

  it('валидация: класс вне 8–11 и неизвестный экзамен отклоняются', async () => {
    const admin = await adminClient();

    const badGrade = await admin('POST', '/api/admin/students', { ...VALID, grade: 7 });
    assert.equal(badGrade.status, 400);

    const badExam = await admin('POST', '/api/admin/students', { ...VALID, exam_type: 'vpr' });
    assert.equal(badExam.status, 400);
  });

  it('повторный e-mail отклоняется, профиль-сирота не остаётся', async () => {
    const admin = await adminClient();
    await admin('POST', '/api/admin/students', VALID);

    const dup = await admin('POST', '/api/admin/students', { ...VALID, grade: 10 });
    assert.equal(dup.status, 409);

    // Откат транзакции: второго профиля не появилось.
    const { rows } = await pool.query('SELECT count(*)::int AS c FROM student_profiles');
    assert.equal(rows[0].c, 1);
  });

  it('ученика нельзя завести через общий раздел пользователей', async () => {
    const admin = await adminClient();
    const { status } = await admin('POST', '/api/admin/users', {
      email: 'x@example.com',
      role: 'student',
    });
    assert.equal(status, 400);
  });

  it('редактирование меняет класс и ФИО', async () => {
    const admin = await adminClient();
    const created = await admin('POST', '/api/admin/students', VALID);
    const id = created.data.student.id;

    const patched = await admin('PATCH', `/api/admin/students/${id}`, {
      grade: 11,
      exam_type: 'ege',
      full_name: 'Иван П.',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.student.grade, 11);
    assert.equal(patched.data.student.exam_type, 'ege');
    assert.equal(patched.data.student.full_name, 'Иван П.');
  });

  it('удаление убирает и учётную запись, и профиль', async () => {
    const admin = await adminClient();
    const created = await admin('POST', '/api/admin/students', VALID);
    const id = created.data.student.id;

    const del = await admin('DELETE', `/api/admin/students/${id}`);
    assert.equal(del.status, 200);

    const { rows: users } = await pool.query('SELECT count(*)::int AS c FROM users WHERE id = $1', [
      id,
    ]);
    assert.equal(users[0].c, 0);
    const { rows: profiles } = await pool.query(
      'SELECT count(*)::int AS c FROM student_profiles WHERE user_id = $1',
      [id],
    );
    assert.equal(profiles[0].c, 0);
  });
});
