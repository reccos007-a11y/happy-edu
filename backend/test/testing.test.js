// Тестирование: управление вопросами (content:write), прохождение теста
// учеником с автопроверкой и автоматическим зачётом темы плана.

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
       student_profiles, topics, sections, subjects RESTART IDENTITY CASCADE`,
  );
  await resetUsers();
});

async function client(email, role) {
  await createUser(email, 'password123', role);
  return login(email);
}

// Логин уже существующего пользователя (напр. ученика, заведённого в seed).
async function login(email) {
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password: 'password123' });
  return call;
}

// Ученик с планом по теме, у которой заведём вопросы.
async function seed() {
  const user = await createUser('pupil@example.com', 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 8, 'oge') RETURNING id",
    [user.id],
  );
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ('Биология', 'both') RETURNING id",
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title) VALUES ($1, 'Раздел') RETURNING id",
    [subj[0].id],
  );
  const { rows: topic } = await pool.query(
    "INSERT INTO topics (section_id, grade, title) VALUES ($1, 8, 'Клетка') RETURNING id",
    [sec[0].id],
  );
  const { rows: plan } = await pool.query(
    "INSERT INTO learning_plans (student_id, subject_id, exam_type) VALUES ($1, $2, 'oge') RETURNING id",
    [prof[0].id, subj[0].id],
  );
  const { rows: item } = await pool.query(
    'INSERT INTO learning_plan_items (plan_id, topic_id, order_index) VALUES ($1, $2, 0) RETURNING id',
    [plan[0].id, topic[0].id],
  );
  return { topicId: topic[0].id, planItemId: item[0].id };
}

// Заводит два вопроса одиночного выбора через API администратора.
async function addQuestions(admin, topicId) {
  await admin('POST', `/api/catalog/topics/${topicId}/questions`, {
    type: 'single_choice',
    text: 'Что хранит наследственную информацию?',
    options: [
      { option_text: 'Ядро', is_correct: true },
      { option_text: 'Мембрана', is_correct: false },
    ],
  });
  await admin('POST', `/api/catalog/topics/${topicId}/questions`, {
    type: 'single_choice',
    text: 'Энергетические станции клетки?',
    options: [
      { option_text: 'Митохондрии', is_correct: true },
      { option_text: 'Рибосомы', is_correct: false },
    ],
  });
}

// Получить id вопросов и id правильных вариантов (для формирования ответов).
async function correctAnswers(topicId) {
  const { rows } = await pool.query(
    `SELECT q.id AS qid, o.id AS oid
     FROM questions q JOIN question_options o ON o.question_id = q.id
     WHERE q.topic_id = $1 AND o.is_correct = true ORDER BY q.order_index, q.id`,
    [topicId],
  );
  return rows;
}

describe('тестирование', () => {
  it('без права content:write вопрос не создать (403)', async () => {
    const { topicId } = await seed();
    const user = await client('user@example.com', 'user');
    const { status } = await user('POST', `/api/catalog/topics/${topicId}/questions`, {
      type: 'single_choice',
      text: 'Q',
      options: [
        { option_text: 'a', is_correct: true },
        { option_text: 'b', is_correct: false },
      ],
    });
    assert.equal(status, 403);
  });

  it('одиночный выбор без правильного варианта отклоняется', async () => {
    const { topicId } = await seed();
    const admin = await client('admin@example.com', 'admin');
    const { status } = await admin('POST', `/api/catalog/topics/${topicId}/questions`, {
      type: 'single_choice',
      text: 'Q',
      options: [
        { option_text: 'a', is_correct: false },
        { option_text: 'b', is_correct: false },
      ],
    });
    assert.equal(status, 400);
  });

  it('ученик получает вопросы без правильных ответов', async () => {
    const { topicId } = await seed();
    const admin = await client('admin@example.com', 'admin');
    await addQuestions(admin, topicId);

    const pupil = await login('pupil@example.com');
    const { status, data } = await pupil('GET', `/api/me/topics/${topicId}/test`);
    assert.equal(status, 200);
    assert.equal(data.questions.length, 2);
    // В вариантах не должно быть признака правильности.
    assert.ok(data.questions[0].options.every((o) => !('is_correct' in o)));
  });

  it('верные ответы дают зачёт и отмечают тему освоенной', async () => {
    const { topicId, planItemId } = await seed();
    const admin = await client('admin@example.com', 'admin');
    await addQuestions(admin, topicId);
    const correct = await correctAnswers(topicId);

    const pupil = await login('pupil@example.com');
    const answers = {};
    for (const r of correct) answers[r.qid] = { selected: [r.oid] };

    const { status, data } = await pupil('POST', `/api/me/topics/${topicId}/test`, { answers });
    assert.equal(status, 200);
    assert.equal(data.percent, 100);
    assert.equal(data.passed, true);

    const { rows } = await pool.query('SELECT status FROM learning_plan_items WHERE id = $1', [
      planItemId,
    ]);
    assert.equal(rows[0].status, 'completed', 'тема должна стать освоенной');
  });

  it('неверные ответы — не зачёт, тема на повторение', async () => {
    const { topicId, planItemId } = await seed();
    const admin = await client('admin@example.com', 'admin');
    await addQuestions(admin, topicId);
    const correct = await correctAnswers(topicId);

    const pupil = await login('pupil@example.com');
    // Отвечаем только на первый вопрос верно (50% < порога).
    const answers = { [correct[0].qid]: { selected: [correct[0].oid] } };

    const { data } = await pupil('POST', `/api/me/topics/${topicId}/test`, { answers });
    assert.equal(data.passed, false);
    assert.equal(data.percent, 50);

    const { rows } = await pool.query('SELECT status FROM learning_plan_items WHERE id = $1', [
      planItemId,
    ]);
    assert.equal(rows[0].status, 'needs_review');
  });
});
