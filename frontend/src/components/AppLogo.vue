<template>
  <div class="logo" :class="`logo--${theme}`">
    <!-- Знак 1c «дуга»: амбер-квадрат с тёмной дугой (открыта вверх). -->
    <span class="mark" :style="markStyle" aria-hidden="true">
      <span class="arc" :style="arcStyle" />
    </span>
    <span class="word" :style="{ fontSize: `${wordSize}px` }">
      Happy<span class="slash">/</span>Edu
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

// theme: 'dark' — на тёмном фоне (белое слово), 'light' — на светлом (тёмное слово).
const props = defineProps({
  size: { type: Number, default: 30 },
  wordSize: { type: Number, default: 16 },
  theme: { type: String, default: 'dark' },
});

const markStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.round(props.size * 0.3)}px`,
  paddingTop: `${Math.round(props.size * 0.27)}px`,
}));

const arcStyle = computed(() => ({
  width: `${Math.round(props.size * 0.5)}px`,
  height: `${Math.round(props.size * 0.27)}px`,
  borderWidth: `${Math.max(2, props.size * 0.083)}px`,
}));
</script>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}
.mark {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  background: #e8a33d;
}
.arc {
  box-sizing: border-box;
  border-style: solid;
  border-color: #171a2b;
  border-top: none;
  border-radius: 0 0 16px 16px;
}
.word {
  font-family: 'Unbounded', system-ui, sans-serif;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.logo--dark .word {
  color: #fff;
}
.logo--light .word {
  color: #171a2b;
}
.slash {
  opacity: 0.45;
}
</style>
