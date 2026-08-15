import express from 'express';
import { publicUser, requireAuth, requirePermission, validate } from './auth.js';
import { pool } from './db.js';
import { generatePassword, hashPassword } from './password.js';
import {
  ADMIN_ROLE,
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLES,
  hasPermission,
  isValidRole,
} from './roles.js';

export const adminRouter = express.Router();

// Весь раздел доступен только вошедшим пользователям.
adminRouter.use(requireAuth);

// Справочник ролей и того, что каждая из них даёт.
adminRouter.get('/roles', requirePermission(PERMISSIONS.USERS_READ), (_req, res) => {
  res.json({
    roles: Object.entries(ROLES).map(([name, permissions]) => ({ name, permissions })),
  });
});

adminRouter.get('/users', requirePermission(PERMISSIONS.USERS_READ), async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY id');
    res.json({ users: rows.map(publicUser) });
  } catch (err) {
    console.error('admin list users failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Заведение учётной записи администратором — единственный способ появиться
// новому пользователю: публичной регистрации на сайте нет.
adminRouter.post('/users', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => {
  const { email, role = DEFAULT_ROLE } = req.body ?? {};

  // Пароль необязателен: если его не задали, генерируем и показываем один раз.
  const generated = !req.body?.password;
  const password = generated ? generatePassword() : req.body.password;

  const error = validate(email, password);
  if (error) return res.status(400).json({ error });
  if (!isValidRole(role)) return res.status(400).json({ error: 'Неизвестная роль' });

  // Раздавать администраторские права — отдельное право: users:write позволяет
  // завести обычного пользователя, но не создать себе второго администратора.
  if (role === ADMIN_ROLE && !hasPermission(req.user.role, PERMISSIONS.ROLES_MANAGE)) {
    return res.status(403).json({ error: 'Недостаточно прав для создания администратора' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email.trim().toLowerCase(), await hashPassword(password), role],
    );

    // Сгенерированный пароль возвращается единственный раз — в базе только хеш,
    // показать его повторно будет неоткуда.
    res.status(201).json({
      user: publicUser(rows[0]),
      generatedPassword: generated ? password : undefined,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким e-mail уже существует' });
    }
    console.error('admin create user failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

adminRouter.patch(
  '/users/:id/role',
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body ?? {};

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
    if (!isValidRole(role)) return res.status(400).json({ error: 'Неизвестная роль' });

    // Смена собственной роли запрещена: администратор мог бы случайно закрыть
    // себе доступ к этому же разделу.
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Нельзя менять собственную роль' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Блокируем строки администраторов на время проверки, иначе два
      // параллельных понижения могли бы вместе снять последнего.
      const { rows: admins } = await client.query(
        'SELECT id FROM users WHERE role = $1 FOR UPDATE',
        [ADMIN_ROLE],
      );

      const { rows: targets } = await client.query(
        'SELECT id, email, role, created_at FROM users WHERE id = $1 FOR UPDATE',
        [id],
      );
      const target = targets[0];
      if (!target) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const losesAdmin = target.role === ADMIN_ROLE && role !== ADMIN_ROLE;
      if (losesAdmin && admins.length <= 1) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'Это последний администратор — сначала назначьте другого' });
      }

      const { rows } = await client.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at',
        [role, id],
      );
      await client.query('COMMIT');
      res.json({ user: publicUser(rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('admin change role failed:', err);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    } finally {
      client.release();
    }
  },
);

adminRouter.delete('/users/:id', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный id' });
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить собственную учётную запись' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: admins } = await client.query('SELECT id FROM users WHERE role = $1 FOR UPDATE', [
      ADMIN_ROLE,
    ]);
    const { rows: targets } = await client.query(
      'SELECT id, role FROM users WHERE id = $1 FOR UPDATE',
      [id],
    );
    const target = targets[0];
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    if (target.role === ADMIN_ROLE && admins.length <= 1) {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json({ error: 'Это последний администратор — сначала назначьте другого' });
    }

    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('admin delete user failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  } finally {
    client.release();
  }
});
