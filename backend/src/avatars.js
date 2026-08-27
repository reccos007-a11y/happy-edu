// Аватары пользователей: загрузка своего, отдача любого и удаление.
//
// Картинка приходит как data:URL в JSON, а не multipart: браузер всё равно
// уменьшает её через canvas перед отправкой (см. useProfile.js), так что
// добавлять разбор multipart и зависимость ради 30-килобайтного JPEG незачем.

import express from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';

export const avatarsRouter = express.Router();

avatarsRouter.use(requireAuth);

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
// Потолок на распакованные байты. Браузер присылает ~20–60 КБ; запас нужен
// на случай, если у кого-то не отработает уменьшение на клиенте.
const MAX_BYTES = 300 * 1024;

const DATA_URL_RE = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/;

// Разбирает data:URL в { mime, bytes } либо возвращает текст ошибки.
export function parseDataUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { error: 'Нет изображения' };
  }
  const match = DATA_URL_RE.exec(value.trim());
  if (!match) return { error: 'Файл не похож на изображение' };

  const [, mime, base64] = match;
  if (!ALLOWED_MIME.includes(mime)) {
    return { error: 'Поддерживаются JPEG, PNG и WebP' };
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { error: 'Пустое изображение' };
  if (bytes.length > MAX_BYTES) {
    return { error: `Файл больше ${Math.round(MAX_BYTES / 1024)} КБ` };
  }

  return { mime, bytes };
}

// Аватар любого пользователя: их показывают в шапке и в списках, поэтому
// достаточно быть вошедшим. Ничего приватного в картинке нет.
avatarsRouter.get('/:userId', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const { rows } = await pool.query(
      'SELECT mime_type, bytes, updated_at FROM user_avatars WHERE user_id = $1',
      [userId],
    );
    const avatar = rows[0];
    if (!avatar) return res.status(404).json({ error: 'Аватар не задан' });

    // Кэш с проверкой: картинка меняется редко, но после замены браузер должен
    // увидеть новую — отсюда ETag по времени обновления и no-cache.
    const etag = `W/"${userId}-${new Date(avatar.updated_at).getTime()}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    res.setHeader('Content-Type', avatar.mime_type);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);
    res.send(avatar.bytes);
  } catch (err) {
    console.error('avatar get failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// Свой аватар — только свой: чужой id в путь не принимаем вовсе.
avatarsRouter.put('/me', async (req, res) => {
  const parsed = parseDataUrl(req.body?.image);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    await pool.query(
      `INSERT INTO user_avatars (user_id, mime_type, bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET mime_type = EXCLUDED.mime_type, bytes = EXCLUDED.bytes, updated_at = now()`,
      [req.user.id, parsed.mime, parsed.bytes],
    );
    res.json({ ok: true, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error('avatar save failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

avatarsRouter.delete('/me', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_avatars WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('avatar delete failed:', err);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});
