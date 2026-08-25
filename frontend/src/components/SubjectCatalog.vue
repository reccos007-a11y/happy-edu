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
          <template v-if="writable">
            <v-spacer />
            <v-btn size="small" variant="text" icon="mdi-pencil" @click="editSubject(subject)" />
            <v-btn
              size="small"
              variant="text"
              color="error"
              icon="mdi-delete-outline"
              @click="askDelete('subject', subject.id, subject.name)"
            />
          </template>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ sections.length }} разделов · {{ topicTotal }} тем
        </p>

        <v-btn
          v-if="writable"
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-plus"
          class="mb-4"
          @click="createSection"
        >
          Добавить раздел
        </v-btn>

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
              <div v-if="writable" class="d-flex ga-2 mb-2">
                <v-btn
                  size="x-small"
                  variant="tonal"
                  prepend-icon="mdi-plus"
                  @click="createTopic(section)"
                >
                  Тема
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  prepend-icon="mdi-pencil"
                  @click="editSection(section)"
                >
                  Раздел
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="error"
                  prepend-icon="mdi-delete-outline"
                  @click="askDelete('section', section.id, section.title)"
                >
                  Удалить
                </v-btn>
              </div>
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
                      class="mr-1"
                    >
                      {{ difficulty(topic.difficulty).label }}
                    </v-chip>
                    <v-btn
                      size="x-small"
                      variant="text"
                      icon="mdi-book-open-variant"
                      title="Материалы темы"
                      @click="openMaterials(topic)"
                    />
                    <template v-if="writable">
                      <v-btn
                        size="x-small"
                        variant="text"
                        icon="mdi-help-circle-outline"
                        title="Вопросы теста"
                        @click="openQuestions(topic)"
                      />
                      <v-btn
                        size="x-small"
                        variant="text"
                        icon="mdi-pencil"
                        @click="editTopic(section, topic)"
                      />
                      <v-btn
                        size="x-small"
                        variant="text"
                        color="error"
                        icon="mdi-delete-outline"
                        @click="askDelete('topic', topic.id, topic.title)"
                      />
                    </template>
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
      <div class="d-flex align-center mb-1">
        <h2 class="text-h4">Предметы</h2>
        <v-spacer />
        <v-btn
          v-if="writable"
          color="primary"
          variant="flat"
          prepend-icon="mdi-plus"
          @click="createSubject"
        >
          Предмет
        </v-btn>
      </div>
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

    <!-- Диалог формы (предмет / раздел / тема) -->
    <v-dialog v-model="dialog.open" max-width="520" persistent>
      <v-card class="register-calm pa-2" border>
        <v-card-title>{{ dialogTitle }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ formError }}
          </v-alert>

          <template v-if="dialog.type === 'subject'">
            <v-text-field v-model="form.name" label="Название" maxlength="100" autofocus />
            <v-select v-model="form.applies_to" :items="EXAM_ITEMS" label="Экзамен" />
            <v-switch
              v-model="form.has_levels"
              color="primary"
              label="Есть уровни (база / профиль)"
            />
          </template>

          <template v-else-if="dialog.type === 'section'">
            <v-text-field v-model="form.title" label="Название раздела" maxlength="255" autofocus />
          </template>

          <template v-else-if="dialog.type === 'topic'">
            <v-text-field v-model="form.title" label="Название темы" maxlength="255" autofocus />
            <div class="d-flex ga-3">
              <v-select
                v-model="form.grade"
                :items="GRADE_ITEMS"
                label="Класс"
                style="max-width: 120px"
              />
              <v-select v-model="form.difficulty" :items="DIFFICULTY_ITEMS" label="Сложность" />
            </div>
            <v-text-field
              v-model="form.codifier_code"
              label="Код ФИПИ (необязательно)"
              maxlength="20"
            />
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDialog">Отмена</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="save">Сохранить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Подтверждение удаления -->
    <v-dialog v-model="confirm.open" max-width="420">
      <v-card class="register-calm pa-2" border>
        <v-card-title>Удалить?</v-card-title>
        <v-card-text>
          «{{ confirm.label }}» будет скрыт из каталога.
          <template v-if="confirm.kind !== 'topic'"> Вложенные элементы тоже скроются.</template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirm.open = false">Отмена</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doDelete">Удалить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <TopicMaterials
      :open="materialsFor.open"
      :topic-id="materialsFor.topicId"
      :topic-title="materialsFor.title"
      @close="materialsFor.open = false"
    />

    <TopicQuestions
      :open="questionsFor.open"
      :topic-id="questionsFor.topicId"
      :topic-title="questionsFor.title"
      @close="questionsFor.open = false"
    />

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="3000">{{
      snack.text
    }}</v-snackbar>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import TopicMaterials from './TopicMaterials.vue';
import TopicQuestions from './TopicQuestions.vue';
import { useAuth } from '../composables/useAuth';
import { useCatalog } from '../composables/useCatalog';

const { can } = useAuth();
const catalog = useCatalog();
const {
  subjects,
  subject,
  sections,
  loading,
  error,
  loadSubjects,
  loadSubject,
  createSubject: apiCreateSubject,
  updateSubject: apiUpdateSubject,
  deleteSubject: apiDeleteSubject,
  createSection: apiCreateSection,
  updateSection: apiUpdateSection,
  deleteSection: apiDeleteSection,
  createTopic: apiCreateTopic,
  updateTopic: apiUpdateTopic,
  deleteTopic: apiDeleteTopic,
} = catalog;

