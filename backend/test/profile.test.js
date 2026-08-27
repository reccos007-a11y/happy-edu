// Профиль в кабинете: ученик правит свои данные, меняет пароль и ставит
// аватар. Аватар — у любого пользователя, профиль — только у ученика.

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

beforeEach(async () => {
  await pool.query('TRUNCATE student_profiles RESTART IDENTITY CASCADE');
  await resetUsers();
});

async function loginAs(email, password, role) {
  const user = await createUser(email, password, role);
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password });
  return { call, user };
}

// Ученик с профилем и готовой сессией.
async function pupilClient(email = 'pupil@example.com') {
  const { call, user } = await loginAs(email, 'password123', 'student');
  await pool.query(
    `INSERT INTO student_profiles (user_id, grade, exam_type, target_exam_date)
     VALUES ($1, 9, 'oge', '2027-06-01')`,
    [user.id],
  );
  await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, 'Аня Петрова']);
  return { call, user };
}

// Однопиксельный PNG — минимальная валидная картинка.
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('профиль в кабинете ученика', () => {
  describe('чтение и правка', () => {
    it('ученик видит свой профиль и меняет имя, класс, экзамен и дату', async () => {
      const { call } = await pupilClient();

      const before = await call('GET', '/api/me/profile');
      assert.equal(before.status, 200);
      assert.equal(before.data.profile.full_name, 'Аня Петрова');
      assert.equal(before.data.profile.grade, 9);

      const patched = await call('PATCH', '/api/me/profile', {
        full_name: 'Анна Петрова',
        grade: 11,
        exam_type: 'ege',
        target_exam_date: '2028-06-01',
      });

      assert.equal(patched.status, 200);
      assert.equal(patched.data.profile.full_name, 'Анна Петрова');
      assert.equal(patched.data.profile.grade, 11);
      assert.equal(patched.data.profile.exam_type, 'ege');
    });

    it('меняет только переданные поля', async () => {
      const { call } = await pupilClient();

      const { data } = await call('PATCH', '/api/me/profile', { grade: 10 });
      assert.equal(data.profile.grade, 10);
      assert.equal(data.profile.full_name, 'Аня Петрова', 'имя не должно измениться');
    });

    it('дата экзамена снимается пустым значением', async () => {
      const { call } = await pupilClient();

      const { data } = await call('PATCH', '/api/me/profile', { target_exam_date: '' });
      assert.equal(data.profile.target_exam_date, null);
    });

    const badCases = [
      ['класс вне 8–11', { grade: 7 }],
      ['класс не число', { grade: '9' }],
      ['неизвестный экзамен', { exam_type: 'vpr' }],
      ['пустое имя', { full_name: '   ' }],
      ['кривая дата', { target_exam_date: '01.06.2027' }],
      ['нет полей', {}],
    ];

    for (const [name, body] of badCases) {
      it(`отклоняет: ${name}`, async () => {
        const { call } = await pupilClient();
        const { status } = await call('PATCH', '/api/me/profile', body);
        assert.equal(status, 400);
      });
    }

    it('не-ученик профиль не правит', async () => {
      const { call } = await loginAs('user@example.com', 'password123', 'user');
      const { status } = await call('PATCH', '/api/me/profile', { grade: 9 });
      assert.equal(status, 404);
    });

    it('роль и e-mail через этот эндпоинт не меняются', async () => {
      const { call, user } = await pupilClient();

      await call('PATCH', '/api/me/profile', {
        full_name: 'Аня',
        role: 'admin',
        email: 'hacker@example.com',
      });

      const { rows } = await pool.query('SELECT role, email FROM users WHERE id = $1', [user.id]);
      assert.equal(rows[0].role, 'student');
      assert.equal(rows[0].email, 'pupil@example.com');
    });
  });

  describe('смена пароля', () => {
    it('меняет пароль, старый перестаёт работать', async () => {
      const { call } = await pupilClient();

      const changed = await call('POST', '/api/me/password', {
        current_password: 'password123',
        new_password: 'new-password-42',
      });
      assert.equal(changed.status, 200);

      const withOld = makeClient(base);
      const oldTry = await withOld('POST', '/api/auth/login', {
        email: 'pupil@example.com',
        password: 'password123',
      });
      assert.equal(oldTry.status, 401);

      const withNew = makeClient(base);
      const newTry = await withNew('POST', '/api/auth/login', {
        email: 'pupil@example.com',
        password: 'new-password-42',
      });
      assert.equal(newTry.status, 200);
    });

    it('без верного текущего пароля не меняет', async () => {
      const { call } = await pupilClient();

      const { status, data } = await call('POST', '/api/me/password', {
        current_password: 'wrong-password',
        new_password: 'new-password-42',
      });
      assert.equal(status, 400);
      assert.match(data.error, /[Тт]екущий пароль/);

      // Пароль остался прежним.
      const fresh = makeClient(base);
      const login = await fresh('POST', '/api/auth/login', {
        email: 'pupil@example.com',
        password: 'password123',
      });
      assert.equal(login.status, 200);
    });

    it('короткий и совпадающий с текущим пароль отклоняются', async () => {
      const { call } = await pupilClient();

      const short = await call('POST', '/api/me/password', {
        current_password: 'password123',
        new_password: 'short',
      });
      assert.equal(short.status, 400);

      const same = await call('POST', '/api/me/password', {
        current_password: 'password123',
        new_password: 'password123',
      });
      assert.equal(same.status, 400);
    });

    it('пароль меняет и не-ученик: это про учётную запись, а не про кабинет', async () => {
      const { call } = await loginAs('admin@example.com', 'password123', 'admin');

      const { status } = await call('POST', '/api/me/password', {
        current_password: 'password123',
        new_password: 'admin-new-password',
      });
      assert.equal(status, 200);
    });
  });

  describe('аватар', () => {
    it('загружается, отдаётся картинкой и удаляется', async () => {
      const { call, user } = await pupilClient();

      const saved = await call('PUT', '/api/avatars/me', { image: PNG_1PX });
      assert.equal(saved.status, 200);

      // Сессия теперь знает, что аватар есть, — интерфейс не ходит вслепую.
      const me = await call('GET', '/api/auth/me');
      assert.equal(me.data.user.has_avatar, true);

      const res = await fetch(`${base}/api/avatars/${user.id}`, {
        headers: { cookie: `session=${await sessionCookie(user)}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.ok(Number(res.headers.get('content-length')) > 0);

      const removed = await call('DELETE', '/api/avatars/me');
      assert.equal(removed.status, 200);

      const after = await call('GET', '/api/auth/me');
      assert.equal(after.data.user.has_avatar, false);
    });

    it('повторная загрузка заменяет прежний аватар', async () => {
      const { call, user } = await pupilClient();

      await call('PUT', '/api/avatars/me', { image: PNG_1PX });
      await call('PUT', '/api/avatars/me', { image: PNG_1PX });

      const { rows } = await pool.query(
        'SELECT count(*)::int AS c FROM user_avatars WHERE user_id = $1',
        [user.id],
      );
      assert.equal(rows[0].c, 1, 'аватар один на пользователя');
    });

    const badImages = [
      ['не картинка', 'data:text/plain;base64,cHJpdmV0'],
      ['неподдерживаемый тип', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
      ['мусор вместо data:URL', 'просто строка'],
      ['пусто', ''],
    ];

    for (const [name, image] of badImages) {
      it(`отклоняет: ${name}`, async () => {
        const { call } = await pupilClient();
        const { status } = await call('PUT', '/api/avatars/me', { image });
        assert.equal(status, 400);
      });
    }

    it('слишком большой файл отклоняется', async () => {
      const { call } = await pupilClient();
      // 400 КБ мусора в base64 — больше потолка в 300 КБ.
      const huge = `data:image/jpeg;base64,${Buffer.alloc(400 * 1024, 1).toString('base64')}`;

      const { status, data } = await call('PUT', '/api/avatars/me', { image: huge });
      assert.equal(status, 400);
      assert.match(data.error, /КБ/);
    });

    it('аватар другого пользователя доступен на чтение, но не на запись', async () => {
      const pupil = await pupilClient('pupil@example.com');
      await pupil.call('PUT', '/api/avatars/me', { image: PNG_1PX });

      const other = await loginAs('other@example.com', 'password123', 'user');

      // Чужой аватар видно: он показывается в шапке и списках.
      const seen = await other.call('GET', `/api/avatars/${pupil.user.id}`);
      assert.notEqual(seen.status, 403);

      // А записать можно только свой: чужой id в маршрут не принимается вовсе.
      await other.call('PUT', '/api/avatars/me', { image: PNG_1PX });
      const { rows } = await pool.query('SELECT user_id FROM user_avatars ORDER BY user_id');
      assert.deepEqual(
        rows.map((r) => Number(r.user_id)),
        [pupil.user.id, other.user.id].sort((a, b) => a - b),
      );
    });

    it('без сессии аватар не отдаётся', async () => {
      const { user } = await pupilClient();
      const res = await fetch(`${base}/api/avatars/${user.id}`);
      assert.equal(res.status, 401);
    });

    it('если аватара нет — 404', async () => {
      const { call, user } = await pupilClient();
      const { status } = await call('GET', `/api/avatars/${user.id}`);
      assert.equal(status, 404);
    });
  });
});

// Отдельный вход ради cookie: makeClient разбирает ответ как JSON, а картинку
// нужно забрать сырым fetch.
async function sessionCookie(user) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'password123' }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('session='));
  return cookie.split('=')[1].split(';')[0];
}
