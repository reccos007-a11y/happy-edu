// Каталог учебного контента (только чтение): витрина предметов и дерево
// разделов с темами. Доступен любому вошедшему пользователю; управление
// контентом (CRUD) появится отдельно, под своим правом.

import express from 'express';
import { requireAuth, requirePermission } from './auth.js';
import { pool } from './db.js';
import { PERMISSIONS } from './roles.js';

export const catalogRouter = express.Router();

catalogRouter.use(requireAuth);

const APPLIES_TO = ['oge', 'ege', 'both'];
const DIFFICULTY = ['base', 'advanced', 'high'];

// Управление контентом — отдельное право. Чтение выше доступно любому вошедшему,
// запись — только с content:write (у администратора есть по умолчанию).
const canWrite = requirePermission(PERMISSIONS.CONTENT_WRITE);

function textField(value, { max, required, label }) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return required ? `Поле «${label}» обязательно` : { ok: true, value: undefined };
  }
  const trimmed = String(value).trim();
  if (trimmed.length > max) return `Поле «${label}» длиннее ${max} символов`;
  return { ok: true, value: trimmed };
}

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

// ─────────────────────────── Управление (content:write) ───────────────────────────

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

// ── Предметы ──

catalogRouter.post('/subjects', canWrite, async (req, res) => {
  const name = textField(req.body?.name, { max: 100, required: true, label: 'Название' });
  if (typeof name === 'string') return res.status(400).json({ error: name });

  const applies_to = req.body?.applies_to ?? 'both';
  if (!APPLIES_TO.includes(applies_to))
    return res.status(400).json({ error: 'Некорректный тип экзамена' });
  const has_levels = Boolean(req.body?.has_levels);
  const order_index = Number.isInteger(req.body?.order_index) ? req.body.order_index : 0;

  try {
    const { rows } = await pool.query(
      `INSERT INTO subjects (name, applies_to, has_levels, order_index)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, applies_to, has_levels, order_index`,
      [name.value, applies_to, has_levels, order_index],
    );
    res.status(201).json({ subject: rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Предмет с таким названием уже есть' });
    console.error('catalog create subject failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

catalogRouter.patch('/subjects/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });

  const sets = [];
  const vals = [];
  if ('name' in (req.body ?? {})) {
    const name = textField(req.body.name, { max: 100, required: true, label: 'Название' });
    if (typeof name === 'string') return res.status(400).json({ error: name });
    vals.push(name.value);
    sets.push(`name = $${vals.length}`);
  }
  if ('applies_to' in (req.body ?? {})) {
    if (!APPLIES_TO.includes(req.body.applies_to))
      return res.status(400).json({ error: 'Некорректный тип экзамена' });
    vals.push(req.body.applies_to);
    sets.push(`applies_to = $${vals.length}`);
  }
  if ('has_levels' in (req.body ?? {})) {
    vals.push(Boolean(req.body.has_levels));
    sets.push(`has_levels = $${vals.length}`);
  }
  if ('order_index' in (req.body ?? {})) {
    if (!Number.isInteger(req.body.order_index))
      return res.status(400).json({ error: 'Некорректный порядок' });
    vals.push(req.body.order_index);
    sets.push(`order_index = $${vals.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Нет полей для изменения' });

  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE subjects SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length} AND deleted_at IS NULL
       RETURNING id, name, applies_to, has_levels, order_index`,
      vals,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Предмет не найден' });
    res.json({ subject: rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Предмет с таким названием уже есть' });
    console.error('catalog update subject failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Мягкое удаление каскадом: предмет и все его разделы с темами. Исторические
// попытки тестов ссылаются на темы, поэтому физически ничего не удаляется.
catalogRouter.delete('/subjects/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE subjects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Предмет не найден' });
    }
    await client.query(
      `UPDATE topics SET deleted_at = now()
       WHERE deleted_at IS NULL
         AND section_id IN (SELECT id FROM sections WHERE subject_id = $1)`,
      [id],
    );
    await client.query(
      'UPDATE sections SET deleted_at = now() WHERE subject_id = $1 AND deleted_at IS NULL',
      [id],
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('catalog delete subject failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});

// ── Разделы ──

catalogRouter.post('/sections', canWrite, async (req, res) => {
  const subjectId = parseId(req.body?.subject_id);
  if (subjectId === null) return res.status(400).json({ error: 'Не указан предмет' });
  const title = textField(req.body?.title, { max: 255, required: true, label: 'Название раздела' });
  if (typeof title === 'string') return res.status(400).json({ error: title });
  const order_index = Number.isInteger(req.body?.order_index) ? req.body.order_index : 0;

  try {
    const subject = await pool.query(
      'SELECT id FROM subjects WHERE id = $1 AND deleted_at IS NULL',
      [subjectId],
    );
    if (!subject.rows[0]) return res.status(404).json({ error: 'Предмет не найден' });

    const { rows } = await pool.query(
      `INSERT INTO sections (subject_id, title, order_index)
       VALUES ($1, $2, $3) RETURNING id, subject_id, title, order_index`,
      [subjectId, title.value, order_index],
    );
    res.status(201).json({ section: rows[0] });
  } catch (err) {
    console.error('catalog create section failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

catalogRouter.patch('/sections/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });

  const sets = [];
  const vals = [];
  if ('title' in (req.body ?? {})) {
    const title = textField(req.body.title, {
      max: 255,
      required: true,
      label: 'Название раздела',
    });
    if (typeof title === 'string') return res.status(400).json({ error: title });
    vals.push(title.value);
    sets.push(`title = $${vals.length}`);
  }
  if ('order_index' in (req.body ?? {})) {
    if (!Number.isInteger(req.body.order_index))
      return res.status(400).json({ error: 'Некорректный порядок' });
    vals.push(req.body.order_index);
    sets.push(`order_index = $${vals.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Нет полей для изменения' });

  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE sections SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length} AND deleted_at IS NULL
       RETURNING id, subject_id, title, order_index`,
      vals,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Раздел не найден' });
    res.json({ section: rows[0] });
  } catch (err) {
    console.error('catalog update section failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

catalogRouter.delete('/sections/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE sections SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Раздел не найден' });
    }
    await client.query(
      'UPDATE topics SET deleted_at = now() WHERE section_id = $1 AND deleted_at IS NULL',
      [id],
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('catalog delete section failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});

// ── Темы ──

catalogRouter.post('/topics', canWrite, async (req, res) => {
  const sectionId = parseId(req.body?.section_id);
  if (sectionId === null) return res.status(400).json({ error: 'Не указан раздел' });
  const title = textField(req.body?.title, { max: 255, required: true, label: 'Название темы' });
  if (typeof title === 'string') return res.status(400).json({ error: title });

  const grade = req.body?.grade;
  if (!Number.isInteger(grade) || grade < 8 || grade > 11) {
    return res.status(400).json({ error: 'Класс должен быть от 8 до 11' });
  }
  const difficulty = req.body?.difficulty ?? 'base';
  if (!DIFFICULTY.includes(difficulty))
    return res.status(400).json({ error: 'Некорректная сложность' });
  const codifier = textField(req.body?.codifier_code, {
    max: 20,
    required: false,
    label: 'Код ФИПИ',
  });
  if (typeof codifier === 'string') return res.status(400).json({ error: codifier });
  const order_index = Number.isInteger(req.body?.order_index) ? req.body.order_index : 0;

  try {
    const section = await pool.query(
      'SELECT id FROM sections WHERE id = $1 AND deleted_at IS NULL',
      [sectionId],
    );
    if (!section.rows[0]) return res.status(404).json({ error: 'Раздел не найден' });

    const { rows } = await pool.query(
      `INSERT INTO topics (section_id, grade, title, order_index, codifier_code, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, section_id, grade, title, order_index, codifier_code, difficulty`,
      [sectionId, grade, title.value, order_index, codifier.value ?? null, difficulty],
    );
    res.status(201).json({ topic: rows[0] });
  } catch (err) {
    console.error('catalog create topic failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

catalogRouter.patch('/topics/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });
  const body = req.body ?? {};

  const sets = [];
  const vals = [];
  if ('title' in body) {
    const title = textField(body.title, { max: 255, required: true, label: 'Название темы' });
    if (typeof title === 'string') return res.status(400).json({ error: title });
    vals.push(title.value);
    sets.push(`title = $${vals.length}`);
  }
  if ('grade' in body) {
    if (!Number.isInteger(body.grade) || body.grade < 8 || body.grade > 11) {
      return res.status(400).json({ error: 'Класс должен быть от 8 до 11' });
    }
    vals.push(body.grade);
    sets.push(`grade = $${vals.length}`);
  }
  if ('difficulty' in body) {
    if (!DIFFICULTY.includes(body.difficulty))
      return res.status(400).json({ error: 'Некорректная сложность' });
    vals.push(body.difficulty);
    sets.push(`difficulty = $${vals.length}`);
  }
  if ('codifier_code' in body) {
    const codifier = textField(body.codifier_code, { max: 20, required: false, label: 'Код ФИПИ' });
    if (typeof codifier === 'string') return res.status(400).json({ error: codifier });
    vals.push(codifier.value ?? null);
    sets.push(`codifier_code = $${vals.length}`);
  }
  if ('order_index' in body) {
    if (!Number.isInteger(body.order_index))
      return res.status(400).json({ error: 'Некорректный порядок' });
    vals.push(body.order_index);
    sets.push(`order_index = $${vals.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Нет полей для изменения' });

  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE topics SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length} AND deleted_at IS NULL
       RETURNING id, section_id, grade, title, order_index, codifier_code, difficulty`,
      vals,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Тема не найдена' });
    res.json({ topic: rows[0] });
  } catch (err) {
    console.error('catalog update topic failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

catalogRouter.delete('/topics/:id', canWrite, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const { rows } = await pool.query(
      'UPDATE topics SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Тема не найдена' });
    res.json({ ok: true });
  } catch (err) {
    console.error('catalog delete topic failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});
