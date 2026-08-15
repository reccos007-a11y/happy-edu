-- Роли пользователей. Список ролей продублирован в backend/src/roles.js:
-- добавление новой роли требует и правки того файла, и новой миграции здесь.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- IF EXISTS: миграция должна пройти и на базе, где ограничение уже создано
-- прежней версией кода, которая пересоздавала его при каждом старте.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
