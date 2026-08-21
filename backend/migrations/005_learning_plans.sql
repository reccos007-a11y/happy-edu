-- Учебные планы (ТЗ, раздел 7.3): у ученика по одному плану на предмет,
-- план — упорядоченная последовательность тем со статусом изучения.
-- Уровень предмета (subject_level_id) опущен: таблицы subject_levels пока нет,
-- добавится отдельной миграцией вместе с базой/профилем по математике.

CREATE TABLE IF NOT EXISTS learning_plans (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id  BIGINT      NOT NULL REFERENCES student_profiles (id),
  subject_id  BIGINT      NOT NULL REFERENCES subjects (id),
  exam_type   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  start_date  DATE        NOT NULL DEFAULT current_date,
  target_date DATE        NULL,
  created_by  INTEGER     NULL REFERENCES users (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ NULL
);

ALTER TABLE learning_plans DROP CONSTRAINT IF EXISTS learning_plans_exam_type_check;
ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_exam_type_check
  CHECK (exam_type IN ('oge', 'ege'));

ALTER TABLE learning_plans DROP CONSTRAINT IF EXISTS learning_plans_status_check;
ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_status_check
  CHECK (status IN ('draft', 'active', 'completed', 'archived'));

-- Один активный план на предмет у ученика (удалённые не мешают).
CREATE UNIQUE INDEX IF NOT EXISTS learning_plans_student_subject_active_idx
  ON learning_plans (student_id, subject_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS learning_plans_student_status_idx
  ON learning_plans (student_id, status);

-- Позиции плана — темы в порядке прохождения со статусом изучения.
CREATE TABLE IF NOT EXISTS learning_plan_items (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id          BIGINT      NOT NULL REFERENCES learning_plans (id),
  topic_id         BIGINT      NOT NULL REFERENCES topics (id),
  order_index      INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'not_started',
  planned_deadline DATE        NULL,
  completed_at     TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE learning_plan_items DROP CONSTRAINT IF EXISTS learning_plan_items_status_check;
ALTER TABLE learning_plan_items ADD CONSTRAINT learning_plan_items_status_check
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'needs_review'));

CREATE UNIQUE INDEX IF NOT EXISTS learning_plan_items_plan_topic_idx
  ON learning_plan_items (plan_id, topic_id);
CREATE INDEX IF NOT EXISTS learning_plan_items_plan_order_idx
  ON learning_plan_items (plan_id, order_index);
