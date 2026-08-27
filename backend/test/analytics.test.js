// Аналитика: срез по ученикам, карточка, слабые места контента, сводка и CSV.
// Всё выводится из попыток и статусов тем, поэтому проверяем на реальных данных.

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
  await pool.query(
    `TRUNCATE test_attempts, learning_plan_items, learning_plans, student_profiles,
              topics, sections, subjects
     RESTART IDENTITY CASCADE`,
  );
  await resetUsers();
});

async function adminClient() {
  await createUser('admin@example.com', 'password123', 'admin');
  const call = makeClient(base);
  await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
  return call;
}

// Предмет с тремя темами и два ученика с разной успеваемостью:
//   Аня  — обе первые темы закрыла, попытки успешные;
//   Боря — застрял на второй теме: три попытки, ни одной зачтённой.
async function seed() {
  const { rows: subj } = await pool.query(
    "INSERT INTO subjects (name, applies_to) VALUES ('Биология', 'oge') RETURNING id",
  );
  const { rows: sec } = await pool.query(
    "INSERT INTO sections (subject_id, title, order_index) VALUES ($1, 'Раздел', 0) RETURNING id",
    [subj[0].id],
  );
  const { rows: topics } = await pool.query(
    `INSERT INTO topics (section_id, grade, title, order_index)
     VALUES ($1, 9, 'Тема 1', 0), ($1, 9, 'Тема 2', 1), ($1, 9, 'Тема 3', 2) RETURNING id`,
    [sec[0].id],
  );

  async function makeStudent(email, name, grade, exam) {
    const user = await createUser(email, 'password123', 'student');
    await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, name]);
    const { rows: prof } = await pool.query(
      `INSERT INTO student_profiles (user_id, grade, exam_type)
       VALUES ($1, $2, $3) RETURNING id`,
      [user.id, grade, exam],
    );
    const { rows: plan } = await pool.query(
      `INSERT INTO learning_plans (student_id, subject_id, exam_type, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [prof[0].id, subj[0].id, exam],
    );
    await pool.query(
      `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
       VALUES ($1, $2, 0, 'not_started'), ($1, $3, 1, 'not_started'), ($1, $4, 2, 'not_started')`,
      [plan[0].id, topics[0].id, topics[1].id, topics[2].id],
    );
    return { userId: user.id, profileId: prof[0].id, planId: plan[0].id };
  }

  const anya = await makeStudent('anya@example.com', 'Аня Петрова', 9, 'oge');
  const borya = await makeStudent('borya@example.com', 'Боря Сидоров', 11, 'ege');

  // Аня закрыла две темы.
  await pool.query(
    `UPDATE learning_plan_items SET status = 'completed', completed_at = now()
     WHERE plan_id = $1 AND topic_id = ANY($2)`,
    [anya.planId, [topics[0].id, topics[1].id]],
  );
  await pool.query(
    `INSERT INTO test_attempts (student_id, topic_id, score_percent, passed, finished_at)
     VALUES ($1, $2, 90, true, now()), ($1, $3, 80, true, now())`,
    [anya.profileId, topics[0].id, topics[1].id],
  );

  // Боря: одна тема закрыта, на второй три неудачные попытки.
  await pool.query(
    `UPDATE learning_plan_items SET status = 'completed', completed_at = now()
     WHERE plan_id = $1 AND topic_id = $2`,
    [borya.planId, topics[0].id],
  );
  await pool.query(
    `INSERT INTO test_attempts (student_id, topic_id, score_percent, passed, finished_at)
     VALUES ($1, $2, 75, true, now()),
            ($1, $3, 40, false, now()), ($1, $3, 50, false, now()), ($1, $3, 60, false, now())`,
    [borya.profileId, topics[0].id, topics[1].id],
  );

  return { subjectId: subj[0].id, topicIds: topics.map((t) => t.id), anya, borya };
}

const byName = (students, name) => students.find((s) => s.full_name === name);

describe('аналитика', () => {
  describe('доступ', () => {
    it('без сессии — 401, без права users:read — 403', async () => {
      const guest = makeClient(base);
      assert.equal((await guest('GET', '/api/admin/analytics/summary')).status, 401);

      await createUser('user@example.com', 'password123', 'user');
      const user = makeClient(base);
      await user('POST', '/api/auth/login', {
        email: 'user@example.com',
        password: 'password123',
      });
      assert.equal((await user('GET', '/api/admin/analytics/students')).status, 403);
    });
  });

  describe('срез по ученикам', () => {
    it('считает прогресс, попытки и баллы по каждому', async () => {
      await seed();
      const admin = await adminClient();

      const { status, data } = await admin('GET', '/api/admin/analytics/students');
      assert.equal(status, 200);
      assert.equal(data.students.length, 2);

      const anya = byName(data.students, 'Аня Петрова');
      assert.equal(anya.topics_total, 3);
      assert.equal(anya.topics_done, 2);
      assert.equal(anya.progress_percent, 67);
      assert.equal(anya.attempts, 2);
      assert.equal(anya.attempts_passed, 2);
      assert.equal(anya.avg_score, 85);
      assert.equal(anya.best_score, 90);

      const borya = byName(data.students, 'Боря Сидоров');
      assert.equal(borya.attempts, 4);
      assert.equal(borya.attempts_passed, 1);
      assert.equal(borya.progress_percent, 33);
    });

    it('прогресс и попытки не размножаются при нескольких планах', async () => {
      const { anya } = await seed();
      // Второй предмет тому же ученику: наивный join завысил бы и темы, и попытки.
      const { rows: subj2 } = await pool.query(
        "INSERT INTO subjects (name, applies_to) VALUES ('Химия', 'oge') RETURNING id",
      );
      const { rows: sec2 } = await pool.query(
        "INSERT INTO sections (subject_id, title) VALUES ($1, 'Раздел') RETURNING id",
        [subj2[0].id],
      );
      const { rows: t2 } = await pool.query(
        "INSERT INTO topics (section_id, grade, title) VALUES ($1, 9, 'Химия 1') RETURNING id",
        [sec2[0].id],
      );
      const { rows: plan2 } = await pool.query(
        `INSERT INTO learning_plans (student_id, subject_id, exam_type, status)
         VALUES ($1, $2, 'oge', 'active') RETURNING id`,
        [anya.profileId, subj2[0].id],
      );
      await pool.query(
        `INSERT INTO learning_plan_items (plan_id, topic_id, order_index, status)
         VALUES ($1, $2, 0, 'not_started')`,
        [plan2[0].id, t2[0].id],
      );

      const admin = await adminClient();
      const { data } = await admin('GET', '/api/admin/analytics/students');
      const row = byName(data.students, 'Аня Петрова');

      assert.equal(row.topics_total, 4, '3 темы биологии + 1 химии');
      assert.equal(row.topics_done, 2);
      assert.equal(row.attempts, 2, 'попытки не должны удваиваться из-за второго плана');
    });

    it('фильтры по классу, экзамену и предмету', async () => {
      const { subjectId } = await seed();
      const admin = await adminClient();

      const byGrade = await admin('GET', '/api/admin/analytics/students?grade=9');
      assert.equal(byGrade.data.students.length, 1);
      assert.equal(byGrade.data.students[0].full_name, 'Аня Петрова');

      const byExam = await admin('GET', '/api/admin/analytics/students?exam=ege');
      assert.equal(byExam.data.students.length, 1);
      assert.equal(byExam.data.students[0].full_name, 'Боря Сидоров');

      const bySubject = await admin('GET', `/api/admin/analytics/students?subject_id=${subjectId}`);
      assert.equal(bySubject.data.students.length, 2);
    });

    it('кривые фильтры отклоняются', async () => {
      const admin = await adminClient();
      assert.equal((await admin('GET', '/api/admin/analytics/students?grade=5')).status, 400);
      assert.equal((await admin('GET', '/api/admin/analytics/students?exam=vpr')).status, 400);
    });

    it('ученик без попыток попадает в срез с нулями', async () => {
      const admin = await adminClient();
      const user = await createUser('new@example.com', 'password123', 'student');
      await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, 'Новичок']);
      await pool.query(
        "INSERT INTO student_profiles (user_id, grade, exam_type) VALUES ($1, 9, 'oge')",
        [user.id],
      );

      const { data } = await admin('GET', '/api/admin/analytics/students');
      const row = byName(data.students, 'Новичок');
      assert.equal(row.attempts, 0);
      assert.equal(row.topics_total, 0);
      assert.equal(row.progress_percent, 0);
      assert.equal(row.avg_score, null);
    });
  });

  describe('карточка ученика', () => {
    it('отдаёт планы, историю попыток и темы, где ученик застрял', async () => {
      const { borya } = await seed();
      const admin = await adminClient();

      const { status, data } = await admin('GET', `/api/admin/analytics/students/${borya.userId}`);
      assert.equal(status, 200);
      assert.equal(data.profile.full_name, 'Боря Сидоров');
      assert.equal(data.plans.length, 1);
      assert.equal(data.plans[0].topics_done, 1);
      assert.equal(data.attempts.length, 4);

      // Застрявшая тема — та, где попытки были, а зачёта нет.
      assert.equal(data.stuck.length, 1);
      assert.equal(data.stuck[0].topic_title, 'Тема 2');
      assert.equal(data.stuck[0].attempts, 3);
      assert.equal(data.stuck[0].best_score, 60);
    });

    it('у успешного ученика застрявших тем нет', async () => {
      const { anya } = await seed();
      const admin = await adminClient();

      const { data } = await admin('GET', `/api/admin/analytics/students/${anya.userId}`);
      assert.equal(data.stuck.length, 0);
    });

    it('несуществующий ученик — 404', async () => {
      const admin = await adminClient();
      const { status } = await admin('GET', '/api/admin/analytics/students/999999');
      assert.equal(status, 404);
    });
  });

  describe('аналитика контента', () => {
    it('показывает долю зачётов и число застрявших по теме', async () => {
      await seed();
      const admin = await adminClient();

      const { status, data } = await admin('GET', '/api/admin/analytics/topics');
      assert.equal(status, 200);

      // Самая проблемная тема идёт первой: сортировка по доле зачётов.
      const worst = data.topics[0];
      assert.equal(worst.topic_title, 'Тема 2');
      assert.equal(worst.attempts, 4, '3 неудачные Бори + 1 удачная Ани');
      assert.equal(worst.attempts_passed, 1);
      assert.equal(worst.pass_rate, 25);
      assert.equal(worst.stuck_students, 1);
      assert.equal(worst.avg_attempts_to_pass, 1, 'считается только по закрывшим тему');
    });

    it('тема без попыток в отчёт не попадает', async () => {
      await seed();
      const admin = await adminClient();

      const { data } = await admin('GET', '/api/admin/analytics/topics');
      assert.ok(!data.topics.some((t) => t.topic_title === 'Тема 3'));
    });

    it('фильтр по предмету', async () => {
      const { subjectId } = await seed();
      const admin = await adminClient();

      const mine = await admin('GET', `/api/admin/analytics/topics?subject_id=${subjectId}`);
      assert.equal(mine.data.topics.length, 2);

      const other = await admin('GET', '/api/admin/analytics/topics?subject_id=999999');
      assert.equal(other.data.topics.length, 0);
    });
  });

  describe('сводка', () => {
    it('считает учеников, активность и средний прогресс', async () => {
      await seed();
      const admin = await adminClient();

      const { status, data } = await admin('GET', '/api/admin/analytics/summary');
      assert.equal(status, 200);
      assert.equal(data.days, 7);
      assert.equal(data.summary.students, 2);
      assert.equal(data.summary.active_students, 2);
      assert.equal(data.summary.attempts, 6);
      assert.equal(data.summary.attempts_passed, 3);
      // Средний прогресс по ученикам: (67 + 33) / 2.
      assert.equal(data.summary.avg_progress, 50);
      assert.equal(data.summary.topics_completed, 3);
    });

    it('период ограничивает выборку активности', async () => {
      await seed();
      const admin = await adminClient();
      // Отодвигаем все попытки на месяц назад — за неделю активности не будет.
      await pool.query("UPDATE test_attempts SET finished_at = now() - interval '30 days'");

      const week = await admin('GET', '/api/admin/analytics/summary?days=7');
      assert.equal(week.data.summary.active_students, 0);
      assert.equal(week.data.summary.attempts, 0);

      const quarter = await admin('GET', '/api/admin/analytics/summary?days=90');
      assert.equal(quarter.data.summary.attempts, 6);
    });

    it('кривой период отклоняется', async () => {
      const admin = await adminClient();
      assert.equal((await admin('GET', '/api/admin/analytics/summary?days=0')).status, 400);
      assert.equal((await admin('GET', '/api/admin/analytics/summary?days=1000')).status, 400);
    });
  });

  describe('выгрузка CSV', () => {
    it('отдаёт файл с заголовками и строками по ученикам', async () => {
      await seed();
      await adminClient();

      // Обычный fetch: makeClient разбирает ответ как JSON, а тут текст.
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
      });
      const cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');

      const res = await fetch(`${base}/api/admin/analytics/students.csv`, { headers: { cookie } });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/csv/);
      assert.match(res.headers.get('content-disposition'), /students\.csv/);

      // Проверяем именно байты: res.text() декодирует UTF-8 и ведущий BOM
      // выбрасывает, так что по строке его наличие не увидеть.
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert.deepEqual(
        [...bytes.slice(0, 3)],
        [0xef, 0xbb, 0xbf],
        'BOM нужен, иначе Excel показывает кракозябры',
      );

      const text = new TextDecoder().decode(bytes);
      const lines = text.replace('\uFEFF', '').trim().split('\r\n');
      assert.equal(lines.length, 3, 'заголовок + два ученика');
      assert.match(lines[0], /ФИО;E-mail;Класс/);
      assert.ok(lines.some((l) => l.includes('Аня Петрова')));
    });
  });
});
