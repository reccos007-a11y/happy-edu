// Доступ к темам внутри плана: гейт последовательности можно выключить,
// тему — открыть вручную, скрыть у одного ученика или открыть по дате.

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
    `TRUNCATE test_attempts, questions, learning_plan_items, learning_plans,
              student_profiles, topics, sections, subjects
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

// Ученик с планом из трёх тем, ни одна не начата: вторая и третья заперты гейтом.
async function seed() {
  const user = await createUser('pupil@example.com', 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge') RETURNING id",
    [user.id],
  );
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ('Биология', 'oge') RETURNING id",
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title, order_index) VALUES ($1, 'Раздел', 0) RETURNING id",
    [subj[0].id],
  );
  const { rows: topics } = await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index)
     VALUES ($1, 9, 'Тема 1', 0), ($1, 9, 'Тема 2', 1), ($1, 9, 'Тема 3', 2) RETURNING id`,
    [sec[0].id],
  );
  const { rows: plan } = await pool.query(
    `INSERT INTO learning_plans (student_id, subject_id, exam_type, status)
     VALUES ($1, $2, 'oge', 'active') RETURNING id`,
    [prof[0].id, subj[0].id],
  );
  const { rows: items } = await pool.query(
    `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
     VALUES ($1, $2, 0, 'not_started'), ($1, $3, 1, 'not_started'), ($1, $4, 2, 'not_started')
     RETURNING id`,
    [plan[0].id, topics[0].id, topics[1].id, topics[2].id],
  );
  // Вопрос во второй теме — чтобы проверять доступ к тесту, а не пустоту.
  await pool.query(
    `INSERT INTO questions (topic_id, type, text, correct_short_answer, order_index)
     VALUES ($1, 'short_answer', 'Вопрос', 'да', 0)`,
    [topics[1].id],
  );

  const pupil = makeClient(base);
  await pupil('POST', '/api/auth/login', { email: 'pupil@example.com', password: 'password123' });

  return {
    pupil,
    userId: user.id,
    planId: plan[0].id,
    topicIds: topics.map((t) => t.id),
    itemIds: items.map((i) => i.id),
  };
}

const isoInDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('доступ к темам плана', () => {
  it('по умолчанию гейт включён: вторая тема заперта', async () => {
    const { pupil, planId, topicIds } = await seed();

    const { data } = await pupil('GET', `/api/me/plans/${planId}`);
    assert.equal(data.items[0].locked, false);
    assert.equal(data.items[1].locked, true);
    assert.equal(data.items[1].lock_reason, 'sequence');

    const test = await pupil('GET', `/api/me/topics/${topicIds[1]}/test`);
    assert.equal(test.status, 403);
    assert.match(test.data.error, /предыдущую тему/);
  });

  describe('свободный порядок', () => {
    it('выключенный гейт открывает все темы плана', async () => {
      const { pupil, planId, topicIds } = await seed();
      const admin = await adminClient();

      const patched = await admin('PATCH', `/api/admin/plans/${planId}`, { sequential: false });
      assert.equal(patched.status, 200);
      assert.equal(patched.data.plan.sequential, false);

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.ok(data.items.every((i) => i.locked === false));
      assert.equal((await pupil('GET', `/api/me/topics/${topicIds[1]}/test`)).status, 200);
    });

    it('нестроковое значение отклоняется', async () => {
      const { planId } = await seed();
      const admin = await adminClient();

      const { status } = await admin('PATCH', `/api/admin/plans/${planId}`, { sequential: 'да' });
      assert.equal(status, 400);
    });
  });

  describe('ручное открытие темы', () => {
    it('открытая тема доступна в обход гейта, остальные — нет', async () => {
      const { pupil, planId, topicIds, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { unlocked: true });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[1].locked, false);
      assert.equal(data.items[2].locked, true, 'третья тема остаётся запертой');
      assert.equal((await pupil('GET', `/api/me/topics/${topicIds[1]}/test`)).status, 200);
    });

    it('открытие снимается обратно', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { unlocked: true });
      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { unlocked: false });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[1].locked, true);
    });

    it('ручное открытие сильнее расписания', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, {
        available_from: isoInDays(7),
        unlocked: true,
      });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[0].locked, false);
    });
  });

  describe('скрытие темы у ученика', () => {
    it('скрытая тема пропадает из плана и из счёта', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { hidden: true });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items.length, 2);

      const overview = await pupil('GET', '/api/me/overview');
      assert.equal(overview.data.stats.topicsTotal, 2);
    });

    it('скрытая тема не запирает следующую', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      // Первую зачли, вторую спрятали — третья должна открыться.
      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, { status: 'completed' });
      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { hidden: true });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items.length, 2);
      assert.equal(data.items[1].locked, false);
    });

    it('тест скрытой темы отвечает 404, а не 403', async () => {
      const { pupil, topicIds, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { hidden: true });

      const { status } = await pupil('GET', `/api/me/topics/${topicIds[1]}/test`);
      assert.equal(status, 404);
    });

    it('персонал видит скрытую позицию, чтобы вернуть её обратно', async () => {
      const { planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[1]}`, { hidden: true });

      const { data } = await admin('GET', `/api/admin/plans/${planId}`);
      assert.equal(data.items.length, 3);
      assert.ok(data.items[1].hidden_at);
    });
  });

  describe('дата открытия', () => {
    it('будущая дата закрывает тему с понятной причиной', async () => {
      const { pupil, planId, topicIds, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, {
        available_from: isoInDays(3),
      });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[0].locked, true);
      assert.equal(data.items[0].lock_reason, 'schedule');

      const test = await pupil('GET', `/api/me/topics/${topicIds[0]}/test`);
      assert.equal(test.status, 403);
      assert.match(test.data.error, /откроется/);
    });

    it('сегодняшняя и прошедшая дата не мешают', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, { available_from: isoInDays(0) });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[0].locked, false);
    });

    it('запертая расписанием тема не предлагается в «продолжить»', async () => {
      const { pupil, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, { available_from: isoInDays(5) });

      const { data } = await pupil('GET', '/api/me/overview');
      // Первая тема закрыта до срока — «продолжить» должно вести на следующую
      // доступную, а не на ту, где ученик упрётся в отказ.
      assert.notEqual(data.resume, null);
      assert.equal(data.resume.topic_title, 'Тема 2');
    });

    it('кривая дата отклоняется', async () => {
      const { itemIds } = await seed();
      const admin = await adminClient();

      const { status } = await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, {
        available_from: '05.09.2026',
      });
      assert.equal(status, 400);
    });

    it('дата снимается пустым значением', async () => {
      const { pupil, planId, itemIds } = await seed();
      const admin = await adminClient();

      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, { available_from: isoInDays(5) });
      await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, { available_from: '' });

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items[0].locked, false);
      assert.equal(data.items[0].available_from, null);
    });
  });

  it('пустой PATCH отклоняется', async () => {
    const { itemIds } = await seed();
    const admin = await adminClient();

    const { status } = await admin('PATCH', `/api/admin/plan-items/${itemIds[0]}`, {});
    assert.equal(status, 400);
  });

  it('без права users:write доступом не поуправляешь', async () => {
    const { itemIds } = await seed();
    await createUser('user@example.com', 'password123', 'user');
    const call = makeClient(base);
    await call('POST', '/api/auth/login', { email: 'user@example.com', password: 'password123' });

    const { status } = await call('PATCH', `/api/admin/plan-items/${itemIds[0]}`, {
      unlocked: true,
    });
    assert.equal(status, 403);
  });
});
