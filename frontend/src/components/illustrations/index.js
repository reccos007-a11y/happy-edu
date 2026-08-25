// Реестр встроенных SVG-иллюстраций. Материал типа 'image' может ссылаться на
// иллюстрацию по ключу в поле content (вместо внешнего URL в file_url) —
// разметка живёт в коде, в базе только ключ.
import BioDiversity from './BioDiversity.vue';
import HumanInNature from './HumanInNature.vue';
import BioMethods from './BioMethods.vue';
import SkeletonCompare from './SkeletonCompare.vue';
import HumanRaces from './HumanRaces.vue';

export const ILLUSTRATIONS = {
  'bio-diversity': BioDiversity,
  'human-in-nature': HumanInNature,
  'bio-methods': BioMethods,
  'skeleton-compare': SkeletonCompare,
  'human-races': HumanRaces,
};
