import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// Единая светлая тема «happy» — дизайн-система «Ясность + Импульс».
// Токены (палитра) задаются здесь один раз; компоненты наследуют их через цвета
// Vuetify. Спокойный/тёплый регистры различаются формой и задаются в app.css.
const happy = {
  dark: false,
  colors: {
    background: '#F7F5F1',
    surface: '#FFFFFF',
    primary: '#4B4FCB',
    secondary: '#FF8A4C',
    success: '#1F9254',
    warning: '#D9822B',
    error: '#C0492B',
    'on-surface': '#232833',
    'on-background': '#232833',
  },
};

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'happy',
    themes: { happy },
  },
  defaults: {
    VCard: { flat: true },
    VTextField: { variant: 'outlined', density: 'comfortable' },
  },
});
