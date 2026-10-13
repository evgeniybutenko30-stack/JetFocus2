# JetFocus

JetFocus — система управления жизнью на русском языке: привычки, задачи, цели,
финансы, баланс сфер жизни, фокус-сессии, социальная лента и рейтинг, PRO-подписка
и админ-консоль.

Приложение — статический SPA, который публикуется на GitHub Pages
(`https://<owner>.github.io/JetFocus2/`). Серверной части в репозитории нет: авторизация
и облачные данные — в Supabase, локальные данные — в IndexedDB браузера.

## Стек

| Слой | Технологии |
| --- | --- |
| Сборка | Vite 5, TypeScript, SWC (`@vitejs/plugin-react-swc`) |
| UI | React 18, Tailwind CSS 3, shadcn/ui (Radix UI), lucide-react, sonner, recharts |
| Маршрутизация | react-router-dom v6 (`BrowserRouter`, `basename` = `import.meta.env.BASE_URL`), ленивые маршруты |
| Состояние и данные | zustand (сторы), TanStack Query, Dexie (IndexedDB, `src/lib/db.ts`) |
| Бэкенд | Supabase (`@supabase/supabase-js` v2): Auth, Postgres + RLS, Storage, RPC |
| Тесты и качество | Vitest + jsdom + Testing Library, ESLint 9 (typescript-eslint, react-hooks) |
| CI/CD | GitHub Actions → GitHub Pages |

## Требования

- **Node.js 22**: версия зафиксирована в `.nvmrc`, достаточно выполнить `nvm use`.
- **npm**: менеджер пакетов проекта, источник истины — `package-lock.json`.
  Файл `bun.lockb` остался от Lovable и не используется в CI.

## Быстрый старт

```sh
git clone <URL репозитория>
cd JetFocus2
nvm use          # Node 22
npm ci           # точная установка зависимостей по package-lock.json
npm run dev      # http://localhost:8080
```

Dev-сервер слушает все сетевые интерфейсы (`host: "::"`), поэтому приложение можно
открыть с телефона в той же сети: `http://<IP-компьютера>:8080`. В публичных сетях
dev-сервер лучше не запускать.

## Скрипты

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер Vite с HMR (порт 8080) |
| `npm run build` | production-сборка в `dist/` |
| `npm run build:dev` | сборка в режиме development |
| `npm run preview` | локальный просмотр собранного `dist/` |
| `npm run lint` | ESLint по всему проекту |
| `npm test` | все unit-тесты Vitest, однократный прогон |
| `npm run test:watch` | Vitest в watch-режиме |
| `npx tsc -p tsconfig.app.json --noEmit` | проверка типов приложения |
| `npx tsc -p tsconfig.node.json --noEmit` | проверка типов конфигов (vite, vitest, tailwind) |

Перед пушем полезно прогнать то же, что проверяет CI:

```sh
npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.node.json --noEmit \
  && npm run lint && npm test && npm run build
```

## Конфигурация и переменные окружения

- **Supabase.** URL проекта и **anon**-ключ заданы в `src/lib/supabase.ts`. Anon-ключ
  публичный по своей природе: он попадает в браузер у каждого пользователя. Данные
  защищают политики RLS и проверки внутри RPC, а не секретность ключа.
  **Никогда** не добавляйте во фронтенд `service_role`-ключ и другие секреты.
- **`BASE_PATH`** (только при сборке) — публичный базовый путь приложения. По умолчанию
  `/`; при деплое на GitHub Pages CI передаёт `/<имя-репозитория>/`. Во всём коде
  абсолютные ссылки строятся от `import.meta.env.BASE_URL`, а переходы внутри
  приложения — через `navigate('/путь')` или `<Link>` react-router.
- Файлы `.env*` в git не коммитятся (см. `.gitignore`), но сейчас проекту они не нужны.

## Структура проекта

```
src/
  App.tsx, main.tsx        точка входа, роутер, ленивые маршруты
  pages/                   экраны (Today, Habits, Tasks, Goals, Finance, Social, Rating, …)
  pages/admin/             админ-консоль
  components/              общие компоненты; components/ui — сгенерированные shadcn/ui
  lib/                     сервисы и чистая логика (tasksService, habitsService,
                           goalsService, financeUtils, starsService, adminService, db.ts…)
  stores/                  zustand-сторы (auth-store, theme-store)
  hooks/                   React-хуки (use-metrics, use-full-access, …)
  test/setup.ts            настройка Vitest (jest-dom)
supabase/migrations/       новые SQL-миграции (применяются вручную, см. ниже)
supabase_*.sql             исторические SQL-скрипты схемы
```

Где хранятся данные:

- **Supabase** (облако, у авторизованного пользователя): профили (`user_profiles`),
  задачи, привычки (`habits`, `habit_completions`, теги), цели (`goals`,
  `goal_milestones`, `goal_actions`, `goal_progress_logs`), звёзды (`stars_ledger`),
  рефералы, посты и лайки, промокоды, роли админ-консоли и аудит. Аватары и медиа
  постов лежат в Storage (бакеты `avatars`, `posts`).
