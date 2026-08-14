# Test Project

Заготовка сайта: Node.js (Express) + PostgreSQL + Vue 3 (Vuetify), всё в Docker.

## Авторизация

E-mail + пароль, сессия в httpOnly cookie.

| Метод | Эндпоинт | Назначение |
|---|---|---|
| POST | `/api/auth/register` | регистрация, сразу выдаёт сессию |
| POST | `/api/auth/login` | вход |
| POST | `/api/auth/logout` | выход, сбрасывает cookie |
| GET | `/api/auth/me` | текущий пользователь либо 401 |

## Роли и права

Две роли, заданные в `backend/src/roles.js` — единственном месте, откуда их берут
и схема БД, и проверки доступа:

| Роль | Права |
|---|---|
| `user` | нет (по умолчанию у всех, кто зарегистрировался) |
| `admin` | `users:read`, `users:write`, `roles:manage` — максимальный набор |

Администратор получает все права из `PERMISSIONS`, включая те, что появятся
позже: новое право достаточно добавить в этот объект.

| Метод | Эндпоинт | Требуемое право |
|---|---|---|
| GET | `/api/admin/roles` | `users:read` |
| GET | `/api/admin/users` | `users:read` |
| PATCH | `/api/admin/users/:id/role` | `roles:manage` |
| DELETE | `/api/admin/users/:id` | `users:write` |

Принятые решения:

- **Роль не кладётся в JWT**, а читается из БД на каждом запросе — иначе снятие
  прав начало бы действовать только после истечения токена (до 7 дней).
- **Регистрация всегда создаёт `user`**: поле `role` из тела запроса игнорируется,
  иначе администратором мог бы стать любой желающий.
- **Нельзя сменить собственную роль** — администратор случайно закрыл бы себе доступ.
- **Нельзя снять права с последнего администратора** (409): проверка идёт в
  транзакции с `FOR UPDATE` на строках админов, что защищает и от одновременного
  взаимного понижения двумя администраторами.
- **Права отдаются фронтенду развёрнутым списком** в `/api/auth/me`, поэтому
  интерфейсу не нужно знать таблицу ролей. Это только для отображения — доступ
  всё равно решает сервер.

### Создание администратора

Регистрация через сайт всегда даёт обычного пользователя, поэтому первый
администратор заводится из командной строки:

```bash
# на сервере
cd /opt/happy-edu
docker compose -f docker-compose.prod.yml -p happy-edu exec backend \
  node src/create-admin.js admin@example.com

# локально
docker compose exec backend node src/create-admin.js admin@example.com
```

Без пароля в аргументах он генерируется и печатается один раз. Пароль можно
задать явно — аргументом или переменной `ADMIN_PASSWORD` (она не попадает
в историю оболочки):

```bash
docker compose exec -e ADMIN_PASSWORD='...' backend node src/create-admin.js admin@example.com
```

Скрипт идемпотентен: если пользователь уже существует, он повышается до
администратора, а пароль меняется только когда передан явно. Дальше роли
раздаются через админ-панель на сайте.

Принятые решения:

- **Пароли** хешируются встроенным в Node `crypto.scrypt` (N=32768, r=8, p=1),
  соль на пользователя, сравнение через `timingSafeEqual`. `bcrypt` не взят
  намеренно: требует нативной сборки в alpine.
