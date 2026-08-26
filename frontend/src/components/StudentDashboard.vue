<template>
  <div class="register-warm student-home">
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <div v-if="loading && !profile" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="profile">
      <!-- Список планов + геймификация -->
      <template v-if="!openPlanId">
        <div class="home-head">
          <div>
            <h1 class="font-serif greeting">Привет, {{ firstName }}!</h1>
            <p class="text-body-1 text-medium-emphasis mb-4">{{ encouragement }}</p>
            <div class="profile-strip">
              <span class="pill">{{ profile.grade }} класс</span>
              <span class="pill">{{ profile.exam_type === 'oge' ? 'ОГЭ' : 'ЕГЭ' }}</span>
              <span v-if="daysLeft !== null" class="pill accent">
                до экзамена {{ daysLeft }} {{ dayWord(daysLeft) }}
              </span>
            </div>
          </div>

          <!-- Карточка уровня и XP -->
          <div v-if="stats" class="level-card">
            <div class="level-top">
              <span class="level-name">Уровень {{ stats.level }} · {{ stats.title }}</span>
              <span class="level-xp tabular">{{ formatXp(stats.xp) }} XP</span>
            </div>
            <div class="xp-track">
              <div class="xp-fill" :style="{ width: xpPercent + '%' }" />
            </div>
            <div class="xp-hint tabular">{{ nextLevelHint }}</div>
            <div class="level-stats">
              <div class="lstat">
                <div class="lstat-num">{{ stats.streakDays }}</div>
                <div class="lstat-lbl">{{ streakWord }}</div>
              </div>
              <div class="lstat">
                <div class="lstat-num green">{{ stats.topicsCompleted }}</div>
                <div class="lstat-lbl">тем зачтено</div>
              </div>
              <div class="lstat">
                <div class="lstat-num amber">{{ earnedBadges }}</div>
                <div class="lstat-lbl">значков</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Продолжить с того же места -->
        <button v-if="resume" class="resume" @click="resumeStudy">
          <div class="resume-left">
            <div class="ring" :style="ringStyle(resumeProgress)">
              <span>{{ resumeProgress }}%</span>
            </div>
            <div class="resume-text">
              <div class="resume-cap">Продолжить с того же места</div>
              <div class="resume-title">{{ resume.subject_name }} · {{ resume.topic_title }}</div>
            </div>
          </div>
          <div class="resume-right">
            <span class="resume-xp">+40 XP за тему</span>
            <span class="resume-btn">Продолжить</span>
          </div>
        </button>

        <h2 class="section-title">Мои предметы</h2>
        <p v-if="plans.length === 0" class="text-body-1 text-medium-emphasis">
          Пока не назначено ни одного плана. Он появится, когда преподаватель добавит предмет.
        </p>

        <div class="plan-grid">
          <div v-for="p in plans" :key="p.id" class="plan-card" @click="open(p.id)">
            <div class="ring" :style="ringStyle(percent(p))">
              <span :class="{ green: percent(p) === 100 }">{{ percent(p) }}%</span>
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

        <!-- Мой прогресс: значки -->
        <template v-if="stats">
          <h2 class="section-title">Мой прогресс</h2>
          <div class="badge-grid">
            <div
              v-for="b in stats.badges"
              :key="b.code"
              class="badge"
              :class="{ earned: b.earned }"
            >
              <div class="badge-ic">{{ b.earned ? '★' : '☆' }}</div>
              <div class="badge-body">
                <div class="badge-label">{{ b.label }}</div>
                <div class="badge-hint">{{ b.earned ? 'получен' : b.hint }}</div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- Детали плана -->
      <template v-else-if="plan">
        <button class="back" @click="close">← Все предметы</button>
        <div class="detail-head">
          <div class="ring big" :style="ringStyle(detailPercent)">
            <span :class="{ green: detailPercent === 100 }">{{ detailPercent }}%</span>
          </div>
          <div>
            <h1 class="font-serif detail-title">{{ plan.subject_name }}</h1>
            <p class="text-body-2 text-medium-emphasis tabular">
              {{ doneCount }} из {{ items.length }} тем освоено · {{ sectionMap.length }} разделов
            </p>
          </div>
        </div>

        <!-- Карта пути -->
        <div v-if="sectionMap.length" class="path-card">
          <div class="path-cap">Карта пути</div>
          <div class="path-row">
            <template v-for="(s, si) in sectionMap" :key="s.title">
              <div v-if="si > 0" class="path-line" :class="s.state" />
              <div class="path-node">
                <div class="node-dot" :class="s.state">
                  <span v-if="s.state === 'done'">✓</span>
                  <span v-else-if="s.state === 'current'" class="tabular"
                    >{{ s.done }}/{{ s.total }}</span
                  >
                  <span v-else class="tabular">{{ si + 1 }}</span>
                </div>
                <div class="node-title" :class="{ current: s.state === 'current' }">
                  {{ s.title }}
                </div>
                <div class="node-sub tabular">
                  {{ s.state === 'current' ? 'вы здесь' : s.done + ' / ' + s.total }}
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="topics">
          <div v-for="(i, idx) in items" :key="i.id">
            <div
              class="topic"
              :class="[`st-${i.status}`, { open: expandedTopic === i.topic_id, locked: i.locked }]"
              @click="onTopicClick(i)"
            >
              <span class="idx tabular">{{ idx + 1 }}</span>
              <div class="topic-main">
                <div class="topic-title">{{ i.topic_title }}</div>
                <div class="topic-sub">
                  {{
                    i.locked
                      ? 'Завершите предыдущую тему, чтобы открыть'
                      : i.section_title + ' · +40 XP'
                  }}
                </div>
              </div>
              <span v-if="i.locked" class="status-chip locked">🔒 недоступна</span>
              <span v-else class="status-chip" :class="i.status">{{
                itemStatus(i.status).label
              }}</span>
              <span class="chevron">{{
                i.locked ? '🔒' : expandedTopic === i.topic_id ? '▾' : '▸'
              }}</span>
            </div>

            <!-- Материалы темы -->
            <div v-if="expandedTopic === i.topic_id && !i.locked" class="materials">
              <div v-if="materialsLoading" class="text-center py-4">
                <v-progress-circular indeterminate color="primary" size="24" />
              </div>
              <p v-else-if="materials.length === 0" class="no-materials">
                Материалы к этой теме пока не добавлены.
              </p>
              <div v-else class="materials-list">
                <MaterialView v-for="m in materials" :key="m.id" :material="m" />
              </div>

              <!-- Тест по теме -->
              <div class="test-zone">
                <button
                  v-if="testTopic !== i.topic_id"
                  class="test-toggle"
                  @click="testTopic = i.topic_id"
                >
                  ✏️ Пройти тест по теме
                </button>
                <TopicTest v-else :topic-id="i.topic_id" @passed="onTestPassed" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import MaterialView from './MaterialView.vue';
