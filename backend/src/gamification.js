// Геймификация кабинета ученика — чистые функции без обращения к БД.
//
// Принцип: никаких отдельных мутабельных счётчиков. Все величины ВЫВОДЯТСЯ из уже
// имеющихся данных (освоенные темы, попытки тестов), поэтому не могут «разъехаться»
// с реальным прогрессом. XP = xpPerTopic × число освоенных тем; статус темы
// 'completed' терминальный (см. me.js), так что двойного начисления не бывает.
//
// Настраиваемы здесь ПРАВИЛА, а не результаты: администратор меняет шаг XP, пороги
// уровней и условия значков (см. settings.js), после чего величины пересчитываются
// из тех же данных. Ручного начисления XP нет — иначе счётчик снова стал бы
// источником правды и разошёлся бы с прогрессом.

// Значения по умолчанию действуют, пока администратор ничего не менял: описаны
// только здесь, миграция их не дублирует.
export const DEFAULT_XP_PER_TOPIC = 40;

// Порог зачёта тематического теста, %.
export const DEFAULT_PASS_PERCENT = 70;

// Пороги уровней (накопленный XP) и титулы. Значения кратны шагу за тему, чтобы
// «до следующего уровня» считалось в целых темах. Выше последнего — потолок.
export const DEFAULT_LEVELS = [
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

// Показатели, на которые может опираться значок. Ключи совпадают с полями,
// которые считает /api/me/overview, — добавление нового показателя требует
// правки и здесь, и там.
export const BADGE_METRICS = {
  topicsCompleted: 'Освоено тем',
  subjectsCompleted: 'Пройдено предметов',
  streakDays: 'Дней подряд',
  bestScore: 'Лучший результат теста, %',
};

// Значок = «показатель достиг порога». Такой формы хватает всем нынешним
// правилам, зато её можно редактировать из админки без выпуска новой версии.
export const DEFAULT_BADGES = [
  {
    code: 'first_topic',
    label: 'Первая тема',
    hint: 'Освойте первую тему',
    metric: 'topicsCompleted',
    threshold: 1,
    enabled: true,
  },
  {
    code: 'five_topics',
    label: 'Пять тем',
    hint: 'Освойте 5 тем',
    metric: 'topicsCompleted',
    threshold: 5,
    enabled: true,
  },
  {
    code: 'twenty_topics',
    label: 'Двадцать тем',
    hint: 'Освойте 20 тем',
    metric: 'topicsCompleted',
    threshold: 20,
    enabled: true,
  },
  {
    code: 'subject_done',
    label: 'Предмет пройден',
    hint: 'Закройте все темы предмета',
    metric: 'subjectsCompleted',
    threshold: 1,
    enabled: true,
  },
  {
    code: 'excellent',
    label: 'Отличник',
    hint: 'Пройдите тест на 90% и выше',
    metric: 'bestScore',
    threshold: 90,
    enabled: true,
  },
  {
    code: 'streak_7',
    label: 'Неделя подряд',
    hint: '7 дней занятий подряд',
    metric: 'streakDays',
    threshold: 7,
    enabled: true,
  },
];

export const DEFAULT_GAMIFICATION = {
  xpPerTopic: DEFAULT_XP_PER_TOPIC,
  passPercent: DEFAULT_PASS_PERCENT,
  levels: DEFAULT_LEVELS,
  badges: DEFAULT_BADGES,
};

// Разложение XP в уровень: текущий уровень, титул, прогресс внутри уровня и сколько
// XP до следующего. На максимальном уровне xpForNext = 0 (полоса заполнена).
export function levelFromXp(xp, levels = DEFAULT_LEVELS) {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  // Пустой список уровней сделал бы кабинет нерабочим, поэтому подстраховываемся
  // дефолтом: настройки валидируются при записи, но данные в БД переживают код.
  const scale = Array.isArray(levels) && levels.length > 0 ? levels : DEFAULT_LEVELS;

  let idx = 0;
  for (let i = 0; i < scale.length; i += 1) {
    if (safeXp >= scale[i].minXp) idx = i;
  }
  const cur = scale[idx];
  const next = scale[idx + 1] ?? null;
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
// либо подсвечивает, что нужно сделать (hint). Выключенные правила не показываются
// вовсе: ученику незачем видеть значок, который администратор убрал.
export function computeBadges(stats = {}, rules = DEFAULT_BADGES) {
  const list = Array.isArray(rules) ? rules : DEFAULT_BADGES;

  return list
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ({
      code: rule.code,
      label: rule.label,
      hint: rule.hint,
      earned: Number(stats[rule.metric] ?? 0) >= Number(rule.threshold),
    }));
}
