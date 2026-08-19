<template>
  <div class="register-calm">
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <!-- Детальный вид предмета -->
    <template v-if="selectedId">
      <v-btn
        variant="text"
        color="primary"
        density="comfortable"
        prepend-icon="mdi-arrow-left"
        class="mb-3 ml-n2"
        @click="closeSubject"
      >
        Все предметы
      </v-btn>

      <div v-if="loading" class="text-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <template v-else-if="subject">
        <div class="d-flex align-center flex-wrap ga-3 mb-1">
          <h2 class="text-h4">{{ subject.name }}</h2>
          <v-chip size="small" variant="tonal" color="primary">{{
            examLabel(subject.applies_to)
          }}</v-chip>
          <v-chip v-if="subject.has_levels" size="small" variant="tonal">база / профиль</v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-5">
          {{ sections.length }} разделов · {{ topicTotal }} тем
        </p>

        <v-expansion-panels v-model="openSection" variant="accordion" multiple>
          <v-expansion-panel v-for="section in sections" :key="section.id" :value="section.id">
            <v-expansion-panel-title>
              <span class="text-subtitle-1 font-weight-medium">{{ section.title }}</span>
              <template #actions="{ expanded }">
                <span class="text-caption text-medium-emphasis mr-2"
                  >{{ section.topics.length }} тем</span
                >
                <v-icon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
              </template>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list class="py-0" bg-color="transparent">
                <v-list-item v-for="topic in section.topics" :key="topic.id" class="px-0 topic-row">
                  <template #prepend>
                    <span v-if="topic.codifier_code" class="topic-code tabular">{{
                      topic.codifier_code
                    }}</span>
                    <span v-else class="topic-code text-disabled">—</span>
                  </template>
                  <v-list-item-title class="text-body-1">{{ topic.title }}</v-list-item-title>
                  <template #append>
                    <v-chip
                      size="x-small"
                      variant="tonal"
                      :color="difficulty(topic.difficulty).color"
                    >
                      {{ difficulty(topic.difficulty).label }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
              <p v-if="section.topics.length === 0" class="text-body-2 text-medium-emphasis py-2">
                В разделе пока нет тем.
              </p>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </template>
    </template>

    <!-- Витрина предметов -->
    <template v-else>
      <h2 class="text-h4 mb-1">Предметы</h2>
      <p class="text-body-2 text-medium-emphasis mb-5">Каталог тем по программе ОГЭ и ЕГЭ</p>

      <div v-if="loading" class="text-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <p v-else-if="subjects.length === 0" class="text-body-2 text-medium-emphasis">
        Каталог пока пуст.
      </p>

      <v-row v-else>
        <v-col v-for="s in subjects" :key="s.id" cols="12" sm="6" md="4">
          <v-card class="pa-5 h-100 subject-card" @click="openSubject(s.id)">
            <div class="d-flex align-center justify-space-between mb-2">
              <v-chip size="small" variant="tonal" color="primary">{{
                examLabel(s.applies_to)
              }}</v-chip>
              <v-icon icon="mdi-arrow-right" color="primary" size="small" />
            </div>
            <h3 class="text-h6 mb-1">{{ s.name }}</h3>
            <p class="text-body-2 text-medium-emphasis mb-0 tabular">
              {{ s.section_count }} разделов · {{ s.topic_count }} тем
            </p>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useCatalog } from '../composables/useCatalog';

const { subjects, subject, sections, loading, error, loadSubjects, loadSubject } = useCatalog();

const selectedId = ref(null);
const openSection = ref([]);

const topicTotal = computed(() =>
  sections.value.reduce((sum, section) => sum + section.topics.length, 0),
);

function examLabel(appliesTo) {
  if (appliesTo === 'oge') return 'ОГЭ';
  if (appliesTo === 'ege') return 'ЕГЭ';
  return 'ОГЭ · ЕГЭ';
}

const DIFFICULTY = {
  base: { label: 'базовый', color: 'surface-variant' },
  advanced: { label: 'продвинутый', color: 'primary' },
  high: { label: 'высокий', color: 'warning' },
};
function difficulty(code) {
  return DIFFICULTY[code] ?? DIFFICULTY.base;
}

async function openSubject(id) {
  selectedId.value = id;
  await loadSubject(id);
  // Первый раздел открыт по умолчанию — сразу видно содержание.
  openSection.value = sections.value.length ? [sections.value[0].id] : [];
}

function closeSubject() {
  selectedId.value = null;
  subject.value = null;
  sections.value = [];
}

onMounted(loadSubjects);
</script>

<style scoped>
.subject-card {
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.subject-card:hover {
  box-shadow: 0 6px 18px -8px rgba(75, 79, 203, 0.28);
}
.topic-code {
  display: inline-block;
  min-width: 34px;
  margin-right: 14px;
  font-size: 12.5px;
  color: var(--ink-soft, #5a5f6b);
}
.topic-row + .topic-row {
  border-top: 1px solid var(--line, #e6e1d6);
}
</style>
