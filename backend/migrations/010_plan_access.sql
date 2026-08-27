-- Управление доступом к темам внутри учебного плана.
--
-- Три независимых механизма поверх уже существующего порядка тем:
--   • learning_plans.sequential — нужен ли вообще гейт «сначала закрой предыдущую».
--     Выключенный план становится свободным: ученик идёт куда хочет;
--   • learning_plan_items.unlocked_at — тема открыта этому ученику вручную, в обход
--     и гейта, и расписания. Учитель разрешил забежать вперёд;
--   • learning_plan_items.available_from — тема откроется не раньше даты.
--     Дата, а не отметка времени: расписание занятий живёт в днях.
-- Плюс hidden_at — тема убрана у конкретного ученика, не трогая остальных.
--
-- Всё это про доступ, а не про содержание: снятие темы с публикации (миграция
-- 009) прячет её у всех, здесь — только у одного ученика в одном плане.
--
-- sequential по умолчанию true: до сих пор гейт действовал всегда, и смена
-- поведения существующих планов на молчаливо-свободное была бы сюрпризом.

ALTER TABLE learning_plans
  ADD COLUMN IF NOT EXISTS sequential BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE learning_plan_items
  ADD COLUMN IF NOT EXISTS unlocked_at    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS hidden_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS available_from DATE        NULL;

-- Выборки кабинета всегда идут по «нескрытым» позициям плана.
CREATE INDEX IF NOT EXISTS learning_plan_items_visible_idx
  ON learning_plan_items (plan_id, order_index)
  WHERE hidden_at IS NULL;
