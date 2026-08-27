import { ref } from 'vue';

// Настройки приложения. Сервер отдаёт вместе с действующими правилами их
// значения по умолчанию и список показателей для значков, поэтому админке не
// нужно дублировать у себя ни дефолты, ни справочник условий.
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`/api/admin/settings${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useSettings() {
  const settings = ref(null);
  const defaults = ref(null);
  const metrics = ref({});
  const loading = ref(false);
  const error = ref('');

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      const data = await api('/gamification');
      settings.value = data.settings;
      defaults.value = data.defaults;
      metrics.value = data.metrics;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // Мутации бросают ошибку — компонент решает, что показать и что перезагрузить.
  const save = (value) => api('/gamification', { method: 'PUT', body: value });
  const reset = () => api('/gamification', { method: 'DELETE' });

  return { settings, defaults, metrics, loading, error, load, save, reset };
}
