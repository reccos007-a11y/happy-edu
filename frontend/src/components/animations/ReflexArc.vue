<template>
  <div class="reflex-anim">
    <svg viewBox="0 0 320 210" class="arc-svg" role="img" aria-label="Схема рефлекторной дуги">
      <!-- путь дуги -->
      <path
        id="arc-path"
        d="M44,182 C44,86 118,66 160,66 C202,66 276,86 276,182"
        fill="none"
        stroke="#e6e1d6"
        stroke-width="4"
        stroke-linecap="round"
      />

      <!-- спинной мозг -->
      <ellipse cx="160" cy="60" rx="30" ry="20" fill="#c7ccff" stroke="#4b4fcb" stroke-width="2" />
      <text x="160" y="64" text-anchor="middle" class="lbl-svg">мозг</text>

      <!-- рецептор (палец) и мышца -->
      <circle cx="44" cy="182" r="14" fill="#ffd9c2" stroke="#e8703a" stroke-width="2" />
      <text x="44" y="186" text-anchor="middle" class="lbl-svg small">🖐</text>
      <rect
        x="262"
        y="168"
        width="28"
        height="28"
        rx="6"
        fill="#e4f1ea"
        stroke="#1f9254"
        stroke-width="2"
      />
      <text x="276" y="187" text-anchor="middle" class="lbl-svg small">💪</text>

      <!-- бегущий импульс -->
      <circle v-if="running" r="7" class="impulse" fill="#ff8a4c" />
    </svg>

    <ol class="stages">
      <li v-for="(s, i) in stages" :key="i" :class="{ lit: running && litStage >= i }">
        <span class="num">{{ i + 1 }}</span
        >{{ s }}
      </li>
    </ol>

    <button class="run-btn" :disabled="running" @click="run">
      {{ running ? 'Импульс идёт…' : 'Запустить импульс' }}
    </button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';

const stages = [
  'Рецептор кожи воспринимает раздражение',
  'Чувствительный нейрон несёт сигнал в мозг',
  'Вставочный нейрон переключает сигнал',
  'Двигательный нейрон несёт команду',
  'Мышца сокращается — рука отдёргивается',
];

const running = ref(false);
const litStage = ref(-1);
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function run() {
  clearTimers();
  running.value = true;
  litStage.value = 0;
  // Подсветка звеньев синхронно с пробегом импульса (~2.2 c).
  for (let i = 1; i < stages.length; i += 1) {
    timers.push(setTimeout(() => (litStage.value = i), i * 440));
  }
  timers.push(
    setTimeout(() => {
      running.value = false;
      litStage.value = -1;
    }, 2300),
  );
}

onBeforeUnmount(clearTimers);
</script>

<style scoped>
.reflex-anim {
  background: #fbfaf7;
  border: 1px solid #e6e1d6;
  border-radius: 16px;
  padding: 16px;
}
.arc-svg {
  width: 100%;
  max-width: 420px;
  display: block;
  margin: 0 auto;
}
.lbl-svg {
  font-size: 11px;
  fill: #4b4fcb;
  font-weight: 600;
}
.lbl-svg.small {
  font-size: 14px;
}
.impulse {
  offset-path: path('M44,182 C44,86 118,66 160,66 C202,66 276,86 276,182');
  animation: run-impulse 2.2s linear forwards;
}
@keyframes run-impulse {
  from {
    offset-distance: 0%;
  }
  to {
    offset-distance: 100%;
  }
}
.stages {
  list-style: none;
  margin: 14px 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stages li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #8a87a0;
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}
.stages li.lit {
  color: #2a2740;
  transform: translateX(3px);
}
.num {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #eeebe3;
  color: #7a7566;
  font-size: 12px;
  font-weight: 700;
  flex: none;
}
.stages li.lit .num {
  background: #ff8a4c;
  color: #fff;
}
.run-btn {
  border: none;
  background: #4b4fcb;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}
.run-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .impulse {
    animation-duration: 0.01s;
  }
}
</style>
