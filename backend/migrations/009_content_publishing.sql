-- Публикация контента: предмет, раздел и тема могут быть черновиком или
-- опубликованы. Черновик виден только персоналу (content:write) и не попадает
-- ни в каталог ученика, ни в новые учебные планы.
--
-- Момент публикации, а не булев флаг: «когда открыли тему» — вопрос, который
-- всё равно задаст аналитика, а NULL естественно читается как «ещё не открыта».
--
-- Существующий контент помечаем опубликованным: на момент миграции ученики его
-- уже видят, и молчаливое исчезновение материала было бы хуже, чем лишняя
-- галочка. Новые записи создаются черновиками — это решает код (см. catalog.js).

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE topics   ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;

UPDATE subjects SET published_at = now() WHERE published_at IS NULL AND deleted_at IS NULL;
UPDATE sections SET published_at = now() WHERE published_at IS NULL AND deleted_at IS NULL;
UPDATE topics   SET published_at = now() WHERE published_at IS NULL AND deleted_at IS NULL;

-- Выборки ученика всегда идут по «живым и опубликованным», поэтому частичные
-- индексы по published_at покрывают именно их.
CREATE INDEX IF NOT EXISTS subjects_published_idx ON subjects (published_at)
  WHERE deleted_at IS NULL AND published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS sections_published_idx ON sections (subject_id, published_at)
  WHERE deleted_at IS NULL AND published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS topics_published_idx ON topics (section_id, published_at)
  WHERE deleted_at IS NULL AND published_at IS NOT NULL;