const writable = computed(() => can('content:write'));

const selectedId = ref(null);
const openSection = ref([]);

const topicTotal = computed(() =>
  sections.value.reduce((sum, section) => sum + section.topics.length, 0),
);

const EXAM_ITEMS = [
  { title: 'ОГЭ', value: 'oge' },
  { title: 'ЕГЭ', value: 'ege' },
  { title: 'ОГЭ и ЕГЭ', value: 'both' },
];
const GRADE_ITEMS = [8, 9, 10, 11];
const DIFFICULTY_ITEMS = [
  { title: 'базовый', value: 'base' },
  { title: 'продвинутый', value: 'advanced' },
  { title: 'высокий', value: 'high' },
];

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
  openSection.value = sections.value.length ? [sections.value[0].id] : [];
}

function closeSubject() {
  selectedId.value = null;
  subject.value = null;
  sections.value = [];
}

// ── Диалоги форм ──
const dialog = reactive({ open: false, type: null, mode: 'create', id: null, sectionId: null });
const form = reactive({});
const saving = ref(false);
const formError = ref('');
const snack = reactive({ open: false, text: '', color: 'success' });
const materialsFor = reactive({ open: false, topicId: null, title: '' });
const questionsFor = reactive({ open: false, topicId: null, title: '' });

function openMaterials(topic) {
  Object.assign(materialsFor, { open: true, topicId: topic.id, title: topic.title });
}
function openQuestions(topic) {
  Object.assign(questionsFor, { open: true, topicId: topic.id, title: topic.title });
}

const dialogTitle = computed(() => {
  const noun = { subject: 'предмет', section: 'раздел', topic: 'тему' }[dialog.type] ?? '';
  return (dialog.mode === 'create' ? 'Новый ' : 'Изменить ') + noun;
});

function openDialog(type, mode, data = {}) {
  dialog.type = type;
  dialog.mode = mode;
  dialog.id = data.id ?? null;
  dialog.sectionId = data.sectionId ?? null;
  formError.value = '';
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, data.form);
  dialog.open = true;
}
function closeDialog() {
  dialog.open = false;
}

function createSubject() {
  openDialog('subject', 'create', { form: { name: '', applies_to: 'both', has_levels: false } });
}
function editSubject(s) {
  openDialog('subject', 'edit', {
    id: s.id,
    form: { name: s.name, applies_to: s.applies_to, has_levels: s.has_levels },
  });
}
function createSection() {
  openDialog('section', 'create', { form: { title: '' } });
}
function editSection(s) {
  openDialog('section', 'edit', { id: s.id, form: { title: s.title } });
}
function createTopic(section) {
  openDialog('topic', 'create', {
    sectionId: section.id,
    form: {
      title: '',
      grade: subject.value?.applies_to === 'oge' ? 9 : 11,
      difficulty: 'base',
      codifier_code: '',
    },
  });
}
function editTopic(section, topic) {
  openDialog('topic', 'edit', {
    id: topic.id,
    sectionId: section.id,
    form: {
      title: topic.title,
      grade: topic.grade,
      difficulty: topic.difficulty,
      codifier_code: topic.codifier_code ?? '',
    },
  });
}

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    if (dialog.type === 'subject') {
      const payload = { name: form.name, applies_to: form.applies_to, has_levels: form.has_levels };
      if (dialog.mode === 'create') await apiCreateSubject(payload);
      else await apiUpdateSubject(dialog.id, payload);
      await loadSubjects();
      if (selectedId.value) await loadSubject(selectedId.value);
    } else if (dialog.type === 'section') {
      const payload = { title: form.title };
      if (dialog.mode === 'create')
        await apiCreateSection({ ...payload, subject_id: selectedId.value });
      else await apiUpdateSection(dialog.id, payload);
      await loadSubject(selectedId.value);
    } else if (dialog.type === 'topic') {
      const payload = {
        title: form.title,
        grade: form.grade,
        difficulty: form.difficulty,
        codifier_code: form.codifier_code || null,
      };
      if (dialog.mode === 'create')
        await apiCreateTopic({ ...payload, section_id: dialog.sectionId });
      else await apiUpdateTopic(dialog.id, payload);
      await loadSubject(selectedId.value);
    }
    dialog.open = false;
    notify('Сохранено');
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

// ── Удаление ──
const confirm = reactive({ open: false, kind: null, id: null, label: '' });
function askDelete(kind, id, label) {
  Object.assign(confirm, { open: true, kind, id, label });
}
async function doDelete() {
  saving.value = true;
  try {
    if (confirm.kind === 'subject') {
      await apiDeleteSubject(confirm.id);
      confirm.open = false;
      closeSubject();
      await loadSubjects();
    } else if (confirm.kind === 'section') {
      await apiDeleteSection(confirm.id);
      confirm.open = false;
      await loadSubject(selectedId.value);
    } else if (confirm.kind === 'topic') {
      await apiDeleteTopic(confirm.id);
      confirm.open = false;
      await loadSubject(selectedId.value);
    }
    notify('Удалено');
  } catch (err) {
    notify(err.message, 'error');
    confirm.open = false;
  } finally {
    saving.value = false;
  }
}

function notify(text, color = 'success') {
  Object.assign(snack, { open: true, text, color });
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
