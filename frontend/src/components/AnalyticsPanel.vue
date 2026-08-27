<template>
  <div class="register-calm">
    <div class="d-flex align-center flex-wrap ga-3 mb-1">
      <h2 class="text-h4">Аналитика</h2>
      <v-spacer />
      <v-select
        v-model="days"
        :items="PERIOD_ITEMS"
        label="Период"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 190px"
        @update:model-value="loadSummary"
      />
    </div>
    <p class="text-body-2 text-medium-emphasis mb-5">
      Всё считается из реальных данных — попыток тестов и статусов тем в планах.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <!-- Сводка -->
    <v-row class="mb-2">
      <v-col v-for="tile in tiles" :key="tile.label" cols="6" md="3">
        <v-card border class="pa-4 h-100">
          <p class="text-caption text-medium-emphasis mb-1">{{ tile.label }}</p>
          <p class="text-h5 mb-0 tabular">{{ tile.value }}</p>
          <p v-if="tile.hint" class="text-caption text-medium-emphasis mb-0">{{ tile.hint }}</p>
        </v-card>
      </v-col>
    </v-row>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="students">Ученики</v-tab>
      <v-tab value="content">Контент</v-tab>
    </v-tabs>

    <!-- Срез по ученикам -->
    <template v-if="tab === 'students'">
      <div class="d-flex align-center flex-wrap ga-3 mb-4">
        <v-select
          v-model="filters.grade"
          :items="GRADE_ITEMS"
          label="Класс"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          style="max-width: 140px"
          @update:model-value="refreshStudents"
        />
        <v-select
          v-model="filters.exam"
          :items="EXAM_ITEMS"
          label="Экзамен"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          style="max-width: 160px"
          @update:model-value="refreshStudents"
        />
        <v-select
          v-model="filters.subject_id"
          :items="subjectItems"
          label="Предмет"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          style="max-width: 240px"
          @update:model-value="refreshStudents"
        />
        <v-spacer />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-download"
          :href="csvUrl(filters)"
          download="students.csv"
        >
          Выгрузить CSV
        </v-btn>
      </div>

      <div v-if="loading" class="text-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <v-card v-else border>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th class="text-left">Ученик</th>
              <th class="text-left" style="width: 80px">Класс</th>
              <th class="text-left" style="width: 200px">Прогресс</th>
              <th class="text-right" style="width: 110px">Попыток</th>
              <th class="text-right" style="width: 110px">Средний</th>
              <th class="text-right" style="width: 100px">Серия</th>
              <th class="text-left" style="width: 150px">Активность</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in students"
              :key="s.user_id"
              class="student-row"
              @click="openStudent(s.user_id)"
            >
              <td>
                <div>{{ s.full_name || '—' }}</div>
                <div class="text-caption text-medium-emphasis">{{ s.email }}</div>
              </td>
              <td class="tabular">{{ s.grade }} · {{ s.exam_type === 'oge' ? 'ОГЭ' : 'ЕГЭ' }}</td>
              <td>
                <v-progress-linear
                  :model-value="s.progress_percent"
                  :color="progressColor(s.progress_percent)"
                  height="6"
                  rounded
                  class="mb-1"
                />
                <span class="text-caption text-medium-emphasis tabular">
                  {{ s.topics_done }} / {{ s.topics_total }} · {{ s.progress_percent }}%
                </span>
              </td>
              <td class="text-right tabular">
                {{ s.attempts }}
                <span v-if="s.attempts" class="text-caption text-medium-emphasis">
                  ({{ s.attempts_passed }} зачт.)
                </span>
              </td>
              <td class="text-right tabular">{{ s.avg_score ?? '—' }}</td>
              <td class="text-right tabular">{{ s.streak_days || '—' }}</td>
              <td class="text-caption text-medium-emphasis">{{ formatDate(s.last_activity) }}</td>
            </tr>
            <tr v-if="students.length === 0">
              <td colspan="7" class="text-center text-medium-emphasis py-6">
                Под эти фильтры никто не подошёл.
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <!-- Аналитика контента -->
    <template v-else>
      <div class="d-flex align-center flex-wrap ga-3 mb-4">
        <v-select
          v-model="topicFilters.subject_id"
          :items="subjectItems"
          label="Предмет"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          style="max-width: 240px"
          @update:model-value="refreshTopics"
        />
        <span class="text-body-2 text-medium-emphasis">
          Темы, по которым были попытки. Сверху — самые проблемные.
        </span>
      </div>

      <div v-if="loading" class="text-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <v-card v-else border>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th class="text-left">Тема</th>
              <th class="text-right" style="width: 110px">Учеников</th>
              <th class="text-right" style="width: 110px">Попыток</th>
              <th class="text-right" style="width: 130px">Зачётов</th>
              <th class="text-right" style="width: 120px">Средний</th>
              <th class="text-right" style="width: 150px">Попыток до зачёта</th>
              <th class="text-right" style="width: 120px">Застряли</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in topics" :key="t.topic_id">
              <td>
                <div>{{ t.topic_title }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ t.subject_name }} · {{ t.section_title }}
                </div>
              </td>
              <td class="text-right tabular">{{ t.students }}</td>
              <td class="text-right tabular">{{ t.attempts }}</td>
              <td class="text-right">
                <v-chip size="small" variant="tonal" :color="passColor(t.pass_rate)">
                  {{ t.pass_rate }}%
                </v-chip>
              </td>
              <td class="text-right tabular">{{ t.avg_score }}</td>
              <td class="text-right tabular">{{ t.avg_attempts_to_pass ?? '—' }}</td>
              <td class="text-right tabular">
                <span :class="{ 'text-error': t.stuck_students > 0 }">{{ t.stuck_students }}</span>
              </td>
            </tr>
            <tr v-if="topics.length === 0">
              <td colspan="7" class="text-center text-medium-emphasis py-6">
                Попыток пока не было — статистике не из чего складываться.
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <!-- Карточка ученика -->
    <v-dialog v-model="card.open" max-width="820" scrollable>
      <v-card class="register-calm" border>
        <v-card-title class="d-flex align-center">
          <span>{{ student?.profile?.full_name || 'Ученик' }}</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="card.open = false" />
        </v-card-title>

        <v-card-text style="min-height: 320px">
          <div v-if="loading" class="text-center py-10">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <template v-else-if="student">
            <p class="text-body-2 text-medium-emphasis mb-4">
              {{ student.profile.email }} · {{ student.profile.grade }} класс ·
              {{ student.profile.exam_type === 'oge' ? 'ОГЭ' : 'ЕГЭ' }}
              <span v-if="student.streak_days"> · серия {{ student.streak_days }} дн.</span>
            </p>

            <h3 class="text-subtitle-1 font-weight-medium mb-2">Планы</h3>
            <v-card v-for="p in student.plans" :key="p.id" border class="pa-3 mb-2">
              <div class="d-flex align-center mb-1">
                <span>{{ p.subject_name }}</span>
                <v-spacer />
                <span class="text-caption text-medium-emphasis tabular">
                  {{ p.topics_done }} / {{ p.topics_total }}
                </span>
              </div>
              <v-progress-linear
                :model-value="p.topics_total ? (p.topics_done / p.topics_total) * 100 : 0"
                color="primary"
                height="6"
                rounded
              />
            </v-card>
            <p v-if="student.plans.length === 0" class="text-body-2 text-medium-emphasis mb-4">
              Планов нет.
            </p>

            <template v-if="student.stuck.length">
              <h3 class="text-subtitle-1 font-weight-medium mt-5 mb-2">Где застрял</h3>
              <v-table density="compact">
                <tbody>
                  <tr v-for="t in student.stuck" :key="t.topic_id">
                    <td>
                      {{ t.topic_title }}
                      <div class="text-caption text-medium-emphasis">{{ t.section_title }}</div>
                    </td>
                    <td class="text-right tabular">{{ t.attempts }} попыток</td>
                    <td class="text-right tabular">лучший {{ t.best_score }}</td>
                    <td class="text-right text-caption text-medium-emphasis">
                      {{ formatDate(t.last_attempt) }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </template>

            <h3 class="text-subtitle-1 font-weight-medium mt-5 mb-2">Последние попытки</h3>
            <v-table density="compact">
              <tbody>
                <tr v-for="a in student.attempts" :key="a.id">
                  <td>
                    {{ a.topic_title }}
                    <div class="text-caption text-medium-emphasis">{{ a.subject_name }}</div>
                  </td>
                  <td class="text-right tabular">{{ a.score_percent }}%</td>
                  <td class="text-right">
                    <v-chip size="x-small" variant="tonal" :color="a.passed ? 'success' : 'error'">
                      {{ a.passed ? 'зачёт' : 'не сдан' }}
                    </v-chip>
                  </td>
                  <td class="text-right text-caption text-medium-emphasis">
                    {{ formatDate(a.finished_at) }}
                  </td>
                </tr>
                <tr v-if="student.attempts.length === 0">
                  <td colspan="4" class="text-center text-medium-emphasis py-4">
                    Тестов ещё не было.
                  </td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAnalytics } from '../composables/useAnalytics';
