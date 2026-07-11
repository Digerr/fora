/* =====================================================================
   ФОРА — конфигурация
   Всё, что нужно менять при деплое, собрано здесь.
   НИЧЕГО секретного сюда не пиши! Файл публичный.
   Supabase anon key — публичный ключ, это нормально, но доступ
   ограничивается правилами RLS (см. README.md).
   ===================================================================== */
window.FORA_CONFIG = {

  // ——— ХРАНИЛИЩЕ ДАННЫХ ———
  // false — данные в localStorage браузера (режим «просто HTML», работает сразу)
  // true  — данные в Supabase (общие для всех посетителей)
  useSupabase: false,

  supabase: {
    url:     "",   // например https://xxxx.supabase.co
    anonKey: "",   // публичный anon key из Project Settings → API
    table:   "predictions"
  },

  // ——— TELEGRAM ———
  telegram: {
    botUsername: "ForaFTbot",                            // без @ — для рефералок
    miniAppUrl:  "https://fora-woad.vercel.app",         // URL мини-апп (Vercel)
    channelUrl:  "https://t.me/your_channel"             // канал для кнопок и VIP (заполни)
  },

  // ——— АДМИНКА ———
  // ВНИМАНИЕ: это защита «от случайных правок», А НЕ настоящая безопасность.
  // В исходнике хранится только SHA-256 hash пароля (plaintext нигде не светится).
  // Настоящая защита записи делается через Supabase RLS / бота (README).
  admin: {
    // Сменить пароль: echo -n "NEW_PW" | sha256sum → подставь hash сюда.
    defaultPasswordHash: "05ccdcae0f73888efc860500f3f1edcc87248710710c1a0abd422d025f3a2d9f"
  },

  // ——— ФИЧИ ———
  features: {
    vip: true,        // закрытые VIP-прогнозы с CTA в канал
    calculator: true,
    archive: true
  },

  // ——— ВИДЫ СПОРТА ———
  sports: [
    { id:"football",   name:"Футбол",     ico:"⚽" },
    { id:"basketball", name:"Баскетбол", ico:"🏀" },
    { id:"tennis",     name:"Теннис",     ico:"🎾" },
    { id:"hockey",     name:"Хоккей",     ico:"🏒" },
    { id:"mma",        name:"ММА",        ico:"🥊" },
    { id:"esports",    name:"Киберспорт", ico:"🎮" }
  ]
};
