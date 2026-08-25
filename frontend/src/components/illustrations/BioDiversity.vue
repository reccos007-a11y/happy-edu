<template>
  <figure class="illus">
    <svg viewBox="0 0 360 180" role="img" aria-label="Разнообразие живой природы">
      <!-- растение -->
      <g>
        <rect x="42" y="96" width="6" height="40" fill="#7a9b52" />
        <path d="M45,100 q-24,-6 -30,-26 q26,2 30,20 z" fill="#8fbf5f" />
        <path d="M45,90 q24,-8 30,-30 q-26,2 -30,24 z" fill="#a6d16f" />
        <circle cx="45" cy="70" r="14" fill="#8fbf5f" />
        <text x="45" y="156" text-anchor="middle" class="cap">растения</text>
      </g>
      <!-- животное (рыба) -->
      <g>
        <ellipse cx="140" cy="96" rx="26" ry="15" fill="#5aa0c8" />
        <path d="M166,96 l16,-10 v20 z" fill="#5aa0c8" />
        <circle cx="128" cy="92" r="2.5" fill="#123" />
        <text x="145" y="156" text-anchor="middle" class="cap">животные</text>
      </g>
      <!-- человек -->
      <g>
        <circle cx="235" cy="70" r="11" fill="#e6b17a" />
        <rect x="228" y="82" width="14" height="30" rx="6" fill="#4b4fcb" />
        <line
          x1="235"
          y1="112"
          x2="229"
          y2="134"
          stroke="#4b4fcb"
          stroke-width="5"
          stroke-linecap="round"
        />
        <line
          x1="235"
          y1="112"
          x2="241"
          y2="134"
          stroke="#4b4fcb"
          stroke-width="5"
          stroke-linecap="round"
        />
        <text x="235" y="156" text-anchor="middle" class="cap">человек</text>
      </g>
      <!-- микроорганизмы / грибы -->
      <g>
        <circle cx="315" cy="86" r="16" fill="#c9a0dc" />
        <circle cx="315" cy="86" r="6" fill="#8a5fa8" />
        <circle cx="332" cy="104" r="9" fill="#d9b6e6" />
        <text x="320" y="156" text-anchor="middle" class="cap">микроорганизмы</text>
      </g>
      <line x1="14" y1="136" x2="346" y2="136" stroke="#e6e1d6" stroke-width="2" />
    </svg>
    <figcaption>Живая природа: растения, животные, человек и микроорганизмы</figcaption>
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
