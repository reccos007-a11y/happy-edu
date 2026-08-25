<template>
  <figure class="illus">
    <svg viewBox="0 0 360 170" role="img" aria-label="Систематическое положение человека">
      <g v-for="(step, i) in steps" :key="i">
        <rect
          :x="20 + i * 82"
          :y="120 - i * 26"
          width="76"
          :height="34 + i * 26"
          rx="7"
          :fill="step.fill"
          stroke="#4b4fcb"
          stroke-opacity="0.25"
        />
        <text :x="58 + i * 82" :y="140 - i * 26" text-anchor="middle" class="cap">
          {{ step.label }}
        </text>
        <path
          v-if="i < steps.length - 1"
          :d="`M${96 + i * 82},${120 - i * 26 - 6} l6,-4 v8 z`"
          fill="#4b4fcb"
        />
      </g>
    </svg>
    <figcaption>Человек в системе живой природы: от хордовых до человека разумного</figcaption>
  </figure>
</template>

<script setup>
const steps = [
  { label: 'Хордовые', fill: '#eef1fb' },
  { label: 'Млекопитающие', fill: '#e2e6fa' },
  { label: 'Приматы', fill: '#d3d9f7' },
  { label: 'Человек', fill: '#c2caf3' },
];
</script>

<style scoped>
.illus {
  margin: 0;
  background: #fbfaf7;
  border: 1px solid #e6e1d6;
  border-radius: 14px;
  padding: 14px;
}
.illus svg {
  width: 100%;
  max-width: 460px;
  display: block;
  margin: 0 auto;
}
.cap {
  font-size: 9.5px;
  fill: #34406b;
  font-weight: 600;
}
figcaption {
  text-align: center;
  font-size: 12.5px;
  color: #8a8577;
  margin-top: 8px;
}
</style>
