<template>
  <v-dialog :model-value="open" max-width="760" scrollable @update:model-value="$emit('close')">
    <v-card class="register-calm" border>
      <v-card-title class="d-flex align-center">
        <span>Учебные планы — {{ studentName }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
      </v-card-title>

      <v-card-text style="min-height: 320px">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
          {{ error }}
        </v-alert>

        <div v-if="loading" class="text-center py-10">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Список планов ученика -->
        <template v-else-if="view === 'list'">
          <div class="d-flex ga-2 mb-4">
            <v-select
              v-model="newSubjectId"
              :items="subjectItems"
              label="Предмет"
              density="comfortable"
              hide-details
              style="max-width: 320px"
            />
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!newSubjectId"
              :loading="creating"
              @click="assign"
            >
              Назначить план
            </v-btn>
          </div>

          <p v-if="plans.length === 0" class="text-body-2 text-medium-emphasis py-4">
            У ученика пока нет планов. Выберите предмет и назначьте план.
          </p>

          <v-card
            v-for="p in plans"
            :key="p.id"
            border
            class="mb-3 pa-4 plan-row"
            @click="openPlan(p.id)"
          >
            <div class="d-flex align-center mb-2">
              <span class="text-subtitle-1 font-weight-medium">{{ p.subject_name }}</span>
              <v-chip
                size="x-small"
                class="ml-2"
                :color="planStatus(p.status).color"
                variant="tonal"
              >
                {{ planStatus(p.status).label }}
              </v-chip>
              <v-spacer />
              <span class="text-caption text-medium-emphasis tabular mr-2">
                {{ p.topics_done }} / {{ p.topics_total }} тем
              </span>
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="error"
                @click.stop="askDeletePlan(p)"
              />
            </div>
            <v-progress-linear
              :model-value="p.topics_total ? (p.topics_done / p.topics_total) * 100 : 0"
              color="primary"
              height="6"
              rounded
            />
          </v-card>
        </template>

        <!-- Детали плана: темы и статусы -->
        <template v-else-if="view === 'detail' && plan">
          <v-btn
            variant="text"
            color="primary"
            density="comfortable"
            prepend-icon="mdi-arrow-left"
            class="mb-3 ml-n2"
            @click="backToList"
          >
            Все планы
          </v-btn>

          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <span class="text-h6">{{ plan.subject_name }}</span>
            <v-select
              :model-value="plan.status"
              :items="PLAN_STATUS_ITEMS"
              density="compact"
              hide-details
              variant="outlined"
              style="max-width: 180px"
              @update:model-value="changePlanStatus"
            />
            <v-spacer />
            <v-switch
              :model-value="plan.sequential"
              color="primary"
              density="compact"
              hide-details
              label="Строгий порядок"
              @update:model-value="changeSequential"
            />
          </div>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{
              plan.sequential
                ? 'Следующая тема открывается после зачёта предыдущей.'
                : 'Ученик проходит темы в любом порядке.'
            }}
          </p>

          <v-list class="py-0" bg-color="transparent">
            <v-list-item
              v-for="(i, idx) in items"
              :key="i.id"
              class="px-0 plan-item"
              :class="{ 'item-hidden': i.hidden_at }"
            >
              <template #prepend>
                <span class="idx tabular">{{ idx + 1 }}</span>
              </template>
              <v-list-item-title class="text-body-1">
                {{ i.topic_title }}
                <v-chip v-if="i.hidden_at" size="x-small" variant="flat" class="ml-1">
                  скрыта
                </v-chip>
                <v-chip
                  v-if="i.unlocked_at"
                  size="x-small"
                  variant="flat"
                  color="primary"
                  class="ml-1"
                >
                  открыта вручную
                </v-chip>
                <v-chip
                  v-if="i.available_from"
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  class="ml-1"
                >
                  с {{ formatDate(i.available_from) }}
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ i.section_title }}<span v-if="i.codifier_code"> · {{ i.codifier_code }}</span>
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  size="small"
                  variant="text"
                  :icon="i.unlocked_at ? 'mdi-lock-open-variant' : 'mdi-lock-open-outline'"
                  :color="i.unlocked_at ? 'primary' : undefined"
                  :title="i.unlocked_at ? 'Отменить ручное открытие' : 'Открыть тему вручную'"
                  :loading="busyItem === `unlock-${i.id}`"
                  @click="toggleUnlocked(i)"
                />
                <v-btn
                  size="small"
                  variant="text"
                  icon="mdi-calendar-clock"
                  title="Дата открытия"
                  @click="openSchedule(i)"
                />
                <v-btn
                  size="small"
                  variant="text"
                  :icon="i.hidden_at ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                  :title="i.hidden_at ? 'Вернуть ученику' : 'Скрыть у этого ученика'"
                  :loading="busyItem === `hide-${i.id}`"
                  @click="toggleHidden(i)"
                />
                <v-select
                  :model-value="i.status"
                  :items="ITEM_STATUS_ITEMS"
                  density="compact"
                  hide-details
                  variant="plain"
                  style="max-width: 170px"
                  :base-color="itemStatus(i.status).color"
                  @update:model-value="(s) => changeItemStatus(i, s)"
                />
              </template>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-dialog v-model="schedule.open" max-width="420">
    <v-card class="register-calm pa-2" border>
      <v-card-title>Дата открытия темы</v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          «{{ schedule.label }}» станет доступна ученику с этой даты. Пустое поле — без ограничения
          по дате.
        </p>
        <v-text-field
          v-model="schedule.value"
          type="date"
          label="Доступна с"
          density="comfortable"
          hide-details
        />
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" :disabled="schedule.saving" @click="clearSchedule">Убрать дату</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="schedule.open = false">Отмена</v-btn>
        <v-btn color="primary" variant="flat" :loading="schedule.saving" @click="saveSchedule">
          Сохранить
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="confirm.open" max-width="420">
    <v-card class="register-calm pa-2" border>
      <v-card-title>Удалить план?</v-card-title>
      <v-card-text>План по предмету «{{ confirm.label }}» будет удалён.</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="confirm.open = false">Отмена</v-btn>
        <v-btn color="error" variant="flat" :loading="creating" @click="doDeletePlan"
          >Удалить</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useCatalog } from '../composables/useCatalog';
