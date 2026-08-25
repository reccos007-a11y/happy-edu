// Кабинет ученика (только чтение): вошедший ученик видит собственный профиль,
// свои учебные планы и прогресс. Доступ — по принадлежности данных: без прав из
// PERMISSIONS, каждый видит только своё. Не-ученик (нет профиля) получает 404.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { STUDENT_ROLE } from './roles.js';

export const meRouter = express.Router();

meRouter.use(requireAuth);

// Порог зачёта тематического теста.
const PASS_PERCENT = 70;

const normalize = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Профиль ученика по вошедшему пользователю; null, если это не ученик.
async function ownProfile(userId) {
  const { rows } = await pool.query(
    `SELECT sp.id, sp.grade, sp.exam_type, sp.target_exam_date, u.full_name
     FROM student_profiles sp JOIN users u ON u.id = sp.user_id
     WHERE sp.user_id = $1 AND sp.deleted_at IS NULL AND u.role = $2`,
    [userId, STUDENT_ROLE],
  );
  return rows[0] ?? null;
}

meRouter.get('/profile', async (req, res) => {
  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });
    res.json({ profile });
  } catch (err) {
    console.error('me profile failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

meRouter.get('/plans', async (req, res) => {
  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });

    const { rows } = await pool.query(
      `SELECT p.id, p.subject_id, s.name AS subject_name, p.exam_type, p.status,
              p.start_date, p.target_date,
              count(i.id)::int AS topics_total,
              count(i.id) FILTER (WHERE i.status = 'completed')::int AS topics_done
       FROM learning_plans p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN learning_plan_items i ON i.plan_id = p.id
       WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
       GROUP BY p.id, s.name
       ORDER BY p.created_at`,
      [profile.id],
    );
    res.json({ plans: rows });
  } catch (err) {
    console.error('me plans failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

meRouter.get('/plans/:planId', async (req, res) => {
  const planId = Number(req.params.planId);
  if (!Number.isInteger(planId)) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });

    // Принадлежность: план виден только своему ученику.
    const planResult = await pool.query(
      `SELECT p.id, s.name AS subject_name, p.exam_type, p.status, p.start_date, p.target_date
       FROM learning_plans p JOIN subjects s ON s.id = p.subject_id
       WHERE p.id = $1 AND p.student_id = $2 AND p.deleted_at IS NULL`,
      [planId, profile.id],
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ error: 'План не найден' });

    const { rows: items } = await pool.query(
      `SELECT i.id, i.status, i.order_index,
              t.id AS topic_id, t.title AS topic_title, t.codifier_code, t.difficulty,
              sec.title AS section_title
       FROM learning_plan_items i
       JOIN topics t ON t.id = i.topic_id
       JOIN sections sec ON sec.id = t.section_id
       WHERE i.plan_id = $1
       ORDER BY i.order_index, i.id`,
      [planId],
    );
    res.json({ plan, items });
  } catch (err) {
    console.error('me plan failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Тест по теме — вопросы БЕЗ правильных ответов (их знает только сервер).
meRouter.get('/topics/:topicId/test', async (req, res) => {
  const topicId = Number(req.params.topicId);
  if (!Number.isInteger(topicId)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });

    const { rows: questions } = await pool.query(
      `SELECT id, type, text, order_index FROM questions
       WHERE topic_id = $1 AND deleted_at IS NULL ORDER BY order_index, id`,
      [topicId],
    );
    const ids = questions.map((q) => q.id);
    let options = [];
    if (ids.length) {
      ({ rows: options } = await pool.query(
        // Без is_correct — правильные ответы не отдаём до проверки.
        `SELECT id, question_id, option_text, order_index
         FROM question_options WHERE question_id = ANY($1) ORDER BY order_index, id`,
        [ids],
      ));
    }
    const byQuestion = new Map(questions.map((q) => [q.id, { ...q, options: [] }]));
    for (const o of options) byQuestion.get(o.question_id)?.options.push(o);
    res.json({ questions: [...byQuestion.values()] });
  } catch (err) {
    console.error('me test get failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Отправка ответов: проверка на сервере, запись попытки; при зачёте тема плана
// автоматически отмечается освоенной.
meRouter.post('/topics/:topicId/test', async (req, res) => {
  const topicId = Number(req.params.topicId);
  if (!Number.isInteger(topicId)) return res.status(400).json({ error: 'Некорректный id' });
  const answers = req.body?.answers ?? {};

  const client = await pool.connect();
  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });

    const { rows: questions } = await client.query(
      `SELECT id, type, correct_short_answer FROM questions
       WHERE topic_id = $1 AND deleted_at IS NULL`,
      [topicId],
    );
    if (questions.length === 0) return res.status(400).json({ error: 'В теме нет вопросов' });

    const { rows: correctOptions } = await client.query(
      `SELECT question_id, id FROM question_options
       WHERE question_id = ANY($1) AND is_correct = true`,
      [questions.map((q) => q.id)],
    );
    const correctByQuestion = new Map();
    for (const o of correctOptions) {
      if (!correctByQuestion.has(o.question_id)) correctByQuestion.set(o.question_id, new Set());
      correctByQuestion.get(o.question_id).add(Number(o.id));
    }

    // Проверка каждого вопроса: балл 1 (полностью верно) или 0.
    const results = {};
    let correct = 0;
    for (const q of questions) {
      const given = answers[q.id] ?? {};
      let ok = false;
      if (q.type === 'short_answer') {
        ok =
          normalize(given.text) !== '' &&
          normalize(given.text) === normalize(q.correct_short_answer);
      } else {
        const selected = new Set((given.selected ?? []).map(Number));
        const need = correctByQuestion.get(q.id) ?? new Set();
        ok = selected.size === need.size && [...need].every((id) => selected.has(id));
      }
      if (ok) correct += 1;
      results[q.id] = ok;
    }

    const percent = Math.round((correct / questions.length) * 100);
    const passed = percent >= PASS_PERCENT;

    // Позиция плана этого ученика для темы — чтобы привязать попытку и отметить зачёт.
    const { rows: planItem } = await client.query(
      `SELECT i.id FROM learning_plan_items i
       JOIN learning_plans p ON p.id = i.plan_id
       WHERE p.student_id = $1 AND i.topic_id = $2 AND p.deleted_at IS NULL
       LIMIT 1`,
      [profile.id, topicId],
    );
    const planItemId = planItem[0]?.id ?? null;

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO test_attempts (student_id, topic_id, plan_item_id, score_percent, passed)
       VALUES ($1, $2, $3, $4, $5)`,
      [profile.id, topicId, planItemId, percent, passed],
    );
    // Зачёт двигает статус темы; при неудаче — помечаем на повторение, если ещё не освоена.
    if (planItemId) {
      if (passed) {
        await client.query(
          "UPDATE learning_plan_items SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1",
          [planItemId],
        );
      } else {
        await client.query(
          "UPDATE learning_plan_items SET status = 'needs_review', updated_at = now() WHERE id = $1 AND status <> 'completed'",
          [planItemId],
        );
      }
    }
    await client.query('COMMIT');

    res.json({ percent, passed, correct, total: questions.length, results });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('me test submit failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});