import { useCatalog } from '../composables/useCatalog';

const {
  summary,
  students,
  topics,
  student,
  loading,
  error,
  loadSummary: fetchSummary,
  loadStudents,
  loadTopics,
  loadStudent,
  csvUrl,
} = useAnalytics();
const { subjects, loadSubjects } = useCatalog();

const tab = ref('students');
const days = ref(7);
const filters = reactive({ grade: null, exam: null, subject_id: null });
const topicFilters = reactive({ subject_id: null });
const card = reactive({ open: false });

const PERIOD_ITEMS = [
  { title: 'за неделю', value: 7 },
  { title: 'за месяц', value: 30 },
  { title: 'за квартал', value: 90 },
  { title: 'за год', value: 365 },
];
const GRADE_ITEMS = [8, 9, 10, 11];
const EXAM_ITEMS = [
  { title: 'ОГЭ', value: 'oge' },
  { title: 'ЕГЭ', value: 'ege' },
];

const subjectItems = computed(() =>
  subjects.value.map((s) => ({ title: s.name, value: Number(s.id) })),
);

// Плитки сводки собираются из ответа: пока он не пришёл, показываем прочерки,
// а не нули — ноль учеников и «ещё не загрузилось» это разные новости.
const tiles = computed(() => {
  const s = summary.value;
  const dash = (v) => (s ? v : '—');
  return [
    { label: 'Учеников', value: dash(s?.students) },
    {
      label: 'Занимались',
      value: dash(s?.active_students),
      hint: s ? `за ${s.days ?? days.value} дн.` : '',
    },
    {
      label: 'Попыток',
      value: dash(s?.attempts),
      hint: s?.attempts ? `${s.attempts_passed} зачтено` : '',
    },
    {
      label: 'Средний прогресс',
      value: s ? `${s.avg_progress}%` : '—',
      hint: s ? `${s.topics_completed} тем освоено` : '',
    },
  ];
});

const progressColor = (percent) =>
  percent >= 70 ? 'success' : percent >= 30 ? 'primary' : 'warning';
const passColor = (rate) => (rate >= 70 ? 'success' : rate >= 40 ? 'warning' : 'error');

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ru-RU') : '—');

const loadSummaryForPeriod = () => fetchSummary(days.value);
const refreshStudents = () => loadStudents(filters);
const refreshTopics = () => loadTopics(topicFilters);

async function openStudent(userId) {
  card.open = true;
  await loadStudent(userId);
}

onMounted(async () => {
  await Promise.all([loadSummaryForPeriod(), refreshStudents(), refreshTopics()]);
  if (subjects.value.length === 0) await loadSubjects();
});

// Селектор периода в шаблоне зовёт этот обработчик.
const loadSummary = loadSummaryForPeriod;
</script>

<style scoped>
.student-row {
  cursor: pointer;
}
.student-row:hover {
  background: rgba(0, 0, 0, 0.03);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
