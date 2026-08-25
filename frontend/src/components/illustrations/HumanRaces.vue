<template>
  <figure class="illus">
    <svg viewBox="0 0 360 160" role="img" aria-label="Большие расы человечества">
      <g v-for="(r, i) in races" :key="i">
        <!-- голова и плечи -->
        <circle :cx="70 + i * 110" cy="58" r="26" :fill="r.skin" />
        <path :d="`M${44 + i * 110},110 a26,26 0 0 1 52,0 z`" :fill="r.skin" />
        <path :d="`M${44 + i * 110},112 h52 v6 h-52 z`" fill="#4b4fcb" fill-opacity="0.12" />
        <text :x="70 + i * 110" y="140" text-anchor="middle" class="cap">{{ r.label }}</text>
      </g>
    </svg>
    <figcaption>Все расы принадлежат к одному виду — Человек разумный — и равноценны</figcaption>
  </figure>
</template>

<script setup>
const races = [
  { label: 'европеоидная', skin: '#f0d0b0' },
  { label: 'монголоидная', skin: '#e6c48f' },
  { label: 'негроидная', skin: '#a9764f' },
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
  font-size: 10.5px;
  fill: #5a5f6b;
  font-weight: 600;
}
figcaption {
  text-align: center;
  font-size: 12.5px;
  color: #8a8577;
  margin-top: 8px;
}
</style>
