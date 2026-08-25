<template>
  <div class="material">
    <div class="material-head">
      <span class="type-icon" :title="typeLabel">{{ typeIcon }}</span>
      <h4 class="material-title">{{ material.title }}</h4>
    </div>

    <!-- Текстовый конспект: выводим как текст (не HTML) — безопасно. -->
    <p v-if="material.type === 'text'" class="text-body">{{ material.content }}</p>

    <!-- Картинка или плейсхолдер под загрузку методистом. -->
    <div v-else-if="material.type === 'image'">
      <img v-if="material.file_url" :src="material.file_url" :alt="material.title" class="img" />
      <div v-else class="placeholder">Иллюстрацию добавит методист</div>
    </div>

    <!-- Видео / ссылка. -->
    <a
      v-else-if="material.type === 'video' || material.type === 'link'"
      :href="material.file_url || '#'"
      target="_blank"
      rel="noopener"
      class="link"
    >
      {{ material.type === 'video' ? '▶ Смотреть видео' : '🔗 Открыть материал' }}
    </a>

    <!-- Интерактивная анимация из реестра. -->
    <component :is="animationComponent" v-else-if="animationComponent" />
    <div v-else-if="material.type === 'animation'" class="placeholder">Анимация недоступна</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { ANIMATIONS } from './animations/index.js';

const props = defineProps({
  material: { type: Object, required: true },
});

const animationComponent = computed(() =>
  props.material.type === 'animation' ? (ANIMATIONS[props.material.content] ?? null) : null,
);

const TYPE = {
  text: { icon: '📄', label: 'Конспект' },
  image: { icon: '🖼', label: 'Иллюстрация' },
  video: { icon: '🎬', label: 'Видео' },
  link: { icon: '🔗', label: 'Ссылка' },
  animation: { icon: '✨', label: 'Анимация' },
};
const typeIcon = computed(() => (TYPE[props.material.type] ?? TYPE.text).icon);
const typeLabel = computed(() => (TYPE[props.material.type] ?? TYPE.text).label);
</script>

<style scoped>
.material {
  background: #fff;
  border: 1px solid #e6e1d6;
  border-radius: 16px;
  padding: 18px 20px;
}
.material-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.type-icon {
  font-size: 18px;
}
.material-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: #2a2740;
}
.text-body {
  font-size: 14.5px;
  line-height: 1.65;
  color: #333846;
  white-space: pre-wrap;
  margin: 0;
}
.img {
  max-width: 100%;
  border-radius: 12px;
  display: block;
}
.placeholder {
  border: 1px dashed #cfc9bb;
  border-radius: 12px;
  padding: 28px;
  text-align: center;
  color: #8a8577;
  font-size: 13px;
  background: #faf8f3;
}
.link {
  display: inline-block;
  color: #4b4fcb;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
</style>
