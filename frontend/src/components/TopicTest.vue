<template>
  <div class="test-block">
    <div v-if="loading" class="text-center py-4">
      <v-progress-circular indeterminate color="primary" size="24" />
    </div>

    <p v-else-if="questions.length === 0" class="no-test">Тест по этой теме ещё не готов.</p>

    <!-- Результат -->
    <div v-else-if="result" class="result" :class="{ ok: result.passed }">
      <div class="score">{{ result.percent }}%</div>
      <p class="verdict">
        {{
          result.passed
            ? '🎉 Тема зачтена! Так держать.'
            : 'Пока не зачтено — попробуй ещё раз после повторения.'
        }}
      </p>
      <p class="detail tabular">Верно {{ result.correct }} из {{ result.total }}</p>
      <button class="retry" @click="restart">Пройти заново</button>
    </div>

    <!-- Вопросы -->
    <form v-else @submit.prevent="submit">
      <div v-for="(q, qi) in questions" :key="q.id" class="question">
        <div class="q-text">
          <span class="q-num">{{ qi + 1 }}.</span> {{ q.text }}
        </div>

        <!-- одиночный выбор -->
        <template v-if="q.type === 'single_choice'">
          <label v-for="o in q.options" :key="o.id" class="opt">
            <input v-model="answers[q.id].single" type="radio" :name="`q${q.id}`" :value="o.id" />
            <span>{{ o.option_text }}</span>
          </label>
        </template>

        <!-- множественный выбор -->
        <template v-else-if="q.type === 'multiple_choice'">
          <label v-for="o in q.options" :key="o.id" class="opt">
            <input v-model="answers[q.id].multi" type="checkbox" :value="o.id" />
            <span>{{ o.option_text }}</span>
          </label>
        </template>

        <!-- короткий ответ -->
        <input
          v-else
          v-model="answers[q.id].text"
          type="text"
          class="short-input"
          placeholder="Ваш ответ"
        />
      </div>

      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
        {{ error }}
      </v-alert>

      <button type="submit" class="submit-btn" :disabled="submitting">
        {{ submitting ? 'Проверяем…' : 'Отправить ответы' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { useTest } from '../composables/useTest';

const props = defineProps({
  topicId: { type: [Number, String], required: true },
});
const emit = defineEmits(['passed']);

const { questions, loading, error, loadTest, submitTest } = useTest();

const answers = reactive({});
const result = ref(null);
const submitting = ref(false);

// Инициализация формы ответов под загруженные вопросы.
watch(
  questions,
  (qs) => {
    Object.keys(answers).forEach((k) => delete answers[k]);
    for (const q of qs) answers[q.id] = { single: null, multi: [], text: '' };
  },
  { immediate: true },
);

async function submit() {
  submitting.value = true;
  error.value = '';
  try {
    const payload = {};
    for (const q of questions.value) {
      const a = answers[q.id];
      if (q.type === 'single_choice') payload[q.id] = { selected: a.single ? [a.single] : [] };
      else if (q.type === 'multiple_choice') payload[q.id] = { selected: a.multi };
      else payload[q.id] = { text: a.text };
    }
    result.value = await submitTest(props.topicId, payload);
    if (result.value.passed) emit('passed');
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

function restart() {
  result.value = null;
  loadTest(props.topicId);
}

loadTest(props.topicId);
</script>

<style scoped>
.test-block {
  background: #fff;
  border: 1px solid #e6e1d6;
  border-radius: 16px;
  padding: 18px 20px;
}
.no-test {
  font-size: 13px;
  color: #8a8577;
  margin: 0;
}
.question {
  margin-bottom: 16px;
}
.q-text {
  font-size: 14.5px;
  font-weight: 600;
  color: #2a2740;
  margin-bottom: 8px;
}
.q-num {
  color: #4b4fcb;
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333846;
  padding: 5px 0;
  cursor: pointer;
}
.opt input {
  accent-color: #4b4fcb;
  width: 16px;
  height: 16px;
}
.short-input {
  width: 100%;
  max-width: 320px;
  border: 1px solid #d8d2c4;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
}
.short-input:focus {
  outline: 2px solid #b6b8ec;
  border-color: #4b4fcb;
}
.submit-btn {
  border: none;
  background: #4b4fcb;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  padding: 11px 20px;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}
.submit-btn:disabled {
  opacity: 0.6;
}
.result {
  text-align: center;
  padding: 8px;
}
.score {
  font-size: 44px;
  font-weight: 800;
  color: #d9822b;
  font-variant-numeric: tabular-nums;
}
.result.ok .score {
  color: #1f9254;
}
.verdict {
  font-size: 15px;
  font-weight: 600;
  color: #2a2740;
  margin: 4px 0;
}
.detail {
  font-size: 13px;
  color: #8a87a0;
  margin: 0 0 12px;
}
.retry {
  border: 1px solid #4b4fcb;
  color: #4b4fcb;
  background: #fff;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
}
</style>
