import { computed, readonly, ref } from 'vue';

const user = ref(null);
const loading = ref(true);

// Права приходят с сервера развёрнутым списком, поэтому фронтенду не нужно
// знать таблицу ролей — достаточно спросить про конкретное право.
const can = (permission) => Boolean(user.value?.permissions?.includes(permission));
const isAdmin = computed(() => user.value?.role === 'admin');

// credentials обязателен: сессия живёт в httpOnly cookie, из JS её не прочитать,
// браузер должен приложить её сам.
async function api(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useAuth() {
  // Показываем загрузку только пока пользователя ещё нет. Повторный refresh
  // (например, после смены аватара) не должен поднимать флаг: App.vue на это
  // время подменяет весь экран спиннером, кабинет пересоздаётся заново и
  // открытые в нём диалоги закрываются на середине действия.
  async function refresh() {
    if (!user.value) loading.value = true;
    try {
      const { user: me } = await api('/me');
      user.value = me;
    } catch {
      user.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function login(email, password) {
    const { user: me } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    user.value = me;
  }

  async function logout() {
    await api('/logout', { method: 'POST' });
    user.value = null;
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    isAdmin,
    can,
    refresh,
    login,
    logout,
  };
}
