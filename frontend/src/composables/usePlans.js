import { ref } from 'vue';

// Учебные планы (админская часть) под /api/admin. Доступ закрыт правом
// users:write на сервере.
async function api(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function usePlans() {
  const plans = ref([]);
  const plan = ref(null);
  const items = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadPlans(userId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/students/${userId}/plans`);
      plans.value = data.plans;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function loadPlan(planId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api(`/plans/${planId}`);
      plan.value = data.plan;
      items.value = data.items;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  const createPlan = (userId, payload) =>
    api(`/students/${userId}/plans`, { method: 'POST', body: payload });
  const updatePlan = (planId, payload) =>
    api(`/plans/${planId}`, { method: 'PATCH', body: payload });
  const deletePlan = (planId) => api(`/plans/${planId}`, { method: 'DELETE' });
  const setItemStatus = (itemId, status) =>
    api(`/plan-items/${itemId}`, { method: 'PATCH', body: { status } });

  return {
    plans,
    plan,
    items,
    loading,
    error,
    loadPlans,
    loadPlan,
    createPlan,
    updatePlan,
    deletePlan,
    setItemStatus,
  };
}
