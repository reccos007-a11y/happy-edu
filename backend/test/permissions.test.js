// Проверки модели прав против настоящего Postgres: транзакционные гарантии
// вроде «нельзя снять последнего администратора» на заглушках не проверить.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { createUser, makeClient, resetUsers, startServer } from './helpers.js';

let server;
let base;

before(async () => {
  await runMigrations();
  ({ server, base } = await startServer());
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

beforeEach(resetUsers);

describe('регистрация и вход', () => {
  it('регистрация создаёт обычного пользователя без прав', async () => {
    const call = makeClient(base);
    const { status, data } = await call('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'password123',
    });

    assert.equal(status, 201);
    assert.equal(data.user.role, 'user');
    assert.deepEqual(data.user.permissions, []);
  });

  it('роль из тела запроса игнорируется', async () => {
    const call = makeClient(base);
    const { data } = await call('POST', '/api/auth/register', {
      email: 'sneaky@example.com',
      password: 'password123',
      role: 'admin',
    });

    assert.equal(data.user.role, 'user');
  });

  it('несуществующий пользователь и неверный пароль неразличимы', async () => {
    const call = makeClient(base);
    await createUser('someone@example.com', 'password123');

    const missing = await call('POST', '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'password123',
    });
    const wrong = await call('POST', '/api/auth/login', {
      email: 'someone@example.com',
      password: 'wrong-password',
    });

    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(missing.data.error, wrong.data.error);
  });
});

describe('доступ к админскому разделу', () => {
  it('без сессии отвечает 401', async () => {
    const call = makeClient(base);
    const { status } = await call('GET', '/api/admin/users');
    assert.equal(status, 401);
  });

  it('обычному пользователю отвечает 403', async () => {
    const call = makeClient(base);
    await createUser('user@example.com', 'password123');
    await call('POST', '/api/auth/login', { email: 'user@example.com', password: 'password123' });

    const { status } = await call('GET', '/api/admin/users');
    assert.equal(status, 403);
  });

  it('обычный пользователь не может завести учётную запись', async () => {
    const call = makeClient(base);
    await createUser('user@example.com', 'password123');
    await call('POST', '/api/auth/login', { email: 'user@example.com', password: 'password123' });

    const { status } = await call('POST', '/api/admin/users', {
      email: 'created-by-user@example.com',
      password: 'password123',
    });

    assert.equal(status, 403);
  });

  it('администратор получает список пользователей и полный набор прав', async () => {
    const call = makeClient(base);
    await createUser('admin@example.com', 'password123', 'admin');
    await createUser('user@example.com', 'password123');
    const login = await call('POST', '/api/auth/login', {
      email: 'admin@example.com',
      password: 'password123',
    });

    assert.deepEqual(login.data.user.permissions, ['users:read', 'users:write', 'roles:manage']);

    const { status, data } = await call('GET', '/api/admin/users');
    assert.equal(status, 200);
    assert.equal(data.users.length, 2);
  });

  it('снятие роли действует немедленно, не дожидаясь истечения токена', async () => {
    const call = makeClient(base);
    const admin = await createUser('admin@example.com', 'password123', 'admin');
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
    assert.equal((await call('GET', '/api/admin/users')).status, 200);

    // Роль меняется в обход приложения — сессия при этом остаётся прежней.
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['user', admin.id]);

    assert.equal((await call('GET', '/api/admin/users')).status, 403);
  });
});

describe('управление ролями', () => {
  let call;
  let admin;

  beforeEach(async () => {
    call = makeClient(base);
    admin = await createUser('admin@example.com', 'password123', 'admin');
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
  });

  it('администратор повышает пользователя', async () => {
    const user = await createUser('user@example.com', 'password123');

    const { status, data } = await call('PATCH', `/api/admin/users/${user.id}/role`, {
      role: 'admin',
    });

    assert.equal(status, 200);
    assert.equal(data.user.role, 'admin');
  });

  it('неизвестная роль отклоняется', async () => {
    const user = await createUser('user@example.com', 'password123');

    const { status } = await call('PATCH', `/api/admin/users/${user.id}/role`, {
      role: 'superroot',
    });

    assert.equal(status, 400);
  });

  it('собственную роль сменить нельзя', async () => {
    const { status, data } = await call('PATCH', `/api/admin/users/${admin.id}/role`, {
      role: 'user',
    });

    assert.equal(status, 400);
    assert.match(data.error, /собственную роль/);
  });

  it('удаление пользователя доступно администратору, себя удалить нельзя', async () => {
    const user = await createUser('user@example.com', 'password123');

    assert.equal((await call('DELETE', `/api/admin/users/${user.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/admin/users/${admin.id}`)).status, 400);
  });

  it('администратор заводит пользователя и получает сгенерированный пароль', async () => {
    const { status, data } = await call('POST', '/api/admin/users', {
      email: 'new@example.com',
      role: 'user',
    });

    assert.equal(status, 201);
    assert.equal(data.user.role, 'user');
    assert.ok(data.generatedPassword, 'пароль должен быть показан один раз');

    // Заведённая учётная запись должна работать: входим ей с выданным паролем.
    const fresh = makeClient(base);
    const login = await fresh('POST', '/api/auth/login', {
      email: 'new@example.com',
      password: data.generatedPassword,
    });
    assert.equal(login.status, 200);
  });

  it('заданный администратором пароль обратно не возвращается', async () => {
    const { status, data } = await call('POST', '/api/admin/users', {
      email: 'manual@example.com',
      password: 'chosen-password',
    });

    assert.equal(status, 201);
    assert.equal(data.generatedPassword, undefined);
  });

  it('повторный e-mail отклоняется', async () => {
    await createUser('taken@example.com', 'password123');

    const { status } = await call('POST', '/api/admin/users', {
      email: 'TAKEN@example.com',
      password: 'password123',
    });

    assert.equal(status, 409);
  });

  it('короткий пароль и кривой e-mail отклоняются', async () => {
    const short = await call('POST', '/api/admin/users', {
      email: 'ok@example.com',
      password: 'short',
    });
    const bad = await call('POST', '/api/admin/users', {
      email: 'не-почта',
      password: 'password123',
    });

    assert.equal(short.status, 400);
    assert.equal(bad.status, 400);
  });

  it('последнего администратора нельзя понизить даже при гонке', async () => {
    const second = await createUser('second@example.com', 'password123', 'admin');

    // Держим строки администраторов заблокированными и снимаем роль с того,
    // кто уже прошёл проверку прав. Без FOR UPDATE в обработчике оба
    // администратора исчезли бы и управлять ролями стало бы некому.
    const blocker = await pool.connect();
    let request;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT id FROM users WHERE role = 'admin' FOR UPDATE");

      request = call('PATCH', `/api/admin/users/${second.id}/role`, { role: 'user' });
      // Даём запросу дойти до блокировки, а не завершиться раньше времени.
      await new Promise((resolve) => setTimeout(resolve, 300));

      await blocker.query('UPDATE users SET role = $1 WHERE id = $2', ['user', admin.id]);
      await blocker.query('COMMIT');
    } finally {
      blocker.release();
    }

    const { status } = await request;
    assert.equal(status, 409);

    const { rows } = await pool.query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
    assert.equal(rows[0].c, 1, 'система осталась без администраторов');
  });
});
