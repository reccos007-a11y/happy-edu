<template>
  <div class="register-warm student-home">
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <div v-if="loading && !profile" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="profile">
      <!-- Список планов -->
      <template v-if="!openPlanId">
        <h1 class="font-serif greeting">Привет, {{ firstName }}!</h1>
        <p class="text-body-1 text-medium-emphasis mb-5">{{ encouragement }}</p>

        <div class="profile-strip mb-8">
          <span class="pill">{{ profile.grade }} класс</span>
          <span class="pill">{{ profile.exam_type === 'oge' ? 'ОГЭ' : 'ЕГЭ' }}</span>
          <span v-if="daysLeft !== null" class="pill accent">
            до экзамена {{ daysLeft }} {{ dayWord(daysLeft) }}
          </span>
        </div>

        <h2 class="text-h6 mb-4">Мои предметы</h2>
        <p v-if="plans.length === 0" class="text-body-1 text-medium-emphasis">
          Пока не назначено ни одного плана. Он появится, когда преподаватель добавит предмет.
        </p>

        <div class="plan-grid">
          <div v-for="p in plans" :key="p.id" class="plan-card" @click="open(p.id)">
            <div class="ring" :style="ringStyle(percent(p))">
              <span>{{ percent(p) }}%</span>
            </div>
            <div class="plan-body">
              <h3 class="plan-title">{{ p.subject_name }}</h3>
              <p class="plan-sub tabular">
                {{ p.topics_done }} из {{ p.topics_total }} тем освоено
              </p>
              <span v-if="percent(p) === 100" class="done-badge">🎉 предмет пройден</span>
            </div>
          </div>
        </div>
      </template>

      <!-- Детали плана -->
      <template v-else-if="plan">
        <button class="back" @click="close">← Все предметы</button>
        <div class="detail-head">
          <div class="ring big" :style="ringStyle(detailPercent)">
            <span>{{ detailPercent }}%</span>
          </div>
          <div>
            <h1 class="font-serif detail-title">{{ plan.subject_name }}</h1>
            <p class="text-body-2 text-medium-emphasis">
              {{ doneCount }} из {{ items.length }} тем освоено
            </p>
          </div>
        </div>

        <div class="topics">
          <div v-for="(i, idx) in items" :key="i.id" class="topic" :class="`st-${i.status}`">
            <span class="idx tabular">{{ idx + 1 }}</span>
            <div class="topic-main">
              <div class="topic-title">{{ i.topic_title }}</div>
              <div class="topic-sub">{{ i.section_title }}</div>
            </div>
            <span class="status-chip" :class="i.status">{{ itemStatus(i.status).label }}</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useMe } from '../composables/useMe';

const { profile, plans, plan, items, loading, error, loadOverview, loadPlan } = useMe();

const openPlanId = ref(null);

const firstName = computed(() => (profile.value?.full_name || 'ученик').split(' ')[0]);

const encouragement = computed(() => {
  const total = plans.value.reduce((a, p) => a + p.topics_total, 0);
  const done = plans.value.reduce((a, p) => a + p.topics_done, 0);
  if (total === 0) return 'Готовимся к экзамену — шаг за шагом.';
  if (done === 0) return 'Начни с первой темы — и дело пойдёт.';
  if (done >= total) return 'Все темы пройдены. Отличная работа!';
  return `Уже освоено ${done} из ${total} тем по всем предметам. Так держать!`;
});

const daysLeft = computed(() => {
  if (!profile.value?.target_exam_date) return null;
  const ms = new Date(profile.value.target_exam_date) - new Date();
  const days = Math.ceil(ms / 86400000);
  return days > 0 ? days : null;
});
function dayWord(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'день';
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return 'дня';
  return 'дней';
}

const percent = (p) => (p.topics_total ? Math.round((p.topics_done / p.topics_total) * 100) : 0);

const ITEM_STATUS = {
  not_started: { label: 'не начата' },
  in_progress: { label: 'в процессе' },
  completed: { label: 'освоена' },
  needs_review: { label: 'на повторение' },
};
const itemStatus = (s) => ITEM_STATUS[s] ?? ITEM_STATUS.not_started;

// Кольцо прогресса: индиго-заполнение по проценту на светлом фоне.
function ringStyle(pct) {
  return { background: `conic-gradient(#4b4fcb ${pct * 3.6}deg, #e8e8fa 0deg)` };
}

const doneCount = computed(() => items.value.filter((i) => i.status === 'completed').length);
const detailPercent = computed(() =>
  items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0,
);

async function open(planId) {
  await loadPlan(planId);
  openPlanId.value = planId;
}
function close() {
  openPlanId.value = null;
}

onMounted(loadOverview);
</script>

<style scoped>
.student-home {
  max-width: 900px;
}
.greeting {
  font-size: clamp(28px, 5vw, 40px);
  margin-bottom: 6px;
}
.profile-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.pill {
  background: #fff;
  border: 1px solid #e8e8fa;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #4b4fcb;
  box-shadow: 0 6px 16px -12px rgba(75, 79, 203, 0.4);
}
.pill.accent {
  background: #fff1e8;
  border-color: #ffd9c2;
  color: #e8703a;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.plan-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fff;
  border-radius: 20px;
  padding: 20px;
  cursor: pointer;
  box-shadow: 0 12px 32px -16px rgba(75, 79, 203, 0.34);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.plan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 36px -16px rgba(75, 79, 203, 0.45);
}
.ring {
  position: relative;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  flex: none;
  display: grid;
  place-items: center;
}
.ring::before {
  content: '';
  position: absolute;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #fff;
}
.ring span {
  position: relative;
  font-weight: 800;
  font-size: 14px;
  color: #4b4fcb;
  font-variant-numeric: tabular-nums;
}
.ring.big {
  width: 84px;
  height: 84px;
}
.ring.big::before {
  width: 64px;
  height: 64px;
}
.ring.big span {
  font-size: 18px;
}
.plan-title {
  font-size: 17px;
  font-weight: 800;
  margin: 0;
}
.plan-sub {
  font-size: 13px;
  color: #8a87a0;
  margin: 2px 0 0;
}
.done-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #1f9254;
}

.back {
  background: none;
  border: none;
  color: #4b4fcb;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
}
.detail-title {
  font-size: clamp(22px, 4vw, 30px);
  margin: 0;
}
.topics {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.topic {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 14px;
  padding: 14px 18px;
  box-shadow: 0 8px 24px -18px rgba(75, 79, 203, 0.3);
}
.topic.st-completed {
  background: #f3faf6;
}
.idx {
  min-width: 26px;
  color: #8a87a0;
  font-size: 13px;
  font-weight: 600;
}
.topic-main {
  flex: 1;
  min-width: 0;
}
.topic-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a2740;
}
.topic-sub {
  font-size: 12px;
  color: #8a87a0;
}
.status-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 14px;
  white-space: nowrap;
}
.status-chip.not_started {
  background: #eeebe3;
  color: #7a7566;
}
.status-chip.in_progress {
  background: #e8e8fa;
  color: #4b4fcb;
}
.status-chip.completed {
  background: #e4f1ea;
  color: #1f9254;
}
.status-chip.needs_review {
  background: #faeedd;
  color: #d9822b;
}
</style>
