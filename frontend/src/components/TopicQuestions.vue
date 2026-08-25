<template>
  <v-dialog :model-value="open" max-width="640" scrollable @update:model-value="$emit('close')">
    <v-card class="register-calm" border>
      <v-card-title class="d-flex align-center">
        <span>Вопросы теста — {{ topicTitle }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
          {{ error }}
        </v-alert>

        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="26" />
        </div>
        <p v-else-if="questions.length === 0" class="text-body-2 text-medium-emphasis mb-4">
          Вопросов пока нет. Добавьте первый — тест по теме появится у ученика.
        </p>
        <v-list v-else class="mb-4 py-0" bg-color="transparent">
          <v-list-item v-for="(q, i) in questions" :key="q.id" class="px-0 q-row">
            <v-list-item-title class="text-wrap">{{ i + 1 }}. {{ q.text }}</v-list-item-title>
            <v-list-item-subtitle>{{ typeLabel(q.type) }}</v-list-item-subtitle>
            <template #append>
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="error"
                @click="remove(q)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-divider class="mb-4" />
        <div class="text-subtitle-2 mb-2">Добавить вопрос</div>
        <v-select v-model="form.type" :items="TYPE_ITEMS" label="Тип" density="comfortable" />
        <v-textarea v-model="form.text" label="Текст вопроса" rows="2" auto-grow />

        <!-- варианты для выбора -->
        <template v-if="form.type !== 'short_answer'">
          <div class="text-caption text-medium-emphasis mb-1">Варианты (отметьте правильные)</div>
          <div v-for="(o, i) in form.options" :key="i" class="d-flex align-center ga-2 mb-2">
            <v-checkbox-btn v-model="o.is_correct" color="success" />
            <v-text-field
              v-model="o.option_text"
              :placeholder="`Вариант ${i + 1}`"
              density="compact"
              hide-details
            />
            <v-btn
              v-if="form.options.length > 2"
              icon="mdi-close"
              variant="text"
              size="x-small"
              @click="form.options.splice(i, 1)"
            />
          </div>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-plus"
            class="mb-3"
            @click="addOption"
          >
            Ещё вариант
          </v-btn>
        </template>

        <!-- правильный ответ для короткого -->
        <v-text-field
          v-else
          v-model="form.correct_short_answer"
          label="Правильный ответ"
          density="comfortable"
        />

        <div class="d-flex justify-end">
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!form.text"
            @click="add"
          >
            Добавить вопрос
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { useQuestions } from '../composables/useQuestions';

const props = defineProps({
  open: { type: Boolean, default: false },
  topicId: { type: [Number, String], default: null },
  topicTitle: { type: String, default: '' },
});
defineEmits(['close']);

const { questions, loading, error, loadQuestions, createQuestion, deleteQuestion } = useQuestions();

const TYPE_ITEMS = [
  { title: 'Одиночный выбор', value: 'single_choice' },
  { title: 'Множественный выбор', value: 'multiple_choice' },
  { title: 'Короткий ответ', value: 'short_answer' },
];
const TYPE_LABEL = {
  single_choice: 'Одиночный выбор',
  multiple_choice: 'Множественный выбор',
  short_answer: 'Короткий ответ',
};
const typeLabel = (t) => TYPE_LABEL[t] ?? t;

function blankForm() {
  return {
    type: 'single_choice',
    text: '',
    correct_short_answer: '',
    options: [
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
    ],
  };
}
const form = reactive(blankForm());
const saving = ref(false);

const addOption = () => form.options.push({ option_text: '', is_correct: false });

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.topicId != null) {
      Object.assign(form, blankForm());
      loadQuestions(props.topicId);
    }
  },
);

async function add() {
  saving.value = true;
  error.value = '';
  try {
    const payload = { type: form.type, text: form.text };
    if (form.type === 'short_answer') {
      payload.correct_short_answer = form.correct_short_answer;
    } else {
      payload.options = form.options
        .filter((o) => o.option_text.trim())
        .map((o) => ({ option_text: o.option_text, is_correct: o.is_correct }));
    }
    await createQuestion(props.topicId, payload);
    Object.assign(form, blankForm());
    await loadQuestions(props.topicId);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove(q) {
  error.value = '';
  try {
    await deleteQuestion(q.id);
    await loadQuestions(props.topicId);
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<style scoped>
.q-row + .q-row {
  border-top: 1px solid var(--line, #e6e1d6);
}
</style>
