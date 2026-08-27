# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Документация проекта на русском: [README.md](README.md) — авторизация, роли, миграции, деплой; [CONTRIBUTING.md](CONTRIBUTING.md) — ветки, PR, правила миграций. Здесь только то, чего в них нет.

## Команды

Всё выполняется в контейнерах, Node локально не нужен.

```bash
docker compose up --build                          # поднять стек (8080 фронт, 3000 API, 5432 БД)
docker compose exec backend npm test                # все тесты backend
docker compose exec backend npm run migrate         # применить миграции вручную
docker compose exec backend node src/seed-catalog.js   # залить демо-каталог по биологии
docker compose exec backend node src/create-admin.js admin@example.com
npm run lint && npm run format:check                # в корне; правка — lint:fix / format
```

Один тестовый файл или один тест (тесты — встроенный `node:test`, `--test-concurrency=1`, т.к. идут против общей БД):

```bash
docker compose exec backend node --test test/plans.test.js
docker compose exec backend node --test --test-name-pattern 'последнего администратора' test/
```

Тестам нужен живой Postgres и переменные `DB_*` — вне контейнера они не запустятся. `helpers.js` даёт `startServer()` (приложение на случайном порту), `makeClient()` (fetch, сам хранящий сессионную cookie) и `resetUsers()` (`TRUNCATE users ... CASCADE`, чистит и зависимые таблицы).

## Архитектура

**Разделение `app.js` / `index.js`.** `createApp()` только собирает Express без прослушивания порта — поэтому тесты поднимают то же приложение на порту 0. Новый роутер подключают в `createApp()`.

**Доступ решается двумя разными механизмами, не смешивать:**

- _Права_ (`requirePermission` из `auth.js`) — для персонала: `/api/admin/*` и мутации `/api/catalog/*` (`content:write`). Источник правды — `PERMISSIONS`/`ROLES` в `roles.js`; новое право достаточно добавить в `PERMISSIONS` (админ получает всё автоматически), новая роль требует ещё и миграции — список ролей закреплён CHECK-ограничением.
- _Принадлежность данных_ — для кабинета ученика (`/api/me/*`, `me.js`). У роли `student` прав нет вообще: `ownProfile(req.user.id)` находит профиль вошедшего, чужого не отдаст, а не-ученик получает 404. Не пытаться закрывать `/api/me/*` правами.

Роль не лежит в JWT — читается из БД на каждом запросе (`userFromRequest`), поэтому понижение прав действует немедленно.

**Слои контента:** `subjects → sections → topics`, к теме привязаны `learning_materials` и `questions` + `question_options`; учебный план ученика — `learning_plans → learning_plan_items` (item ссылается на topic). Персонал правит это через `catalog.js` и `plans.js`, ученик читает через `me.js`.

**Прохождение тестов целиком серверное** (`me.js`): `GET /api/me/topics/:id/test` отдаёт вопросы **без `is_correct`**, `POST` проверяет ответы на сервере, пишет `test_attempts` и при ≥70% (`PASS_PERCENT`) сам переводит пункт плана в `completed`. Правильные ответы не должны попадать в ответ API.

**Гейт последовательности тем** — `topicLocked()`: нельзя _начать_ не начатую тему, пока предыдущая в плане не зачтена, но уже начатые и зачтённые остаются доступны (иначе провал теста запер бы ученика без пересдачи). Тема, которой нет ни в одном плане, не гейтится.

**Геймификация выводится, а не хранится** (`gamification.js`): XP, уровень, серия и значки считаются из освоенных тем и попыток тестов при запросе `/api/me/overview`. Отдельных счётчиков в БД нет — не заводить.

**Soft delete.** Во всех таблицах кроме `users` есть `deleted_at`; выборки обязаны фильтровать `deleted_at IS NULL`. Забытый фильтр — самая частая ошибка в этом коде.

**Frontend без роутера.** `App.vue` выбирает экран по роли (`isStudent` → `StudentDashboard`, иначе вкладки каталог/ученики/профиль), URL не меняется. Вся работа с API — в `composables/use*.js` по одному шаблону: локальный `api()` с `credentials: 'include'` (сессия в httpOnly cookie), `loading`/`error` в состоянии, мутации возвращают промис и бросают ошибку — вызывающий компонент решает, что перезагрузить. Новый раздел API = новый composable по этому образцу.

Nginx фронтенда проксирует `/api/` на `backend:3000`, поэтому в коде фронта пути всегда относительные (`/api/...`), без хоста.

## Чего ждать от репозитория

- Код, комментарии, сообщения об ошибках и UI — на русском. Комментарии объясняют _почему_ принято решение, а не что делает строка; держаться этого стиля.
- README описывает только слой авторизации и отстаёт от кода: ролей уже три (`user`, `student`, `admin`) и есть право `content:write`. Актуальное — `roles.js`.
- Прямо в `main` не пушат: push в `main` автоматически деплоит на https://smartalise.ru. Ветки `feat/`, `fix/`, `chore/`, `docs/` → pull request.
- Влитую миграцию не редактируют — только новый файл со следующим номером; писать идемпотентно (`IF NOT EXISTS`), база на сервере живая.
- Репозиторий публичный; `.env` не коммитится, адрес сервера и ключи — только в секретах GitHub Actions.
