// Настройки приложения, редактируемые администратором. Хранятся в app_settings
// как «ключ → JSON» (см. миграцию 008), правила описаны в gamification.js.
//
// Читаем из БД на каждом запросе, без кэша в памяти: экземпляров backend может
// быть несколько, и кэш у них разъехался бы после правки настроек — а запрос
// одной строки по первичному ключу дешевле, чем инвалидация между процессами.

import express from 'express';
import { requireAuth, requirePermission } from './auth.js';
import { pool } from './db.js';
import { BADGE_METRICS, DEFAULT_GAMIFICATION } from './gamification.js';
import { PERMISSIONS } from './roles.js';

export const settingsRouter = express.Router();

settingsRouter.use(requireAuth);

const GAMIFICATION_KEY = 'gamification';

const MAX_LEVELS = 20;
const MAX_BADGES = 30;
const CODE_RE = /^[a-z0-9_]{1,40}$/;

// Действующие правила геймификации: сохранённые администратором либо дефолтные,
// пока он ничего не менял. Раскладываем поверх дефолтов, чтобы настройка,
// сохранённая прежней версией кода, не потеряла новых полей.
export async function getGamificationSettings() {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [
    GAMIFICATION_KEY,
  ]);
  if (!rows[0]) return { ...DEFAULT_GAMIFICATION };
  return { ...DEFAULT_GAMIFICATION, ...rows[0].value };
}

function intInRange(value, { min, max, label }) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    return `${label}: нужно целое число от ${min} до ${max}`;
  }
  return null;
}

function validateLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return 'Уровни: нужен хотя бы один уровень';
  }
  if (levels.length > MAX_LEVELS) {
    return `Уровни: не больше ${MAX_LEVELS}`;
  }

  for (let i = 0; i < levels.length; i += 1) {
    const row = levels[i];
    const at = `Уровень №${i + 1}`;

    const levelError = intInRange(row?.level, { min: 1, max: 999, label: `${at}: номер` });
    if (levelError) return levelError;

    const xpError = intInRange(row?.minXp, { min: 0, max: 1000000, label: `${at}: порог XP` });
    if (xpError) return xpError;

    const title = typeof row?.title === 'string' ? row.title.trim() : '';
    if (title.length === 0 || title.length > 50) {
      return `${at}: название от 1 до 50 символов`;
    }

    // Порядок обязателен: levelFromXp идёт по списку сверху вниз и на неотсортированной
    // шкале выдал бы не тот уровень.
    if (i > 0) {
      if (Number(row.minXp) <= Number(levels[i - 1].minXp)) {
        return `${at}: порог XP должен быть больше предыдущего`;
      }
      if (Number(row.level) <= Number(levels[i - 1].level)) {
        return `${at}: номер должен быть больше предыдущего`;
      }
    }
  }

  // Первый уровень обязан начинаться с нуля, иначе ученик без XP не попадёт
  // ни в один уровень.
  if (Number(levels[0].minXp) !== 0) {
    return 'Уровень №1: порог XP должен быть 0';
  }

  return null;
}

function validateBadges(badges) {
  if (!Array.isArray(badges)) return 'Значки: нужен список';
  if (badges.length > MAX_BADGES) return `Значки: не больше ${MAX_BADGES}`;

  const seen = new Set();
  for (let i = 0; i < badges.length; i += 1) {
    const row = badges[i];
    const at = `Значок №${i + 1}`;

    const code = typeof row?.code === 'string' ? row.code.trim() : '';
    if (!CODE_RE.test(code)) {
      return `${at}: код — латиница, цифры и подчёркивание, до 40 символов`;
    }
    if (seen.has(code)) return `${at}: код «${code}» уже используется`;
    seen.add(code);

    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    if (label.length === 0 || label.length > 60) {
      return `${at}: название от 1 до 60 символов`;
    }

    const hint = typeof row?.hint === 'string' ? row.hint.trim() : '';
    if (hint.length > 120) return `${at}: подсказка не длиннее 120 символов`;

    if (!Object.hasOwn(BADGE_METRICS, row?.metric)) {
      return `${at}: неизвестный показатель`;
    }

    // Процентный показатель ограничен сотней — порог выше недостижим, и значок
    // навсегда остался бы серым.
    const max = row.metric === 'bestScore' ? 100 : 100000;
    const thresholdError = intInRange(row?.threshold, { min: 0, max, label: `${at}: порог` });
    if (thresholdError) return thresholdError;

    if (row?.enabled !== undefined && typeof row.enabled !== 'boolean') {
      return `${at}: признак «включён» должен быть true или false`;
    }
  }

  return null;
}

// Возвращает { value } или { error }: собирает уже нормализованный объект,
// чтобы в БД не попали лишние поля из тела запроса.
export function validateGamification(body) {
  const xpError = intInRange(body?.xpPerTopic, { min: 1, max: 10000, label: 'XP за тему' });
  if (xpError) return { error: xpError };

  const passError = intInRange(body?.passPercent, { min: 1, max: 100, label: 'Порог зачёта' });
  if (passError) return { error: passError };

  const levelsError = validateLevels(body?.levels);
  if (levelsError) return { error: levelsError };

  const badgesError = validateBadges(body?.badges);
  if (badgesError) return { error: badgesError };

  return {
    value: {
      xpPerTopic: Number(body.xpPerTopic),
      passPercent: Number(body.passPercent),
      levels: body.levels.map((row) => ({
        level: Number(row.level),
        minXp: Number(row.minXp),
        title: String(row.title).trim(),
      })),
      badges: body.badges.map((row) => ({
        code: String(row.code).trim(),
        label: String(row.label).trim(),
        hint: typeof row.hint === 'string' ? row.hint.trim() : '',
        metric: row.metric,
        threshold: Number(row.threshold),
        enabled: row.enabled !== false,
      })),
    },
  };
}

// Чтение — всему персоналу (кабинет ученика показывает те же правила),
// изменение — отдельным правом.
settingsRouter.get(
  '/gamification',
  requirePermission(PERMISSIONS.USERS_READ),
  async (_req, res) => {
    try {
      const settings = await getGamificationSettings();
      res.json({ settings, defaults: DEFAULT_GAMIFICATION, metrics: BADGE_METRICS });
    } catch (err) {
      console.error('settings get failed:', err);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  },
);

settingsRouter.put(
  '/gamification',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  async (req, res) => {
    const { value, error } = validateGamification(req.body ?? {});
    if (error) return res.status(400).json({ error });

    try {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [GAMIFICATION_KEY, JSON.stringify(value), req.user.id],
      );
      res.json({ settings: value });
    } catch (err) {
      console.error('settings save failed:', err);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  },
);

// Сброс к значениям по умолчанию — удаление строки, а не запись дефолтов:
// тогда правила снова следуют за кодом, а не застывают на значениях того дня,
// когда нажали «сбросить».
settingsRouter.delete(
  '/gamification',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  async (_req, res) => {
    try {
      await pool.query('DELETE FROM app_settings WHERE key = $1', [GAMIFICATION_KEY]);
      res.json({ settings: DEFAULT_GAMIFICATION });
    } catch (err) {
      console.error('settings reset failed:', err);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  },
);
