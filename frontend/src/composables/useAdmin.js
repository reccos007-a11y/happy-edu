import { ref } from 'vue';

// Раздел /api/admin закрыт правами на сервере: без нужного permission приходит
// 403 независимо от того, что показывает интерфейс.
async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useAdmin() {
  const users = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadUsers() {
    loading.value = true;
    error.value = '';
    try {
      const { users: list } = await api('/users');
      users.value = list;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function setRole(id, role) {
    error.value = '';
    try {
      const { user } = await api(`/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      const i = users.value.findIndex((u) => u.id === id);
      if (i !== -1) users.value[i] = user;
      return true;
    } catch (e) {
      error.value = e.message;
      // Сервер отказал — возвращаем список к его настоящему состоянию,
      // иначе в таблице осталась бы роль, которой в БД нет.
      await loadUsers();
      return false;
    }
  }

  async function removeUser(id) {
    error.value = '';
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      users.value = users.value.filter((u) => u.id !== id);
      return true;
    } catch (e) {
      error.value = e.message;
      return false;
    }
  }

  return { users, loading, error, loadUsers, setRole, removeUser };
}
