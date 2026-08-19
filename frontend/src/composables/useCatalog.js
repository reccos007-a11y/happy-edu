import { ref } from 'vue';

// Чтение и управление каталогом. Сессия — в httpOnly cookie, поэтому
// credentials обязателен (как в useAuth).
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`/api/catalog${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useCatalog() {
  const subjects = ref([]);
  const subject = ref(null);
  const sections = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadSubjects() {
    loading.value = true;
    error.value = '';
    try {
      const data = await api('/subjects');
      subjects.value = data.subjects;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  async function loadSubject(id) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/subjects/${id}`);
      subject.value = data.subject;
      sections.value = data.sections;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // Мутации возвращают ответ или бросают ошибку — вызывающий решает, что
  // перезагрузить (витрину или дерево) и как показать ошибку.
  const createSubject = (payload) => api('/subjects', { method: 'POST', body: payload });
  const updateSubject = (id, payload) => api(`/subjects/${id}`, { method: 'PATCH', body: payload });
  const deleteSubject = (id) => api(`/subjects/${id}`, { method: 'DELETE' });

  const createSection = (payload) => api('/sections', { method: 'POST', body: payload });
  const updateSection = (id, payload) => api(`/sections/${id}`, { method: 'PATCH', body: payload });
  const deleteSection = (id) => api(`/sections/${id}`, { method: 'DELETE' });

  const createTopic = (payload) => api('/topics', { method: 'POST', body: payload });
  const updateTopic = (id, payload) => api(`/topics/${id}`, { method: 'PATCH', body: payload });
  const deleteTopic = (id) => api(`/topics/${id}`, { method: 'DELETE' });

  return {
    subjects,
    subject,
    sections,
    loading,
    error,
    loadSubjects,
    loadSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    createSection,
    updateSection,
    deleteSection,
    createTopic,
    updateTopic,
    deleteTopic,
  };
}
