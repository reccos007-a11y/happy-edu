<template>
  <v-app>
    <v-app-bar color="primary" flat>
      <v-app-bar-title class="font-serif">Happy-edu</v-app-bar-title>
      <template #append>
        <template v-if="user">
          <span class="mr-2 text-body-2 d-none d-sm-inline">{{ user.email }}</span>
          <v-chip v-if="isAdmin" size="small" color="white" variant="outlined" class="mr-4">
            Администратор
          </v-chip>
          <v-btn variant="tonal" size="small" :loading="leaving" @click="signOut">Выйти</v-btn>
        </template>
      </template>
    </v-app-bar>

    <v-main>
      <!-- Гость: форма входа по центру -->
      <v-container
        v-if="loading || !user"
        class="d-flex flex-column align-center justify-center"
        style="min-height: 80vh"
      >
        <v-progress-circular v-if="loading" indeterminate color="primary" />
        <AuthCard v-else />
      </v-container>

      <!-- Ученик: личный кабинет (тёплый регистр) -->
      <v-container v-else-if="isStudent" class="py-8" style="max-width: 1080px">
        <StudentDashboard />
      </v-container>

      <!-- Персонал: вкладки и контент -->
      <template v-else>
        <v-tabs v-model="tab" color="primary" class="border-b">
          <v-container class="py-0 d-flex">
            <v-tab value="catalog">Каталог</v-tab>
            <v-tab v-if="canManageStudents" value="students">Ученики</v-tab>
            <v-tab value="account">Мой профиль</v-tab>
          </v-container>
        </v-tabs>

        <v-container class="py-8" style="max-width: 1080px">
          <SubjectCatalog v-if="tab === 'catalog'" />

          <StudentsPanel v-else-if="tab === 'students' && canManageStudents" />

          <template v-else>
            <v-card max-width="480" class="pa-6 mb-8 register-calm" border>
              <h2 class="text-h5 mb-2">Вы вошли</h2>
              <p class="mb-1">{{ user.email }}</p>
              <p class="text-caption text-medium-emphasis mb-4">
                Аккаунт создан {{ new Date(user.created_at).toLocaleString('ru-RU') }}
              </p>
              <v-chip :color="statusColor" variant="flat">{{ status }}</v-chip>
            </v-card>

            <AdminPanel v-if="isAdmin" style="max-width: 860px" />
          </template>
        </v-container>
      </template>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AdminPanel from './components/AdminPanel.vue';
import AuthCard from './components/AuthCard.vue';
import StudentDashboard from './components/StudentDashboard.vue';
import StudentsPanel from './components/StudentsPanel.vue';
import SubjectCatalog from './components/SubjectCatalog.vue';
import { useAuth } from './composables/useAuth';

const { user, loading, isAdmin, can, refresh, logout } = useAuth();

const canManageStudents = computed(() => can('users:write'));
const isStudent = computed(() => user.value?.role === 'student');
const tab = ref('catalog');
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
