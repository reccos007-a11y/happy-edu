import '@mdi/font/css/materialdesignicons.css';
// Шрифты дизайн-системы — self-host из @fontsource (без внешнего CDN).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/600.css';
// Wordmark логотипа Happy/Edu.
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import { createApp } from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import './styles/app.css';

createApp(App).use(vuetify).mount('#app');
