// Геймификация кабинета ученика — чистые функции без обращения к БД.
//
// Принцип: никаких отдельных мутабельных счётчиков. Все величины ВЫВОДЯТСЯ из уже
// имеющихся данных (освоенные темы, попытки тестов), поэтому не могут «разъехаться»
// с реальным прогрессом. XP = XP_PER_TOPIC × число освоенных тем; статус темы
// 'completed' терминальный (см. me.js), так что двойного начисления не бывает.

// Опыт за одну зачтённую тему.
export const XP_PER_TOPIC = 40;

// Пороги уровней (накопленный XP) и титулы. Значения кратны шагу за тему, чтобы
// «до следующего уровня» считалось в целых темах. Выше десятого — потолок.
export const LEVELS = [
  { level: 1, minXp: 0, title: 'Новичок' },
  { level: 2, minXp: 120, title: 'Ученик' },
  { level: 3, minXp: 280, title: 'Старатель' },
  { level: 4, minXp: 480, title: 'Знаток' },
  { level: 5, minXp: 720, title: 'Умелец' },
  { level: 6, minXp: 1000, title: 'Мастер' },
  { level: 7, minXp: 1240, title: 'Исследователь' },
  { level: 8, minXp: 1500, title: 'Эрудит' },
  { level: 9, minXp: 1840, title: 'Наставник' },
  { level: 10, minXp: 2200, title: 'Гений' },
];

// Разложение XP в уровень: текущий уровень, титул, прогресс внутри уровня и сколько
// XP до следующего. На максимальном уровне xpForNext = 0 (полоса заполнена).
export function levelFromXp(xp) {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i].minXp) idx = i;
  }
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const xpForNext = next ? next.minXp - cur.minXp : 0;
  return {
    level: cur.level,
    title: cur.title,
    xp: safeXp,
    xpFloor: cur.minXp,
    xpNext: next ? next.minXp : null,
    xpIntoLevel: safeXp - cur.minXp,
    xpForNext,
  };
}

// Длина серии — сколько дней подряд (заканчивая сегодня или вчера) была активность.
// dates — массив строк 'YYYY-MM-DD' (день попытки теста). Считаем в UTC: расхождение
// с местным днём для «серии» несущественно, зато детерминированно.
export function streakFromDates(dates) {
  const days = new Set(dates.map((d) => String(d).slice(0, 10)));
  if (days.size === 0) return 0;

  const dayMs = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const todayMs = Date.parse(`${iso(Date.now())}T00:00:00Z`);

  // Серия «живёт», если последняя активность была сегодня или вчера.
  let cursor;
  if (days.has(iso(todayMs))) cursor = todayMs;
  else if (days.has(iso(todayMs - dayMs))) cursor = todayMs - dayMs;
  else return 0;

  let streak = 0;
  while (days.has(iso(cursor))) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}

// Значки — правила поверх реальных данных ученика. Каждый либо получен (earned),
// либо подсвечивает, что нужно сделать (hint).
export function computeBadges({
  topicsCompleted = 0,
  subjectsCompleted = 0,
  streakDays = 0,
  bestScore = 0,
} = {}) {
  return [
    {
      code: 'first_topic',
      label: 'Первая тема',
      hint: 'Освойте первую тему',
      earned: topicsCompleted >= 1,
    },
    {
      code: 'five_topics',
      label: 'Пять тем',
      hint: 'Освойте 5 тем',
      earned: topicsCompleted >= 5,
    },
    {
      code: 'twenty_topics',
      label: 'Двадцать тем',
      hint: 'Освойте 20 тем',
      earned: topicsCompleted >= 20,
    },
    {
      code: 'subject_done',
      label: 'Предмет пройден',
      hint: 'Закройте все темы предмета',
      earned: subjectsCompleted >= 1,
    },
    {
      code: 'excellent',
      label: 'Отличник',
      hint: 'Пройдите тест на 90% и выше',
      earned: bestScore >= 90,
    },
    {
      code: 'streak_7',
      label: 'Неделя подряд',
      hint: '7 дней занятий подряд',
      earned: streakDays >= 7,
    },
  ];
}
