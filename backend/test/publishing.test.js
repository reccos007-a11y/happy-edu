// Публикация контента: черновик виден персоналу и невидим ученику — по всей
// цепочке предмет → раздел → тема и во всех точках, где ученик читает контент.

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
    `TRUNCATE test_attempts, question_options, questions, learning_plan_items, learning_plans,
              learning_materials, student_profiles, topics, sections, subjects
     RESTART IDENTITY CASCADE`,
  );
  await resetUsers();
});

async function loginAs(email, password, role) {
  await createUser(email, password, role);
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password });
  return call;
}

const adminClient = () => loginAs('admin@example.com', 'password123', 'admin');

// Опубликованный предмет с разделом и двумя темами + ученик с планом по ним.
async function seed() {
  const user = await createUser('pupil@example.com', 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge') RETURNING id",
    [user.id],
  );
  const { rows: subj } = await pool.query(
    `INSERT INTO subjects (name, applies_to, published_at)
     VALUES ('Биология', 'oge', now()) RETURNING id`,
  );
  const { rows: sec } = await pool.query(
    `INSERT INTO sections (subject_id, title, order_index, published_at)
     VALUES ($1, 'Раздел', 0, now()) RETURNING id`,
    [subj[0].id],
  );
  const { rows: topics } = await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index, published_at)
     VALUES ($1, 9, 'Тема 1', 0, now()), ($1, 9, 'Тема 2', 1, now()) RETURNING id`,
    [sec[0].id],
  );
  const { rows: plan } = await pool.query(
    `INSERT INTO learning_plans (student_id, subject_id, exam_type, status)
     VALUES ($1, $2, 'oge', 'active') RETURNING id`,
    [prof[0].id, subj[0].id],
  );
  await pool.query(
    `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
     VALUES ($1, $2, 0, 'completed'), ($1, $3, 1, 'not_started')`,
    [plan[0].id, topics[0].id, topics[1].id],
  );

  const pupil = makeClient(base);
  await pupil('POST', '/api/auth/login', { email: 'pupil@example.com', password: 'password123' });

  return {
    pupil,
    subjectId: subj[0].id,
    sectionId: sec[0].id,
    topicIds: topics.map((t) => t.id),
    planId: plan[0].id,
  };
}

const hide = (table, id) =>
  pool.query(`UPDATE ${table} SET published_at = NULL WHERE id = $1`, [id]);

describe('публикация контента', () => {
  it('новый предмет создаётся черновиком', async () => {
    const admin = await adminClient();
    const { status, data } = await admin('POST', '/api/catalog/subjects', { name: 'Физика' });

    assert.equal(status, 201);
    assert.equal(data.subject.published_at, null);
  });

  it('PATCH публикует и снимает с публикации', async () => {
    const admin = await adminClient();
    const { data: created } = await admin('POST', '/api/catalog/subjects', { name: 'Физика' });

    const published = await admin('PATCH', `/api/catalog/subjects/${created.subject.id}`, {
      published: true,
    });
    assert.ok(published.data.subject.published_at);

    const hidden = await admin('PATCH', `/api/catalog/subjects/${created.subject.id}`, {
      published: false,
    });
    assert.equal(hidden.data.subject.published_at, null);
  });

  describe('витрина каталога', () => {
    it('ученик не видит предмет-черновик, персонал видит', async () => {
      const { pupil, subjectId } = await seed();
      const admin = await adminClient();
      await hide('subjects', subjectId);

      const forPupil = await pupil('GET', '/api/catalog/subjects');
      assert.equal(forPupil.data.subjects.length, 0);

      const forAdmin = await admin('GET', '/api/catalog/subjects');
      assert.equal(forAdmin.data.subjects.length, 1);
      assert.equal(forAdmin.data.subjects[0].published_at, null);
    });

    it('счётчики тем считают только видимое ученику', async () => {
      const { pupil, topicIds } = await seed();
      await hide('topics', topicIds[1]);

      const { data } = await pupil('GET', '/api/catalog/subjects');
      // Иначе ученик увидел бы «2 темы», а внутри предмета — одну.
      assert.equal(data.subjects[0].topic_count, 1);
    });

    it('скрытый раздел уносит свои темы из дерева', async () => {
      const { pupil, subjectId, sectionId } = await seed();
      await hide('sections', sectionId);

      const { data } = await pupil('GET', `/api/catalog/subjects/${subjectId}`);
      assert.equal(data.sections.length, 0);
    });

    it('черновик предмета для ученика — 404, а не 403', async () => {
      const { pupil, subjectId } = await seed();
      await hide('subjects', subjectId);

      const { status } = await pupil('GET', `/api/catalog/subjects/${subjectId}`);
      assert.equal(status, 404);
    });
  });

  describe('кабинет ученика', () => {
    it('скрытая тема исчезает из плана и из общего счёта', async () => {
      const { pupil, planId, topicIds } = await seed();

      const before = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(before.data.items.length, 2);

      await hide('topics', topicIds[1]);

      const after = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(after.data.items.length, 1);

      const overview = await pupil('GET', '/api/me/overview');
      assert.equal(overview.data.stats.topicsTotal, 1);
    });

    it('скрытие темы посреди плана не запирает следующую', async () => {
      const { pupil, planId, topicIds } = await seed();
      // Третья тема после незачтённой второй: пока вторая видна, третья заперта.
      const { rows: sec } = await pool.query('SELECT section_id FROM topics WHERE id = $1', [
        topicIds[0],
      ]);
      const { rows: third } = await pool.query(
        `INSERT INTO topics (section_id, grade, title, order_index, published_at)
         VALUES ($1, 9, 'Тема 3', 2, now()) RETURNING id`,
        [sec[0].section_id],
      );
      await pool.query(
        `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
         VALUES ($1, $2, 2, 'not_started')`,
        [planId, third[0].id],
      );

      const before = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(before.data.items.at(-1).locked, true);

      // Прячем незачтённую вторую тему — третья должна открыться, а не остаться
      // запертой навсегда за исчезнувшим пунктом.
      await hide('topics', topicIds[1]);

      const after = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(after.data.items.length, 2);
      assert.equal(after.data.items.at(-1).locked, false);
    });

    it('тест скрытой темы недоступен даже по прямой ссылке', async () => {
      const { pupil, topicIds } = await seed();
      await pool.query(
        `INSERT INTO questions (topic_id, type, text, correct_short_answer, order_index)
         VALUES ($1, 'short_answer', 'Вопрос', 'да', 0)`,
        [topicIds[1]],
      );

      const open = await pupil('GET', `/api/me/topics/${topicIds[1]}/test`);
      assert.equal(open.status, 200);

      await hide('topics', topicIds[1]);

      assert.equal((await pupil('GET', `/api/me/topics/${topicIds[1]}/test`)).status, 404);
      assert.equal(
        (await pupil('POST', `/api/me/topics/${topicIds[1]}/test`, { answers: {} })).status,
        404,
      );
    });

    it('материалы скрытой темы не отдаются ученику, но видны персоналу', async () => {
      const { pupil, topicIds } = await seed();
      const admin = await adminClient();
      await pool.query(
        `INSERT INTO learning_materials (topic_id, type, title, content, order_index)
         VALUES ($1, 'text', 'Конспект', 'Текст', 0)`,
        [topicIds[0]],
      );
      await hide('topics', topicIds[0]);

      assert.equal(
        (await pupil('GET', `/api/catalog/topics/${topicIds[0]}/materials`)).status,
        404,
      );

      const forAdmin = await admin('GET', `/api/catalog/topics/${topicIds[0]}/materials`);
      assert.equal(forAdmin.status, 200);
      assert.equal(forAdmin.data.materials.length, 1);
    });

    it('скрытый предмет прячет темы, даже если сами они опубликованы', async () => {
      const { pupil, subjectId, planId } = await seed();
      await hide('subjects', subjectId);

      const { data } = await pupil('GET', `/api/me/plans/${planId}`);
      assert.equal(data.items.length, 0);
    });
  });

  describe('учебные планы', () => {
    it('новый план наполняется только опубликованными темами', async () => {
      const { subjectId, topicIds } = await seed();
      const admin = await adminClient();
      await hide('topics', topicIds[1]);

      const other = await createUser('pupil2@example.com', 'password123', 'student');
      await pool.query(
        "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge')",
        [other.id],
      );

      const created = await admin('POST', `/api/admin/students/${other.id}/plans`, {
        subject_id: subjectId,
      });
      assert.equal(created.status, 201);

      const { rows } = await pool.query(
        'SELECT count(*)::int AS c FROM learning_plan_items WHERE plan_id = $1',
        [created.data.plan.id],
      );
      assert.equal(rows[0].c, 1);
    });

    it('по неопубликованному предмету план не создаётся', async () => {
      const { subjectId } = await seed();
      const admin = await adminClient();
      await hide('subjects', subjectId);

      const other = await createUser('pupil3@example.com', 'password123', 'student');
      await pool.query(
        "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge')",
        [other.id],
      );

      const { status, data } = await admin('POST', `/api/admin/students/${other.id}/plans`, {
        subject_id: subjectId,
      });
      assert.equal(status, 400);
      assert.match(data.error, /не опубликован/);
    });
  });
});
