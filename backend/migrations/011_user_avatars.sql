-- Аватары пользователей.
--
-- Отдельная таблица, а не колонка в users: картинка нужна редко (шапка,
-- списки), а users читается на каждом запросе при проверке сессии — держать
-- рядом с ней двоичные данные незачем. Удаление аватара становится удалением
-- строки, а не UPDATE с обнулением трёх полей.
--
-- Байты в БД, а не файлы на диске: не нужен отдельный том, аватары переживают
-- пересоздание контейнеров при деплое и попадают в тот же бэкап, что остальные
-- данные. Картинку уменьшает браузер перед отправкой, поэтому размеры здесь
-- маленькие — ограничение проверяется в коде (backend/src/avatars.js).

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    INTEGER     PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mime_type  VARCHAR(32) NOT NULL,
  bytes      BYTEA       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_avatars DROP CONSTRAINT IF EXISTS user_avatars_mime_check;
ALTER TABLE user_avatars ADD CONSTRAINT user_avatars_mime_check
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
