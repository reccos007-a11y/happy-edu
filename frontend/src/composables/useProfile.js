import { ref } from 'vue';

// Свой профиль, пароль и аватар. Всё под /api/me и /api/avatars — сервер
// определяет пользователя по сессии, id никуда не передаётся.
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

// Уменьшаем картинку в браузере: на сервер уходит квадрат 256×256 в JPEG
// вместо снимка с телефона на несколько мегабайт. Заодно кадрируем по центру —
// аватар всё равно круглый, и растянутое по ширине лицо выглядит плохо.
const AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.85;

export function resizeToDataUrl(file, size = AVATAR_SIZE) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Файл не похож на изображение'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', AVATAR_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function useProfile() {
  const profile = ref(null);
  const loading = ref(false);
  const error = ref('');

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      profile.value = (await api('/api/me/profile')).profile;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // Мутации бросают ошибку — компонент решает, что показать.
  const save = (payload) => api('/api/me/profile', { method: 'PATCH', body: payload });
  const changePassword = (payload) => api('/api/me/password', { method: 'POST', body: payload });
  const uploadAvatar = (image) => api('/api/avatars/me', { method: 'PUT', body: { image } });
  const deleteAvatar = () => api('/api/avatars/me', { method: 'DELETE' });

  return { profile, loading, error, load, save, changePassword, uploadAvatar, deleteAvatar };
}
