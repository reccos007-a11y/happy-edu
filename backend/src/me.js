// Кабинет ученика (только чтение): вошедший ученик видит собственный профиль,
// свои учебные планы и прогресс. Доступ — по принадлежности данных: без прав из
// PERMISSIONS, каждый видит только своё. Не-ученик (нет профиля) получает 404.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { STUDENT_ROLE } from './roles.js';
import { XP_PER_TOPIC, levelFromXp, streakFromDates, computeBadges } from './gamification.js';

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

// Доступ к теме внутри плана. Причины закрытия проверяются по убыванию
// «силы», и порядок здесь содержательный:
//   1. скрыта у этого ученика (hidden_at) — темы для него как бы нет;
//   2. открыта вручную (unlocked_at) — учитель разрешил забежать вперёд,
//      это перебивает и расписание, и гейт;
//   3. расписание (available_from) — откроется не раньше даты;
//   4. гейт последовательности, и только если он включён у плана: НАЧАТЬ
//      не начатую тему нельзя, пока предыдущая не зачтена. Уже начатые и
//      зачтённые не блокируются — иначе провал теста запер бы без пересдачи.
//
// Нумерация и «предыдущая» считаются только по нескрытым позициям: скрытая
// тема выпадает из цепочки, а не запирает следующую навсегда.
async function topicAccess(profileId, topicId) {
  const { rows } = await pool.query(
    `WITH plan_items AS (
       SELECT i.id, i.plan_id, i.topic_id, i.status, i.order_index,
              i.hidden_at, i.unlocked_at, i.available_from, p.sequential
       FROM learning_plan_items i
       JOIN learning_plans p ON p.id = i.plan_id
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       WHERE p.student_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
     ),
     visible AS (
       SELECT topic_id, status, unlocked_at, available_from, sequential,
              available_from IS NOT NULL AND available_from > current_date AS scheduled,
              lag(status) OVER w AS prev,
              row_number() OVER w AS rn
       FROM plan_items
       WHERE hidden_at IS NULL
       WINDOW w AS (PARTITION BY plan_id ORDER BY order_index, id)
     )
     SELECT h.hidden, v.status, v.prev, v.rn, v.unlocked_at, v.scheduled,
            v.available_from, v.sequential
     FROM (
       SELECT EXISTS (
         SELECT 1 FROM plan_items WHERE topic_id = $2 AND hidden_at IS NOT NULL
       ) AS hidden
     ) h
     LEFT JOIN visible v ON v.topic_id = $2`,
    [profileId, topicId],
  );

  const r = rows[0];
  if (r?.hidden) return { locked: true, reason: 'hidden' };
  // Темы нет ни в одном плане — доступом плана она не управляется.
  if (!r?.status) return { locked: false, reason: null };
  if (r.unlocked_at) return { locked: false, reason: null };
  if (r.scheduled) return { locked: true, reason: 'schedule', availableFrom: r.available_from };
  if (!r.sequential) return { locked: false, reason: null };
  if (r.status === 'not_started' && Number(r.rn) > 1 && r.prev !== 'completed') {
    return { locked: true, reason: 'sequence' };
  }
  return { locked: false, reason: null };
}

// Человеческий ответ на закрытую тему. Скрытая — 404: для ученика её не
// существует, и сообщать об обратном незачем.
function accessDenied(res, access) {
  if (access.reason === 'hidden') return res.status(404).json({ error: 'Тема не найдена' });
  if (access.reason === 'schedule') {
    const date = new Date(access.availableFrom).toLocaleDateString('ru-RU');
    return res.status(403).json({ error: `Тема откроется ${date}` });
  }
  return res.status(403).json({ error: 'Сначала завершите предыдущую тему' });
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
           JOIN learning_plan_items i ON i.plan_id = p.id AND i.hidden_at IS NULL
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
      // Скрытые и ещё не открытые по расписанию сюда не попадают — предлагать
      // кнопку, которая упрётся в отказ, некуда.
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
           AND i.hidden_at IS NULL
           AND (i.available_from IS NULL OR i.available_from <= current_date)
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
    const xp = topicsCompleted * XP_PER_TOPIC;

    const stats = {
      ...levelFromXp(xp),
      topicsCompleted,
      topicsTotal: totals.topics_total,
      subjectsCompleted,
      streakDays,
      badges: computeBadges({ topicsCompleted, subjectsCompleted, streakDays, bestScore }),
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
       LEFT JOIN learning_plan_items i ON i.plan_id = p.id AND i.hidden_at IS NULL
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
      `SELECT p.id, s.name AS subject_name, p.exam_type, p.status, p.start_date, p.target_date,
              p.sequential
       FROM learning_plans p JOIN subjects s ON s.id = p.subject_id
       WHERE p.id = $1 AND p.student_id = $2 AND p.deleted_at IS NULL`,
      [planId, profile.id],
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ error: 'План не найден' });

    // Скрытые позиции отсеиваются в WHERE, то есть до оконных функций, —
    // поэтому в цепочке «предыдущая тема» они не участвуют.
    const { rows: items } = await pool.query(
      `SELECT i.id, i.status, i.order_index, i.available_from, i.unlocked_at,
              t.id AS topic_id, t.title AS topic_title, t.codifier_code, t.difficulty,
              sec.title AS section_title,
              -- Причина закрытия в том же порядке, что и в topicAccess:
              -- ручное открытие → расписание → гейт последовательности.
              CASE
                WHEN i.unlocked_at IS NOT NULL THEN NULL
                WHEN i.available_from IS NOT NULL AND i.available_from > current_date
                  THEN 'schedule'
                WHEN NOT $2 THEN NULL
                WHEN i.status <> 'not_started' THEN NULL
                WHEN lag(i.status) OVER w IS NULL THEN NULL
                WHEN lag(i.status) OVER w = 'completed' THEN NULL
                ELSE 'sequence'
              END AS lock_reason
       FROM learning_plan_items i
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       JOIN sections sec ON sec.id = t.section_id
       WHERE i.plan_id = $1 AND i.hidden_at IS NULL
       WINDOW w AS (ORDER BY i.order_index, i.id)
       ORDER BY i.order_index, i.id`,
      [planId, plan.sequential],
    );
    // locked оставляем в ответе: кабинет уже на него опирается, а причина —
    // дополнение, чтобы показать «откроется 5 сентября» вместо общего замка.
    for (const item of items) item.locked = item.lock_reason !== null;
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

    const access = await topicAccess(profile.id, topicId);
    if (access.locked) return accessDenied(res, access);

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

    const access = await topicAccess(profile.id, topicId);
    if (access.locked) return accessDenied(res, access);

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
    const xpAwarded = newlyCompleted ? XP_PER_TOPIC : 0;
    const levelBefore = levelFromXp((completedAfter - (newlyCompleted ? 1 : 0)) * XP_PER_TOPIC);
    const levelAfter = levelFromXp(completedAfter * XP_PER_TOPIC);

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
