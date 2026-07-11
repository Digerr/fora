/* =====================================================================
   ФОРА — слой данных (Store)
   Единый асинхронный интерфейс для UI. Переключается между
   localStorage и Supabase одним флагом FORA_CONFIG.useSupabase.
   UI не знает, откуда данные — поэтому миграция безболезненная.

   Формат записи (совпадает с колонками таблицы Supabase):
   { id, sport, league, match, pick, odds, conf, status, date, analysis, vip }
   status ∈ 'upcoming' | 'win' | 'lose'
   ===================================================================== */
(function () {
  const CFG = window.FORA_CONFIG;
  const LS_KEY = "fora_predictions_v2";

  const SEED = [
    {id:'s1',sport:'football',league:'АПЛ · 27 тур',match:'Арсенал — Манчестер Сити',pick:'Тотал больше 2.5',odds:1.85,conf:74,status:'upcoming',date:'2026-07-13T21:00',analysis:'Обе команды в топе по xG, встречаются в открытый футбол. В 7 из 8 последних очных — три и более мяча.',vip:false,
      h2h:[['Арсенал','2024','3:1'],['Манчестер Сити','2024','0:0'],['Арсенал','2023','1:3'],['Манчестер Сити','2023','4:1'],['Арсенал','2023','1:0']],
      formHome:['W','W','D','W','W'], formAway:['W','L','W','W','D'],
      oddsHistory:[1.95, 1.92, 1.88, 1.85, 1.85]},
    {id:'s5',sport:'esports',league:'CS2 · Major',match:'NAVI — Vitality',pick:'Тотал карт больше 2.5',odds:1.95,conf:66,status:'upcoming',date:'2026-07-13T18:00',analysis:'Составы равны по рейтингу, серии между ними стабильно уходят на третью карту.',vip:false,
      h2h:[['NAVI','2025','2:1'],['Vitality','2024','1:2'],['NAVI','2024','2:0'],['Vitality','2024','2:1'],['NAVI','2023','2:1']],
      formHome:['W','W','W','L','W'], formAway:['W','W','D','W','W'],
      oddsHistory:[1.80, 1.85, 1.90, 1.92, 1.95]},
    {id:'s7',sport:'football',league:'Ла Лига · 26 тур',match:'Реал — Барселона',pick:'Победа Реала',odds:2.30,conf:60,status:'upcoming',date:'2026-07-14T22:00',analysis:'Эль-Класико дома, у Барсы кадровые потери в обороне.',vip:true,
      h2h:[['Реал','2024','3:2'],['Барселона','2024','0:4'],['Реал','2023','2:1'],['Барселона','2023','1:2'],['Реал','2023','4:0']],
      formHome:['W','D','W','W','W'], formAway:['W','W','L','D','W'],
      oddsHistory:[2.50, 2.45, 2.40, 2.35, 2.30]},
    {id:'s9',sport:'hockey',league:'НХЛ · регулярка',match:'Тампа-Бэй — Флорида',pick:'Тотал больше 5.5',odds:1.90,conf:64,status:'upcoming',date:'2026-07-13T03:00',analysis:'Дерби Флориды с высоким темпом, обе команды играют на атаку.',vip:false,
      h2h:[['Флорида','2025','4:3'],['Тампа','2024','5:2'],['Флорида','2024','3:2'],['Тампа','2024','4:1'],['Флорида','2023','6:3']],
      formHome:['W','L','W','W','L'], formAway:['W','W','W','L','W'],
      oddsHistory:[1.75, 1.78, 1.82, 1.86, 1.90]},
    {id:'s2',sport:'tennis',league:'Уимблдон · 1/4 финала',match:'Синнер — Алькарас',pick:'Победа Алькараса',odds:2.10,conf:63,status:'win',date:'2026-07-10T16:30',analysis:'Алькарас увереннее на траве в этом сезоне, выиграл два последних очных на быстром покрытии.',vip:false,
      h2h:[['Алькарас','2025','3:1'],['Синнер','2024','3:2'],['Алькарас','2024','3:0'],['Синнер','2023','3:2'],['Алькарас','2023','3:1']],
      formHome:['W','W','W','L','W'], formAway:['W','W','W','W','W'],
      oddsHistory:[2.30, 2.25, 2.20, 2.15, 2.10]},
    {id:'s3',sport:'basketball',league:'NBA · плей-офф',match:'Бостон — Денвер',pick:'Фора Денвера (+5.5)',odds:1.90,conf:58,status:'lose',date:'2026-07-09T04:00',analysis:'Денвер стабильно проигрывает не более 6 очков на выезде, но Бостон поймал кураж дома.',vip:false,
      h2h:[['Бостон','2025','112:104'],['Денвер','2024','115:108'],['Бостон','2024','102:110'],['Денвер','2023','119:115'],['Бостон','2023','108:100']],
      formHome:['W','W','W','W','L'], formAway:['W','L','W','W','W'],
      oddsHistory:[1.75, 1.78, 1.82, 1.86, 1.90]},
    {id:'s4',sport:'hockey',league:'КХЛ · регулярка',match:'ЦСКА — СКА',pick:'Обе забьют — Да',odds:1.72,conf:69,status:'win',date:'2026-07-08T19:30',analysis:'Классическое дерби с высокой результативностью, обе тройки в форме.',vip:false,
      h2h:[['ЦСКА','2025','4:2'],['СКА','2024','3:1'],['ЦСКА','2024','2:3'],['СКА','2024','4:2'],['ЦСКА','2023','5:3']],
      formHome:['W','W','D','W','W'], formAway:['L','W','W','W','D'],
      oddsHistory:[1.80, 1.78, 1.75, 1.73, 1.72]},
    {id:'s6',sport:'mma',league:'UFC 320',match:'Махачев — Оливейра',pick:'Победа Махачева',odds:1.55,conf:81,status:'win',date:'2026-07-06T05:00',analysis:'Доминирующая борьба и контроль. Оливейра уязвим в партере против топ-борца.',vip:false,
      h2h:[['Махачев','2023','SUB R1'],['—','—','—']],
      formHome:['W','W','W','W','W'], formAway:['W','W','L','W','W'],
      oddsHistory:[1.45, 1.48, 1.50, 1.52, 1.55]},
    {id:'s8',sport:'tennis',league:'ATP · полуфинал',match:'Джокович — Медведев',pick:'Тотал геймов меньше 38.5',odds:1.80,conf:71,status:'win',date:'2026-06-28T14:00',analysis:'Оба на подаче играют коротко, ожидаются быстрые тай-брейки.',vip:false,
      h2h:[['Джокович','2024','3:1'],['Медведев','2024','2:3'],['Джокович','2023','3:0'],['Джокович','2023','3:2'],['Медведев','2022','3:2']],
      formHome:['W','W','W','D','W'], formAway:['W','L','W','W','W'],
      oddsHistory:[1.90, 1.88, 1.85, 1.82, 1.80]},
    {id:'s10',sport:'football',league:'Серия A · 25 тур',match:'Интер — Милан',pick:'Обе забьют — Да',odds:1.75,conf:67,status:'lose',date:'2026-06-24T21:45',analysis:'Дерби Милана обычно результативное, но в этот раз сыграли 0:0.',vip:false,
      h2h:[['Интер','2025','2:0'],['Милан','2024','1:3'],['Интер','2024','2:1'],['Милан','2024','1:0'],['Интер','2023','1:1']],
      formHome:['W','D','W','W','D'], formAway:['W','W','L','W','D'],
      oddsHistory:[1.65, 1.68, 1.70, 1.73, 1.75]},
    {id:'s11',sport:'basketball',league:'Евролига',match:'Реал М — Олимпиакос',pick:'Тотал меньше 158.5',odds:1.88,conf:62,status:'win',date:'2026-06-20T22:00',analysis:'Обе команды в плей-оффном режиме играют от обороны.',vip:false,
      h2h:[['Реал М','2025','78:72'],['Олимпиакос','2024','75:80'],['Реал М','2024','82:74'],['Олимпиакос','2024','70:65']],
      formHome:['W','W','D','W','W'], formAway:['W','L','W','W','L'],
      oddsHistory:[1.75, 1.78, 1.82, 1.85, 1.88]},
    {id:'s12',sport:'football',league:'Бундеслига',match:'Бавария — Дортмунд',pick:'Победа Баварии',odds:1.65,conf:73,status:'win',date:'2026-06-15T19:30',analysis:'Дома Бавария не проигрывает Дортмунду последние сезоны.',vip:false,
      h2h:[['Бавария','2025','4:0'],['Дортмунд','2024','0:2'],['Бавария','2024','3:1'],['Бавария','2023','4:2'],['Дортмунд','2023','2:2']],
      formHome:['W','W','W','W','D'], formAway:['W','L','W','D','L'],
      oddsHistory:[1.55, 1.58, 1.60, 1.62, 1.65]},
    {id:'s13',sport:'mma',league:'UFC Fight Night',match:'Анкалаев — Крайли',pick:'Победа Анкалаева Т/О',odds:2.05,conf:59,status:'lose',date:'2026-06-12T05:00',analysis:'Недооценённая выносливость Крайли, бой ушёл в решение.',vip:false,
      h2h:[],
      formHome:['W','W','D','W','W'], formAway:['W','W','W','W','L'],
      oddsHistory:[1.95, 1.98, 2.00, 2.03, 2.05]}
  ];

  function uid(){ return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function normalize(x){
    return {
      id: x.id || uid(),
      sport: x.sport || 'football',
      league: x.league || '',
      match: x.match || '',
      pick: x.pick || '',
      odds: Number(x.odds) || 1,
      conf: Math.max(1, Math.min(100, Number(x.conf) || 50)),
      status: ['win','lose','upcoming'].includes(x.status) ? x.status : 'upcoming',
      date: x.date || new Date().toISOString().slice(0,16),
      analysis: x.analysis || '',
      vip: !!x.vip,
      // optional analytical fields (may be missing on older records)
      h2h: Array.isArray(x.h2h) ? x.h2h : [],
      formHome: Array.isArray(x.formHome) ? x.formHome : [],
      formAway: Array.isArray(x.formAway) ? x.formAway : [],
      oddsHistory: Array.isArray(x.oddsHistory) ? x.oddsHistory : []
    };
  }

  /* ---------- localStorage backend ---------- */
  const local = {
    async list(){
      try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); }
      catch(e){}
      localStorage.setItem(LS_KEY, JSON.stringify(SEED));
      return JSON.parse(JSON.stringify(SEED));
    },
    async _writeAll(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr)); },
    async create(rec){ const arr = await this.list(); const r = normalize(rec); arr.unshift(r); await this._writeAll(arr); return r; },
    async update(id, patch){ const arr = await this.list(); const i = arr.findIndex(x=>x.id===id); if(i<0) throw new Error('not found'); arr[i] = normalize({...arr[i], ...patch, id}); await this._writeAll(arr); return arr[i]; },
    async remove(id){ const arr = await this.list(); await this._writeAll(arr.filter(x=>x.id!==id)); },
    async replaceAll(arr){ const norm = arr.map(normalize); await this._writeAll(norm); return norm; }
  };

  /* ---------- Supabase backend (включается флагом) ----------
     Чтобы заработало:
       1) раскомментируй <script supabase-js> в index.html
       2) заполни supabase.url / anonKey в config.js
       3) useSupabase: true
       4) создай таблицу и RLS по SQL из README.md
  */
  function makeSupabase(){
    const { url, anonKey, table } = CFG.supabase;
    const client = window.supabase.createClient(url, anonKey);
    return {
      _c: client,
      async list(){
        const { data, error } = await client.from(table).select('*').order('date', { ascending:false });
        if (error) throw error;
        return (data||[]).map(normalize);
      },
      async create(rec){
        const r = normalize(rec); delete r.id; // id генерит база
        const { data, error } = await client.from(table).insert(r).select().single();
        if (error) throw error; return normalize(data);
      },
      async update(id, patch){
        const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
        if (error) throw error; return normalize(data);
      },
      async remove(id){
        const { error } = await client.from(table).delete().eq('id', id);
        if (error) throw error;
      },
      async replaceAll(arr){
        // простая массовая замена: очистить + вставить (осторожно!)
        await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const rows = arr.map(x=>{ const r = normalize(x); delete r.id; return r; });
        const { data, error } = await client.from(table).insert(rows).select();
        if (error) throw error; return (data||[]).map(normalize);
      }
    };
  }

  const useSb = CFG.useSupabase && window.supabase && CFG.supabase.url;
  const backend = useSb ? makeSupabase() : local;

  // Публичный API
  window.Store = {
    mode: useSb ? 'supabase' : 'local',
    list:       (...a) => backend.list(...a),
    create:     (...a) => backend.create(...a),
    update:     (...a) => backend.update(...a),
    remove:     (...a) => backend.remove(...a),
    replaceAll: (...a) => backend.replaceAll(...a),
    normalize
  };
})();
