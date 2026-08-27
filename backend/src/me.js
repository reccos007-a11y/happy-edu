// Кабинет ученика (только чтение): вошедший ученик видит собственный профиль,
// свои учебные планы и прогресс. Доступ — по принадлежности данных: без прав из
// PERMISSIONS, каждый видит только своё. Не-ученик (нет профиля) получает 404.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { STUDENT_ROLE } from './roles.js';
import { levelFromXp, streakFromDates, computeBadges } from './gamification.js';
import { getGamificationSettings } from './settings.js';

export const meRouter = express.Router();

meRouter.use(requireAuth);

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

// Последовательное открытие тем: НАЧАТЬ (не начатую) тему нельзя, пока предыдущая
// в плане не зачтена. Уже начатые (в процессе / на повторение) и зачтённые темы
// остаются доступными — иначе провал теста запер бы ученика без права пересдачи.
async function topicLocked(profileId, topicId) {
  const { rows } = await pool.query(
    `WITH ord AS (
       SELECT i.topic_id, i.status,
              lag(i.status) OVER (PARTITION BY i.plan_id ORDER BY i.order_index, i.id) AS prev,
              row_number() OVER (PARTITION BY i.plan_id ORDER BY i.order_index, i.id) AS rn
       FROM learning_plan_items i
       JOIN learning_plans p ON p.id = i.plan_id
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
     )
     SELECT status, prev, rn FROM ord WHERE topic_id = $2 LIMIT 1`,
    [profileId, topicId],
  );
  const r = rows[0];
  if (!r) return false; // темы нет в планах — гейт не применяем
  return r.status === 'not_started' && Number(r.rn) > 1 && r.prev !== 'completed';
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

// Сводка кабинета для геймификации: XP/уровень/серия/значки — всё выведено из уже
// существующих данных (освоенные темы, попытки тестов), плюс «продолжить с того же
// места». Никаких отдельных счётчиков в БД.
meRouter.get('/overview', async (req, res) => {
  try {
    const profile = await ownProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Профиль ученика не найден' });

    const [totalsRes, datesRes, bestRes, resumeRes] = await Promise.all([
      // Итоги по всем активным планам ученика + число полностью пройденных предметов.
      pool.query(
        `WITH plan_stats AS (
           SELECT p.id,
                  count(t.id)::int AS tot,
                  count(t.id) FILTER (WHERE i.status = 'completed')::int AS done
           FROM learning_plans p
           JOIN learning_plan_items i ON i.plan_id = p.id
           JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
           WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
           GROUP BY p.id
         )
         SELECT COALESCE(sum(done), 0)::int AS topics_completed,
                COALESCE(sum(tot), 0)::int AS topics_total,
                count(*) FILTER (WHERE tot > 0 AND tot = done)::int AS subjects_completed
         FROM plan_stats`,
        [profile.id],
      ),
      // Дни с активностью (для серии).
      pool.query(
        `SELECT DISTINCT finished_at::date::text AS d
         FROM test_attempts WHERE student_id = $1`,
        [profile.id],
      ),
      // Лучший результат теста (для значка «Отличник»).
      pool.query(
        `SELECT COALESCE(MAX(score_percent), 0)::float AS best
         FROM test_attempts WHERE student_id = $1`,
        [profile.id],
      ),
      // «Продолжить»: первая незакрытая тема по порядку (уже начатые — вперёд).
      // Первая незакрытая в плане всегда доступна: всё до неё уже зачтено.
      pool.query(
        `SELECT p.id AS plan_id, s.name AS subject_name,
                t.id AS topic_id, t.title AS topic_title, sec.title AS section_title,
                i.status
         FROM learning_plans p
         JOIN learning_plan_items i ON i.plan_id = p.id
         JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
         JOIN sections sec ON sec.id = t.section_id
         JOIN subjects s ON s.id = p.subject_id
         WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
           AND i.status <> 'completed'
         ORDER BY (i.status IN ('in_progress', 'needs_review')) DESC,
                  p.created_at, i.order_index, i.id
         LIMIT 1`,
        [profile.id],
      ),
    ]);

    const totals = totalsRes.rows[0];
    const topicsCompleted = totals.topics_completed;
    const subjectsCompleted = totals.subjects_completed;
    const streakDays = streakFromDates(datesRes.rows.map((r) => r.d));
    const bestScore = Number(bestRes.rows[0].best);
    const rules = await getGamificationSettings();
    const xp = topicsCompleted * rules.xpPerTopic;

    const stats = {
      ...levelFromXp(xp, rules.levels),
      topicsCompleted,
      topicsTotal: totals.topics_total,
      subjectsCompleted,
      streakDays,
      badges: computeBadges(
        { topicsCompleted, subjectsCompleted, streakDays, bestScore },
        rules.badges,
      ),
    };

    res.json({ profile, stats, resume: resumeRes.rows[0] ?? null });
  } catch (err) {
    console.error('me overview failed:', err);
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
              count(ti.id)::int AS topics_total,
              count(ti.id) FILTER (WHERE i.status = 'completed')::int AS topics_done
       FROM learning_plans p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN learning_plan_items i ON i.plan_id = p.id
       LEFT JOIN topics ti ON ti.id = i.topic_id AND ti.deleted_at IS NULL
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
              sec.title AS section_title,
              -- Тема заблокирована, если её ещё не начинали, а предыдущая в плане
              -- не зачтена. Первая тема и уже начатые/зачтённые не блокируются.
              CASE
                WHEN i.status <> 'not_started' THEN false
                WHEN lag(i.status) OVER w IS NULL THEN false
                WHEN lag(i.status) OVER w = 'completed' THEN false
                ELSE true
              END AS locked
       FROM learning_plan_items i
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       JOIN sections sec ON sec.id = t.section_id
       WHERE i.plan_id = $1
       WINDOW w AS (ORDER BY i.order_index, i.id)
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

    if (await topicLocked(profile.id, topicId)) {
      return res.status(403).json({ error: 'Сначала завершите предыдущую тему' });
    }

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

    if (await topicLocked(profile.id, topicId)) {
      return res.status(403).json({ error: 'Сначала завершите предыдущую тему' });
    }

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

    // Правила читаем до BEGIN: запрос идёт мимо транзакции, на отдельном соединении.
    const rules = await getGamificationSettings();
    const percent = Math.round((correct / questions.length) * 100);
    const passed = percent >= rules.passPercent;

    // Позиция плана этого ученика для темы — чтобы привязать попытку и отметить зачёт.
    const { rows: planItem } = await client.query(
      `SELECT i.id, i.status FROM learning_plan_items i
       JOIN learning_plans p ON p.id = i.plan_id
       WHERE p.student_id = $1 AND i.topic_id = $2 AND p.deleted_at IS NULL
       LIMIT 1`,
      [profile.id, topicId],
    );
    const planItemId = planItem[0]?.id ?? null;
    // Начисляем XP только при ПЕРВОМ зачёте темы (статус completed терминальный).
    const newlyCompleted = passed && planItemId != null && planItem[0].status !== 'completed';

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

    // Справочные поля для экрана результата: XP за эту тему и уровень после зачёта.
    // XP выведен из числа освоенных тем, поэтому считаем completed до/после.
    const { rows: cnt } = await client.query(
      `SELECT count(*) FILTER (WHERE i.status = 'completed')::int AS c
       FROM learning_plans p
       JOIN learning_plan_items i ON i.plan_id = p.id
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'`,
      [profile.id],
    );
    const completedAfter = cnt[0].c;
    const xpAwarded = newlyCompleted ? rules.xpPerTopic : 0;
    const levelBefore = levelFromXp(
      (completedAfter - (newlyCompleted ? 1 : 0)) * rules.xpPerTopic,
      rules.levels,
    );
    const levelAfter = levelFromXp(completedAfter * rules.xpPerTopic, rules.levels);

    res.json({
      percent,
      passed,
      correct,
      total: questions.length,
      results,
      xpAwarded,
      leveledUp: levelAfter.level > levelBefore.level,
      level: levelAfter,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('me test submit failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});