- **Сессия** — JWT на 7 дней в cookie `session` с `httpOnly`, `sameSite=lax`
  и `Secure` в проде (флаг `COOKIE_SECURE`, локально выключен, иначе браузер
  не сохранит cookie на http://localhost).
- **E-mail нормализуется** в нижний регистр, уникальность обеспечена индексом
  `users_email_lower_idx` по `lower(email)`.
- **Неверный пароль и несуществующий пользователь** дают одинаковый ответ 401,
  чтобы перебором нельзя было выяснить зарегистрированные адреса.
- **Схема** создаётся при старте backend (`src/schema.js`), идемпотентно.
  Для нетривиальных изменений схемы понадобится инструмент миграций.

`JWT_SECRET` обязателен — без него backend не стартует. Генерация:
`openssl rand -base64 48`. Смена секрета инвалидирует все активные сессии.

## Структура

- `backend/` — Express API, health-check `/api/health`, подключение к Postgres через `pg`
- `frontend/` — Vue 3 + Vite + Vuetify, тестовая страничка, обращается к `/api/health`
- `docker-compose.yml` — postgres + backend + frontend (nginx, отдаёт статику и проксирует `/api` на backend)

## Запуск локально

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend: http://localhost:3000/api/health
- Postgres: localhost:5432

## Деплой

Развёрнуто на VPS `159.194.214.11` (Ubuntu 24.04), директория `/opt/happy-edu`.

**Открыто:** https://smartalise.ru (и `www.smartalise.ru`)

Контейнеры не публикуют портов на хост вообще — снаружи проект доступен только
через Caddy по HTTPS. Наружу на сервере слушают лишь 22 (SSH), 80 и 443 (Caddy).

### Важно про этот сервер

На сервере уже работают три других проекта (`eurtx`, `dosifeya`, `smarthome`) за общим
реверс-прокси Caddy, который занимает порты 80 и 443. Поэтому:

- используется отдельный compose-проект `happy-edu`;
- `docker-compose.prod.yml` **не публикует** порты postgres и backend наружу — они доступны
  только внутри сети `happy-edu_default`;
- контейнеры остальных проектов не затрагиваются.

### Как подключён домен

DNS домена управляется Beget, A-записи `smartalise.ru` и `www.smartalise.ru` указывают
на 159.194.214.11.

Frontend подключён к внешней сети `web` (её создаёт проект `smarthome`) с алиасом
`happy-edu-frontend`. В `/opt/smarthome/Caddyfile` добавлен блок:

```
smartalise.ru, www.smartalise.ru {
	encode gzip
	reverse_proxy happy-edu-frontend:80
}
```

Сертификат Let's Encrypt Caddy выпускает и продлевает сам. Бэкапы Caddyfile лежат
рядом как `Caddyfile.bak.<timestamp>`.

После правки Caddyfile применять так (сначала проверка, потом reload без простоя):

```bash
docker exec smarthome-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec smarthome-caddy-1 caddy reload  --config /etc/caddy/Caddyfile
```

### Команды на сервере

```bash
cd /opt/happy-edu
docker compose -f docker-compose.prod.yml -p happy-edu ps
docker compose -f docker-compose.prod.yml -p happy-edu logs -f
docker compose -f docker-compose.prod.yml -p happy-edu up -d --build   # передеплой
```

### Автодеплой (GitHub Actions)

Push в `main` автоматически выкатывает изменения на https://smartalise.ru —
`.github/workflows/deploy.yml`. Его же можно запустить вручную из вкладки Actions
(«Run workflow»), без коммита.

Что делает workflow:

1. проверяет, что на сервере есть `/opt/happy-edu/.env` и хватает места на диске
   (меньше 700 МБ — деплой останавливается, не начав ломать рабочую версию);
2. переносит код через `rsync` (без `.env`, `node_modules`, `dist`, `.git`);
3. помечает текущие образы тегом `:previous` — это точка отката;
4. пересобирает и поднимает контейнеры с `--force-recreate`;
5. **проверяет результат**, а не код возврата: сверяет ID собранного образа с тем,
   на котором реально работает контейнер, и опрашивает `https://smartalise.ru/api/health`
   до 10 раз. Если что-то не так — шаг падает и печатает логи контейнеров.

Одновременные деплои исключены (`concurrency`), иначе два `rsync` перетёрли бы
файлы друг друга.

Секреты репозитория (Settings → Secrets → Actions):

| Секрет | Назначение |
|---|---|
| `VPS_SSH_KEY` | приватный ключ деплоя (пара к `~/.ssh/id_ed25519_happy_edu_ci`) |
| `VPS_KNOWN_HOSTS` | host-ключи сервера, чтобы не отключать проверку хоста |
| `VPS_HOST`, `VPS_USER` | адрес сервера и пользователь |

Ключ деплоя — **отдельный** от личного: его можно отозвать, удалив строку
`github-actions-deploy@happy-edu` из `/root/.ssh/authorized_keys` на сервере,
не трогая свой доступ.

**Откат** (автоматического нет — деплой только сообщает о провале):

```bash
ssh vps
cd /opt/happy-edu
docker tag happy-edu-backend:previous happy-edu-backend
docker tag happy-edu-frontend:previous happy-edu-frontend
docker compose -f docker-compose.prod.yml -p happy-edu up -d --force-recreate
```

Учтите: откат возвращает код, но **не откатывает схему БД** — `initSchema`
только добавляет объекты, поэтому старый код с новой схемой обычно работает,
но это стоит держать в голове при изменениях схемы.

### Обновление кода с локальной машины (в обход CI)

```bash
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude .env \
  ~/Projects/happy-edu/ vps:/opt/happy-edu/
ssh vps "cd /opt/happy-edu && docker compose -f docker-compose.prod.yml -p happy-edu up -d --build"
```

Алиас `vps` настроен в `~/.ssh/config` (ключ `~/.ssh/id_ed25519_vps`).

### Если понадобится домен и HTTPS

Добавить блок в `/opt/smarthome/Caddyfile`, подключить frontend к внешней сети `web`
и убрать публикацию порта 8080. Caddy сам выпустит сертификат Let's Encrypt.