- **IndexedDB / Dexie** (локально в браузере): финансы (операции, счета, финансовые
  цели), фокус-сессии, планы дня, достижения, уведомления, а также данные гостевого
  режима.

Unit-тесты лежат рядом с кодом (`*.test.ts` / `*.test.tsx`) и запускаются в jsdom.
К Supabase тесты не обращаются, клиент в них замокан.

## Деплой на GitHub Pages

Деплой полностью автоматический (`.github/workflows/deploy.yml`):

1. push в `main` (или ручной запуск *Run workflow*);
2. job **checks** вызывает `ci.yml`: `npm ci` → проверка типов → ESLint → Vitest →
   сборка. Если любая проверка падает, сайт **не** публикуется;
3. job **build** собирает приложение с `BASE_PATH=/<имя-репозитория>/` и копирует
   `dist/index.html` в `dist/404.html`. Это SPA-fallback: GitHub Pages отдаёт 404.html
   на прямые ссылки вида `/JetFocus2/today`, и роутер открывает нужный экран;
4. job **deploy** публикует артефакт через `actions/deploy-pages`.

Workflow `.github/workflows/ci.yml` также запускается на каждый push в остальные ветки
и на каждый pull request.

Однократная настройка:

- **GitHub:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- **Supabase:** Authentication → URL Configuration — добавьте адрес сайта
  `https://<owner>.github.io/JetFocus2/` в *Site URL* и/или *Redirect URLs*.
  Ссылка из письма подтверждения ведёт на `window.location.origin + BASE_URL`;
  если адреса нет в списке, Supabase перенаправит пользователя не туда.

Локальная проверка production-сборки с тем же базовым путём:

```sh
export BASE_PATH=/JetFocus2/   # нужен и при сборке, и при preview
npm run build && npm run preview
# открыть http://localhost:4173/JetFocus2/
```

## База данных Supabase: применение SQL

Схема ведётся SQL-скриптами, которые **вручную** выполняются в
Supabase Dashboard → SQL Editor (CLI-миграции не настроены). Удалённая база из
репозитория не меняется.

Исторические скрипты в корне репозитория (для нового проекта; в рабочей базе
они уже применены):

1. `supabase_full_setup.sql` — `user_profiles`, базовые таблицы и триггер
   `handle_new_user` (включает в себя `supabase_setup.sql`);
2. `supabase_tasks_setup.sql` — таблица задач.
   ⚠️ Скрипт начинается с `DROP TABLE tasks CASCADE`. **Никогда не запускайте его
   на рабочей базе:** все задачи будут удалены;
3. `supabase_goals_complete.sql` — система целей (повторно запускаемая версия
   `supabase_goals_v2.sql`);
4. `supabase_habits_full.sql` — привычки;
5. `supabase_rating_setup.sql` — рефералы, посты, лайки, публичные профили;
6. `supabase_admin_setup_v2.sql` — роли и RPC админ-консоли (заменяет
   `supabase_admin_setup.sql`).

Новые миграции лежат в `supabase/migrations/` и применяются по порядку имён
**после** скриптов выше:

- **`supabase/migrations/20261013_security_hardening.sql`** — обязательная миграция
  безопасности. Админ-RPC авторизуются по `auth.uid()`, а не по переданному клиентом id.
  Отозван `EXECUTE` у `anon`. Пользователь не может сам выдать себе PRO или звёзды
  и не может снять с себя бан. Добавлены ограничения записи в `stars_ledger`,
  в Storage и в промокоды, а также индексы. Как применять:
  1. сделайте бэкап (Database → Backups) или как минимум убедитесь, что он есть;
  2. вставьте **весь** файл в SQL Editor и нажмите *Run*. Скрипт идемпотентен
     и выполняется одной транзакцией: применяется целиком или не применяется вовсе.
     Если нет обязательных объектов, он остановится с понятным сообщением;
  3. проверьте вход, создание задач и привычек, начисление звёзд и админ-консоль;
  4. инструкция по откату — в шапке файла.

Новые изменения схемы оформляйте отдельным файлом
`supabase/migrations/YYYYMMDD_описание.sql`. Пишите его идемпотентно
(`IF NOT EXISTS`, `CREATE OR REPLACE`) и с комментарием, как применять и откатывать.

## Обновление зависимостей

- Устанавливайте и обновляйте пакеты только через npm, чтобы `package-lock.json`
  оставался единственным lock-файлом.
- `npm audit` показывает в основном уязвимости инструментов разработки (Vite
  dev-сервер, Vitest, Tailwind 3). В production-бандл они не попадают: на GitHub Pages
  отдаётся только статический `dist/`.
- Мажорные обновления (Vite 6+, Vitest 4+, react-router 7, Tailwind 4) делайте
  отдельными PR и проверяйте в CI.