import { usePlans } from '../composables/usePlans';

const props = defineProps({
  open: { type: Boolean, default: false },
  userId: { type: [Number, String], default: null },
  studentName: { type: String, default: '' },
});
defineEmits(['close']);

const { subjects, loadSubjects } = useCatalog();
const {
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
  setItemAccess,
} = usePlans();

const view = ref('list');
const newSubjectId = ref(null);
const creating = ref(false);
const confirm = reactive({ open: false, id: null, label: '' });
// Какая именно кнопка доступа сейчас в работе («действие-id»): крутилка должна
// быть на нажатой, а не на всех сразу.
const busyItem = ref('');
const schedule = reactive({ open: false, item: null, label: '', value: '', saving: false });

const subjectItems = computed(() =>
  subjects.value.map((s) => ({ title: s.name, value: Number(s.id) })),
);

const PLAN_STATUS = {
  draft: { label: 'черновик', color: 'surface-variant' },
  active: { label: 'активен', color: 'primary' },
  completed: { label: 'завершён', color: 'success' },
  archived: { label: 'в архиве', color: 'surface-variant' },
};
const planStatus = (s) => PLAN_STATUS[s] ?? PLAN_STATUS.active;
const PLAN_STATUS_ITEMS = Object.entries(PLAN_STATUS).map(([value, v]) => ({
  title: v.label,
  value,
}));

