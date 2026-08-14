<template>
  <v-card max-width="420" class="pa-6 mx-auto" elevation="4">
    <v-card-title class="text-h6 text-center">
      {{ mode === 'login' ? 'Вход' : 'Регистрация' }}
    </v-card-title>

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
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          variant="outlined"
          density="comfortable"
          :hint="mode === 'register' ? 'Не короче 8 символов' : undefined"
          persistent-hint
          :disabled="busy"
        />

        <v-alert v-if="error" type="error" density="compact" class="mt-4" :text="error" />

        <v-btn
          type="submit"
          color="primary"
          block
          class="mt-4"
          :loading="busy"
        >
          {{ mode === 'login' ? 'Войти' : 'Зарегистрироваться' }}
        </v-btn>
      </v-form>
    </v-card-text>

    <v-card-actions class="justify-center">
      <v-btn variant="text" size="small" :disabled="busy" @click="toggle">
        {{ mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const { login, register } = useAuth();

const mode = ref('login');
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

function toggle() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  error.value = '';
}

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    if (mode.value === 'login') {
      await login(email.value, password.value);
    } else {
      await register(email.value, password.value);
    }
    password.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
