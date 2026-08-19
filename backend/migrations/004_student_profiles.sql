-- Роль «ученик» и профили учеников (ТЗ, разделы 3 и 7.1).
-- Список ролей продублирован в backend/src/roles.js: добавление роли требует
-- правки того файла и этой миграции (роли закреплены CHECK-ограничением).

-- ФИО. Nullable: у заведённых раньше пользователей его нет, а ломать их незачем.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Расширяем список ролей ролью student. teacher/parent появятся отдельными
-- миграциями, когда добавятся кабинеты куратора и родителя.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'student'));

-- Профиль ученика: 1:1 с users (role='student'). Мягкое удаление — на профиль
-- будут ссылаться исторические попытки тестов, терять их нельзя.
CREATE TABLE IF NOT EXISTS student_profiles (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER     NOT NULL UNIQUE REFERENCES users (id),
  grade            SMALLINT    NOT NULL,
  exam_type        TEXT        NOT NULL,
  target_exam_date DATE        NULL,
  curator_id       INTEGER     NULL REFERENCES users (id),
  enrolled_at      DATE        NOT NULL DEFAULT current_date,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ NULL
);

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_grade_check;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_grade_check
  CHECK (grade BETWEEN 8 AND 11);

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_exam_type_check;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_exam_type_check
  CHECK (exam_type IN ('oge', 'ege'));

CREATE INDEX IF NOT EXISTS student_profiles_curator_idx ON student_profiles (curator_id);
