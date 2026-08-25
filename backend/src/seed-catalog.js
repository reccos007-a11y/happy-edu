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

async function findOrCreateQuestion(client, topicId, question, order_index) {
  const found = await client.query(
    'SELECT id FROM questions WHERE topic_id = $1 AND text = $2 AND deleted_at IS NULL',
    [topicId, question.text],
  );
  if (found.rows[0]) return;

  const { rows } = await client.query(
    `INSERT INTO questions (topic_id, type, text, difficulty, correct_short_answer, order_index)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      topicId,
      question.type ?? 'single_choice',
      question.text,
      question.difficulty ?? 'base',
      question.correct_short_answer ?? null,
      order_index,
    ],
  );
  const questionId = rows[0].id;
  for (const [i, o] of (question.options ?? []).entries()) {
    await client.query(
      `INSERT INTO question_options (question_id, option_text, is_correct, order_index)
       VALUES ($1, $2, $3, $4)`,
      [questionId, o.option_text, Boolean(o.is_correct), i],
    );
  }
}

async function findOrCreateMaterial(client, topicId, material, order_index) {
  const found = await client.query(
    'SELECT id FROM learning_materials WHERE topic_id = $1 AND title = $2 AND deleted_at IS NULL',
    [topicId, material.title],
  );
  if (found.rows[0]) return;

  await client.query(
    `INSERT INTO learning_materials (topic_id, type, title, content, file_url, order_index)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      topicId,
      material.type ?? 'text',
      material.title,
      material.content ?? null,
      material.file_url ?? null,
      order_index,
    ],
  );
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
  {
    name: 'Биология',
    applies_to: 'both',
    has_levels: false,
    sections: [
      {
        title: 'Науки об организме человека',
        topics: [
          { grade: 8, title: 'Биосоциальная природа человека', codifier_code: '1.1' },
          {
            grade: 8,
            title: 'Науки о человеке: анатомия, физиология, гигиена',
            codifier_code: '1.2',
          },
        ],
      },
      {
        title: 'Происхождение человека',
        topics: [
          { grade: 8, title: 'Место человека в живой природе', codifier_code: '2.1' },
          {
            grade: 8,
            title: 'Расы человека и их происхождение',
            codifier_code: '2.2',
            difficulty: 'advanced',
          },
        ],
      },
      {
        // Образцовый раздел: наполнен материалами (конспекты, схемы, анимации).
        title: 'Общий обзор организма. Строение',
        topics: [
          {
            grade: 8,
            title: 'Строение и жизнедеятельность клетки',
            codifier_code: '3.1',
            materials: [
              {
                type: 'text',
                title: 'Конспект: клетка — единица живого',
                content: `Клетка — наименьшая структурная и функциональная единица организма. Тело человека состоит примерно из 30–40 триллионов клеток, различных по форме и назначению, но сходных по общему плану строения.

Основные части клетки:
• Клеточная мембрана — тонкая оболочка, отделяющая клетку от среды и управляющая обменом веществ: пропускает нужные вещества внутрь и удаляет продукты обмена.
• Цитоплазма — внутренняя полужидкая среда, в которой протекают химические реакции и располагаются органоиды.
• Ядро — хранит наследственную информацию в молекулах ДНК и управляет жизнедеятельностью клетки.

Органоиды и их роль:
• Митохондрии — «энергетические станции»: в них питательные вещества окисляются, освобождая энергию (в форме АТФ).
• Эндоплазматическая сеть и рибосомы — синтез белков и транспорт веществ.
• Комплекс Гольджи — упаковка и вынос веществ из клетки.
• Лизосомы — расщепление и переваривание отработавших частей.

Жизнедеятельность клетки: обмен веществ и энергии, рост, деление, раздражимость. Благодаря делению клеток организм растёт и заживают повреждения.`,
              },
              {
                type: 'animation',
                title: 'Интерактивная схема клетки',
                content: 'cell-structure',
              },
              {
                type: 'image',
                title: 'Иллюстрация: строение животной клетки',
                file_url: '',
              },
            ],
            questions: [
              {
                type: 'single_choice',
                text: 'Какая часть клетки хранит наследственную информацию?',
                options: [
                  { option_text: 'Ядро', is_correct: true },
                  { option_text: 'Клеточная мембрана', is_correct: false },
                  { option_text: 'Цитоплазма', is_correct: false },
                ],
              },
              {
                type: 'single_choice',
                text: 'Какие органоиды называют «энергетическими станциями» клетки?',
                options: [
                  { option_text: 'Рибосомы', is_correct: false },
                  { option_text: 'Митохондрии', is_correct: true },
                  { option_text: 'Лизосомы', is_correct: false },
                ],
              },
              {
                type: 'multiple_choice',
                text: 'Выберите функции клеточной мембраны:',
                options: [
                  { option_text: 'Отделяет клетку от среды', is_correct: true },
                  { option_text: 'Управляет обменом веществ', is_correct: true },
                  { option_text: 'Хранит ДНК', is_correct: false },
                ],
              },
              {
                type: 'short_answer',
                text: 'Как называется полужидкая внутренняя среда клетки?',
                correct_short_answer: 'цитоплазма',
              },
            ],
          },
          {
            grade: 8,
            title: 'Ткани организма человека',
            codifier_code: '3.2',
            materials: [
              {
                type: 'text',
                title: 'Конспект: четыре типа тканей',
                content: `Ткань — группа клеток, сходных по строению и происхождению и выполняющих общую функцию. В организме человека выделяют четыре основных типа тканей.

1. Эпителиальная ткань. Клетки плотно прилегают друг к другу, межклеточного вещества мало. Покрывает тело снаружи (кожа) и выстилает полости органов, образует железы. Функции: защита, всасывание, выделение.

2. Соединительная ткань. Много межклеточного вещества. Очень разнообразна: кровь, костная и хрящевая ткань, жировая, связки и сухожилия. Функции: опора, транспорт, запас, защита.

3. Мышечная ткань. Способна сокращаться. Бывает гладкая (стенки внутренних органов), поперечнополосатая скелетная (движения тела) и сердечная. Функция: движение.

4. Нервная ткань. Состоит из нейронов и клеток-спутников. Обладает возбудимостью и проводимостью — воспринимает раздражения и проводит нервные импульсы. Функции: регуляция и связь частей организма.`,
              },
              {
                type: 'image',
                title: 'Иллюстрация: типы тканей под микроскопом',
                file_url: '',
              },
            ],
          },
          {
            grade: 8,
            title: 'Рефлекторная регуляция',
            codifier_code: '3.3',
            difficulty: 'advanced',
            materials: [
              {
                type: 'text',
                title: 'Конспект: рефлекс и рефлекторная дуга',
                content: `Рефлекс — ответная реакция организма на раздражение, осуществляемая при участии нервной системы. Именно рефлексы обеспечивают быстрое приспособление организма к изменениям среды.

Путь, по которому проходит нервный импульс при рефлексе, называют рефлекторной дугой. Она состоит из пяти звеньев:
1. Рецептор — воспринимает раздражение (например, боль от укола).
2. Чувствительный (центростремительный) нейрон — передаёт сигнал в центральную нервную систему.
3. Вставочный нейрон — в спинном или головном мозге переключает сигнал.
4. Двигательный (центробежный) нейрон — несёт команду к рабочему органу.
5. Рабочий орган (мышца или железа) — выполняет ответное действие.

Пример: касание горячего предмета → рецепторы кожи → импульс в спинной мозг → команда мышцам → рука отдёргивается. Всё происходит за доли секунды, ещё до того как мы осознаём боль.

Рефлексы бывают безусловные (врождённые) и условные (приобретённые в течение жизни).`,
              },
              {
                type: 'animation',
                title: 'Анимация: рефлекторная дуга',
                content: 'reflex-arc',
              },
            ],
          },
        ],
      },
      {
        title: 'Опорно-двигательная система',
        topics: [
          { grade: 8, title: 'Скелет человека. Строение костей', codifier_code: '4.1' },
          { grade: 8, title: 'Соединения костей и мышцы', codifier_code: '4.2' },
          { grade: 8, title: 'Осанка и предупреждение травм', codifier_code: '4.3' },
        ],
      },
      {
        title: 'Внутренняя среда организма',
        topics: [
          { grade: 8, title: 'Кровь и её состав', codifier_code: '5.1' },
          { grade: 8, title: 'Иммунитет', codifier_code: '5.2', difficulty: 'advanced' },
          {
            grade: 8,
            title: 'Группы крови. Переливание',
            codifier_code: '5.3',
            difficulty: 'advanced',
          },
        ],
      },
      {
        title: 'Кровеносная и лимфатическая системы',
        topics: [
          { grade: 8, title: 'Строение и работа сердца', codifier_code: '6.1' },
          { grade: 8, title: 'Круги кровообращения', codifier_code: '6.2', difficulty: 'advanced' },
        ],
      },
      {
        title: 'Дыхание',
        topics: [
          { grade: 8, title: 'Органы дыхания', codifier_code: '7.1' },
          {
            grade: 8,
            title: 'Газообмен в лёгких и тканях',
            codifier_code: '7.2',
            difficulty: 'advanced',
          },
        ],
      },
      {
        title: 'Пищеварение',
        topics: [
          { grade: 8, title: 'Питание и органы пищеварения', codifier_code: '8.1' },
          { grade: 8, title: 'Пищеварение в желудке и кишечнике', codifier_code: '8.2' },
          { grade: 8, title: 'Витамины', codifier_code: '8.3' },
        ],
      },
      {
        title: 'Обмен веществ и энергии',
        topics: [
          {
            grade: 8,
            title: 'Обмен белков, жиров и углеводов',
            codifier_code: '9.1',
            difficulty: 'advanced',
          },
          { grade: 8, title: 'Нормы питания', codifier_code: '9.2' },
        ],
      },
      {
        title: 'Покровы тела. Выделение',
        topics: [
          { grade: 8, title: 'Кожа и терморегуляция', codifier_code: '10.1' },
          { grade: 8, title: 'Строение и работа почек', codifier_code: '10.2' },
        ],
      },
      {
        title: 'Нервная система',
        topics: [
          { grade: 8, title: 'Значение и строение нервной системы', codifier_code: '11.1' },
          { grade: 8, title: 'Спинной мозг', codifier_code: '11.2' },
          { grade: 8, title: 'Головной мозг', codifier_code: '11.3', difficulty: 'advanced' },
        ],
      },
      {
        title: 'Органы чувств и анализаторы',
        topics: [
          { grade: 8, title: 'Зрение', codifier_code: '12.1' },
          { grade: 8, title: 'Слух и равновесие', codifier_code: '12.2' },
        ],
      },
      {
        title: 'Высшая нервная деятельность. Эндокринная система',
        topics: [
          {
            grade: 8,
            title: 'Рефлексы. Сон и бодрствование',
            codifier_code: '13.1',
            difficulty: 'advanced',
          },
          { grade: 8, title: 'Железы и гормоны', codifier_code: '13.2', difficulty: 'advanced' },
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
    let materials = 0;
    let questionsCount = 0;

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
          const topicId = await findOrCreateTopic(client, sectionId, topic, ti);
          topics += 1;

          for (const [mi, material] of (topic.materials ?? []).entries()) {
            await findOrCreateMaterial(client, topicId, material, mi);
            materials += 1;
          }
          for (const [qi, question] of (topic.questions ?? []).entries()) {
            await findOrCreateQuestion(client, topicId, question, qi);
            questionsCount += 1;
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(
      `Каталог: ${subjects} предметов, ${sections} разделов, ${topics} тем, ` +
        `${materials} материалов, ${questionsCount} вопросов`,
    );
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
