<template>
  <v-app>
    <v-app-bar color="primary">
      <v-app-bar-title>Happy-edu</v-app-bar-title>
      <template #append>
        <template v-if="user">
          <span class="mr-2 text-body-2">{{ user.email }}</span>
          <v-chip v-if="isAdmin" size="small" color="white" variant="outlined" class="mr-4">
            Администратор
          </v-chip>
          <v-btn variant="tonal" size="small" :loading="leaving" @click="signOut">Выйти</v-btn>
        </template>
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="d-flex flex-column align-center justify-center" style="min-height: 80vh">
        <v-progress-circular v-if="loading" indeterminate color="primary" />

        <template v-else-if="user">
          <v-card max-width="480" class="pa-6 text-center" elevation="4">
            <v-card-title class="text-h5">Вы вошли</v-card-title>
            <v-card-text>
              <p class="mb-2">{{ user.email }}</p>
              <p class="text-caption text-medium-emphasis">
                Аккаунт создан {{ new Date(user.created_at).toLocaleString('ru-RU') }}
              </p>
              <v-chip :color="statusColor" variant="flat" class="mt-4">{{ status }}</v-chip>
            </v-card-text>
          </v-card>

          <AdminPanel v-if="isAdmin" class="mt-8" style="width: 100%; max-width: 860px" />
        </template>

        <AuthCard v-else />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AdminPanel from './components/AdminPanel.vue';
import AuthCard from './components/AuthCard.vue';
import { useAuth } from './composables/useAuth';

const { user, loading, isAdmin, refresh, logout } = useAuth();

const status = ref('проверка backend...');
const statusColor = computed(() => (status.value.includes('подключены') ? 'success' : 'warning'));
const leaving = ref(false);

async function signOut() {
  leaving.value = true;
  try {
    await logout();
  } finally {
    leaving.value = false;
  }
}

onMounted(async () => {
  await refresh();
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    status.value = data.status === 'ok' ? 'Backend + DB подключены' : 'Backend недоступен';
  } catch {
    status.value = 'Backend недоступен';
  }
});
</script>
