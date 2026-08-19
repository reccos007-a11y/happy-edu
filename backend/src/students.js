// Управление учениками: администратор заводит ученика (учётная запись + профиль
// с классом и экзаменом) — единственный способ появиться ученику, как и для
// прочих пользователей. Ученик и его профиль создаются атомарно.
//
// Куратор (curator_id) пока не выставляется через API — появится вместе с ролью
// teacher и кабинетом куратора.

import express from 'express';
import { requireAuth, requirePermission, validate } from './auth.js';
import { pool } from './db.js';
import { generatePassword, hashPassword } from './password.js';
import { PERMISSIONS, STUDENT_ROLE } from './roles.js';

export const studentsRouter = express.Router();

studentsRouter.use(requireAuth);

const EXAM_TYPES = ['oge', 'ege'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function publicStudent(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    grade: row.grade,
    exam_type: row.exam_type,
    target_exam_date: row.target_exam_date,
    enrolled_at: row.enrolled_at,
    curator_id: row.curator_id ?? null,
    curator_name: row.curator_name ?? null,
  };
}

// Проверка полей профиля. mode='create' — grade и exam_type обязательны;
// mode='patch' — валидируются только присланные.
function validateProfile(body, mode) {
  if (mode === 'create' || 'grade' in body) {
    if (!Number.isInteger(body.grade) || body.grade < 8 || body.grade > 11) {
      return 'Класс должен быть от 8 до 11';
    }
  }
  if (mode === 'create' || 'exam_type' in body) {
    if (!EXAM_TYPES.includes(body.exam_type)) return 'Экзамен должен быть ОГЭ или ЕГЭ';
  }
  if (body.target_exam_date != null && body.target_exam_date !== '') {
    if (!ISO_DATE.test(body.target_exam_date)) return 'Некорректная дата экзамена';
  }
  return null;
}

// Список учеников с профилями.
studentsRouter.get('/', requirePermission(PERMISSIONS.USERS_READ), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name,
              sp.grade, sp.exam_type, sp.target_exam_date, sp.enrolled_at,
              sp.curator_id, cu.full_name AS curator_name
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id AND sp.deleted_at IS NULL
       LEFT JOIN users cu ON cu.id = sp.curator_id
       WHERE u.role = $1
       ORDER BY u.full_name NULLS LAST, u.email`,
      [STUDENT_ROLE],
    );
    res.json({ students: rows.map(publicStudent) });
  } catch (err) {
    console.error('students list failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Завести ученика: учётная запись (role=student) + профиль, атомарно.
studentsRouter.post('/', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => {
  const body = req.body ?? {};
  const { email } = body;

  const generated = !body.password;
  const password = generated ? generatePassword() : body.password;

  const credError = validate(email, password);
  if (credError) return res.status(400).json({ error: credError });

  const profileError = validateProfile(body, 'create');
  if (profileError) return res.status(400).json({ error: profileError });

  const fullName = body.full_name ? String(body.full_name).trim() : null;
  const targetDate = body.target_exam_date ? body.target_exam_date : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email.trim().toLowerCase(), await hashPassword(password), STUDENT_ROLE, fullName],
    );
    const userId = userRows[0].id;

    await client.query(
      `INSERT INTO student_profiles (user_id, grade, exam_type, target_exam_date)
       VALUES ($1, $2, $3, $4)`,
      [userId, body.grade, body.exam_type, targetDate],
    );
    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, sp.grade, sp.exam_type, sp.target_exam_date,
              sp.enrolled_at, sp.curator_id, NULL AS curator_name
       FROM users u JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );

    res.status(201).json({
      student: publicStudent(rows[0]),
      generatedPassword: generated ? password : undefined,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким e-mail уже существует' });
    }
    console.error('students create failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});

// Обновление профиля и ФИО ученика.
studentsRouter.patch('/:userId', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Некорректный id' });

  const body = req.body ?? {};
  const profileError = validateProfile(body, 'patch');
  if (profileError) return res.status(400).json({ error: profileError });

  const sets = [];
  const vals = [];
  if ('grade' in body) {
    vals.push(body.grade);
    sets.push(`grade = $${vals.length}`);
  }
  if ('exam_type' in body) {
    vals.push(body.exam_type);
    sets.push(`exam_type = $${vals.length}`);
  }
  if ('target_exam_date' in body) {
    vals.push(body.target_exam_date || null);
    sets.push(`target_exam_date = $${vals.length}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ФИО живёт в users, остальное — в профиле; обновляем то, что пришло.
    if ('full_name' in body) {
      await client.query('UPDATE users SET full_name = $1 WHERE id = $2 AND role = $3', [
        body.full_name ? String(body.full_name).trim() : null,
        userId,
        STUDENT_ROLE,
      ]);
    }

    let profile;
    if (sets.length > 0) {
      vals.push(userId);
      const { rows } = await client.query(
        `UPDATE student_profiles SET ${sets.join(', ')}, updated_at = now()
         WHERE user_id = $${vals.length} AND deleted_at IS NULL RETURNING user_id`,
        vals,
      );
      profile = rows[0];
    } else {
      const { rows } = await client.query(
        'SELECT user_id FROM student_profiles WHERE user_id = $1 AND deleted_at IS NULL',
        [userId],
      );
      profile = rows[0];
    }

    if (!profile) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ученик не найден' });
    }
    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, sp.grade, sp.exam_type, sp.target_exam_date,
              sp.enrolled_at, sp.curator_id, cu.full_name AS curator_name
       FROM users u JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN users cu ON cu.id = sp.curator_id
       WHERE u.id = $1`,
      [userId],
    );
    res.json({ student: publicStudent(rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('students update failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});

// Удаление ученика: профиль и учётная запись, в транзакции.
studentsRouter.delete('/:userId', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Некорректный id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM users WHERE id = $1 AND role = $2', [
      userId,
      STUDENT_ROLE,
    ]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ученик не найден' });
    }
    await client.query('DELETE FROM student_profiles WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('students delete failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});