import TopicTest from './TopicTest.vue';
import { useMe } from '../composables/useMe';
import { useMaterials } from '../composables/useMaterials';

const {
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
} = useMe();
const { materials, loading: materialsLoading, loadMaterials } = useMaterials();

const openPlanId = ref(null);
const expandedTopic = ref(null);
const testTopic = ref(null);

async function toggleTopic(topicId) {
  testTopic.value = null;
  if (expandedTopic.value === topicId) {
    expandedTopic.value = null;
    return;
  }
  expandedTopic.value = topicId;
  await loadMaterials(topicId);
}

// Заблокированную тему открыть нельзя — сначала нужно завершить предыдущую.
function onTopicClick(item) {
  if (item.locked) return;
  toggleTopic(item.topic_id);
}

// Тест зачтён — перезагружаем план и геймификацию: статус темы, XP, значки обновятся.
async function onTestPassed() {
  if (openPlanId.value) await loadPlan(openPlanId.value);
  await refreshStats();
}

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

// XP-полоса и подсказка «до следующего уровня».
const xpPercent = computed(() => {
  if (!stats.value || !stats.value.xpForNext) return 100;
  return Math.min(100, Math.round((stats.value.xpIntoLevel / stats.value.xpForNext) * 100));
});
const nextLevelHint = computed(() => {
  const s = stats.value;
  if (!s) return '';
  if (!s.xpForNext) return 'Максимальный уровень достигнут';
  const left = s.xpForNext - s.xpIntoLevel;
  const topics = Math.ceil(left / 40);
  return `До уровня ${s.level + 1} — ${left} XP (≈ ${topics} ${topicWord(topics)})`;
});
function topicWord(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'тема';
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return 'темы';
  return 'тем';
}
const streakWord = computed(() => {
  const n = stats.value?.streakDays ?? 0;
  const d = n % 10;
  const dd = n % 100;
  const w =
    d === 1 && dd !== 11 ? 'день' : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? 'дня' : 'дней';
  return `${w} серии`;
});
const earnedBadges = computed(() => stats.value?.badges.filter((b) => b.earned).length ?? 0);
const formatXp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Прогресс темы для карточки «Продолжить»: 0% если ещё не начата, 40% если в процессе.
const resumeProgress = computed(() => (resume.value?.status === 'in_progress' ? 40 : 0));

