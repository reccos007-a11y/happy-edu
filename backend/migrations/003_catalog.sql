-- Каталог учебного контента: предметы -> разделы -> темы.
-- Иерархия из ТЗ (раздел 7.2). Пока без subtopics/learning_materials и уровней
-- предмета (subject_levels) — они добавляются отдельными миграциями по мере
-- надобности; here достаточно для каталога тем.
--
-- Списки допустимых значений заданы через CHECK, а не native ENUM: так их видно
-- прямо в схеме и проще расширять новой миграцией (как роли в 002_user_roles).
-- Мягкое удаление (deleted_at) — на эти строки будут ссылаться исторические
-- попытки тестов, поэтому физически удалять контент нельзя.

CREATE TABLE IF NOT EXISTS subjects (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  applies_to  TEXT         NOT NULL DEFAULT 'both',
  has_levels  BOOLEAN      NOT NULL DEFAULT false,
  order_index INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ  NULL
);

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_applies_to_check;
ALTER TABLE subjects ADD CONSTRAINT subjects_applies_to_check
  CHECK (applies_to IN ('oge', 'ege', 'both'));

-- Уникальность имени только среди «живых» предметов: удалённый не мешает завести
-- новый с тем же названием.
CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_active_idx
  ON subjects (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sections (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id  BIGINT       NOT NULL REFERENCES subjects (id),
  title       VARCHAR(255) NOT NULL,
  order_index INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS sections_subject_order_idx ON sections (subject_id, order_index);

CREATE TABLE IF NOT EXISTS topics (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  section_id    BIGINT       NOT NULL REFERENCES sections (id),
  grade         SMALLINT     NOT NULL,
  title         VARCHAR(255) NOT NULL,
  order_index   INT          NOT NULL DEFAULT 0,
  codifier_code VARCHAR(20)  NULL,
  difficulty    TEXT         NOT NULL DEFAULT 'base',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ  NULL
);

ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_grade_check;
ALTER TABLE topics ADD CONSTRAINT topics_grade_check CHECK (grade BETWEEN 8 AND 11);

ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_difficulty_check;
ALTER TABLE topics ADD CONSTRAINT topics_difficulty_check
  CHECK (difficulty IN ('base', 'advanced', 'high'));

CREATE INDEX IF NOT EXISTS topics_section_order_idx ON topics (section_id, order_index);
CREATE INDEX IF NOT EXISTS topics_codifier_idx ON topics (codifier_code);
