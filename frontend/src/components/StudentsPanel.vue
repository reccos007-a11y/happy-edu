<template>
  <div class="register-calm">
    <div class="d-flex align-center mb-1">
      <h2 class="text-h4">Ученики</h2>
      <v-spacer />
      <v-btn color="primary" variant="flat" prepend-icon="mdi-account-plus" @click="openCreate">
        Добавить ученика
      </v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-5">
      Учётные записи учеников заводит администратор — с классом и целевым экзаменом.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <div v-if="loading" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-card v-else border>
      <v-table>
        <thead>
          <tr>
            <th class="text-left">ФИО</th>
            <th class="text-left">E-mail</th>
            <th class="text-left" style="width: 90px">Класс</th>
            <th class="text-left" style="width: 90px">Экзамен</th>
            <th class="text-left" style="width: 140px">Дата экзамена</th>
            <th style="width: 96px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in students" :key="s.id">
            <td>{{ s.full_name || '—' }}</td>
            <td class="text-medium-emphasis">{{ s.email }}</td>
            <td class="tabular">{{ s.grade }}</td>
            <td>{{ s.exam_type === 'oge' ? 'ОГЭ' : 'ЕГЭ' }}</td>
            <td class="tabular">{{ s.target_exam_date || '—' }}</td>
            <td class="text-right">
              <v-btn
                size="small"
                variant="text"
                icon="mdi-clipboard-text-outline"
                title="Учебные планы"
                @click="openPlans(s)"
              />
              <v-btn size="small" variant="text" icon="mdi-pencil" @click="openEdit(s)" />
              <v-btn
                size="small"
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                @click="askDelete(s)"
              />
            </td>
          </tr>
          <tr v-if="students.length === 0">
            <td colspan="6" class="text-center text-medium-emphasis py-6">
              Учеников пока нет. Нажмите «Добавить ученика».
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Диалог создания / редактирования -->
    <v-dialog v-model="dialog.open" max-width="520" persistent>
      <v-card class="register-calm pa-2" border>
        <v-card-title>{{
          dialog.mode === 'create' ? 'Новый ученик' : 'Изменить ученика'
        }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ formError }}
          </v-alert>

          <v-text-field v-model="form.full_name" label="ФИО" maxlength="255" autofocus />
          <v-text-field
            v-model="form.email"
            label="E-mail"
            :disabled="dialog.mode === 'edit'"
            :hint="dialog.mode === 'edit' ? 'E-mail изменить нельзя' : ''"
            persistent-hint
          />
          <div class="d-flex ga-3 mt-2">
            <v-select
              v-model="form.grade"
              :items="GRADE_ITEMS"
              label="Класс"
              style="max-width: 120px"
            />
            <v-select v-model="form.exam_type" :items="EXAM_ITEMS" label="Экзамен" />
          </div>
          <v-text-field
            v-model="form.target_exam_date"
            label="Дата экзамена (необязательно)"
            type="date"
          />
          <v-text-field
            v-if="dialog.mode === 'create'"
            v-model="form.password"
            label="Пароль (необязательно)"
            hint="Пусто — сервер сгенерирует и покажет один раз"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog.open = false">Отмена</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="save">Сохранить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Показ сгенерированного пароля (один раз) -->
    <v-dialog v-model="passwordDialog.open" max-width="440">
      <v-card class="register-calm pa-2" border>
        <v-card-title>Ученик добавлен</v-card-title>
        <v-card-text>
          <p class="mb-2">Пароль показывается один раз — сохраните и передайте ученику:</p>
          <v-text-field
            :model-value="passwordDialog.password"
            readonly
            variant="outlined"
            class="tabular"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="passwordDialog.open = false">Понятно</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Подтверждение удаления -->
    <v-dialog v-model="confirm.open" max-width="420">
      <v-card class="register-calm pa-2" border>
        <v-card-title>Удалить ученика?</v-card-title>
        <v-card-text>Учётная запись «{{ confirm.label }}» и профиль будут удалены.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirm.open = false">Отмена</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doDelete">Удалить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <StudentPlans
      :open="plansFor.open"
      :user-id="plansFor.userId"
      :student-name="plansFor.name"
      @close="plansFor.open = false"
    />

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="3000">{{
      snack.text
    }}</v-snackbar>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import StudentPlans from './StudentPlans.vue';
import { useStudents } from '../composables/useStudents';

const { students, loading, error, loadStudents, addStudent, updateStudent, removeStudent } =
  useStudents();

const GRADE_ITEMS = [8, 9, 10, 11];
const EXAM_ITEMS = [
  { title: 'ОГЭ', value: 'oge' },
  { title: 'ЕГЭ', value: 'ege' },
];

const dialog = reactive({ open: false, mode: 'create', id: null });
const form = reactive({});
const saving = ref(false);
const formError = ref('');
const snack = reactive({ open: false, text: '', color: 'success' });
const passwordDialog = reactive({ open: false, password: '' });
const confirm = reactive({ open: false, id: null, label: '' });
const plansFor = reactive({ open: false, userId: null, name: '' });

function openPlans(s) {
  Object.assign(plansFor, { open: true, userId: s.id, name: s.full_name || s.email });
}

function openCreate() {
  dialog.mode = 'create';
  dialog.id = null;
  formError.value = '';
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, {
    full_name: '',
    email: '',
    grade: 9,
    exam_type: 'oge',
    target_exam_date: '',
    password: '',
  });
  dialog.open = true;
}

function openEdit(s) {
  dialog.mode = 'edit';
  dialog.id = s.id;
  formError.value = '';
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, {
    full_name: s.full_name ?? '',
    email: s.email,
    grade: s.grade,
    exam_type: s.exam_type,
    target_exam_date: s.target_exam_date ?? '',
  });
  dialog.open = true;
}

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    if (dialog.mode === 'create') {
      const payload = {
        email: form.email,
        full_name: form.full_name || undefined,
        grade: form.grade,
        exam_type: form.exam_type,
        target_exam_date: form.target_exam_date || undefined,
      };
      if (form.password) payload.password = form.password;
      const data = await addStudent(payload);
      dialog.open = false;
      await loadStudents();
      if (data.generatedPassword) {
        passwordDialog.password = data.generatedPassword;
        passwordDialog.open = true;
      } else {
        notify('Ученик добавлен');
      }
    } else {
      await updateStudent(dialog.id, {
        full_name: form.full_name || null,
        grade: form.grade,
        exam_type: form.exam_type,
        target_exam_date: form.target_exam_date || null,
      });
      dialog.open = false;
      await loadStudents();
      notify('Сохранено');
    }
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

function askDelete(s) {
  Object.assign(confirm, { open: true, id: s.id, label: s.full_name || s.email });
}

async function doDelete() {
  saving.value = true;
  try {
    await removeStudent(confirm.id);
    confirm.open = false;
    await loadStudents();
    notify('Ученик удалён');
  } catch (e) {
    notify(e.message, 'error');
    confirm.open = false;
  } finally {
    saving.value = false;
  }
}

function notify(text, color = 'success') {
  Object.assign(snack, { open: true, text, color });
}

onMounted(loadStudents);
</script>
