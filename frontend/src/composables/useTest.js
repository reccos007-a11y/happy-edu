import { ref } from 'vue';

// Прохождение теста по теме (кабинет ученика). Правильные ответы не приходят с
// вопросами — проверка на сервере.
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`/api/me${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useTest() {
  const questions = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadTest(topicId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/topics/${topicId}/test`);
      questions.value = data.questions;
    } catch (e) {
      error.value = e.message;
      questions.value = [];
    } finally {
      loading.value = false;
    }
  }

  const submitTest = (topicId, answers) =>
    api(`/topics/${topicId}/test`, { method: 'POST', body: { answers } });

  return { questions, loading, error, loadTest, submitTest };
}
