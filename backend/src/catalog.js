// Каталог учебного контента (только чтение): витрина предметов и дерево
// разделов с темами. Доступен любому вошедшему пользователю; управление
// контентом (CRUD) появится отдельно, под своим правом.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';

export const catalogRouter = express.Router();

catalogRouter.use(requireAuth);

// Список предметов со счётчиками разделов и тем — для витрины каталога.
catalogRouter.get('/subjects', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id,
              s.name,
              s.applies_to,
              s.has_levels,
              count(DISTINCT sec.id)::int AS section_count,
              count(t.id)::int            AS topic_count
       FROM subjects s
       LEFT JOIN sections sec ON sec.subject_id = s.id AND sec.deleted_at IS NULL
       LEFT JOIN topics t     ON t.section_id = sec.id AND t.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY s.id
       ORDER BY s.order_index, s.name`,
    );
    res.json({ subjects: rows });
  } catch (err) {
    console.error('catalog list subjects failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Предмет с деревом: разделы по порядку, внутри — темы по порядку.
catalogRouter.get('/subjects/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const subjectResult = await pool.query(
      'SELECT id, name, applies_to, has_levels FROM subjects WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    const subject = subjectResult.rows[0];
    if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

    // Разделы и темы одним запросом; собираем дерево в приложении, сохраняя
    // порядок order_index. Разделы без тем тоже попадают в ответ.
    const { rows } = await pool.query(
      `SELECT sec.id           AS section_id,
              sec.title        AS section_title,
              sec.order_index  AS section_order,
              t.id             AS topic_id,
              t.title          AS topic_title,
              t.grade          AS topic_grade,
              t.codifier_code  AS topic_codifier,
              t.difficulty     AS topic_difficulty,
              t.order_index    AS topic_order
       FROM sections sec
       LEFT JOIN topics t ON t.section_id = sec.id AND t.deleted_at IS NULL
       WHERE sec.subject_id = $1 AND sec.deleted_at IS NULL
       ORDER BY sec.order_index, sec.id, t.order_index, t.id`,
      [id],
    );

    const sections = [];
    const byId = new Map();
    for (const r of rows) {
      let section = byId.get(r.section_id);
      if (!section) {
        section = { id: r.section_id, title: r.section_title, topics: [] };
        byId.set(r.section_id, section);
        sections.push(section);
      }
      if (r.topic_id) {
        section.topics.push({
          id: r.topic_id,
          title: r.topic_title,
          grade: r.topic_grade,
          codifier_code: r.topic_codifier,
          difficulty: r.topic_difficulty,
        });
      }
    }

    res.json({ subject, sections });
  } catch (err) {
    console.error('catalog get subject failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});
