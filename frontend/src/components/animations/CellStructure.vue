<template>
  <div class="cell-anim">
    <svg viewBox="0 0 320 240" class="cell-svg" role="img" aria-label="Схема строения клетки">
      <!-- мембрана и цитоплазма -->
      <ellipse
        cx="160"
        cy="120"
        rx="150"
        ry="108"
        class="membrane cyto-drift"
        fill="#eef1fb"
        stroke="#4b4fcb"
        stroke-width="3"
      />

      <!-- органеллы (кликабельны) -->
      <g
        v-for="o in organelles"
        :key="o.key"
        class="organelle"
        :class="{ active: selected === o.key }"
        @click="selected = o.key"
        @mouseenter="hover = o.key"
        @mouseleave="hover = null"
      >
        <!-- ядро -->
        <template v-if="o.key === 'nucleus'">
          <circle
            cx="160"
            cy="118"
            r="42"
            fill="#c7ccff"
            stroke="#4b4fcb"
            stroke-width="2"
            class="nucleus-pulse"
          />
          <circle cx="172" cy="110" r="12" fill="#4b4fcb" />
        </template>

        <!-- митохондрии -->
        <template v-else-if="o.key === 'mito'">
          <g
            v-for="(m, i) in [
              [70, 70],
              [235, 165],
            ]"
            :key="i"
          >
            <ellipse
              :cx="m[0]"
              :cy="m[1]"
              rx="26"
              ry="13"
              fill="#ffd9c2"
              stroke="#e8703a"
              stroke-width="2"
            />
            <path
              :d="`M${m[0] - 18},${m[1]} q6,-8 12,0 q6,8 12,0 q6,-8 12,0`"
              fill="none"
              stroke="#e8703a"
              stroke-width="1.5"
            />
          </g>
        </template>

        <!-- ЭПС и рибосомы -->
        <template v-else-if="o.key === 'er'">
          <path
            d="M95,175 q20,-10 40,0 q20,10 40,0"
            fill="none"
            stroke="#818cf8"
            stroke-width="3"
          />
          <circle
            v-for="(p, i) in ribosomes"
            :key="i"
            :cx="p[0]"
            :cy="p[1]"
            r="2.5"
            fill="#34d399"
          />
        </template>

        <!-- аппарат Гольджи -->
        <template v-else-if="o.key === 'golgi'">
          <path
            v-for="(dy, i) in [0, 7, 14]"
            :key="i"
            :d="`M215,60 q22,-6 44,${dy ? 0 : 0}`"
            :transform="`translate(0 ${dy})`"
            fill="none"
            stroke="#d9822b"
            stroke-width="3"
          />
        </template>
      </g>
    </svg>

    <div class="legend">
      <button
        v-for="o in organelles"
        :key="o.key"
        class="chip"
        :class="{ active: selected === o.key }"
        :style="{ '--c': o.color }"
        @click="selected = o.key"
      >
        {{ o.name }}
      </button>
    </div>

    <p class="descr">
      <strong>{{ current.name }}.</strong> {{ current.text }}
    </p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const organelles = [
  {
    key: 'nucleus',
    name: 'Ядро',
    color: '#4b4fcb',
    text: 'Хранит наследственную информацию (ДНК) и управляет работой клетки.',
  },
  {
    key: 'mito',
    name: 'Митохондрии',
    color: '#e8703a',
    text: 'Освобождают энергию при окислении питательных веществ — «энергетические станции».',
  },
  {
    key: 'er',
    name: 'ЭПС и рибосомы',
    color: '#818cf8',
    text: 'Синтезируют белки и переносят вещества внутри клетки.',
  },
  {
    key: 'golgi',
    name: 'Аппарат Гольджи',
    color: '#d9822b',
    text: 'Упаковывает вещества и выводит их из клетки.',
  },
];

const selected = ref('nucleus');
const hover = ref(null);
const current = computed(
  () => organelles.find((o) => o.key === (hover.value ?? selected.value)) ?? organelles[0],
);

// Рибосомы — точки вдоль ЭПС.
const ribosomes = [
  [100, 172],
  [118, 178],
  [140, 180],
  [160, 178],
  [178, 180],
];
</script>

<style scoped>
.cell-anim {
  background: #fbfaf7;
  border: 1px solid #e6e1d6;
  border-radius: 16px;
  padding: 16px;
}
.cell-svg {
  width: 100%;
  max-width: 420px;
  display: block;
  margin: 0 auto;
}
.organelle {
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.organelle:hover,
.organelle.active {
  opacity: 1;
}
.organelle:not(.active) {
  opacity: 0.85;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin: 14px 0 10px;
}
.chip {
  border: 1px solid var(--c);
  color: var(--c);
  background: #fff;
  border-radius: 16px;
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.chip.active {
  background: var(--c);
  color: #fff;
}
.descr {
  font-size: 14px;
  color: #333846;
  margin: 0;
  text-align: center;
  min-height: 42px;
}
.nucleus-pulse {
  transform-box: fill-box;
  transform-origin: center;
  animation: pulse 3.5s ease-in-out infinite;
}
.cyto-drift {
  transform-box: fill-box;
  transform-origin: center;
  animation: drift 9s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}
@keyframes drift {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .nucleus-pulse,
  .cyto-drift {
    animation: none;
  }
}
</style>
