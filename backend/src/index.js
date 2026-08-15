import { createApp } from './app.js';
import { runMigrations } from './migrate.js';

const port = process.env.PORT || 3000;

// Миграции применяются до того, как сервер начнёт принимать запросы: иначе
// первые запросы пришли бы на схему, которой ещё нет.
runMigrations()
  .then(() => {
    createApp().listen(port, () => {
      console.log(`Backend listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось применить миграции:', err);
    process.exit(1);
  });
