import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { verifyPassword } from './password.js';
import { hasPermission, permissionsOf } from './roles.js';

export const COOKIE_NAME = 'session';

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET не задан — сервер не может подписывать сессии');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function cookieOptions() {
  return {
    httpOnly: true,
    // За Caddy трафик приходит по HTTPS, но до backend доходит по http внутри
    // сети Docker, поэтому Secure включаем по явной настройке окружения.
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

// Возвращает текст ошибки или null. Используется и при самостоятельной
// регистрации, и когда пользователя заводит администратор: требования
// к e-mail и паролю в обоих случаях одинаковые.
export function validate(email, password) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'Некорректный e-mail';
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Пароль должен быть не короче ${MIN_PASSWORD} символов`;
  }
  return null;
}

// Роль в токен намеренно не кладём: иначе понижение прав начало бы действовать
// только после истечения токена. В токене — только идентификатор.
function issueToken(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

// То, что видит клиент: без password_hash, но с развёрнутым списком прав,
// чтобы фронтенду не приходилось знать таблицу ролей.
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name ?? null,
    role: row.role,
    permissions: permissionsOf(row.role),
    created_at: row.created_at,
    // Признак, а не сама картинка: по нему интерфейс решает, показывать
    // фотографию или инициалы, и не ходит за аватаром вслепую.
    has_avatar: row.has_avatar ?? false,
  };
}

// Загружает пользователя по сессионной cookie. Роль читается из БД при каждом
// запросе, поэтому снятие прав действует немедленно.
async function userFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at, u.full_name,
              EXISTS (SELECT 1 FROM user_avatars a WHERE a.user_id = u.id) AS has_avatar
       FROM users u WHERE u.id = $1`,
      [payload.sub],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    req.user = user;
    next();
  } catch (err) {
    console.error('auth check failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

export const authRouter = express.Router();

// Самостоятельной регистрации нет: учётные записи заводит администратор
// (POST /api/admin/users), первого — CLI-скрипт create-admin.js.
// Эндпоинт /register удалён целиком, а не закрыт флагом: пока его нет в коде,
// его нельзя случайно включить обратно настройкой окружения.

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Укажите e-mail и пароль' });
  }

  const normalized = email.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.created_at, u.full_name,
              EXISTS (SELECT 1 FROM user_avatars a WHERE a.user_id = u.id) AS has_avatar
       FROM users u WHERE lower(u.email) = $1`,
      [normalized],
    );
    const user = rows[0];

    // Один и тот же ответ на «нет такого пользователя» и «неверный пароль»,
    // чтобы нельзя было перебором выяснить, какие адреса зарегистрированы.
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Неверный e-mail или пароль' });

    issueToken(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
