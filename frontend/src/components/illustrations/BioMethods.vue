<template>
  <figure class="illus">
    <svg viewBox="0 0 360 150" role="img" aria-label="Методы биологии">
      <!-- наблюдение: лупа -->
      <g>
        <circle cx="52" cy="56" r="18" fill="#eef1fb" stroke="#4b4fcb" stroke-width="3" />
        <line
          x1="65"
          y1="69"
          x2="78"
          y2="82"
          stroke="#4b4fcb"
          stroke-width="4"
          stroke-linecap="round"
        />
        <text x="52" y="112" text-anchor="middle" class="cap">наблюдение</text>
      </g>
      <!-- эксперимент: колба -->
      <g>
        <path
          d="M138,40 h16 v16 l12,26 a4,4 0 0 1 -4,6 h-32 a4,4 0 0 1 -4,-6 l12,-26 z"
          fill="#e4f1ea"
          stroke="#1f9254"
          stroke-width="2.5"
        />
        <path d="M128,74 h36 l6,14 a4,4 0 0 1 -4,6 h-40 a4,4 0 0 1 -4,-6 z" fill="#8fd0aa" />
        <text x="146" y="112" text-anchor="middle" class="cap">эксперимент</text>
      </g>
      <!-- измерение: линейка -->
      <g>
        <rect
          x="214"
          y="42"
          width="20"
          height="52"
          rx="3"
          fill="#fff1e8"
          stroke="#e8703a"
          stroke-width="2.5"
        />
        <line
          v-for="y in [50, 60, 70, 80]"
          :key="y"
          x1="214"
          :y1="y"
          x2="223"
          :y2="y"
          stroke="#e8703a"
          stroke-width="2"
        />
        <text x="224" y="112" text-anchor="middle" class="cap">измерение</text>
      </g>
      <!-- сравнение: весы -->
      <g>
        <line x1="312" y1="44" x2="312" y2="88" stroke="#4b4fcb" stroke-width="3" />
        <line x1="292" y1="52" x2="332" y2="52" stroke="#4b4fcb" stroke-width="3" />
        <circle cx="292" cy="64" r="8" fill="#c7ccff" stroke="#4b4fcb" stroke-width="2" />
        <circle cx="332" cy="64" r="8" fill="#c7ccff" stroke="#4b4fcb" stroke-width="2" />
        <rect x="300" y="88" width="24" height="5" rx="2" fill="#4b4fcb" />
        <text x="312" y="112" text-anchor="middle" class="cap">сравнение</text>
      </g>
    </svg>
    <figcaption>Основные методы биологии</figcaption>
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
  max-width: 460px;
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
