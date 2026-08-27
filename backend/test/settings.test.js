// Настройки геймификации: правила редактируются администратором, влияют на
// кабинет ученика и защищены отдельным правом.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { DEFAULT_GAMIFICATION } from '../src/gamification.js';
import { runMigrations } from '../src/migrate.js';
import { createUser, makeClient, resetUsers, startServer } from './helpers.js';

let server;
let base;

before(async () => {
  await runMigrations();
  ({ server, base } = await startServer());
});

after(async () => {
  // Настройки — единственная таблица, общая для всех тестовых файлов: остальные
  // чистят своё в beforeEach, а сохранённые здесь правила достались бы следующему
  // файлу и, например, сдвинули бы ему порог зачёта. Убираем за собой.
  await pool.query('TRUNCATE app_settings');
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE app_settings, test_attempts, learning_plan_items, learning_plans,
              student_profiles, questions, topics, sections, subjects
     RESTART IDENTITY CASCADE`,
  );
  await resetUsers();
});

async function loginAs(email, password, role) {
  await createUser(email, password, role);
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email, password });
  return call;
}

const adminClient = () => loginAs('admin@example.com', 'password123', 'admin');

// Ученик с планом из двух тем; первая уже зачтена — значит XP уже начислен.
async function seedStudent() {
  const user = await createUser('pupil@example.com', 'password123', 'student');
  const { rows: prof } = await pool.query(
    "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge') RETURNING id",
    [user.id],
  );
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ('Биология', 'oge') RETURNING id",
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title, order_index) VALUES ($1, 'Раздел', 0) RETURNING id",
    [subj[0].id],
  );
  const { rows: topics } = await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index)
     VALUES ($1, 9, 'Тема 1', 0), ($1, 9, 'Тема 2', 1) RETURNING id`,
    [sec[0].id],
  );
  const { rows: plan } = await pool.query(
    `INSERT INTO learning_plans (student_id, subject_id, exam_type, status)
     VALUES ($1, $2, 'oge', 'active') RETURNING id`,
    [prof[0].id, subj[0].id],
  );
  await pool.query(
    `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
     VALUES ($1, $2, 0, 'completed'), ($1, $3, 1, 'not_started')`,
    [plan[0].id, topics[0].id, topics[1].id],
  );

  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email: 'pupil@example.com', password: 'password123' });
  return call;
}

// Валидные настройки с точечной правкой — чтобы каждый тест не собирал их целиком.
function settingsWith(patch = {}) {
  return { ...DEFAULT_GAMIFICATION, ...patch };
}

