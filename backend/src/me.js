// Кабинет ученика (только чтение): вошедший ученик видит собственный профиль,
// свои учебные планы и прогресс. Доступ — по принадлежности данных: без прав из
// PERMISSIONS, каждый видит только своё. Не-ученик (нет профиля) получает 404.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { STUDENT_ROLE } from './roles.js';

export const meRouter = express.Router();

meRouter.use(requireAuth);

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
              t.title AS topic_title, t.codifier_code, t.difficulty,
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
