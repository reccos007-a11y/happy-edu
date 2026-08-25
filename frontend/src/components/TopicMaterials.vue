<template>
  <v-dialog :model-value="open" max-width="640" scrollable @update:model-value="$emit('close')">
    <v-card class="register-calm" border>
      <v-card-title class="d-flex align-center">
        <span>Материалы — {{ topicTitle }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
          {{ error }}
        </v-alert>

        <!-- Список материалов -->
        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="26" />
        </div>
        <p v-else-if="materials.length === 0" class="text-body-2 text-medium-emphasis mb-4">
          Материалов пока нет. Добавьте первый ниже.
        </p>
        <v-list v-else class="mb-4 py-0" bg-color="transparent">
          <v-list-item v-for="m in materials" :key="m.id" class="px-0 mat-row">
            <template #prepend>
              <span class="mr-3">{{ typeIcon(m.type) }}</span>
            </template>
            <v-list-item-title>{{ m.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ typeLabel(m.type) }}</v-list-item-subtitle>
            <template #append>
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="error"
                @click="remove(m)"
              />
            </template>
          </v-list-item>
        </v-list>

        <!-- Добавление материала -->
        <v-divider class="mb-4" />
        <div class="text-subtitle-2 mb-2">Добавить материал</div>
        <v-select v-model="form.type" :items="TYPE_ITEMS" label="Тип" density="comfortable" />
        <v-text-field
          v-model="form.title"
          label="Заголовок"
          maxlength="255"
          density="comfortable"
        />

        <v-textarea
          v-if="form.type === 'text'"
          v-model="form.content"
          label="Текст конспекта"
          rows="4"
          auto-grow
        />
        <v-select
          v-else-if="form.type === 'animation'"
          v-model="form.content"
          :items="ANIMATION_OPTIONS"
          label="Анимация"
          density="comfortable"
        />
        <v-text-field
          v-else
          v-model="form.file_url"
          :label="form.type === 'image' ? 'URL картинки' : 'Ссылка (URL)'"
          density="comfortable"
        />

        <div class="d-flex justify-end">
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!form.title"
            @click="add"
          >
            Добавить
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { useMaterials } from '../composables/useMaterials';
import { ANIMATION_OPTIONS } from './animations/index.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  topicId: { type: [Number, String], default: null },
  topicTitle: { type: String, default: '' },
});
defineEmits(['close']);

const { materials, loading, error, loadMaterials, createMaterial, deleteMaterial } = useMaterials();

const TYPE_ITEMS = [
  { title: 'Конспект (текст)', value: 'text' },
  { title: 'Картинка', value: 'image' },
  { title: 'Видео', value: 'video' },
  { title: 'Ссылка', value: 'link' },
  { title: 'Анимация', value: 'animation' },
];
const TYPE = {
  text: { icon: '📄', label: 'Конспект' },
  image: { icon: '🖼', label: 'Иллюстрация' },
  video: { icon: '🎬', label: 'Видео' },
  link: { icon: '🔗', label: 'Ссылка' },
  animation: { icon: '✨', label: 'Анимация' },
};
const typeIcon = (t) => (TYPE[t] ?? TYPE.text).icon;
const typeLabel = (t) => (TYPE[t] ?? TYPE.text).label;

const form = reactive({ type: 'text', title: '', content: '', file_url: '' });
const saving = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.topicId != null) {
      Object.assign(form, { type: 'text', title: '', content: '', file_url: '' });
      loadMaterials(props.topicId);
    }
  },
);

async function add() {
  saving.value = true;
  error.value = '';
  try {
    const payload = { type: form.type, title: form.title };
    if (form.type === 'text' || form.type === 'animation') payload.content = form.content || null;
    else payload.file_url = form.file_url || null;
    await createMaterial(props.topicId, payload);
    Object.assign(form, { title: '', content: '', file_url: '' });
    await loadMaterials(props.topicId);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove(m) {
  error.value = '';
  try {
    await deleteMaterial(m.id);
    await loadMaterials(props.topicId);
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<style scoped>
.mat-row + .mat-row {
  border-top: 1px solid var(--line, #e6e1d6);
}
</style>
