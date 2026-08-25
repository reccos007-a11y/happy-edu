// Реестр интерактивных анимаций. Материал типа 'animation' хранит в БД ключ,
// а разметка живёт здесь, в коде — так в базе нет «сырого HTML».
import BloodCirculation from './BloodCirculation.vue';
import CellStructure from './CellStructure.vue';
import ReflexArc from './ReflexArc.vue';

export const ANIMATIONS = {
  'cell-structure': CellStructure,
  'reflex-arc': ReflexArc,
  'blood-circulation': BloodCirculation,
};

// Для выпадающего списка в админке.
export const ANIMATION_OPTIONS = [
  { title: 'Строение клетки', value: 'cell-structure' },
  { title: 'Рефлекторная дуга', value: 'reflex-arc' },
  { title: 'Круги кровообращения', value: 'blood-circulation' },
];
