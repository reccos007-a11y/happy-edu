<template>
  <v-dialog :model-value="open" max-width="560" scrollable @update:model-value="$emit('close')">
    <v-card class="register-warm pa-2" border>
      <v-card-title class="d-flex align-center">
        <span>Мой профиль</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
          {{ error }}
        </v-alert>

        <!-- Аватар -->
        <div class="d-flex align-center ga-4 mb-6">
          <UserAvatar
            :user-id="user.id"
            :has-avatar="user.has_avatar"
            :name="form.full_name"
            :email="user.email"
            :size="88"
            :version="avatarVersion"
          />
          <div>
            <div class="d-flex ga-2 mb-1">
              <v-btn size="small" variant="tonal" :loading="uploading" @click="pickFile">
                {{ user.has_avatar ? 'Заменить фото' : 'Загрузить фото' }}
              </v-btn>
              <v-btn
                v-if="user.has_avatar"
                size="small"
                variant="text"
                color="error"
                :loading="uploading"
                @click="removeAvatar"
              >
                Удалить
              </v-btn>
            </div>
            <p class="text-caption text-medium-emphasis mb-0">
              JPEG, PNG или WebP. Картинка обрежется по центру в квадрат.
            </p>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="d-none"
              @change="onFile"
            />
          </div>
        </div>

        <!-- Данные -->
        <v-text-field
          v-model="form.full_name"
          label="ФИО"
          maxlength="255"
          density="comfortable"
          class="mb-2"
        />
        <v-text-field
          :model-value="user.email"
          label="E-mail"
          density="comfortable"
          disabled
          hint="E-mail меняет администратор"
          persistent-hint
          class="mb-4"
        />
        <div class="d-flex ga-3 flex-wrap">
          <v-select
            v-model="form.grade"
            :items="GRADE_ITEMS"
            label="Класс"
            density="comfortable"
            style="max-width: 140px"
          />
          <v-select
            v-model="form.exam_type"
            :items="EXAM_ITEMS"
            label="Экзамен"
            density="comfortable"
            style="max-width: 160px"
          />
          <v-text-field
            v-model="form.target_exam_date"
            label="Дата экзамена"
            type="date"
            density="comfortable"
            style="min-width: 190px"
          />
        </div>

        <!-- Пароль -->
        <v-divider class="my-5" />
        <div class="d-flex align-center mb-2">
          <h3 class="text-subtitle-1 font-weight-medium">Пароль</h3>
          <v-spacer />
          <v-btn size="small" variant="text" @click="passwordOpen = !passwordOpen">
            {{ passwordOpen ? 'Свернуть' : 'Сменить пароль' }}
          </v-btn>
        </div>

        <template v-if="passwordOpen">
          <v-alert v-if="passwordError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ passwordError }}
          </v-alert>
          <v-text-field
            v-model="passwordForm.current_password"
            label="Текущий пароль"
            type="password"
            density="comfortable"
            autocomplete="current-password"
          />
          <v-text-field
            v-model="passwordForm.new_password"
            label="Новый пароль"
            type="password"
            density="comfortable"
            autocomplete="new-password"
            hint="Не короче 8 символов"
            persistent-hint
          />
          <v-btn
            color="primary"
            variant="tonal"
            class="mt-3"
            :loading="savingPassword"
            @click="submitPassword"
          >
            Сохранить пароль
          </v-btn>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('close')">Отмена</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="submit">Сохранить</v-btn>
      </v-card-actions>
    </v-card>

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="3000">
      {{ snack.text }}
    </v-snackbar>
  </v-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import UserAvatar from './UserAvatar.vue';
import { resizeToDataUrl, useProfile } from '../composables/useProfile';

const props = defineProps({
  open: { type: Boolean, default: false },
  profile: { type: Object, default: null },
  user: { type: Object, required: true },
});
const emit = defineEmits(['close', 'saved']);

const { save, changePassword, uploadAvatar, deleteAvatar } = useProfile();

const GRADE_ITEMS = [8, 9, 10, 11];
const EXAM_ITEMS = [
  { title: 'ОГЭ', value: 'oge' },
  { title: 'ЕГЭ', value: 'ege' },
];

const form = reactive({ full_name: '', grade: 9, exam_type: 'oge', target_exam_date: '' });
const passwordForm = reactive({ current_password: '', new_password: '' });
const passwordOpen = ref(false);
const passwordError = ref('');
const error = ref('');
const saving = ref(false);
const savingPassword = ref(false);
const uploading = ref(false);
const fileInput = ref(null);
// Меняем после загрузки: иначе браузер покажет закэшированную старую картинку.
const avatarVersion = ref(0);
const snack = reactive({ open: false, text: '', color: 'success' });

// Форму наполняем при каждом открытии: закрыли без сохранения — правки
// не должны остаться висеть до следующего раза.
watch(
  () => [props.open, props.profile],
  () => {
    if (!props.open || !props.profile) return;
    Object.assign(form, {
      full_name: props.profile.full_name ?? '',
      grade: props.profile.grade,
      exam_type: props.profile.exam_type,
      target_exam_date: props.profile.target_exam_date
        ? String(props.profile.target_exam_date).slice(0, 10)
        : '',
    });
    error.value = '';
    passwordError.value = '';
    passwordOpen.value = false;
    Object.assign(passwordForm, { current_password: '', new_password: '' });
  },
  { immediate: true },
);

function notify(text, color = 'success') {
  Object.assign(snack, { open: true, text, color });
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    await save({
      full_name: form.full_name,
      grade: form.grade,
      exam_type: form.exam_type,
      target_exam_date: form.target_exam_date || '',
    });
    emit('saved');
    notify('Профиль сохранён');
    emit('close');
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function submitPassword() {
  savingPassword.value = true;
  passwordError.value = '';
  try {
    await changePassword({ ...passwordForm });
    Object.assign(passwordForm, { current_password: '', new_password: '' });
    passwordOpen.value = false;
    notify('Пароль изменён');
  } catch (err) {
    passwordError.value = err.message;
  } finally {
    savingPassword.value = false;
  }
}

const pickFile = () => fileInput.value?.click();

async function onFile(event) {
  const file = event.target.files?.[0];
  // Сбрасываем сразу: иначе повторный выбор того же файла не вызовет change.
  event.target.value = '';
  if (!file) return;

  uploading.value = true;
  error.value = '';
  try {
    await uploadAvatar(await resizeToDataUrl(file));
    avatarVersion.value += 1;
    emit('saved');
    notify('Фото обновлено');
  } catch (err) {
    error.value = err.message;
  } finally {
    uploading.value = false;
  }
}

async function removeAvatar() {
  uploading.value = true;
  error.value = '';
  try {
    await deleteAvatar();
    avatarVersion.value += 1;
    emit('saved');
    notify('Фото удалено');
  } catch (err) {
    error.value = err.message;
  } finally {
    uploading.value = false;
  }
}
</script>
