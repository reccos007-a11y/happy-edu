<template>
  <v-card class="pa-4" elevation="4">
    <v-card-title class="d-flex align-center">
      Пользователи
      <v-spacer />
      <v-btn variant="text" size="small" :loading="loading" @click="loadUsers">Обновить</v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert v-if="error" type="error" density="compact" class="mb-4" :text="error" />

      <v-table density="comfortable">
        <thead>
          <tr>
            <th class="text-left">E-mail</th>
            <th class="text-left" style="width: 160px">Роль</th>
            <th class="text-left">Создан</th>
            <th style="width: 56px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>
              {{ u.email }}
              <v-chip v-if="u.id === currentUserId" size="x-small" class="ml-2">это вы</v-chip>
            </td>
            <td>
              <v-select
                :model-value="u.role"
                :items="roleItems"
                :disabled="u.id === currentUserId || busyId === u.id"
                variant="plain"
                density="compact"
                hide-details
                @update:model-value="(role) => changeRole(u, role)"
              />
            </td>
            <td class="text-medium-emphasis text-caption">
              {{ new Date(u.created_at).toLocaleString('ru-RU') }}
            </td>
            <td>
              <v-btn
                icon="mdi-delete"
                variant="text"
                size="small"
                :disabled="u.id === currentUserId || busyId === u.id"
                @click="confirmDelete(u)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>

      <p class="text-caption text-medium-emphasis mt-4">
        Собственную роль изменить нельзя, как и снять права с последнего администратора.
      </p>
    </v-card-text>

    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card>
        <v-card-title class="text-h6">Удалить пользователя?</v-card-title>
        <v-card-text>
          Учётная запись <strong>{{ pendingDelete?.email }}</strong> будет удалена безвозвратно.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Отмена</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            :loading="busyId === pendingDelete?.id"
            @click="doDelete"
          >
            Удалить
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAdmin } from '../composables/useAdmin';
import { useAuth } from '../composables/useAuth';

const { user } = useAuth();
const { users, loading, error, loadUsers, setRole, removeUser } = useAdmin();

const currentUserId = computed(() => user.value?.id);
const roleItems = [
  { title: 'Пользователь', value: 'user' },
  { title: 'Администратор', value: 'admin' },
];

const busyId = ref(null);
const deleteDialog = ref(false);
const pendingDelete = ref(null);

async function changeRole(target, role) {
  if (role === target.role) return;
  busyId.value = target.id;
  try {
    await setRole(target.id, role);
  } finally {
    busyId.value = null;
  }
}

function confirmDelete(target) {
  pendingDelete.value = target;
  deleteDialog.value = true;
}

async function doDelete() {
  busyId.value = pendingDelete.value.id;
  try {
    const ok = await removeUser(pendingDelete.value.id);
    if (ok) deleteDialog.value = false;
  } finally {
    busyId.value = null;
  }
}

onMounted(loadUsers);
</script>
