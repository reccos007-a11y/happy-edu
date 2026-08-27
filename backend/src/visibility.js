// Видимость учебного контента одним правилом на весь backend.
//
// Тема доступна ученику, только если опубликована вся цепочка предмет → раздел →
// тема: снять с публикации предмет должно быть достаточно, чтобы спрятать всё
// внутри, иначе пришлось бы обходить дерево и снимать флаги по одному.
//
// Персонал с content:write видит и черновики — поэтому условие собирается в
// SQL-фрагмент, а не хардкодится в каждом запросе: забытая проверка в одном
// месте показала бы ученику неготовый материал.

import { PERMISSIONS, hasPermission } from './roles.js';

// Видит ли пользователь черновики. Право на управление контентом = право его
// видеть до публикации.
export function seesDrafts(user) {
  return hasPermission(user?.role, PERMISSIONS.CONTENT_WRITE);
}

// Условие «опубликовано по всей цепочке» для переданных псевдонимов таблиц.
// Подставляется в WHERE/JOIN как есть — аргументы это имена из самого запроса,
// а не пользовательский ввод.
export function publishedChain({ topic, section, subject }) {
  const parts = [];
  if (topic) parts.push(`${topic}.published_at IS NOT NULL`);
  if (section) parts.push(`${section}.published_at IS NOT NULL`);
  if (subject) parts.push(`${subject}.published_at IS NOT NULL`);
  return parts.join(' AND ');
}

// То же условие, но с поблажкой для персонала: `$n` — булев параметр «видит
// черновики». Запрос остаётся один на обе роли, различие уходит в параметр.
export function visibleContent(aliases, draftsParam) {
  return `(${draftsParam} OR (${publishedChain(aliases)}))`;
}

// Готовый CTE со списком тем, доступных ученику. Кабинет ученика черновиков не
// видит никогда, поэтому здесь без параметра: подключается как
// `WITH ${VISIBLE_TOPICS_CTE} SELECT ... JOIN visible_topics vt ON vt.id = ...`.
//
// Отдельный CTE, а не условие в каждом запросе: цепочку из трёх таблиц пришлось
// бы повторять шесть раз, и забытое звено в одном месте показало бы ученику
// снятую с публикации тему.
export const VISIBLE_TOPICS_CTE = `visible_topics AS (
       SELECT t.id
       FROM topics t
       JOIN sections sec ON sec.id = t.section_id
       JOIN subjects s   ON s.id = sec.subject_id
       WHERE t.deleted_at IS NULL AND sec.deleted_at IS NULL AND s.deleted_at IS NULL
         AND ${publishedChain({ topic: 't', section: 'sec', subject: 's' })}
     )`;
