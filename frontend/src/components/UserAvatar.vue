<template>
  <div class="avatar" :style="{ width: px, height: px, fontSize: initialsSize }">
    <img v-if="hasAvatar && !failed" :src="src" alt="" @error="failed = true" />
    <span v-else>{{ initials }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  // Наличие картинки известно из сессии — так мы не дёргаем сервер вслепую
  // и не ловим 404 в консоли у тех, кто аватар не ставил.
  hasAvatar: { type: Boolean, default: false },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  size: { type: Number, default: 40 },
  // Меняется после загрузки нового файла: заставляет браузер перезапросить
  // картинку, не полагаясь на кэш.
  version: { type: [Number, String], default: 0 },
});

const failed = ref(false);
watch(
  () => [props.userId, props.version],
  () => {
    failed.value = false;
  },
);

const px = computed(() => `${props.size}px`);
const initialsSize = computed(() => `${Math.round(props.size * 0.38)}px`);
const src = computed(() => `/api/avatars/${props.userId}?v=${props.version}`);

// Инициалы из имени, а если имени нет — первая буква почты.
const initials = computed(() => {
  const parts = (props.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (props.email || '?').slice(0, 1).toUpperCase();
});
</script>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  flex: none;
  background: rgba(94, 92, 230, 0.14);
  color: #4b49b8;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
