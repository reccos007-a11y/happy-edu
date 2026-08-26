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
  const stats = ref(null);
  const resume = ref(null);
  const loading = ref(false);
  const error = ref('');

  async function loadOverview() {
    loading.value = true;
    error.value = '';
    try {
      const [p, pl, ov] = await Promise.all([api('/profile'), api('/plans'), api('/overview')]);
      profile.value = p.profile;
      plans.value = pl.plans;
      stats.value = ov.stats;
      resume.value = ov.resume;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  // Пересчёт геймификации после зачёта темы (XP/уровень/значки/«продолжить»).
  async function refreshStats() {
    try {
      const ov = await api('/overview');
      stats.value = ov.stats;
      resume.value = ov.resume;
    } catch {
      /* не критично для UI */
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

  return {
    profile,
    plans,
    plan,
    items,
    stats,
    resume,
    loading,
    error,
    loadOverview,
    loadPlan,
    refreshStats,
  };
}