describe('настройки геймификации', () => {
  it('пока ничего не сохранено, отдаёт значения по умолчанию', async () => {
    const admin = await adminClient();
    const { status, data } = await admin('GET', '/api/admin/settings/gamification');

    assert.equal(status, 200);
    assert.equal(data.settings.xpPerTopic, DEFAULT_GAMIFICATION.xpPerTopic);
    assert.equal(data.settings.passPercent, DEFAULT_GAMIFICATION.passPercent);
    assert.equal(data.settings.levels.length, DEFAULT_GAMIFICATION.levels.length);
    // Дефолты и список показателей нужны админке, чтобы показать «сбросить» и
    // выпадающий список условий.
    assert.ok(data.defaults);
    assert.ok(data.metrics.topicsCompleted);
  });

  it('сохраняет правила и возвращает их при следующем чтении', async () => {
    const admin = await adminClient();
    const saved = await admin(
      'PUT',
      '/api/admin/settings/gamification',
      settingsWith({ xpPerTopic: 25, passPercent: 60 }),
    );
    assert.equal(saved.status, 200);

    const { data } = await admin('GET', '/api/admin/settings/gamification');
    assert.equal(data.settings.xpPerTopic, 25);
    assert.equal(data.settings.passPercent, 60);
  });

  it('сброс возвращает поведение к дефолтам', async () => {
    const admin = await adminClient();
    await admin('PUT', '/api/admin/settings/gamification', settingsWith({ xpPerTopic: 25 }));

    const reset = await admin('DELETE', '/api/admin/settings/gamification');
    assert.equal(reset.status, 200);

    const { data } = await admin('GET', '/api/admin/settings/gamification');
    assert.equal(data.settings.xpPerTopic, DEFAULT_GAMIFICATION.xpPerTopic);
  });

  describe('доступ', () => {
    it('обычный пользователь не читает и не меняет настройки', async () => {
      const user = await loginAs('user@example.com', 'password123', 'user');

      assert.equal((await user('GET', '/api/admin/settings/gamification')).status, 403);
      assert.equal(
        (await user('PUT', '/api/admin/settings/gamification', settingsWith())).status,
        403,
      );
    });

    it('без входа — 401', async () => {
      const guest = makeClient(base);
      assert.equal((await guest('GET', '/api/admin/settings/gamification')).status, 401);
    });
  });

  describe('валидация', () => {
    const cases = [
      ['XP за тему нулевой', { xpPerTopic: 0 }],
      ['XP за тему дробный', { xpPerTopic: 12.5 }],
      ['порог зачёта больше 100', { passPercent: 120 }],
      ['уровни пустые', { levels: [] }],
      ['первый уровень не с нуля', { levels: [{ level: 1, minXp: 50, title: 'Старт' }] }],
      [
        'пороги уровней не возрастают',
        {
          levels: [
            { level: 1, minXp: 0, title: 'Раз' },
            { level: 2, minXp: 0, title: 'Два' },
          ],
        },
      ],
      [
        'у значка неизвестный показатель',
        { badges: [{ code: 'x', label: 'Значок', metric: 'нечто', threshold: 1 }] },
      ],
      [
        'коды значков повторяются',
        {
          badges: [
            { code: 'dup', label: 'Раз', metric: 'topicsCompleted', threshold: 1 },
            { code: 'dup', label: 'Два', metric: 'topicsCompleted', threshold: 2 },
          ],
        },
      ],
      [
        'порог процентного значка выше 100',
        { badges: [{ code: 'best', label: 'Лучший', metric: 'bestScore', threshold: 101 }] },
      ],
    ];

    for (const [name, patch] of cases) {
      it(`отклоняет: ${name}`, async () => {
        const admin = await adminClient();
        const { status, data } = await admin(
          'PUT',
          '/api/admin/settings/gamification',
          settingsWith(patch),
        );
        assert.equal(status, 400);
        assert.ok(data.error);
      });
    }

    it('после отклонённой правки действуют прежние правила', async () => {
      const admin = await adminClient();
      await admin('PUT', '/api/admin/settings/gamification', settingsWith({ xpPerTopic: 25 }));
      await admin('PUT', '/api/admin/settings/gamification', settingsWith({ xpPerTopic: 0 }));

      const { data } = await admin('GET', '/api/admin/settings/gamification');
      assert.equal(data.settings.xpPerTopic, 25);
    });
  });

  describe('влияние на кабинет ученика', () => {
    it('XP за тему пересчитывается по новым правилам', async () => {
      const admin = await adminClient();
      const pupil = await seedStudent();

      const before = await pupil('GET', '/api/me/overview');
      assert.equal(before.data.stats.xp, DEFAULT_GAMIFICATION.xpPerTopic);

      await admin('PUT', '/api/admin/settings/gamification', settingsWith({ xpPerTopic: 100 }));

      const after = await pupil('GET', '/api/me/overview');
      // Та же одна освоенная тема, но шаг XP другой — величина выведена, а не хранится.
      assert.equal(after.data.stats.xp, 100);
    });

    it('титул уровня берётся из настроенной шкалы', async () => {
      const admin = await adminClient();
      const pupil = await seedStudent();

      await admin(
        'PUT',
        '/api/admin/settings/gamification',
        settingsWith({
          xpPerTopic: 10,
          levels: [
            { level: 1, minXp: 0, title: 'Старт' },
            { level: 2, minXp: 10, title: 'Разогнался' },
          ],
        }),
      );

      const { data } = await pupil('GET', '/api/me/overview');
      assert.equal(data.stats.level, 2);
      assert.equal(data.stats.title, 'Разогнался');
    });

    it('выключенный значок исчезает из кабинета', async () => {
      const admin = await adminClient();
      const pupil = await seedStudent();

      const before = await pupil('GET', '/api/me/overview');
      assert.ok(before.data.stats.badges.some((b) => b.code === 'first_topic'));

      await admin(
        'PUT',
        '/api/admin/settings/gamification',
        settingsWith({
          badges: DEFAULT_GAMIFICATION.badges.map((b) =>
            b.code === 'first_topic' ? { ...b, enabled: false } : b,
          ),
        }),
      );

      const after = await pupil('GET', '/api/me/overview');
      assert.ok(!after.data.stats.badges.some((b) => b.code === 'first_topic'));
    });

    it('порог зачёта из настроек решает судьбу попытки', async () => {
      const admin = await adminClient();
      const pupil = await seedStudent();

      // Тест из двух вопросов: ответим верно ровно на один — это 50%.
      const { rows: topic } = await pool.query(
        "SELECT id FROM topics WHERE title = 'Тема 2' LIMIT 1",
      );
      const { rows: qs } = await pool.query(
        `INSERT INTO questions (topic_id, type, text, correct_short_answer, order_index)
         VALUES ($1, 'short_answer', 'Первый вопрос', 'да', 0),
                ($1, 'short_answer', 'Второй вопрос', 'нет', 1)
         RETURNING id`,
        [topic[0].id],
      );
      const answers = { [qs[0].id]: { text: 'да' }, [qs[1].id]: { text: 'мимо' } };

      // При стандартных 70% половина правильных ответов — незачёт.
      const strict = await pupil('POST', `/api/me/topics/${topic[0].id}/test`, { answers });
      assert.equal(strict.data.percent, 50);
      assert.equal(strict.data.passed, false);

      await admin('PUT', '/api/admin/settings/gamification', settingsWith({ passPercent: 40 }));

      const lenient = await pupil('POST', `/api/me/topics/${topic[0].id}/test`, { answers });
      assert.equal(lenient.data.passed, true);
      // Зачёт закрывает тему плана и начисляет XP за неё.
      assert.equal(lenient.data.xpAwarded, DEFAULT_GAMIFICATION.xpPerTopic);
    });
  });
});
