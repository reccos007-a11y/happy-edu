// Наполнение каталога демонстрационным, но реальным контентом: предметы,
// разделы и темы по кодификатору ФИПИ. Идемпотентно — предмет/раздел/тема
// ищутся по имени и создаются только если их ещё нет, поэтому повторный запуск
// не плодит дубли и безопасен на живой базе.
//
//   docker compose exec backend node src/seed-catalog.js

import { pool } from './db.js';

async function findOrCreateSubject(client, { name, applies_to, has_levels, order_index }) {
  const found = await client.query(
    'SELECT id FROM subjects WHERE lower(name) = lower($1) AND deleted_at IS NULL',
    [name],
  );
  if (found.rows[0]) return found.rows[0].id;

  const { rows } = await client.query(
    `INSERT INTO subjects (name, applies_to, has_levels, order_index)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, applies_to, has_levels, order_index],
  );
  return rows[0].id;
}

async function findOrCreateSection(client, subjectId, { title, order_index }) {
  const found = await client.query(
    'SELECT id FROM sections WHERE subject_id = $1 AND title = $2 AND deleted_at IS NULL',
    [subjectId, title],
  );
  if (found.rows[0]) return found.rows[0].id;

  const { rows } = await client.query(
    'INSERT INTO sections (subject_id, title, order_index) VALUES ($1, $2, $3) RETURNING id',
    [subjectId, title, order_index],
  );
  return rows[0].id;
}

async function findOrCreateTopic(client, sectionId, topic, order_index) {
  const found = await client.query(
    'SELECT id FROM topics WHERE section_id = $1 AND title = $2 AND deleted_at IS NULL',
    [sectionId, topic.title],
  );
  if (found.rows[0]) return found.rows[0].id;

  const { rows } = await client.query(
    `INSERT INTO topics (section_id, grade, title, order_index, codifier_code, difficulty)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      sectionId,
      topic.grade,
      topic.title,
      order_index,
      topic.codifier_code ?? null,
      topic.difficulty ?? 'base',
    ],
  );
  return rows[0].id;
}

// Демоданные. Разделы и коды — по духу кодификатора ФИПИ; для витрины каталога
// достаточно, реальный контент методисты заливают позже.
const CATALOG = [
  {
    name: 'Обществознание',
    applies_to: 'both',
    has_levels: false,
    sections: [
      {
        title: 'Человек и общество',
        topics: [
          {
            grade: 9,
            title: 'Биологическое и социальное в человеке',
            codifier_code: '1.1',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Личность. Социализация индивида',
            codifier_code: '1.2',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Потребности и способности человека',
            codifier_code: '1.3',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Общество как форма жизнедеятельности людей',
            codifier_code: '1.4',
            difficulty: 'advanced',
          },
        ],
      },
      {
        title: 'Сфера духовной культуры',
        topics: [
          {
            grade: 9,
            title: 'Наука в жизни современного общества',
            codifier_code: '2.1',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Образование и его значимость',
            codifier_code: '2.2',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Религия, мораль, гуманизм',
            codifier_code: '2.3',
            difficulty: 'advanced',
          },
        ],
      },
      {
        title: 'Экономика',
        topics: [
          {
            grade: 9,
            title: 'Экономика и её роль в жизни общества',
            codifier_code: '3.1',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Товары и услуги, ресурсы и потребности',
            codifier_code: '3.2',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Спрос и предложение. Рыночный механизм',
            codifier_code: '3.3',
            difficulty: 'advanced',
          },
          { grade: 9, title: 'Деньги. Инфляция', codifier_code: '3.4', difficulty: 'advanced' },
        ],
      },
      {
        title: 'Право',
        topics: [
          {
            grade: 9,
            title: 'Право, его роль в жизни общества',
            codifier_code: '6.1',
            difficulty: 'base',
          },
          {
            grade: 9,
            title: 'Конституция РФ. Основы конституционного строя',
            codifier_code: '6.2',
            difficulty: 'high',
          },
          {
            grade: 9,
            title: 'Права и свободы человека и гражданина',
            codifier_code: '6.3',
            difficulty: 'advanced',
          },
        ],
      },
    ],
  },
  {
    name: 'Математика',
    applies_to: 'both',
    has_levels: true,
    sections: [
      {
        title: 'Алгебра и начала анализа',
        topics: [
          { grade: 11, title: 'Производная функции', codifier_code: '3.1', difficulty: 'advanced' },
          {
            grade: 11,
            title: 'Геометрический смысл производной',
            codifier_code: '3.2',
            difficulty: 'advanced',
          },
          {
            grade: 11,
            title: 'Первообразная и интеграл',
            codifier_code: '3.3',
            difficulty: 'high',
          },
        ],
      },
      {
        title: 'Геометрия',
        topics: [
          {
            grade: 11,
            title: 'Планиметрия: углы и окружности',
            codifier_code: '5.1',
            difficulty: 'base',
          },
          {
            grade: 11,
            title: 'Стереометрия: объёмы тел',
            codifier_code: '5.2',
            difficulty: 'high',
          },
        ],
      },
    ],
  },
];

export async function seedCatalog() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let subjects = 0;
    let sections = 0;
    let topics = 0;

    for (const [si, subject] of CATALOG.entries()) {
      const subjectId = await findOrCreateSubject(client, {
        name: subject.name,
        applies_to: subject.applies_to,
        has_levels: subject.has_levels,
        order_index: si,
      });
      subjects += 1;

      for (const [seci, section] of subject.sections.entries()) {
        const sectionId = await findOrCreateSection(client, subjectId, {
          title: section.title,
          order_index: seci,
        });
        sections += 1;

        for (const [ti, topic] of section.topics.entries()) {
          await findOrCreateTopic(client, sectionId, topic, ti);
          topics += 1;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Каталог: ${subjects} предметов, ${sections} разделов, ${topics} тем`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  seedCatalog()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
