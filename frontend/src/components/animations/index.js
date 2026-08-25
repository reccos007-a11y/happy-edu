// Реестр интерактивных анимаций. Материал типа 'animation' хранит в БД ключ,
// а разметка живёт здесь, в коде — так в базе нет «сырого HTML».
import CellStructure from './CellStructure.vue';
import ReflexArc from './ReflexArc.vue';

export const ANIMATIONS = {
  'cell-structure': CellStructure,
  'reflex-arc': ReflexArc,
};

// Для выпадающего списка в админке.
export const ANIMATION_OPTIONS = [
  { title: 'Строение клетки', value: 'cell-structure' },
  { title: 'Рефлекторная дуга', value: 'reflex-arc' },
];
