# ФОРА — аналитический форм-гайд по спорту

Статичный сайт (HTML/CSS/JS, без сборки) с панелью управления, готовый
к деплою на Cloudflare Pages, подключению Supabase и запуску как Telegram Mini App.

## Структура

```
fora/
├─ index.html          — разметка
├─ assets/
│  ├─ config.js        — ВСЕ настройки (Supabase, Telegram, пароль, фичи)
│  ├─ store.js         — слой данных: localStorage ↔ Supabase
│  ├─ app.js           — логика интерфейса
│  ├─ styles.css       — стили (вкл. тёмная тема)
│  ├─ favicon.svg
│  └─ og.png           — картинка для репостов
└─ README.md
```

Данные по умолчанию хранятся в **localStorage** браузера — то есть у каждого посетителя
свои. Это нормально для теста, но для реального сайта с общими данными
нужен Supabase (ниже).

---

## 1. Локальный запуск

Просто открой `index.html` в браузере. Лучше через локальный сервер:

```bash
python3 -m http.server 8000
# открой http://localhost:8000
```

Вход в панель: кнопка «Панель» в меню. Пароль задаётся через SHA-256 hash
в `assets/config.js` → `admin.defaultPasswordHash`. Сменить пароль можно
из самой панели — новый hash сохранится в localStorage браузера.

---

## 2. Деплой на GitHub + Cloudflare Pages

```bash
cd fora
git init
git add .
git commit -m "FORA site"
git branch -M main
git remote add origin https://github.com/USERNAME/fora.git
git push -u origin main
```

В Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**:
- выбери репозиторий `fora`
- **Framework preset:** None
- **Build command:** оставь пустым
- **Build output directory:** `/` (корень)
- Deploy.

Сайт будет на `https://fora.pages.dev` (или твой домен).
Каждый `git push` → автодеплой.

---

## 3. Подключение Supabase (общая база)

### 3.1 Создай проект на supabase.com → SQL Editor → выполни:

```sql
create table if not exists predictions (
  id        uuid primary key default gen_random_uuid(),
  sport     text not null,
  league    text default '',
  match     text not null,
  pick      text not null,
  odds      numeric not null default 1,
  conf      int not null default 50,
  status    text not null default 'upcoming',  -- upcoming | win | lose
  date      text,                              -- ISO datetime-local
  analysis  text default '',
  vip       boolean not null default false,
  created_at timestamptz default now()
);

alter table predictions enable row level security;

-- Читать может кто угодно (публичный сайт):
create policy "public read" on predictions
  for select using (true);

-- ЗАПИСЬ НАПРЯМУЮ С ФРОНТА НЕ РАЗРЕШАЕМ (безопасность).
-- Запись — только через service_role ключ с бэкенда/бота (п. 5).
```

### 3.2 В `assets/config.js`:

```js
useSupabase: true,
supabase: {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJhbGci...",   // Project Settings → API → anon public
  table: "predictions"
}
```

### 3.3 В `index.html` раскомментируй строку:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Готово — сайт читает прогнозы из общей базы. Слой данных (`store.js`)
переключается автоматически — менять app.js не нужно.

> ⚠ anon key — публичный, его видно в коде, это нормально. Защита — через RLS.
> service_role key НИКОГДА не клади в фронтенд.

---

## 4. Telegram Mini App

Сайт уже поддерживает запуск внутри Telegram (тема, expand, BackButton,
хаптика, `start_param` для рефералок). Ничего дописывать не нужно.

1. Напиши [@BotFather](https://t.me/BotFather) → `/newbot` → получи токен.
2. `/newapp` → выбери бота → укажи URL сайта (с Cloudflare) → получишь ссылку
   вида `https://t.me/YourForaBot/app`.
3. В `config.js` заполни `telegram.botUsername`, `miniAppUrl`, `channelUrl`.
4. Кнопка меню бота: BotFather → `/setmenubutton`.

Рефералки: ссылка `https://t.me/YourForaBot/app?startapp=REFCODE` → код
попадает в `start_param`; в `app.js` есть TODO, где его отправить на бэкенд.

---

## 5. Автопостинг в канал + безопасная запись (бот)

Кнопка «Пост» в панели готовит текст для канала и открывает окно шеринга
Telegram (текст копируется в буфер). Для полной автоматизации сделай
небольшой бот (например Cloudflare Worker или Supabase Edge Function):

- принимает новый прогноз (с авторизацией),
- пишет в Supabase через `service_role`,
- шлёт пост в канал через Bot API `sendMessage`
  (`https://api.telegram.org/bot<TOKEN>/sendMessage`).

Так ты заполняешь одно место → и сайт, и канал обновляются.

---

## 6. О безопасности

- Пароль админки в `config.js` — это ЗАЩИТА ОТ СЛУЧАЙНЫХ ПРАВОК, а НЕ
  настоящая безопасность: любой может открыть код и увидеть его.
- Настоящая защита записи — только через Supabase RLS + бэкенд (п. 3, 5).
- В localStorage-режиме данные только на твоём устройстве — делай бэкапы
  кнопкой «Экспорт JSON».

---

## 7. Контент и юридика

Сайт содержит пометку 18+ и дисклеймер («информационно-аналитический
характер, не призыв, не гарантия»). Не удаляй его — реклама ставок
жёстко регулируется. Не обещай доход и «100% проходимость».
