-- Тестирование (ТЗ, раздел 7.4), MVP: банк вопросов по темам, варианты ответов
-- и попытки прохождения тематического теста.
--
-- Упрощения относительно ТЗ (расширяемо новыми миграциями):
--   • типы вопросов — single_choice / multiple_choice / short_answer
--     (развёрнутый ответ с ручной проверкой добавим позже);
--   • «тест по теме» собирается из вопросов темы, отдельной таблицы tests пока нет;
--   • попытка хранит итог (процент, зачёт), детальная история ответов — позже.

CREATE TABLE IF NOT EXISTS questions (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id             BIGINT       NOT NULL REFERENCES topics (id),
  type                 TEXT         NOT NULL DEFAULT 'single_choice',
  text                 TEXT         NOT NULL,
  difficulty           TEXT         NOT NULL DEFAULT 'base',
  correct_short_answer VARCHAR(500) NULL,
  order_index          INT          NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ  NULL
);

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('single_choice', 'multiple_choice', 'short_answer'));

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE questions ADD CONSTRAINT questions_difficulty_check
  CHECK (difficulty IN ('base', 'advanced', 'high'));

CREATE INDEX IF NOT EXISTS questions_topic_order_idx ON questions (topic_id, order_index);

CREATE TABLE IF NOT EXISTS question_options (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id BIGINT       NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  option_text VARCHAR(500) NOT NULL,
  is_correct  BOOLEAN      NOT NULL DEFAULT false,
  order_index INT          NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS question_options_question_idx ON question_options (question_id, order_index);

-- Попытка прохождения теста по теме. plan_item_id связывает результат с позицией
-- плана ученика, чтобы зачёт автоматически отмечал тему освоенной.
CREATE TABLE IF NOT EXISTS test_attempts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id    BIGINT      NOT NULL REFERENCES student_profiles (id),
  topic_id      BIGINT      NOT NULL REFERENCES topics (id),
  plan_item_id  BIGINT      NULL REFERENCES learning_plan_items (id),
  score_percent NUMERIC(5, 2) NOT NULL,
  passed        BOOLEAN     NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_attempts_student_topic_idx ON test_attempts (student_id, topic_id);