const percent = (p) => (p.topics_total ? Math.round((p.topics_done / p.topics_total) * 100) : 0);

const ITEM_STATUS = {
  not_started: { label: 'не начата' },
  in_progress: { label: 'в процессе' },
  completed: { label: 'освоена' },
  needs_review: { label: 'на повторение' },
};
const itemStatus = (s) => ITEM_STATUS[s] ?? ITEM_STATUS.not_started;

// Кольцо прогресса: индиго-заполнение по проценту; зелёное на 100%.
function ringStyle(pct) {
  const color = pct === 100 ? '#1f9254' : '#4b4fcb';
  return { background: `conic-gradient(${color} ${pct * 3.6}deg, #e8e8fa 0deg)` };
}

const doneCount = computed(() => items.value.filter((i) => i.status === 'completed').length);
const detailPercent = computed(() =>
  items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0,
);

// Карта пути: разделы плана по порядку с прогрессом; первый незакрытый — текущий.
const sectionMap = computed(() => {
  const list = [];
  const byTitle = new Map();
  for (const it of items.value) {
    let s = byTitle.get(it.section_title);
    if (!s) {
      s = { title: it.section_title, total: 0, done: 0 };
      byTitle.set(it.section_title, s);
      list.push(s);
    }
    s.total += 1;
    if (it.status === 'completed') s.done += 1;
  }
  let currentAssigned = false;
  for (const s of list) {
    if (s.total > 0 && s.done === s.total) s.state = 'done';
    else if (!currentAssigned) {
      s.state = 'current';
      currentAssigned = true;
    } else s.state = 'future';
  }
  return list;
});

async function open(planId) {
  expandedTopic.value = null;
  await loadPlan(planId);
  openPlanId.value = planId;
}
function close() {
  openPlanId.value = null;
  expandedTopic.value = null;
  testTopic.value = null;
}

// «Продолжить»: открыть план текущей темы и сразу развернуть её.
async function resumeStudy() {
  const r = resume.value;
  if (!r) return;
  await open(r.plan_id);
  await toggleTopic(r.topic_id);
}

onMounted(loadOverview);
</script>

<style scoped>
.student-home {
  max-width: 940px;
}
.greeting {
  font-size: clamp(28px, 5vw, 38px);
  margin-bottom: 6px;
}
.home-head {
  display: flex;
  gap: 30px;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 26px;
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
  background: var(--amber-bg);
  border-color: var(--amber-border);
  color: var(--amber-text);
}

