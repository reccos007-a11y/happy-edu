import { ref } from 'vue';

// Раздел /api/admin/students закрыт правом users:write на сервере: без него
// приходит 403 независимо от того, что показывает интерфейс.
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`/api/admin/students${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useStudents() {
  const students = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadStudents() {
    loading.value = true;
    error.value = '';
    try {
      const { students: list } = await api('');
      students.value = list;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  // Пароль можно не передавать — сервер сгенерирует его и вернёт один раз.
  const addStudent = (payload) => api('', { method: 'POST', body: payload });
  const updateStudent = (id, payload) => api(`/${id}`, { method: 'PATCH', body: payload });
  const removeStudent = (id) => api(`/${id}`, { method: 'DELETE' });

  return { students, loading, error, loadStudents, addStudent, updateStudent, removeStudent };
}
