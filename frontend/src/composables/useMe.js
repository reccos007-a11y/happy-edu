import { ref } from 'vue';

// Кабинет ученика (только чтение): вошедший ученик видит свой профиль и планы.
async function api(path) {
  const res = await fetch(`/api/me${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function useMe() {
  const profile = ref(null);
  const plans = ref([]);
  const plan = ref(null);
  const items = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function loadOverview() {
    loading.value = true;
    error.value = '';
    try {
      const [p, pl] = await Promise.all([api('/profile'), api('/plans')]);
      profile.value = p.profile;
      plans.value = pl.plans;
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

  return { profile, plans, plan, items, loading, error, loadOverview, loadPlan };
}