/* Карточка уровня */
.level-card {
  width: 330px;
  flex: none;
  background: #fff;
  border-radius: 20px;
  padding: 22px;
  box-shadow: 0 12px 32px -14px rgba(75, 79, 203, 0.34);
}
.level-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.level-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--ink);
}
.level-xp {
  font-size: 12px;
  font-weight: 600;
  color: #8a87a0;
  white-space: nowrap;
}
.xp-track {
  height: 10px;
  border-radius: 5px;
  background: #e8e8fa;
  margin-top: 14px;
  overflow: hidden;
}
.xp-fill {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, #4b4fcb, #7a7ee0);
  transition: width 0.4s ease;
}
.xp-hint {
  font-size: 12px;
  color: #8a87a0;
  margin-top: 10px;
}
.level-stats {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
.lstat {
  flex: 1;
  text-align: center;
}
.lstat-num {
  font-size: 20px;
  font-weight: 800;
  color: #4b4fcb;
  font-variant-numeric: tabular-nums;
}
.lstat-num.green {
  color: #1f9254;
}
.lstat-num.amber {
  color: var(--amber-text);
}
.lstat-lbl {
  font-size: 11px;
  color: #8a8577;
  margin-top: 5px;
}

/* Продолжить */
.resume {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border: none;
  border-radius: 20px;
  padding: 20px 24px;
  margin-bottom: 30px;
  box-shadow: 0 12px 32px -14px rgba(75, 79, 203, 0.34);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.resume:hover {
  box-shadow: 0 16px 36px -14px rgba(75, 79, 203, 0.45);
}
.resume-left {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.resume-cap {
  font-size: 12px;
  font-weight: 600;
  color: #8a87a0;
}
.resume-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  margin-top: 6px;
}
.resume-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}
.resume-xp {
  font-size: 12px;
  font-weight: 600;
  color: var(--amber-text);
}
.resume-btn {
  background: #4b4fcb;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 22px;
  border-radius: 12px;
}

.section-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
  margin: 30px 0 14px;
  font-family: 'Inter', sans-serif;
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
.ring span.green {
  color: #1f9254;
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

/* Значки */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.badge {
  display: flex;
  align-items: center;
  gap: 13px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px 16px;
  opacity: 0.72;
}
.badge.earned {
  opacity: 1;
  border-color: var(--amber-border);
  background: linear-gradient(#fff, #fffdf8);
}
.badge-ic {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 18px;
  background: #eeebe3;
  color: #a8a08c;
}
.badge.earned .badge-ic {
  background: var(--amber-bg);
  color: var(--amber-text);
}
.badge-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.badge-hint {
  font-size: 11.5px;
  color: #8a8577;
  margin-top: 3px;
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

/* Карта пути */
.path-card {
  background: #fff;
  border-radius: 20px;
  padding: 24px 26px;
  margin-bottom: 24px;
  box-shadow: 0 12px 32px -18px rgba(75, 79, 203, 0.3);
  overflow-x: auto;
}
.path-cap {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.path-row {
  display: flex;
  align-items: flex-start;
  margin-top: 22px;
  min-width: max-content;
}
.path-node {
  flex: none;
  width: 120px;
  text-align: center;
}
.node-dot {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  margin: 0 auto;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
}
.node-dot.done {
  background: #1f9254;
  color: #fff;
}
.node-dot.current {
  background: #4b4fcb;
  color: #fff;
  font-size: 12px;
}
.node-dot.future {
  background: #eeebe3;
  color: #a09a8b;
}
.node-title {
  font-size: 11px;
  font-weight: 500;
  color: #8a8577;
  margin-top: 9px;
  line-height: 1.35;
}
.node-title.current {
  font-weight: 700;
  color: #4b4fcb;
}
.node-sub {
  font-size: 10px;
  color: #a09a8b;
  margin-top: 4px;
}
.path-line {
  flex: 1;
  min-width: 24px;
  height: 4px;
  border-radius: 2px;
  margin-top: 20px;
  background: #e6e1d6;
}
.path-line.done {
  background: #1f9254;
}
.path-line.current {
  background: linear-gradient(90deg, #1f9254, #4b4fcb);
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
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.topic:hover {
  box-shadow: 0 10px 26px -16px rgba(75, 79, 203, 0.42);
}
.topic.st-completed {
  background: #f3faf6;
}
.topic.st-in_progress {
  border-left: 3px solid #4b4fcb;
}
.topic.locked {
  background: #f6f4ef;
  box-shadow: none;
  cursor: not-allowed;
}
.topic.locked:hover {
  box-shadow: none;
}
.topic.locked .topic-title {
  color: #9a958a;
}
.topic.locked .idx {
  color: #bdb8ab;
}
.status-chip.locked {
  background: #eeebe3;
  color: #8a8577;
}
.topic.open {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.chevron {
  color: #8a87a0;
  font-size: 13px;
  flex: none;
}
.materials {
  background: #faf8f3;
  border: 1px solid #e6e1d6;
  border-top: none;
  border-radius: 0 0 14px 14px;
  padding: 14px;
  margin-top: -6px;
}
.materials-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.no-materials {
  font-size: 13px;
  color: #8a8577;
  margin: 0;
  padding: 6px;
}
.test-zone {
  margin-top: 12px;
}
.test-toggle {
  border: 1px solid #4b4fcb;
  color: #4b4fcb;
  background: #fff;
  font-weight: 700;
  font-size: 13.5px;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}
.test-toggle:hover {
  background: #f2f2fd;
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
  background: var(--amber-bg);
  color: var(--amber-text);
}

@media (max-width: 640px) {
  .level-card {
    width: 100%;
  }
  .resume {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
