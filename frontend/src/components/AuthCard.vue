<template>
  <div class="auth-card">
    <h1 class="auth-title font-serif">Вход</h1>
    <p class="auth-sub">Для учеников, преподавателей и администраторов</p>

    <v-form class="auth-form" @submit.prevent="submit">
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

      <v-alert v-if="error" type="error" density="compact" class="mb-2" :text="error" />

      <button type="submit" class="auth-submit" :disabled="busy">
        {{ busy ? 'Входим…' : 'Войти' }}
      </button>
    </v-form>

    <p class="auth-note">Забыли пароль? Напишите преподавателю — он сбросит доступ.</p>
    <p class="auth-note muted">Регистрации на портале нет: учётную запись создаёт администратор.</p>
  </div>
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

<style scoped>
.auth-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--r-calm);
  padding: 30px;
}
.auth-title {
  font-size: 22px;
  color: var(--ink);
  text-align: center;
  margin: 0;
}
.auth-sub {
  font-size: 13px;
  color: #8a8577;
  text-align: center;
  margin: 10px 0 0;
}
.auth-form {
  margin-top: 22px;
}
.auth-submit {
  width: 100%;
  background: var(--indigo);
  color: #fff;
  border: none;
  border-radius: var(--r-calm);
  padding: 14px;
  font:
    600 15px/1 'Inter',
    sans-serif;
  cursor: pointer;
  margin-top: 4px;
}
.auth-submit:hover {
  background: #3f43b8;
}
.auth-submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.auth-note {
  font-size: 12px;
  line-height: 1.5;
  color: #8a8577;
  text-align: center;
  margin: 18px 0 0;
}
.auth-note.muted {
  margin-top: 8px;
  color: #a8a394;
}
</style>
