import { ref } from 'vue';

// Чтение каталога учебного контента. Сессия — в httpOnly cookie, поэтому
// credentials обязателен (как в useAuth).
async function api(path) {
  const res = await fetch(`/api/catalog${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
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

  return { subjects, subject, sections, loading, error, loadSubjects, loadSubject };
}
