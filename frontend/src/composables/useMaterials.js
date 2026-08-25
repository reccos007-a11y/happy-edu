import { ref } from 'vue';

// Учебные материалы темы. Чтение доступно любому вошедшему, запись — под
// content:write на сервере.
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

export function useMaterials() {
  const materials = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadMaterials(topicId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/topics/${topicId}/materials`);
      materials.value = data.materials;
    } catch (e) {
      error.value = e.message;
      materials.value = [];
    } finally {
      loading.value = false;
    }
  }

  const createMaterial = (topicId, payload) =>
    api(`/topics/${topicId}/materials`, { method: 'POST', body: payload });
  const deleteMaterial = (id) => api(`/materials/${id}`, { method: 'DELETE' });

  return { materials, loading, error, loadMaterials, createMaterial, deleteMaterial };
}
