-- Учебные материалы темы (ТЗ, раздел 7.2): конспекты, картинки, видео, ссылки
-- и интерактивные анимации.
--
-- Типы отличаются от ТЗ (text/video/presentation/file/link) под наши нужды:
--   text      — конспект (content хранит текст);
--   image     — иллюстрация (file_url);
--   video     — видео по ссылке (file_url);
--   link      — внешний ресурс (file_url);
--   animation — интерактивная схема; content хранит КЛЮЧ Vue-компонента из
--               реестра во фронтенде, а не разметку — так в базе нет «сырого
--               HTML» и связанного с ним риска XSS.

CREATE TABLE IF NOT EXISTS learning_materials (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    BIGINT       NOT NULL REFERENCES topics (id),
  type        TEXT         NOT NULL DEFAULT 'text',
  title       VARCHAR(255) NOT NULL,
  content     TEXT         NULL,
  file_url    VARCHAR(500) NULL,
  order_index INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ  NULL
);

ALTER TABLE learning_materials DROP CONSTRAINT IF EXISTS learning_materials_type_check;
ALTER TABLE learning_materials ADD CONSTRAINT learning_materials_type_check
  CHECK (type IN ('text', 'image', 'video', 'link', 'animation'));

CREATE INDEX IF NOT EXISTS learning_materials_topic_order_idx
  ON learning_materials (topic_id, order_index);
