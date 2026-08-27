import { ref } from 'vue';

// Аналитика (только чтение) под /api/admin/analytics. Доступ закрыт правом
// users:read на сервере.
async function api(path) {
  const res = await fetch(`/api/admin/analytics${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

// Фильтры собираем здесь: пустые значения не должны попадать в query,
// иначе сервер получит grade= и ответит «класс должен быть от 8 до 11».
function toQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useAnalytics() {
  const summary = ref(null);
  const students = ref([]);
  const topics = ref([]);
  const student = ref(null);
  const loading = ref(false);
  const error = ref('');

  async function load(fn) {
    loading.value = true;
    error.value = '';
    try {
      await fn();
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  const loadSummary = (days) =>
    load(async () => {
      summary.value = (await api(`/summary${toQuery({ days })}`)).summary;
    });

  const loadStudents = (filters) =>
    load(async () => {
      students.value = (await api(`/students${toQuery(filters)}`)).students;
    });

  const loadTopics = (filters) =>
    load(async () => {
      topics.value = (await api(`/topics${toQuery(filters)}`)).topics;
    });

  const loadStudent = (userId) =>
    load(async () => {
      student.value = await api(`/students/${userId}`);
    });

  // Выгрузка идёт обычной ссылкой: браузер сам покажет диалог сохранения,
  // а сессионная cookie уедет вместе с запросом.
  const csvUrl = (filters) => `/api/admin/analytics/students.csv${toQuery(filters)}`;

  return {
    summary,
    students,
    topics,
    student,
    loading,
    error,
    loadSummary,
    loadStudents,
    loadTopics,
    loadStudent,
    csvUrl,
  };
}
