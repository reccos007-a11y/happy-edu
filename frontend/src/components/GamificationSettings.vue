<template>
  <div class="register-calm">
    <div class="d-flex align-center mb-1">
      <h2 class="text-h4">Геймификация</h2>
      <v-spacer />
      <v-btn variant="text" :disabled="saving" @click="askReset">Сбросить к умолчанию</v-btn>
      <v-btn color="primary" variant="flat" class="ml-2" :loading="saving" @click="save">
        Сохранить
      </v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-5">
      Правила, по которым считаются опыт, уровни и значки в кабинете ученика. Сами величины не
      хранятся — после изменения правил они пересчитываются из реального прогресса.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <div v-if="loading" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="draft">
      <v-card border class="pa-5 mb-6">
        <h3 class="text-h6 mb-4">Опыт и зачёт</h3>
        <div class="d-flex ga-4 flex-wrap">
          <v-text-field
            v-model.number="draft.xpPerTopic"
            type="number"
            label="XP за освоенную тему"
            min="1"
            style="max-width: 240px"
            hint="Опыт ученика = это число × количество освоенных тем"
            persistent-hint
          />
          <v-text-field
            v-model.number="draft.passPercent"
            type="number"
            label="Порог зачёта теста, %"
            min="1"
            max="100"
            style="max-width: 240px"
            hint="Результат ниже порога отправляет тему на повторение"
            persistent-hint
          />
        </div>
      </v-card>

      <v-card border class="pa-5 mb-6">
        <div class="d-flex align-center mb-4">
          <h3 class="text-h6">Уровни</h3>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addLevel">
            Добавить уровень
          </v-btn>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Порог первого уровня — всегда 0. Дальше номера и пороги должны возрастать.
        </p>

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left" style="width: 110px">Номер</th>
              <th class="text-left" style="width: 160px">Порог XP</th>
              <th class="text-left">Название</th>
              <th style="width: 56px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in draft.levels" :key="i">
              <td>
                <v-text-field
                  v-model.number="row.level"
                  type="number"
                  density="compact"
                  hide-details
                  variant="plain"
                />
              </td>
              <td>
                <v-text-field
                  v-model.number="row.minXp"
                  type="number"
                  density="compact"
                  hide-details
                  variant="plain"
                />
              </td>
              <td>
                <v-text-field
                  v-model="row.title"
                  density="compact"
                  hide-details
                  variant="plain"
                  maxlength="50"
                />
              </td>
              <td class="text-right">
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  icon="mdi-delete-outline"
                  :disabled="draft.levels.length === 1"
                  title="Удалить уровень"
                  @click="draft.levels.splice(i, 1)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card border class="pa-5">
        <div class="d-flex align-center mb-4">
          <h3 class="text-h6">Значки</h3>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addBadge">
            Добавить значок
          </v-btn>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Значок выдаётся, когда показатель ученика достигает порога. Выключенный значок не
          показывается в кабинете совсем.
        </p>

        <v-card v-for="(row, i) in draft.badges" :key="i" border class="pa-4 mb-3">
          <div class="d-flex ga-3 flex-wrap align-center">
            <v-text-field
              v-model="row.label"
              label="Название"
              density="compact"
              hide-details
              maxlength="60"
              style="min-width: 200px"
            />
            <v-select
              v-model="row.metric"
              :items="metricItems"
              label="Показатель"
              density="compact"
              hide-details
              style="max-width: 260px"
            />
            <v-text-field
              v-model.number="row.threshold"
              type="number"
              label="Порог"
              density="compact"
              hide-details
              min="0"
              style="max-width: 120px"
            />
            <v-switch
              v-model="row.enabled"
              color="primary"
              density="compact"
              hide-details
              label="Включён"
            />
            <v-btn
              size="small"
              variant="text"
              color="error"
              icon="mdi-delete-outline"
              title="Удалить значок"
              @click="draft.badges.splice(i, 1)"
            />
          </div>
          <div class="d-flex ga-3 flex-wrap mt-3">
            <v-text-field
              v-model="row.code"
              label="Код"
              density="compact"
              hide-details
              maxlength="40"
              style="max-width: 220px"
              hint="Латиница, цифры, подчёркивание"
            />
            <v-text-field
              v-model="row.hint"
              label="Подсказка ученику"
              density="compact"
              hide-details
              maxlength="120"
              style="min-width: 280px"
            />
          </div>
        </v-card>

        <p v-if="draft.badges.length === 0" class="text-medium-emphasis text-center py-4">
          Значков нет — в кабинете раздел достижений будет пустым.
        </p>
      </v-card>
    </template>

    <v-dialog v-model="confirmReset" max-width="440">
      <v-card class="register-calm pa-2" border>
        <v-card-title>Сбросить настройки?</v-card-title>
        <v-card-text>
          Правила вернутся к значениям по умолчанию, а опыт и значки учеников пересчитаются по ним.
          Прогресс — освоенные темы и результаты тестов — не затрагивается.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmReset = false">Отмена</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doReset">Сбросить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="3000">{{
      snack.text
    }}</v-snackbar>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useSettings } from '../composables/useSettings';

const { settings, metrics, loading, error, load, save: saveSettings, reset } = useSettings();

// Правим копию, а не то, что пришло с сервера: пока изменения не сохранены,
// отмена должна возвращать прежние правила без повторной загрузки.
const draft = ref(null);
const saving = ref(false);
const confirmReset = ref(false);
const snack = reactive({ open: false, text: '', color: 'success' });

const metricItems = computed(() =>
  Object.entries(metrics.value).map(([value, title]) => ({ value, title })),
);

function makeDraft() {
  draft.value = settings.value ? structuredClone(settings.value) : null;
}

function notify(text, color = 'success') {
  Object.assign(snack, { open: true, text, color });
}

function addLevel() {
  const last = draft.value.levels[draft.value.levels.length - 1];
  draft.value.levels.push({
    level: (last?.level ?? 0) + 1,
    minXp: (last?.minXp ?? 0) + 200,
    title: '',
  });
}

function addBadge() {
  draft.value.badges.push({
    code: '',
    label: '',
    hint: '',
    metric: 'topicsCompleted',
    threshold: 1,
    enabled: true,
  });
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const data = await saveSettings(draft.value);
    settings.value = data.settings;
    makeDraft();
    notify('Настройки сохранены');
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

function askReset() {
  confirmReset.value = true;
}

async function doReset() {
  saving.value = true;
  error.value = '';
  try {
    const data = await reset();
    settings.value = data.settings;
    makeDraft();
    confirmReset.value = false;
    notify('Вернули значения по умолчанию');
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await load();
  makeDraft();
});
</script>
