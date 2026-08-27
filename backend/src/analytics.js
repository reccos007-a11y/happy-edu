// Аналитика по обучению: срез по ученикам, карточка одного ученика, слабые
// места контента и общая сводка. Только чтение — под правом users:read.
//
// Собственных таблиц нет и не заводится: всё выводится из попыток тестов и
// статусов тем в планах. Отдельные счётчики пришлось бы поддерживать в
// актуальном состоянии, и первая же правка данных мимо приложения сделала бы
// отчёты неверными — а так цифры всегда следуют за фактами.

import express from 'express';
import { requireAuth, requirePermission } from './auth.js';
import { pool } from './db.js';
import { streakFromDates } from './gamification.js';
import { PERMISSIONS, STUDENT_ROLE } from './roles.js';

export const analyticsRouter = express.Router();

analyticsRouter.use(requireAuth);
analyticsRouter.use(requirePermission(PERMISSIONS.USERS_READ));

const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;
const EXAM_TYPES = ['oge', 'ege'];

function parseDays(value) {
  const days = Number(value ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
  return days;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

// Фильтры среза приходят из query и подставляются параметрами. Каждый
// необязателен, поэтому условие пишется как «фильтр не задан ИЛИ совпал» —
// так запрос остаётся одним и не собирается конкатенацией.
function parseFilters(query) {
  const grade = query.grade ? Number(query.grade) : null;
  if (grade !== null && (!Number.isInteger(grade) || grade < 8 || grade > 11)) {
    return { error: 'Класс должен быть от 8 до 11' };
  }

  const exam = query.exam || null;
  if (exam !== null && !EXAM_TYPES.includes(exam)) {
    return { error: 'Неизвестный тип экзамена' };
  }

  const subjectId = query.subject_id ? Number(query.subject_id) : null;
  if (subjectId !== null && !Number.isInteger(subjectId)) {
    return { error: 'Некорректный предмет' };
  }

  return { values: [grade, exam, subjectId] };
}

// Срез по ученикам: прогресс по планам плюс статистика попыток. Планы и
// попытки считаются отдельными подзапросами: join их напрямую размножил бы
// строки и завысил и то, и другое.
const STUDENTS_QUERY = `
  WITH progress AS (
    SELECT p.student_id,
           count(i.id)::int AS topics_total,
           count(i.id) FILTER (WHERE i.status = 'completed')::int AS topics_done
    FROM learning_plans p
    JOIN learning_plan_items i ON i.plan_id = p.id
    JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status <> 'archived'
      AND ($3::bigint IS NULL OR p.subject_id = $3)
    GROUP BY p.student_id
  ),
  attempts AS (
    SELECT a.student_id,
           count(*)::int AS attempts,
           count(*) FILTER (WHERE a.passed)::int AS attempts_passed,
           round(avg(a.score_percent), 1)::float AS avg_score,
           max(a.score_percent)::float AS best_score,
           max(a.finished_at) AS last_activity
    FROM test_attempts a
    JOIN topics t ON t.id = a.topic_id
    JOIN sections sec ON sec.id = t.section_id
    WHERE ($3::bigint IS NULL OR sec.subject_id = $3)
    GROUP BY a.student_id
  )
  SELECT u.id AS user_id, u.email, u.full_name,
         sp.id AS profile_id, sp.grade, sp.exam_type, sp.target_exam_date,
         COALESCE(pr.topics_total, 0) AS topics_total,
         COALESCE(pr.topics_done, 0)  AS topics_done,
         CASE WHEN COALESCE(pr.topics_total, 0) = 0 THEN 0
              ELSE round(pr.topics_done * 100.0 / pr.topics_total)::int
         END AS progress_percent,
         COALESCE(at.attempts, 0)        AS attempts,
         COALESCE(at.attempts_passed, 0) AS attempts_passed,
         at.avg_score,
         at.best_score,
         at.last_activity
  FROM student_profiles sp
  JOIN users u ON u.id = sp.user_id AND u.role = $4
  LEFT JOIN progress pr ON pr.student_id = sp.id
  LEFT JOIN attempts at ON at.student_id = sp.id
  WHERE sp.deleted_at IS NULL
    AND ($1::int IS NULL OR sp.grade = $1)
    AND ($2::text IS NULL OR sp.exam_type = $2)
  ORDER BY u.full_name NULLS LAST, u.email
`;

// Серию считаем в приложении: правило «сегодня или вчера, дальше без пропусков»
// уже описано в gamification.js, и дублировать его на SQL значило бы завести
// второй источник правды.
async function streaksByProfile() {
  const { rows } = await pool.query(
    `SELECT DISTINCT student_id, finished_at::date::text AS d FROM test_attempts`,
  );
  const byProfile = new Map();
  for (const row of rows) {
    if (!byProfile.has(row.student_id)) byProfile.set(row.student_id, []);
    byProfile.get(row.student_id).push(row.d);
  }
  const streaks = new Map();
  for (const [profileId, dates] of byProfile) {
    streaks.set(profileId, streakFromDates(dates));
  }
  return streaks;
}

async function studentsSlice(query) {
  const filters = parseFilters(query);
  if (filters.error) return { error: filters.error };

  const { rows } = await pool.query(STUDENTS_QUERY, [...filters.values, STUDENT_ROLE]);
  const streaks = await streaksByProfile();

  return {
    students: rows.map((row) => ({
      ...row,
      streak_days: streaks.get(row.profile_id) ?? 0,
    })),
  };
}

analyticsRouter.get('/students', async (req, res) => {
  try {
    const result = await studentsSlice(req.query);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('analytics students failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Выгрузка того же среза. Разделитель «;» и BOM — иначе русский Excel
// открывает файл одной колонкой и в кракозябрах.
const CSV_COLUMNS = [
  ['full_name', 'ФИО'],
  ['email', 'E-mail'],
  ['grade', 'Класс'],
  ['exam_type', 'Экзамен'],
  ['topics_done', 'Освоено тем'],
  ['topics_total', 'Всего тем'],
  ['progress_percent', 'Прогресс, %'],
  ['attempts', 'Попыток'],
  ['attempts_passed', 'Из них зачтено'],
  ['avg_score', 'Средний балл'],
  ['best_score', 'Лучший балл'],
  ['streak_days', 'Серия, дней'],
  ['last_activity', 'Последняя активность'],
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  // Кавычки удваиваются, а сама ячейка берётся в кавычки, если содержит
  // разделитель, кавычку или перенос строки.
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

analyticsRouter.get('/students.csv', async (req, res) => {
  try {
    const result = await studentsSlice(req.query);
    if (result.error) return res.status(400).json({ error: result.error });

    const header = CSV_COLUMNS.map(([, title]) => title).join(';');
    const lines = result.students.map((s) => CSV_COLUMNS.map(([key]) => csvCell(s[key])).join(';'));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(`\uFEFF${[header, ...lines].join('\r\n')}\r\n`);
  } catch (err) {
    console.error('analytics csv failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Общая сводка за период: сколько учеников вообще, сколько занималось,
// сколько было попыток и как в среднем их сдают.
analyticsRouter.get('/summary', async (req, res) => {
  const days = parseDays(req.query.days);
  if (days === null) return res.status(400).json({ error: 'Период — от 1 до 365 дней' });

  try {
    const [totals, period, progress] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS students
         FROM student_profiles sp JOIN users u ON u.id = sp.user_id AND u.role = $1
         WHERE sp.deleted_at IS NULL`,
        [STUDENT_ROLE],
      ),
      pool.query(
        `SELECT count(DISTINCT student_id)::int AS active_students,
                count(*)::int AS attempts,
                count(*) FILTER (WHERE passed)::int AS attempts_passed,
                round(avg(score_percent), 1)::float AS avg_score
         FROM test_attempts
         WHERE finished_at >= now() - make_interval(days => $1::int)`,
        [days],
      ),
      // Средний прогресс считаем по ученикам, а не по темам: иначе ученик с
      // огромным планом перевесил бы всех остальных.
      pool.query(
        `WITH per_student AS (
           SELECT p.student_id,
                  count(i.id)::int AS tot,
                  count(i.id) FILTER (WHERE i.status = 'completed')::int AS done
           FROM learning_plans p
           JOIN learning_plan_items i ON i.plan_id = p.id
           JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
           WHERE p.deleted_at IS NULL AND p.status <> 'archived'
           GROUP BY p.student_id
         )
         SELECT COALESCE(round(avg(done * 100.0 / NULLIF(tot, 0))), 0)::int AS avg_progress,
                COALESCE(sum(done), 0)::int AS topics_completed
         FROM per_student`,
      ),
    ]);

    res.json({
      days,
      summary: {
        ...totals.rows[0],
        ...period.rows[0],
        ...progress.rows[0],
      },
    });
  } catch (err) {
    console.error('analytics summary failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Слабые места контента: где ученики буксуют. Тема попадает в отчёт, только
// если по ней вообще были попытки — «ноль попыток» говорит о плане, а не о
// качестве материала.
analyticsRouter.get('/topics', async (req, res) => {
  const subjectId = req.query.subject_id ? parseId(req.query.subject_id) : null;
  if (req.query.subject_id && subjectId === null) {
    return res.status(400).json({ error: 'Некорректный предмет' });
  }

  try {
    const { rows } = await pool.query(
      `WITH by_student AS (
         SELECT a.topic_id, a.student_id,
                count(*)::int AS attempts,
                bool_or(a.passed) AS passed
         FROM test_attempts a
         GROUP BY a.topic_id, a.student_id
       )
       SELECT t.id AS topic_id, t.title AS topic_title, t.difficulty,
              sec.title AS section_title, s.name AS subject_name,
              count(DISTINCT a.student_id)::int AS students,
              count(a.id)::int AS attempts,
              round(avg(a.score_percent), 1)::float AS avg_score,
              count(a.id) FILTER (WHERE a.passed)::int AS attempts_passed,
              round(count(a.id) FILTER (WHERE a.passed) * 100.0 / count(a.id))::int AS pass_rate,
              -- Сколько попыток в среднем нужно ученику, чтобы закрыть тему.
              -- Считаем только по тем, кто её всё-таки закрыл: у застрявших
              -- счётчик ещё растёт и занизил бы картину.
              (SELECT round(avg(attempts), 1)::float FROM by_student b
                WHERE b.topic_id = t.id AND b.passed) AS avg_attempts_to_pass,
              (SELECT count(*)::int FROM by_student b
                WHERE b.topic_id = t.id AND NOT b.passed) AS stuck_students
       FROM test_attempts a
       JOIN topics t ON t.id = a.topic_id AND t.deleted_at IS NULL
       JOIN sections sec ON sec.id = t.section_id
       JOIN subjects s ON s.id = sec.subject_id
       WHERE ($1::bigint IS NULL OR s.id = $1)
       GROUP BY t.id, t.title, t.difficulty, sec.title, s.name
       ORDER BY pass_rate, avg_score, attempts DESC`,
      [subjectId],
    );
    res.json({ topics: rows });
  } catch (err) {
    console.error('analytics topics failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Карточка одного ученика: планы, история попыток и темы, на которых он застрял.
analyticsRouter.get('/students/:userId', async (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const { rows: profileRows } = await pool.query(
      `SELECT sp.id, sp.grade, sp.exam_type, sp.target_exam_date,
              u.id AS user_id, u.email, u.full_name, u.created_at
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id AND u.role = $2
       WHERE sp.user_id = $1 AND sp.deleted_at IS NULL`,
      [userId, STUDENT_ROLE],
    );
    const profile = profileRows[0];
    if (!profile) return res.status(404).json({ error: 'Ученик не найден' });

    const [plans, attempts, stuck, activity] = await Promise.all([
      pool.query(
        `SELECT p.id, s.name AS subject_name, p.status,
                count(i.id)::int AS topics_total,
                count(i.id) FILTER (WHERE i.status = 'completed')::int AS topics_done
         FROM learning_plans p
         JOIN subjects s ON s.id = p.subject_id
         LEFT JOIN learning_plan_items i ON i.plan_id = p.id
         LEFT JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
         WHERE p.student_id = $1 AND p.deleted_at IS NULL
         GROUP BY p.id, s.name
         ORDER BY p.created_at`,
        [profile.id],
      ),
      // Последние попытки — история «как шло», а не полный лог: для разбора
      // хватает свежих, а список на тысячу строк в диалоге бесполезен.
      pool.query(
        `SELECT a.id, a.score_percent::float, a.passed, a.finished_at,
                t.title AS topic_title, sec.title AS section_title, s.name AS subject_name
         FROM test_attempts a
         JOIN topics t ON t.id = a.topic_id
         JOIN sections sec ON sec.id = t.section_id
         JOIN subjects s ON s.id = sec.subject_id
         WHERE a.student_id = $1
         ORDER BY a.finished_at DESC
         LIMIT 50`,
        [profile.id],
      ),
      // Застрял = попытки были, зачёта нет.
      pool.query(
        `SELECT t.id AS topic_id, t.title AS topic_title, sec.title AS section_title,
                count(*)::int AS attempts,
                max(a.score_percent)::float AS best_score,
                max(a.finished_at) AS last_attempt
         FROM test_attempts a
         JOIN topics t ON t.id = a.topic_id AND t.deleted_at IS NULL
         JOIN sections sec ON sec.id = t.section_id
         WHERE a.student_id = $1
         GROUP BY t.id, t.title, sec.title
         HAVING bool_or(a.passed) = false
         ORDER BY count(*) DESC, max(a.finished_at) DESC`,
        [profile.id],
      ),
      // Помесячная активность за год — для графика динамики.
      pool.query(
        `SELECT to_char(date_trunc('month', finished_at), 'YYYY-MM') AS month,
                count(*)::int AS attempts,
                round(avg(score_percent), 1)::float AS avg_score
         FROM test_attempts
         WHERE student_id = $1 AND finished_at >= now() - interval '1 year'
         GROUP BY 1 ORDER BY 1`,
        [profile.id],
      ),
    ]);

    const dates = attempts.rows.map((a) => new Date(a.finished_at).toISOString().slice(0, 10));

    res.json({
      profile,
      plans: plans.rows,
      attempts: attempts.rows,
      stuck: stuck.rows,
      activity: activity.rows,
      streak_days: streakFromDates(dates),
    });
  } catch (err) {
    console.error('analytics student failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});
