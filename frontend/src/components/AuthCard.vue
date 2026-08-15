<template>
  <v-card max-width="420" class="pa-6 mx-auto" elevation="4">
    <v-card-title class="text-h6 text-center">Вход</v-card-title>

    <v-card-text>
      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="email"
          variant="outlined"
          density="comfortable"
          :disabled="busy"
        />
        <v-text-field
          v-model="password"
          label="Пароль"
          type="password"
          autocomplete="current-password"
          variant="outlined"
          density="comfortable"
          :disabled="busy"
        />

        <v-alert v-if="error" type="error" density="compact" class="mt-4" :text="error" />

        <v-btn type="submit" color="primary" block class="mt-4" :loading="busy">Войти</v-btn>
      </v-form>
    </v-card-text>

    <v-card-actions class="justify-center">
      <span class="text-caption text-medium-emphasis text-center">
        Учётные записи создаёт администратор — самостоятельной регистрации нет.
      </span>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const { login } = useAuth();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await login(email.value, password.value);
    password.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
