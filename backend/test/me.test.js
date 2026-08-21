// Кабинет ученика: вошедший ученик видит свой профиль и свои планы, но не
// чужие; не-ученик профиля не имеет.

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

async function login(email) {
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password: 'password123' });
  return call;
}

// Ученик с профилем и назначенным планом по предмету с двумя темами.
async function seedStudentWithPlan(email) {
  const user = await createUser(email, 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge') RETURNING id",
    [user.id],
  );
  // Имя предмета уникально на ученика: у subjects действует UNIQUE по названию.
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ($1, 'oge') RETURNING id",
    [`Обществознание (${email})`],
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title, order_index) VALUES ($1, 'Раздел', 0) RETURNING id",
    [subj[0].id],
  );
  const { rows: topics } = await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index)
     VALUES ($1, 9, 'Тема 1', 0), ($1, 9, 'Тема 2', 1) RETURNING id`,
    [sec[0].id],
  );
  const { rows: plan } = await pool.query(
    "INSERT INTO learning_plans (student_id, subject_id, exam_type) VALUES ($1, $2, 'oge') RETURNING id",
    [prof[0].id, subj[0].id],
  );
  await pool.query(
    `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
     VALUES ($1, $2, 0, 'completed'), ($1, $3, 1, 'not_started')`,
    [plan[0].id, topics[0].id, topics[1].id],
  );
  return { userId: user.id, subjectId: subj[0].id, planId: plan[0].id };
}

describe('кабинет ученика', () => {
  it('ученик видит свой профиль', async () => {
    await seedStudentWithPlan('pupil@example.com');
    const call = await login('pupil@example.com');

    const { status, data } = await call('GET', '/api/me/profile');
    assert.equal(status, 200);
    assert.equal(data.profile.grade, 9);
    assert.equal(data.profile.exam_type, 'oge');
  });

  it('не-ученик профиля не имеет (404)', async () => {
    await createUser('admin@example.com', 'password123', 'admin');
    const call = await login('admin@example.com');

    const { status } = await call('GET', '/api/me/profile');
    assert.equal(status, 404);
  });

  it('ученик видит свои планы с прогрессом', async () => {
    await seedStudentWithPlan('pupil@example.com');
    const call = await login('pupil@example.com');

    const { status, data } = await call('GET', '/api/me/plans');
    assert.equal(status, 200);
    assert.equal(data.plans.length, 1);
    assert.equal(data.plans[0].topics_total, 2);
    assert.equal(data.plans[0].topics_done, 1);
  });

  it('ученик открывает свой план с темами', async () => {
    const { planId } = await seedStudentWithPlan('pupil@example.com');
    const call = await login('pupil@example.com');

    const { status, data } = await call('GET', `/api/me/plans/${planId}`);
    assert.equal(status, 200);
    assert.equal(data.items.length, 2);
    assert.equal(data.items[0].status, 'completed');
  });

  it('чужой план ученику не виден (404)', async () => {
    const other = await seedStudentWithPlan('other@example.com');
    await seedStudentWithPlan('pupil@example.com');
    const call = await login('pupil@example.com');

    const { status } = await call('GET', `/api/me/plans/${other.planId}`);
    assert.equal(status, 404, 'план другого ученика недоступен');
  });
});