const ITEM_STATUS = {
  not_started: { label: 'не начата', color: 'medium-emphasis' },
  in_progress: { label: 'в процессе', color: 'primary' },
  completed: { label: 'освоена', color: 'success' },
  needs_review: { label: 'на повторение', color: 'warning' },
};
const itemStatus = (s) => ITEM_STATUS[s] ?? ITEM_STATUS.not_started;
const ITEM_STATUS_ITEMS = Object.entries(ITEM_STATUS).map(([value, v]) => ({
  title: v.label,
  value,
}));

// Открытие диалога: загрузить планы ученика и справочник предметов.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.userId != null) {
      view.value = 'list';
      newSubjectId.value = null;
      loadPlans(props.userId);
      if (subjects.value.length === 0) loadSubjects();
    }
  },
);

async function assign() {
  creating.value = true;
  try {
    await createPlan(props.userId, { subject_id: newSubjectId.value });
    newSubjectId.value = null;
    await loadPlans(props.userId);
  } catch (e) {
    error.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function openPlan(planId) {
  await loadPlan(planId);
  view.value = 'detail';
}
function backToList() {
  view.value = 'list';
  loadPlans(props.userId);
}

async function changePlanStatus(status) {
  try {
    await updatePlan(plan.value.id, { status });
    plan.value.status = status;
  } catch (e) {
    error.value = e.message;
  }
}

async function changeItemStatus(item, status) {
  try {
    await setItemStatus(item.id, status);
    item.status = status;
  } catch (e) {
    error.value = e.message;
  }
}

async function changeSequential(value) {
  try {
    await updatePlan(plan.value.id, { sequential: value });
    plan.value.sequential = value;
  } catch (e) {
    error.value = e.message;
  }
}

// Ответ сервера кладём в позицию целиком: он возвращает все отметки доступа,
// и брать их оттуда надёжнее, чем угадывать на клиенте.
async function applyAccess(item, payload, busyKey) {
  busyItem.value = busyKey;
  try {
    const { item: updated } = await setItemAccess(item.id, payload);
    Object.assign(item, updated);
  } catch (e) {
    error.value = e.message;
  } finally {
    busyItem.value = '';
  }
}

const toggleUnlocked = (item) =>
  applyAccess(item, { unlocked: !item.unlocked_at }, `unlock-${item.id}`);

const toggleHidden = (item) => applyAccess(item, { hidden: !item.hidden_at }, `hide-${item.id}`);

function openSchedule(item) {
  Object.assign(schedule, {
    open: true,
    item,
    label: item.topic_title,
    // input[type=date] понимает только ГГГГ-ММ-ДД, а сервер отдаёт дату с временем.
    value: item.available_from ? String(item.available_from).slice(0, 10) : '',
    saving: false,
  });
}

async function saveSchedule() {
  schedule.saving = true;
  await applyAccess(schedule.item, { available_from: schedule.value || '' }, '');
  schedule.saving = false;
  schedule.open = false;
}

async function clearSchedule() {
  schedule.value = '';
  await saveSchedule();
}

const formatDate = (value) => new Date(value).toLocaleDateString('ru-RU');

function askDeletePlan(p) {
  Object.assign(confirm, { open: true, id: p.id, label: p.subject_name });
}
async function doDeletePlan() {
  creating.value = true;
  try {
    await deletePlan(confirm.id);
    confirm.open = false;
    await loadPlans(props.userId);
  } catch (e) {
    error.value = e.message;
    confirm.open = false;
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.plan-row {
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.plan-row:hover {
  box-shadow: 0 6px 18px -8px rgba(75, 79, 203, 0.28);
}
/* Скрытая у ученика тема остаётся в списке персонала, но приглушена. */
.item-hidden {
  opacity: 0.55;
}
.plan-item + .plan-item {
  border-top: 1px solid var(--line, #e6e1d6);
}
.idx {
  display: inline-block;
  min-width: 26px;
  color: var(--ink-soft, #5a5f6b);
  font-size: 13px;
}
</style>
