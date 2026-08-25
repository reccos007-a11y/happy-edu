<template>
  <div class="blood-anim">
    <svg
      viewBox="0 0 320 260"
      class="blood-svg"
      role="img"
      aria-label="Схема кругов кровообращения"
    >
      <!-- лёгкие -->
      <ellipse cx="90" cy="52" rx="34" ry="24" fill="#fde8ee" stroke="#e8709a" stroke-width="2" />
      <text x="90" y="56" text-anchor="middle" class="lbl">лёгкие</text>

      <!-- тело (органы) -->
      <rect
        x="56"
        y="196"
        width="68"
        height="34"
        rx="8"
        fill="#eef1fb"
        stroke="#4b4fcb"
        stroke-width="2"
      />
      <text x="90" y="217" text-anchor="middle" class="lbl">органы тела</text>

      <!-- сердце -->
      <path
        d="M232,120 a26,26 0 0 1 52,0 a26,26 0 0 1 52,0 q0,34 -52,64 q-52,-30 -52,-64 a26,26 0 0 1 0,0 z"
        transform="translate(-114 -6) scale(0.62)"
        fill="#f7c2cf"
        stroke="#c0492b"
        stroke-width="3"
      />
      <text x="196" y="132" text-anchor="middle" class="lbl">сердце</text>

      <!-- малый круг (сердце -> лёгкие -> сердце): венозная вверх, артериальная вниз -->
      <path
        id="pulm-out"
        d="M176,104 C150,72 118,60 96,66"
        fill="none"
        stroke="#8aa0d8"
        stroke-width="3"
      />
      <path
        id="pulm-in"
        d="M92,74 C120,90 150,104 176,118"
        fill="none"
        stroke="#e06377"
        stroke-width="3"
      />

      <!-- большой круг (сердце -> тело -> сердце): артериальная вниз, венозная вверх -->
      <path
        id="sys-out"
        d="M188,150 C168,182 120,196 96,200"
        fill="none"
        stroke="#e06377"
        stroke-width="3"
      />
      <path
        id="sys-in"
        d="M92,210 C130,214 176,196 188,168"
        fill="none"
        stroke="#8aa0d8"
        stroke-width="3"
      />

      <!-- бегущие капли крови -->
      <template v-if="running">
        <circle r="5" class="drop d-po" fill="#e06377" />
        <circle r="5" class="drop d-pi" fill="#e06377" />
        <circle r="5" class="drop d-so" fill="#e06377" />
        <circle r="5" class="drop d-si" fill="#8aa0d8" />
      </template>
    </svg>

    <div class="legend">
      <span><i class="a" /> артериальная кровь (с кислородом)</span>
      <span><i class="v" /> венозная кровь (с углекислым газом)</span>
    </div>
    <button class="toggle" @click="running = !running">
      {{ running ? 'Остановить' : 'Запустить кровоток' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const running = ref(true);
</script>

<style scoped>
.blood-anim {
  background: #fbfaf7;
  border: 1px solid #e6e1d6;
  border-radius: 16px;
  padding: 16px;
}
.blood-svg {
  width: 100%;
  max-width: 420px;
  display: block;
  margin: 0 auto;
}
.lbl {
  font-size: 10.5px;
  fill: #5a5f6b;
  font-weight: 600;
}
.drop {
  animation-duration: 3s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.d-po {
  offset-path: path('M176,104 C150,72 118,60 96,66');
  animation-name: flow;
}
.d-pi {
  offset-path: path('M92,74 C120,90 150,104 176,118');
  animation-name: flow;
  animation-delay: 1.5s;
}
.d-so {
  offset-path: path('M188,150 C168,182 120,196 96,200');
  animation-name: flow;
  animation-delay: 0.7s;
}
.d-si {
  offset-path: path('M92,210 C130,214 176,196 188,168');
  animation-name: flow;
  animation-delay: 2.2s;
}
@keyframes flow {
  from {
    offset-distance: 0%;
  }
  to {
    offset-distance: 100%;
  }
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 0 10px;
  font-size: 12.5px;
  color: #5a5f6b;
}
.legend span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.legend i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
.legend i.a {
  background: #e06377;
}
.legend i.v {
  background: #8aa0d8;
}
.toggle {
  border: 1px solid #4b4fcb;
  color: #4b4fcb;
  background: #fff;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .drop {
    animation: none;
  }
}
</style>
