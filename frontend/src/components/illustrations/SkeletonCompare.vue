<template>
  <figure class="illus">
    <svg viewBox="0 0 320 200" role="img" aria-label="Сравнение осанки обезьяны и человека">
      <!-- обезьяна: наклонённое тело, опора на 4 конечности -->
      <g stroke="#a97c50" stroke-width="4" fill="none" stroke-linecap="round">
        <circle cx="52" cy="70" r="12" fill="#e6cdb0" stroke="none" />
        <path d="M60,78 q34,10 58,26" />
        <path d="M64,84 l-4,44" />
        <path d="M96,96 l2,36" />
        <path d="M118,104 l6,26" />
      </g>
      <text x="90" y="164" text-anchor="middle" class="cap">обезьяна: тело наклонено</text>

      <!-- человек: прямохождение, S-образный позвоночник -->
      <g stroke="#4b4fcb" stroke-width="4" fill="none" stroke-linecap="round">
        <circle cx="240" cy="42" r="12" fill="#c7ccff" stroke="none" />
        <path d="M240,54 q-8,20 0,40 q8,20 0,40" />
        <path d="M224,74 h32" />
        <path d="M240,134 l-10,30" />
        <path d="M240,134 l10,30" />
      </g>
      <text x="240" y="188" text-anchor="middle" class="cap">человек: прямохождение</text>

      <line
        x1="160"
        y1="24"
        x2="160"
        y2="176"
        stroke="#e6e1d6"
        stroke-width="2"
        stroke-dasharray="4 4"
      />
    </svg>
    <figcaption>Прямохождение — ключевое отличие человека</figcaption>
  </figure>
</template>

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
  max-width: 420px;
  display: block;
  margin: 0 auto;
}
.cap {
  font-size: 10px;
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
