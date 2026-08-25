import { ref } from 'vue';

// Банк вопросов темы (админ, под content:write).
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

export function useQuestions() {
  const questions = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadQuestions(topicId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/topics/${topicId}/questions`);
      questions.value = data.questions;
    } catch (e) {
      error.value = e.message;
      questions.value = [];
    } finally {
      loading.value = false;
    }
  }

  const createQuestion = (topicId, payload) =>
    api(`/topics/${topicId}/questions`, { method: 'POST', body: payload });
  const deleteQuestion = (id) => api(`/questions/${id}`, { method: 'DELETE' });

  return { questions, loading, error, loadQuestions, createQuestion, deleteQuestion };
}
