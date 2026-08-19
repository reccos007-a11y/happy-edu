// Общая обвязка для тестов: поднимает приложение на свободном порту и даёт
// HTTP-клиент, который сам хранит сессионную cookie.

import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/password.js';

export async function startServer() {
  // Порт 0 — операционная система выдаёт свободный, поэтому параллельные
  // запуски тестов не конфликтуют.
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

export function makeClient(base) {
  let cookie = '';

  return async function call(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.cookie = cookie;

    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // fetch не хранит cookie между запросами — делаем это сами.
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
}

export async function resetUsers() {
  // CASCADE: на users ссылаются зависимые таблицы (напр. student_profiles),
  // без него TRUNCATE упрётся в внешний ключ.
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
}

// Заводит пользователя напрямую в БД, минуя HTTP: нужен, когда тесту важен
// готовый администратор, а не сам процесс регистрации.
export async function createUser(email, password, role = 'user') {
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
    [email.toLowerCase(), await hashPassword(password), role],
  );
  return rows[0];
}
