// Учебные планы: назначение плана ученику наполняет его темами предмета,
// доступ закрыт правом, статусы тем двигают прогресс.

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
  await pool.query(
    `TRUNCATE learning_plan_items, learning_plans, student_profiles, topics, sections, subjects
     RESTART IDENTITY CASCADE`,
  );
  await resetUsers();
});

async function adminClient() {
  await createUser('admin@example.com', 'password123', 'admin');
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
  return call;
}

// Ученик с профилем и предмет с тремя темами — напрямую в БД.
async function seed() {
  const user = await createUser('pupil@example.com', 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge') RETURNING id",
    [user.id],
  );
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ('Обществознание', 'oge') RETURNING id",
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title, order_index) VALUES ($1, 'Человек и общество', 0) RETURNING id",
    [subj[0].id],
  );
  await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index) VALUES
       ($1, 9, 'Тема 1', 0), ($1, 9, 'Тема 2', 1), ($1, 9, 'Тема 3', 2)`,
    [sec[0].id],
  );
  return { userId: user.id, profileId: prof[0].id, subjectId: subj[0].id };
}

describe('учебные планы', () => {
  it('без права users:write назначение запрещено (403)', async () => {
    const { userId, subjectId } = await seed();
    await createUser('user@example.com', 'password123', 'user');
    const call = makeClient(base);
    await call('POST', '/api/auth/login', { email: 'user@example.com', password: 'password123' });

    const { status } = await call('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: subjectId,
    });
    assert.equal(status, 403);
  });

  it('план наполняется темами предмета по порядку', async () => {
    const { userId, subjectId } = await seed();
    const admin = await adminClient();

    const created = await admin('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: subjectId,
    });
    assert.equal(created.status, 201);
    const planId = created.data.plan.id;

    const plan = await admin('GET', `/api/admin/plans/${planId}`);
    assert.equal(plan.status, 200);
    assert.equal(plan.data.items.length, 3);
    assert.deepEqual(
      plan.data.items.map((i) => i.topic_title),
      ['Тема 1', 'Тема 2', 'Тема 3'],
    );
    assert.ok(plan.data.items.every((i) => i.status === 'not_started'));
  });

  it('повторный план на тот же предмет отклоняется', async () => {
    const { userId, subjectId } = await seed();
    const admin = await adminClient();

    await admin('POST', `/api/admin/students/${userId}/plans`, { subject_id: subjectId });
    const dup = await admin('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: subjectId,
    });
    assert.equal(dup.status, 409);
  });

  it('статус темы completed двигает прогресс в списке планов', async () => {
    const { userId, subjectId } = await seed();
    const admin = await adminClient();

    const created = await admin('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: subjectId,
    });
    const planId = created.data.plan.id;
    const plan = await admin('GET', `/api/admin/plans/${planId}`);
    const firstItem = plan.data.items[0];

    const patched = await admin('PATCH', `/api/admin/plan-items/${firstItem.id}`, {
      status: 'completed',
    });
    assert.equal(patched.status, 200);
    assert.ok(patched.data.item.completed_at, 'у завершённой темы есть отметка времени');

    const list = await admin('GET', `/api/admin/students/${userId}/plans`);
    assert.equal(list.data.plans[0].topics_total, 3);
    assert.equal(list.data.plans[0].topics_done, 1);
  });

  it('несуществующий ученик или предмет — 404', async () => {
    const { userId, subjectId } = await seed();
    const admin = await adminClient();

    const noStudent = await admin('POST', '/api/admin/students/999999/plans', {
      subject_id: subjectId,
    });
    assert.equal(noStudent.status, 404);

    const noSubject = await admin('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: 999999,
    });
    assert.equal(noSubject.status, 404);
  });

  it('план архивируется и мягко удаляется', async () => {
    const { userId, subjectId } = await seed();
    const admin = await adminClient();
    const created = await admin('POST', `/api/admin/students/${userId}/plans`, {
      subject_id: subjectId,
    });
    const planId = created.data.plan.id;

    const archived = await admin('PATCH', `/api/admin/plans/${planId}`, { status: 'archived' });
    assert.equal(archived.data.plan.status, 'archived');

    const del = await admin('DELETE', `/api/admin/plans/${planId}`);
    assert.equal(del.status, 200);

    const list = await admin('GET', `/api/admin/students/${userId}/plans`);
    assert.equal(list.data.plans.length, 0, 'удалённый план не показывается');
  });
});
