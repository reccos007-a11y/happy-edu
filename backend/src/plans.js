// Учебные планы: администратор назначает ученику план по предмету. План
// наполняется темами предмета в порядке прохождения; у каждой темы — статус
// изучения. Управление — под правом users:write (как ведение учеников).

import express from 'express';
import { requireAuth, requirePermission } from './auth.js';
import { pool } from './db.js';
import { PERMISSIONS, STUDENT_ROLE } from './roles.js';

export const plansRouter = express.Router();

plansRouter.use(requireAuth);

const canRead = requirePermission(PERMISSIONS.USERS_READ);
const canWrite = requirePermission(PERMISSIONS.USERS_WRITE);

const PLAN_STATUS = ['draft', 'active', 'completed', 'archived'];
const ITEM_STATUS = ['not_started', 'in_progress', 'completed', 'needs_review'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

// Профиль ученика по user_id (учётной записи).
async function findProfile(userId) {
  const { rows } = await pool.query(
    `SELECT sp.id, sp.exam_type
     FROM student_profiles sp JOIN users u ON u.id = sp.user_id
     WHERE sp.user_id = $1 AND sp.deleted_at IS NULL AND u.role = $2`,
    [userId, STUDENT_ROLE],
  );
  return rows[0] ?? null;
}

// Список планов ученика с прогрессом (освоено тем из общего числа).
plansRouter.get('/students/:userId/plans', canRead, async (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const profile = await findProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Ученик не найден' });

    const { rows } = await pool.query(
      `SELECT p.id, p.subject_id, s.name AS subject_name, p.exam_type, p.status,
              p.start_date, p.target_date,
              count(ti.id)::int AS topics_total,
              count(ti.id) FILTER (WHERE i.status = 'completed')::int AS topics_done
       FROM learning_plans p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN learning_plan_items i ON i.plan_id = p.id
       LEFT JOIN topics ti ON ti.id = i.topic_id AND ti.deleted_at IS NULL
       WHERE p.student_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id, s.name
       ORDER BY p.created_at`,
      [profile.id],
    );
    res.json({ plans: rows });
  } catch (err) {
    console.error('plans list failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Назначить ученику план по предмету — наполняется темами предмета по порядку.
plansRouter.post('/students/:userId/plans', canWrite, async (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ error: 'Некорректный id' });
  const subjectId = parseId(req.body?.subject_id);
  if (subjectId === null) return res.status(400).json({ error: 'Не указан предмет' });
  const targetDate = req.body?.target_date || null;

  const client = await pool.connect();
  try {
    const profile = await findProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Ученик не найден' });

    const subject = await client.query(
      'SELECT id, published_at FROM subjects WHERE id = $1 AND deleted_at IS NULL',
      [subjectId],
    );
    if (!subject.rows[0]) return res.status(404).json({ error: 'Предмет не найден' });
    // По черновику план вышел бы пустым и молча: лучше сказать прямо.
    if (!subject.rows[0].published_at) {
      return res.status(400).json({ error: 'Предмет не опубликован — план будет пустым' });
    }

    const examType = req.body?.exam_type ?? profile.exam_type;

    await client.query('BEGIN');
    const { rows: planRows } = await client.query(
      `INSERT INTO learning_plans (student_id, subject_id, exam_type, target_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [profile.id, subjectId, examType, targetDate, req.user.id],
    );
    const planId = planRows[0].id;

    // Наполняем опубликованными темами предмета в порядке разделов и тем.
    // Черновики в план не попадают: иначе ученик получил бы пункт, который в
    // кабинете не отображается, и план бы никогда не закрылся.
    await client.query(
      `INSERT INTO learning_plan_items (plan_id, topic_id, order_index)
       SELECT $1, t.id, row_number() OVER (ORDER BY sec.order_index, sec.id, t.order_index, t.id) - 1
       FROM topics t
       JOIN sections sec ON sec.id = t.section_id AND sec.deleted_at IS NULL
       WHERE sec.subject_id = $2 AND t.deleted_at IS NULL
         AND t.published_at IS NOT NULL AND sec.published_at IS NOT NULL`,
      [planId, subjectId],
    );
    await client.query('COMMIT');

    res.status(201).json({ plan: { id: planId } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'У ученика уже есть план по этому предмету' });
    }
    console.error('plans create failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});

// План с темами и их статусами.
plansRouter.get('/plans/:planId', canRead, async (req, res) => {
  const planId = parseId(req.params.planId);
  if (planId === null) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const planResult = await pool.query(
      `SELECT p.id, p.subject_id, s.name AS subject_name, p.exam_type, p.status,
              p.start_date, p.target_date
       FROM learning_plans p JOIN subjects s ON s.id = p.subject_id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [planId],
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ error: 'План не найден' });

    const { rows: items } = await pool.query(
      `SELECT i.id, i.status, i.order_index,
              t.id AS topic_id, t.title AS topic_title, t.codifier_code, t.difficulty,
              sec.title AS section_title
       FROM learning_plan_items i
       JOIN topics t ON t.id = i.topic_id AND t.deleted_at IS NULL
       JOIN sections sec ON sec.id = t.section_id
       WHERE i.plan_id = $1
       ORDER BY i.order_index, i.id`,
      [planId],
    );
    res.json({ plan, items });
  } catch (err) {
    console.error('plan get failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Изменить план: статус и целевую дату.
plansRouter.patch('/plans/:planId', canWrite, async (req, res) => {
  const planId = parseId(req.params.planId);
  if (planId === null) return res.status(400).json({ error: 'Некорректный id' });
  const body = req.body ?? {};

  const sets = [];
  const vals = [];
  if ('status' in body) {
    if (!PLAN_STATUS.includes(body.status))
      return res.status(400).json({ error: 'Некорректный статус' });
    vals.push(body.status);
    sets.push(`status = $${vals.length}`);
  }
  if ('target_date' in body) {
    vals.push(body.target_date || null);
    sets.push(`target_date = $${vals.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Нет полей для изменения' });

  vals.push(planId);
  try {
    const { rows } = await pool.query(
      `UPDATE learning_plans SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length} AND deleted_at IS NULL
       RETURNING id, status, target_date`,
      vals,
    );
    if (!rows[0]) return res.status(404).json({ error: 'План не найден' });
    res.json({ plan: rows[0] });
  } catch (err) {
    console.error('plan update failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Мягкое удаление плана (позиции остаются в истории).
plansRouter.delete('/plans/:planId', canWrite, async (req, res) => {
  const planId = parseId(req.params.planId);
  if (planId === null) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const { rows } = await pool.query(
      'UPDATE learning_plans SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [planId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'План не найден' });
    res.json({ ok: true });
  } catch (err) {
    console.error('plan delete failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Статус темы в плане. completed проставляет отметку времени завершения.
plansRouter.patch('/plan-items/:itemId', canWrite, async (req, res) => {
  const itemId = parseId(req.params.itemId);
  if (itemId === null) return res.status(400).json({ error: 'Некорректный id' });
  const { status } = req.body ?? {};
  if (!ITEM_STATUS.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });

  const completedAt = status === 'completed' ? 'now()' : 'NULL';
  try {
    const { rows } = await pool.query(
      `UPDATE learning_plan_items
       SET status = $1, completed_at = ${completedAt}, updated_at = now()
       WHERE id = $2
       RETURNING id, status, completed_at`,
      [status, itemId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Тема плана не найдена' });
    res.json({ item: rows[0] });
  } catch (err) {
    console.error('plan item update failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});
