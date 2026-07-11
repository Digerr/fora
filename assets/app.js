/* =====================================================================
   ФОРА — логика интерфейса
   Зависит от window.FORA_CONFIG (config.js) и window.Store (store.js).
   Не знает, где хранятся данные — всё через Store (async).
   ===================================================================== */
(function () {
  const CFG = window.FORA_CONFIG;
  const PW_KEY = 'fora_pw';
  const THEME_KEY = 'fora_theme';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  let DATA = [];          // все прогнозы
  let activeSport = 'all';
  let admin = false;
  let currentScreen = null;
  const screenHistory = [];   // для TG BackButton

  const SPORTS = CFG.sports;
  const sportById = id => SPORTS.find(s=>s.id===id) || {name:id, ico:'🏅'};

  /* ---------- helpers ---------- */
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad2 = n => String(n).padStart(2,'0');
  function fmtDate(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return esc(iso);
    const M=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    return `${d.getDate()} ${M[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  const STLABEL = { upcoming:'Ожидает', win:'Прошёл', lose:'Не зашёл' };

  function toast(msg, isErr){ const t=$('#toast'); t.textContent=msg; t.className='toast show'+(isErr?' err':''); clearTimeout(t._t); t._t=setTimeout(()=>t.className='toast',2600); }

  /* ---------- THEME ---------- */
  function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); try{localStorage.setItem(THEME_KEY,t);}catch(e){} }
  function initTheme(){
    let t; try{ t=localStorage.getItem(THEME_KEY); }catch(e){}
    if(!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark':'light';
    applyTheme(t);
    const toggleTheme = ()=> applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
    ['themeBtn','themeBtn2'].forEach(id=>{ const b=$('#'+id); if(b) b.addEventListener('click', toggleTheme); });
  }

  /* ---------- TELEGRAM MINI APP ---------- */
  function initTelegram(){
    const tg = window.Telegram && window.Telegram.WebApp;
    if(!tg || !tg.initData) return;              // обычный браузер — выходим
    document.body.classList.add('tg');
    try{ tg.ready(); tg.expand(); }catch(e){}
    // тема из телеги
    applyTheme(tg.colorScheme === 'dark' ? 'dark' : 'light');
    tg.onEvent && tg.onEvent('themeChanged', ()=> applyTheme(tg.colorScheme==='dark'?'dark':'light'));
    // реферальный параметр (start_param) — готовая точка для рефералок
    const ref = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if(ref){ try{ localStorage.setItem('fora_ref', ref); }catch(e){}
      // TODO: отправить ref на бэкенд для учёта приглашения
    }
    // BackButton: сначала закрывает модалку/drawer, потом возвращает на предыдущий экран
    tg.BackButton && tg.BackButton.onClick(()=>{
      const overlayOpen = $('#overlay').classList.contains('open');
      const drawerOpen = $('#drawer').classList.contains('on');
      if(overlayOpen){ closeModal(); return; }
      if(drawerOpen){ closeDrawer(); return; }
      goBack();
    });
    window._tg = tg;
  }
  function tgHaptic(type){ try{ window._tg && window._tg.HapticFeedback && window._tg.HapticFeedback.impactOccurred(type||'light'); }catch(e){} }

  /* ---------- SCREEN NAVIGATION (bottom tab bar) ---------- */
  // Карта: hash → screen id (для обратной совместимости со старыми ссылками #today, #guide и т.д.)
  const HASH_TO_SCREEN = {
    '#today':'home', '#top':'home', '#home':'home',
    '#guide':'guide', '#record':'record', '#calc':'calc',
    '#archive':'more', '#column':'more', '#faq':'more',
    '#subscribe':'more', '#more':'more'
  };
  function showScreen(id, pushHistory=true){
    if(!HASH_TO_SCREEN['#'+id] && id!=='home') id='home';
    if(id===currentScreen && pushHistory===false && currentScreen!==null) return;
    $$('.screen').forEach(s=> s.classList.toggle('on', s.dataset.screen===id));
    $$('.tabbar .tab').forEach(t=> t.classList.toggle('on', t.dataset.go===id));
    if(pushHistory && id!==currentScreen) screenHistory.push(id);
    currentScreen = id;
    window.scrollTo({top:0, behavior:'instant' in window ? 'instant':'auto'});
    // обновляем hash без скачка
    const hash = id==='home' ? '#top' : '#'+id;
    if(location.hash !== hash) history.replaceState(null,'',hash);
    // TG BackButton: показываем только если есть куда возвращаться
    const tg = window._tg;
    if(tg && tg.BackButton){
      if(screenHistory.length>1) tg.BackButton.show();
      else tg.BackButton.hide();
    }
    // TG MainButton: на калькуляторе — «копировать», на остальных экранах — скрыть
    if(id==='calc') setupMainButton('calc');
    else setupMainButton('off');
    tgHaptic('light');
  }
  function goBack(){
    if(screenHistory.length>1){
      screenHistory.pop();
      showScreen(screenHistory[screenHistory.length-1], false);
    }
  }

  /* ---------- DRAWER (гамбургер) ---------- */
  function setBurger(on){ ['burger','burger2'].forEach(id=>{ const b=$('#'+id); if(b) b.classList.toggle('on', on); }); }
  function openDrawer(){ $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); setBurger(true); document.body.classList.add('lock'); }
  function closeDrawer(){ $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); setBurger(false); document.body.classList.remove('lock'); }

  /* ---------- STATS ---------- */
  function computeStats(){
    const settled = DATA.filter(p=>p.status==='win'||p.status==='lose');
    const wins = settled.filter(p=>p.status==='win').length;
    const total = settled.length;
    const wr = total? Math.round(wins/total*100):0;
    let profit=0; settled.forEach(p=> profit += p.status==='win' ? (p.odds-1) : -1 );
    const roi = total? (profit/total*100):0;
    const avg = total? (settled.reduce((a,p)=>a+p.odds,0)/total):0;
    // текущая серия (по дате, новые сначала)
    const chrono = settled.slice().sort((a,b)=> new Date(b.date)-new Date(a.date));
    let streak=0, sType=null;
    for(const p of chrono){ if(sType===null){sType=p.status;streak=1;} else if(p.status===sType) streak++; else break; }
    return {wins,total,wr,profit,roi,avg,streak,sType,losses:total-wins};
  }

  function renderStats(){
    const s = computeStats();
    $('#recMeta').textContent = `${s.total} ЗАВЕРШЕНО · ${s.wins}–${s.losses}`;
    const roiCls = s.roi>=0?'pos':'neg', prCls=s.profit>=0?'pos':'neg';
    const strTxt = s.sType? `${s.streak} ${s.sType==='win'?'побед':'неудач'}` : '—';
    // каждая ячейка получает data-target и data-fmt для анимации
    const cells = [
      ['Проходимость', s.wr, v=>Math.round(v)+'<small>%</small>', `${s.wins} из ${s.total}`, ''],
      ['ROI', s.roi, v=>(v>=0?'+':'')+v.toFixed(1)+'<small>%</small>', 'на дистанции', roiCls],
      ['Прибыль', s.profit, v=>(v>=0?'+':'')+v.toFixed(1)+'<small>u</small>', 'в единицах ставки', prCls],
      ['Средний кэф', s.avg, v=>v.toFixed(2), 'по завершённым', ''],
      ['Серия', s.sType? s.streak : 0, v=>Math.round(v)+(s.sType?(' '+s.sType==='win'?'побед':'неудач'):''), strTxt.split(' ').slice(1).join(' ')||'подряд', s.sType==='win'?'pos':(s.sType==='lose'?'neg':'')]
    ];
    $('#recCells').innerHTML = cells.map(([k,v,fmt,sub,cls])=>
      `<div class="cell"><div class="k">${k}</div><div class="v ${cls}" data-target="${v}" data-fmt="${encodeURIComponent(fmt.toString())}">0</div><div class="s">${sub}</div></div>`
    ).join('');
    // анимация count-up
    setTimeout(()=>{
      $$('#recCells .v[data-target]').forEach(el=>{
        const to = +el.dataset.target, fmtRaw = decodeURIComponent(el.dataset.fmt);
        // parse fmt to extract prefix/suffix
        const m = fmtRaw.match(/^(\D*)(\d[\d.]*)(\D+)$/);
        if(!m){ el.textContent = to; return; }
        const [, pre, , suf] = m;
        const dur = 1100, t0 = performance.now();
        function step(t){
          const k = Math.min(1, (t-t0)/dur);
          const e = 1 - Math.pow(1-k, 3);
          const cur = (to*e).toFixed(to%1===0?0:1);
          el.innerHTML = pre + cur + suf;
          if(k<1) requestAnimationFrame(step);
          else {
            // flash effect after settle
            el.classList.add(to>=0 && (el.classList.contains('pos')) ? 'flash-pos' : (el.classList.contains('neg')?'flash-neg':''));
            setTimeout(()=> el.classList.remove('flash-pos','flash-neg'), 800);
          }
        }
        requestAnimationFrame(step);
      });
    }, 60);
  }

  function renderTrend(){
    const settled = DATA.filter(p=>p.status==='win'||p.status==='lose')
      .sort((a,b)=> new Date(a.date)-new Date(b.date)).slice(-10);
    const box = $('#trendBox');
    if(!settled.length){ box.innerHTML=''; return; }
    box.innerHTML = `<div class="th">Форма — последние ${settled.length}</div><div class="dots">`+
      settled.map(p=>`<span class="tr-sq ${p.status}" title="${esc(p.match)}">${p.status==='win'?'W':'L'}</span>`).join('')+`</div>`;
  }

  function renderBreakdown(){
    const rows = SPORTS.map(sp=>{
      const list = DATA.filter(p=>p.sport===sp.id);
      const settled = list.filter(p=>p.status==='win'||p.status==='lose');
      const wins = settled.filter(p=>p.status==='win').length;
      const wr = settled.length? Math.round(wins/settled.length*100):0;
      return {sp, count:list.length, settled:settled.length, wr};
    }).filter(r=>r.count>0).sort((a,b)=>b.count-a.count);
    $('#breakdown').innerHTML = rows.map(r=>`<tr>
      <td><span class="em">${r.sp.ico}</span>${esc(r.sp.name)}</td>
      <td>${r.count}</td><td>${r.settled}</td>
      <td>${r.settled? r.wr+'%':'—'}${r.settled?`<span class="wrbar"><i style="width:${r.wr}%"></i></span>`:''}</td></tr>`).join('')
      || `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint)">Нет данных</td></tr>`;
  }

  /* ---------- FEATURE (прогноз дня) ---------- */
  function renderFeature(){
    const up = DATA.filter(p=>p.status==='upcoming' && !(CFG.features.vip && p.vip));
    const pick = up.slice().sort((a,b)=> b.conf-a.conf || new Date(a.date)-new Date(b.date))[0];
    const wrap = $('#featureWrap');
    if(!pick){ wrap.innerHTML = `<div class="empty">Нет ближайших прогнозов — загляни позже.</div>`; return; }
    const sp = sportById(pick.sport);
    wrap.innerHTML = `<div class="feature">
      <div class="f-main">
        <div class="f-kick"><span class="em">${sp.ico}</span>${esc(sp.name)}<span>·</span>${esc(pick.league)}</div>
        <div class="f-ttl" data-open="${pick.id}">${esc(pick.match)}</div>
        <div class="f-pick"><span class="pl">Ставка</span><span class="pv">${esc(pick.pick)}</span></div>
        <p class="f-note">${esc(pick.analysis)}</p>
      </div>
      <div class="f-side">
        <div class="fs-odds"><div class="k">Кэф</div><div class="v">${pick.odds.toFixed(2)}</div></div>
        ${segBar(pick.conf)}
        <div class="fdate">◷ ${fmtDate(pick.date)}</div>
        <button class="mini" data-open="${pick.id}" style="align-self:flex-start">Разбор →</button>
      </div>
    </div>`;
  }

  function segBar(conf){
    // circular ring — tiered color by confidence level
    const tier = conf>=85?'top':conf>=70?'high':conf>=50?'mid':'low';
    const r = 26, c = 2*Math.PI*r, off = c * (1 - conf/100);
    return `<div class="ring-wrap"><div class="ring ${tier}">
      <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="${r}"/>
      <circle class="fg" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}"/></svg>
      <div class="pct" data-target="${conf}">0<small>%</small></div>
    </div><div class="lbl">Уверенность</div></div>`;
  }
  // анимация счёта для circular meter и любых чисел
  function animateNum(el, to, opts={}){
    const dur = opts.dur||1000, fmt = opts.fmt||(v=>Math.round(v));
    const small = opts.small?'<small>'+(opts.small===true?'':opts.small)+'</small>':'';
    const t0 = performance.now();
    function step(t){
      const k = Math.min(1, (t-t0)/dur);
      const e = 1 - Math.pow(1-k, 3); // easeOutCubic
      el.innerHTML = fmt(to*e) + small;
      if(k<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  // После рендера — анимируем все .pct[data-target] и stroke-dashoffset
  function animateRings(){
    $$('.ring').forEach(ring=>{
      const pct = $('.pct', ring), fg = $('.fg', ring);
      if(!pct || !fg) return;
      const target = +pct.dataset.target;
      const c = +fg.getAttribute('stroke-dasharray');
      // start full offset (empty), animate to final
      fg.style.strokeDashoffset = c;
      requestAnimationFrame(()=>{ fg.style.strokeDashoffset = (c * (1 - target/100)).toFixed(2); });
      animateNum(pct, target, { small: true });
    });
  }

  /* ---------- TICKER ---------- */
  function renderTicker(){
    const up = DATA.filter(p=>p.status==='upcoming').slice(0,8);
    const src = up.length?up:DATA.slice(0,8);
    if(!src.length){ $('#ticker').innerHTML=''; return; }
    const one = src.map(p=>{ const sp=sportById(p.sport);
      return `<span class="it"><span>${sp.ico}</span><span>${esc(p.match)}</span><span class="sep">—</span><span>${esc(p.pick)}</span><span class="o">${p.odds.toFixed(2)}</span></span>`;
    }).join('<span class="sep">•</span>');
    $('#ticker').innerHTML = one + '<span class="sep">•</span>' + one;
  }

  /* ---------- TABS ---------- */
  function renderTabs(){
    const counts = {}; DATA.forEach(p=> counts[p.sport]=(counts[p.sport]||0)+1);
    const tabs = [{id:'all',name:'Все',ico:'◈'}].concat(SPORTS.filter(s=>counts[s.id]));
    $('#sportTabs').innerHTML = tabs.map(t=>`<button class="tab ${t.id===activeSport?'on':''}" data-sport="${t.id}">${t.ico?t.ico+' ':''}${esc(t.name)}${t.id!=='all'?` ${counts[t.id]}`:''}</button>`).join('');
  }

  /* ---------- GUIDE ---------- */
  function currentList(){
    let list = DATA.slice();
    if(activeSport!=='all') list = list.filter(p=>p.sport===activeSport);
    const q = $('#searchInput').value.trim().toLowerCase();
    if(q) list = list.filter(p=> (p.match+' '+p.pick+' '+p.league).toLowerCase().includes(q));
    const sf = $('#statusFilter').value;
    if(sf!=='all') list = list.filter(p=>p.status===sf);
    const sb = $('#sortBy').value;
    if(sb==='conf') list.sort((a,b)=>b.conf-a.conf);
    else if(sb==='odds') list.sort((a,b)=>b.odds-a.odds);
    else list.sort((a,b)=> new Date(b.date)-new Date(a.date));
    return list;
  }

  function renderGuide(){
    const list = currentList();
    $('#countPill').textContent = list.length;
    const box = $('#guideList');
    if(!list.length){ box.innerHTML = `<div class="empty">Ничего не найдено. Попробуй сменить фильтр.</div>`; return; }
    box.innerHTML = list.map((p,i)=>{
      const sp=sportById(p.sport);
      const locked = CFG.features.vip && p.vip && !admin;
      const stamp = `<span class="stamp ${p.status}">${p.status==='upcoming'?'<span class="d"></span>':''}${STLABEL[p.status]}</span>`;
      return `<article class="entry stripe-${p.status} ${locked?'locked':''}">
        <div class="idx">${pad2(i+1)}</div>
        <div class="body">
          <div class="kick"><span class="em">${sp.ico}</span>${esc(sp.name)}<span>·</span>${esc(p.league)}${p.vip?'<span class="viptag">VIP</span>':''}</div>
          <div class="ttl" data-open="${p.id}">${esc(p.match)}</div>
          <div class="pickline"><span class="pl">Ставка</span><span class="pv">${esc(p.pick)}</span></div>
          ${locked? `<a class="viplock" href="${esc(CFG.telegram.channelUrl)}" target="_blank" rel="noopener">🔒 Открыть в Telegram-канале</a>`
                   : `<p class="note">${esc(p.analysis)}</p>`}
          <div class="foot">
            <span>◷ ${fmtDate(p.date)}</span>
            <a class="lnk" data-open="${p.id}">Разбор →</a>
            <span class="admin-only">
              <button class="mini" data-edit="${p.id}">Ред.</button>
              <button class="mini" data-post="${p.id}">Пост</button>
              <button class="mini dngr" data-del="${p.id}">✕</button>
            </span>
          </div>
        </div>
        <div class="rail">
          ${stamp}
          <div class="odds-b"><div class="k">Кэф</div><div class="v">${p.odds.toFixed(2)}</div></div>
          ${segBar(p.conf)}
        </div>
      </article>`;
    }).join('');
  }

  /* ---------- ARCHIVE ---------- */
  function renderArchive(){
    if(!CFG.features.archive){ return; }
    const settled = DATA.filter(p=>p.status==='win'||p.status==='lose');
    const groups = {};
    settled.forEach(p=>{ const d=new Date(p.date); const key = isNaN(d)?'0000-00':`${d.getFullYear()}-${pad2(d.getMonth()+1)}`; (groups[key]=groups[key]||[]).push(p); });
    const keys = Object.keys(groups).sort().reverse();
    const MN=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    const box=$('#archiveList');
    if(!keys.length){ box.innerHTML = `<div class="empty">Архив пуст — завершённых прогнозов пока нет.</div>`; return; }
    box.innerHTML = keys.map((k,idx)=>{
      const arr = groups[k].sort((a,b)=> new Date(b.date)-new Date(a.date));
      const wins = arr.filter(p=>p.status==='win').length;
      const wr = Math.round(wins/arr.length*100);
      let profit=0; arr.forEach(p=> profit += p.status==='win'?(p.odds-1):-1);
      const [y,m]=k.split('-');
      const title = k==='0000-00'?'Без даты':`${MN[+m-1]} ${y}`;
      return `<details class="mo" ${idx===0?'open':''}>
        <summary>
          <span class="mo-t">${title}</span>
          <span class="mo-stats"><span>${arr.length} прогн.</span><span><b>${wins}–${arr.length-wins}</b></span><span>WR <b>${wr}%</b></span><span class="${profit>=0?'pos':'neg'}">P/L <b>${profit>=0?'+':''}${profit.toFixed(1)}u</b></span><span class="pm">+</span></span>
        </summary>
        <div class="mo-body">${arr.map(p=>`<div class="mo-line"><span class="mm" data-open="${p.id}" style="cursor:pointer">${esc(p.match)} — ${esc(p.pick)}</span><span class="oo">${p.odds.toFixed(2)}</span><span class="st ${p.status}">${STLABEL[p.status]}</span></div>`).join('')}</div>
      </details>`;
    }).join('');
  }

  /* ---------- CALCULATOR ---------- */
  function renderCalc(){
    if(!CFG.features.calculator) return;
    const bank = Math.max(0, +$('#c_bank').value||0);
    const risk = Math.max(0, +$('#c_risk').value||0);
    const odds = Math.max(1.01, +$('#c_odds').value||1.01);
    const prob = Math.min(99, Math.max(1, +$('#c_prob').value||1))/100;
    const flat = bank*risk/100;
    const b = odds-1;
    let kelly = (b*prob-(1-prob))/b;
    const kellyFrac = Math.max(0, kelly);
    const kellyHalf = kellyFrac/2;
    const kellyStake = bank*kellyHalf;
    const ev = (prob*odds-1)*100;
    $('#calcOut').innerHTML = `
      <div class="co-row"><span class="l">Флэт (${risk}%)</span><span class="v">${Math.round(flat).toLocaleString('ru')}</span></div>
      <div class="co-row"><span class="l">Келли ½</span><span class="v">${kellyFrac>0?Math.round(kellyStake).toLocaleString('ru'):'0'} <small>(${(kellyHalf*100).toFixed(1)}%)</small></span></div>
      <div class="co-row"><span class="l">Ожид. ценность</span><span class="v ${ev>=0?'pos':'neg'}">${ev>=0?'+':''}${ev.toFixed(1)}<small>%</small></span></div>
      <div class="co-note">${ev>=0? 'Положительное матожидание: ставка имеет ценность на дистанции.' : 'Отрицательное матожидание — при такой оценке вероятности ставка невыгодна.'} Келли показан в половинном размере — так безопаснее.</div>`;
  }

  /* ---------- RENDER ALL ---------- */
  function renderAll(){ renderTicker(); renderTabs(); renderGuide(); renderStats(); renderTrend(); renderBreakdown(); renderFeature(); renderArchive(); renderCharts(); setTimeout(animateRings, 30); }

  /* ---------- SKELETONS (показываем пока данные грузятся) ---------- */
  function showSkeletons(){
    const box = $('#guideList');
    if(!box) return;
    box.innerHTML = Array.from({length:4},()=>`<div class="skel-card">
      <div class="skel-block skel-idx"></div>
      <div class="skel-lines">
        <div class="skel-block"></div>
        <div class="skel-block"></div>
        <div class="skel-block"></div>
        <div class="skel-block"></div>
      </div>
    </div>`).join('');
    const fw = $('#featureWrap');
    if(fw) fw.innerHTML = `<div class="skel-card" style="grid-template-columns:1fr;gap:14px;padding:22px 0">
      <div class="skel-block" style="width:30%;height:11px"></div>
      <div class="skel-block" style="width:80%;height:28px"></div>
      <div class="skel-block" style="width:55%;height:16px"></div>
      <div class="skel-block" style="width:90%;height:14px"></div>
      <div class="skel-block" style="width:75%;height:14px"></div>
    </div>`;
  }

  /* ---------- PULL-TO-REFRESH ---------- */
  let pullState = { y:0, active:false, refreshing:false };
  function initPullToRefresh(){
    const ind = $('#pullIndicator'); if(!ind) return;
    const THRESHOLD = 70;
    let startY = 0;
    document.addEventListener('touchstart', e=>{
      if(window.scrollY > 0 || pullState.refreshing) return;
      startY = e.touches[0].clientY;
      pullState.y = 0;
    }, { passive:true });
    document.addEventListener('touchmove', e=>{
      if(startY<=0 || pullState.refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if(dy <= 0){ ind.classList.remove('show','active'); return; }
      // сопротивление
      pullState.y = dy * 0.5;
      if(pullState.y > 5){
        ind.classList.add('show');
        $('.pi-text', ind).textContent = pullState.y >= THRESHOLD ? 'Отпустите для обновления' : 'Потяните, чтобы обновить';
        if(pullState.y >= THRESHOLD) ind.classList.add('active'); else ind.classList.remove('active');
        ind.style.transform = `translateX(-50%) translateY(${Math.min(pullState.y, 80)}px)`;
      }
    }, { passive:true });
    document.addEventListener('touchend', async ()=>{
      if(pullState.y >= THRESHOLD && !pullState.refreshing){
        pullState.refreshing = true;
        ind.classList.add('spinning');
        $('.pi-text', ind).textContent = 'Обновление…';
        ind.style.transform = '';
        try { DATA = await window.Store.list(); renderAll(); tgHaptic('medium'); }
        catch(e){ toast('Не удалось обновить', true); }
        finally {
          setTimeout(()=>{
            ind.classList.remove('spinning','active','show');
            pullState.refreshing = false;
            pullState.y = 0;
            startY = 0;
          }, 400);
        }
      } else {
        ind.classList.remove('active','show');
        ind.style.transform = '';
        pullState.y = 0;
        startY = 0;
      }
    }, { passive:true });
  }

  /* ---------- ONBOARDING (3 swipe-карточки) ---------- */
  const ONBOARD_KEY = 'fora_onboarded_v1';
  function showOnboarding(){
    if(localStorage.getItem(ONBOARD_KEY)==='1') return;
    const ob = $('#onboard'); if(!ob) return;
    const slides = [
      { ico:'Ф', t:'Не угадываем.<br><span class="u">Считаем.</span>', p:'Каждый матч разбираем по форме, очным встречам и движению линий. Прогноз — это цифры, а не чутьё.' },
      { ico:'%', t:'Честная статистика,<br>даже <span class="u">проигрыши</span>', p:'Турнирная запись обновляется автоматически. Мы не прячем минусы — на дистанции важен ROI, а не отдельный матч.' },
      { ico:'▶', t:'Жми на «Лента» —<br>там <span class="u">прогноз дня</span>', p:'Главный выбор редакции с лучшим соотношением уверенности и ценности. По тапу на карточку — полный разбор с H2H и формой.' }
    ];
    let idx = 0;
    ob.innerHTML = `<button class="onboard-skip" id="obSkip">Пропустить</button>
      ${slides.map((s,i)=>`<div class="onboard-slide ${i===0?'on':''}" data-i="${i}">
        <div class="onboard-ico">${s.ico}</div>
        <h2 class="serif">${s.t}</h2>
        <p>${s.p}</p>
      </div>`).join('')}
      <div class="onboard-dots">${slides.map((_,i)=>`<span class="d ${i===0?'on':''}" data-i="${i}"></span>`).join('')}</div>
      <div class="onboard-actions">
        <button class="onboard-btn" id="obNext">${idx<slides.length-1?'Далее':'Готово'}</button>
      </div>`;
    ob.classList.add('show');
    document.body.classList.add('lock');
    function setI(n){
      idx = (n + slides.length) % slides.length;
      $$('.onboard-slide', ob).forEach(s=> s.classList.toggle('on', +s.dataset.i===idx));
      $$('.onboard-dots .d', ob).forEach(d=> d.classList.toggle('on', +d.dataset.i===idx));
      $('#obNext', ob).textContent = idx<slides.length-1?'Далее':'Готово';
    }
    function finish(){ ob.classList.remove('show'); document.body.classList.remove('lock'); localStorage.setItem(ONBOARD_KEY, '1'); }
    $('#obSkip', ob).onclick = finish;
    $('#obNext', ob).onclick = ()=> idx<slides.length-1 ? setI(idx+1) : finish();
    $$('.onboard-dots .d', ob).forEach(d=> d.onclick = ()=> setI(+d.dataset.i));
    // swipe
    let sx=0;
    ob.addEventListener('touchstart', e=> sx = e.touches[0].clientX, { passive:true });
    ob.addEventListener('touchend', e=>{
      const dx = e.changedTouches[0].clientX - sx;
      if(Math.abs(dx) > 50) setI(idx + (dx<0?1:-1));
    }, { passive:true });
  }

  /* ---------- MATCH DETAIL: H2H / FORM / ODDS SPARK ---------- */
  function sparkline(values, w=240, h=50){
    if(!values || values.length<2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const step = w / (values.length - 1);
    const pts = values.map((v,i)=>`${(i*step).toFixed(1)},${(h - ((v-min)/range)*h*0.8 - h*0.1).toFixed(1)}`).join(' ');
    const up = values[values.length-1] > values[0];
    const col = up ? 'var(--red)' : 'var(--green)';
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${w}" cy="${(h - ((values[values.length-1]-min)/range)*h*0.8 - h*0.1).toFixed(1)}" r="3" fill="${col}"/>
    </svg>`;
  }
  function renderH2H(p){
    if(!p.h2h || !p.h2h.length) return '';
    const teams = p.match.split(' — ');
    const rows = p.h2h.map(r=>{
      const [who, yr, sc] = r;
      const isHome = who === teams[0];
      const isAway = who === teams[1];
      const cls = (isHome || isAway) ? 'win' : '';
      return `<div class="h2h-row ${cls}"><span class="who">${esc(who)}</span><span class="yr">${esc(yr)}</span><span class="sc">${esc(sc)}</span></div>`;
    }).join('');
    return `<div class="dt-h2h"><div class="h">Очные встречи</div><div class="h2h-list">${rows}</div></div>`;
  }
  function renderForm(p){
    if((!p.formHome || !p.formHome.length) && (!p.formAway || !p.formAway.length)) return '';
    const teams = p.match.split(' — ');
    const dots = arr => (arr||[]).map(d=>`<span class="fd ${d}">${d}</span>`).join('');
    return `<div class="dt-form">
      <div class="side"><div class="h">${esc(teams[0]||'Хозяева')}</div><div class="dots">${dots(p.formHome)}</div></div>
      <div class="side"><div class="h">${esc(teams[1]||'Гости')}</div><div class="dots">${dots(p.formAway)}</div></div>
    </div>`;
  }
  function renderOdds(p){
    if(!p.oddsHistory || p.oddsHistory.length<2) return '';
    const first = p.oddsHistory[0], last = p.oddsHistory[p.oddsHistory.length-1];
    const diff = last - first;
    const trend = diff > 0 ? `<span class="trend up">▲ ${diff.toFixed(2)}</span>` : diff < 0 ? `<span class="trend dn">▼ ${Math.abs(diff).toFixed(2)}</span>` : `<span class="trend">—</span>`;
    return `<div class="dt-odds"><div class="h"><span>Движение кэфа</span>${trend}</div>
      ${sparkline(p.oddsHistory)}
      <div class="odds-labels"><span>${first.toFixed(2)}</span><span>${last.toFixed(2)}</span></div></div>`;
  }

  /* ---------- MODAL ---------- */
  function openModal(html){ $('#modal').innerHTML=html; $('#overlay').classList.add('open'); document.body.classList.add('lock'); window._tg&&window._tg.BackButton&&window._tg.BackButton.show(); }
  function closeModal(){ $('#overlay').classList.remove('open'); if(!$('#drawer').classList.contains('on')) document.body.classList.remove('lock'); window._tg&&window._tg.BackButton&&window._tg.BackButton.hide(); setupMainButton('off'); }

  function openDetail(id){
    const p = DATA.find(x=>x.id===id); if(!p) return;
    if(CFG.features.vip && p.vip && !admin){ window.open(CFG.telegram.channelUrl,'_blank'); return; }
    const sp=sportById(p.sport);
    openModal(`<div class="mh"><h3>Разбор прогноза</h3><button data-close>✕</button></div>
      <div class="mb detail">
        <div class="dt-kick"><span>${sp.ico} ${esc(sp.name)}</span><span>·</span><span>${esc(p.league)}</span><span class="stamp ${p.status}" style="transform:none">${STLABEL[p.status]}</span></div>
        <div class="dt-ttl">${esc(p.match)}</div>
        <div class="dt-grid">
          <div><div class="k">Ставка</div><div class="v" style="font-size:17px;font-family:var(--serif)">${esc(p.pick)}</div></div>
          <div><div class="k">Кэф</div><div class="v">${p.odds.toFixed(2)}</div></div>
          <div><div class="k">Уверенность</div><div class="v">${p.conf}%</div></div>
        </div>
        <p>${esc(p.analysis)||'Подробный разбор появится позже.'}</p>
        ${renderH2H(p)}
        ${renderForm(p)}
        ${renderOdds(p)}
        <div class="foot" style="margin-top:18px;font-family:var(--mono);font-size:12px;color:var(--ink-faint)">◷ ${fmtDate(p.date)}</div>
      </div>
      <div class="mf"><button class="mbtn" data-share="${p.id}">↗ Поделиться</button><button class="mbtn pri" data-close>Готово</button></div>`);
    // TG MainButton — «Поделиться»
    setupMainButton('share', p.id);
  }

  /* ---------- CHARTS на экране «Запись» ---------- */
  function renderCharts(){
    const settled = DATA.filter(p=>p.status==='win'||p.status==='lose');
    if(!settled.length){
      const wrap = $('#chartsWrap');
      if(wrap) wrap.innerHTML = `<div class="chart-empty">Графики появятся, когда будут завершённые прогнозы.</div>`;
      return;
    }
    // 1. ROI по неделям (кумулятивно)
    const chrono = settled.slice().sort((a,b)=> new Date(a.date)-new Date(b.date));
    let cum = 0;
    const points = chrono.map(p=>{ cum += p.status==='win' ? (p.odds-1) : -1; return cum; });
    // группируем по неделям (последняя точка каждой недели)
    const byWeek = {};
    chrono.forEach((p,i)=>{ const d = new Date(p.date); const w = getWeekKey(d); byWeek[w] = points[i]; });
    const weeks = Object.keys(byWeek).sort();
    const weekVals = weeks.map(w=>byWeek[w]);
    // 2. Donut по видам спорта
    const sportCount = {};
    settled.forEach(p=>{ sportCount[p.sport] = (sportCount[p.sport]||0)+1; });
    const sportEntries = Object.entries(sportCount).sort((a,b)=>b[1]-a[1]);
    const colors = ['#CE3B22','#2E7648','#2B4E86','#D4A017','#8B5CF6','#0891B2'];
    const total = sportEntries.reduce((s,[,n])=>s+n,0);

    const wrap = $('#chartsWrap');
    if(!wrap) return;
    wrap.innerHTML = `
      <div class="chart-block">
        <div class="ch-h">Cumulative profit</div>
        <div class="ch-sub">Прибыль по неделям, единиц</div>
        ${weekVals.length>1 ? sparkline(weekVals, 360, 80) : `<div class="chart-empty">Нужно больше данных (пока ${weekVals.length} неделя)</div>`}
      </div>
      <div class="chart-block">
        <div class="ch-h">Sport breakdown</div>
        <div class="ch-sub">Распределение по видам спорта</div>
        ${donutChart(sportEntries, total, colors)}
        <div class="chart-legend">${sportEntries.map(([id,n],i)=>{
          const sp = sportById(id);
          return `<span class="lg"><span class="sw" style="background:${colors[i%colors.length]}"></span>${sp.ico} ${esc(sp.name)} (${n})</span>`;
        }).join('')}</div>
      </div>`;
  }
  function getWeekKey(d){
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = dt.getUTCDay()||7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
    const weekNo = Math.ceil(((dt - yearStart)/86400000 + 1)/7);
    return `${dt.getUTCFullYear()}-${weekNo}`;
  }
  function donutChart(entries, total, colors){
    if(!entries.length) return '';
    const r=50, r2=32, cx=60, cy=60;
    let acc = 0;
    const segs = entries.map(([id,n],i)=>{
      const start = acc/total*Math.PI*2 - Math.PI/2;
      acc += n;
      const end = acc/total*Math.PI*2 - Math.PI/2;
      const large = (end-start) > Math.PI ? 1 : 0;
      const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
      const x2 = cx + r*Math.cos(end), y2 = cy + r*Math.sin(end);
      const x3 = cx + r2*Math.cos(end), y3 = cy + r2*Math.sin(end);
      const x4 = cx + r2*Math.cos(start), y4 = cy + r2*Math.sin(start);
      return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r2} ${r2} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${colors[i%colors.length]}"/>`;
    }).join('');
    return `<svg class="ch-svg" viewBox="0 0 120 120" style="max-width:200px;margin:0 auto;display:block">${segs}<text x="60" y="64" text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="700" fill="var(--ink)">${total}</text><text x="60" y="78" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8" fill="var(--ink-soft)" letter-spacing="1">ВСЕГО</text></svg>`;
  }

  /* ---------- TG MAIN BUTTON ---------- */
  function setupMainButton(mode, payload){
    const tg = window._tg; if(!tg || !tg.MainButton) return;
    try{
      if(mode==='share' && payload){
        tg.MainButton.setText('↗ ПОДЕЛИТЬСЯ ПРОГНОЗОМ');
        tg.MainButton.show();
        tg.MainButton.onClick(()=> sharePost(payload));
      } else if(mode==='calc'){
        tg.MainButton.setText('СКОПИРОВАТЬ СТАВКУ');
        tg.MainButton.show();
        tg.MainButton.onClick(()=> copyCalc());
      } else {
        tg.MainButton.hide();
      }
    }catch(e){}
  }
  function copyCalc(){
    const flat = $('#calcOut .co-row:first-child .v')?.textContent || '';
    const kelly = $('#calcOut .co-row:nth-child(2) .v')?.textContent || '';
    const txt = `Флэт: ${flat}\nКелли ½: ${kelly}`;
    if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
    toast('Скопировано');
  }

  /* ---------- POST текст для канала ---------- */
  function buildPost(p){
    const sp=sportById(p.sport);
    const st = p.status==='win'?'✅ ПРОШЁЛ':p.status==='lose'?'❌ НЕ ЗАШЁЛ':'⏳ ОЖИДАЕТ';
    return `${sp.ico} ${sp.name.toUpperCase()} | ${p.league}\n`+
      `🏟 ФОРА — прогноз дня\n\n`+
      `${p.match}\nСтавка: ${p.pick}\nКэф: ${p.odds.toFixed(2)} | Уверенность: ${p.conf}%\n`+
      (p.status==='upcoming'?`Начало: ${fmtDate(p.date)}\n`:`Статус: ${st}\n`)+
      `\n${p.analysis||''}\n\n——\nАналитика, не лотерея · 18+`;
  }
  function sharePost(id){
    const p = DATA.find(x=>x.id===id); if(!p) return;
    const sp=sportById(p.sport);
    const text = buildPost(p);
    const tg = window._tg;
    // deep link на mini app с этим прогнозом
    const botUser = CFG.telegram.botUsername || 'ForaFTbot';
    const shareUrl = `https://t.me/${botUser}/app?startapp=p_${p.id}`;
    const shareText = `${sp.ico} ${p.match}\nСтавка: ${p.pick} @ ${p.odds.toFixed(2)}\n\nОткрой разбор в ФОРА:`;
    // 1. Web Share API (на мобильных открывает системный шаринг)
    if(navigator.share){
      navigator.share({ title:'ФОРА — прогноз', text: shareText, url: shareUrl })
        .then(()=> tgHaptic('medium'))
        .catch(()=>{ /* пользователь отменил — не показываем ошибку */ });
      return;
    }
    // 2. Telegram Mini App share sheet (если внутри TG)
    if(tg && tg.openTelegramLink){
      // копируем полный пост в буфер
      if(navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
      const u = 'https://t.me/share/url?url='+encodeURIComponent(shareUrl)+'&text='+encodeURIComponent(shareText);
      tg.openTelegramLink(u);
      toast('Текст поста скопирован');
      return;
    }
    // 3. Fallback: открыть TG share в новой вкладке
    if(navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
    window.open('https://t.me/share/url?url='+encodeURIComponent(shareUrl)+'&text='+encodeURIComponent(shareText),'_blank');
    toast('Текст поста скопирован');
  }

  /* ---------- ADMIN ---------- */
  // Храним и сравниваем пароль только в виде SHA-256 hash.
  // В config.js лежит defaultPasswordHash; в localStorage — hash пользовательского пароля.
  async function sha256(s){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function getPwHash(){ try{ return localStorage.getItem(PW_KEY)||CFG.admin.defaultPasswordHash; }catch(e){ return CFG.admin.defaultPasswordHash; } }
  function setAdmin(on){ admin=on; document.body.classList.toggle('admin',on); renderAll(); }

  function openLogin(){
    openModal(`<div class="mh"><h3>Вход в панель</h3><button data-close>✕</button></div>
      <div class="mb"><div class="field"><label>Пароль</label><input type="password" id="pwInput" autofocus></div>
      <div class="pwnote">Защита от случайных правок. Настоящая безопасность — через Supabase RLS (см. README).</div></div>
      <div class="mf"><button class="mbtn" data-close>Отмена</button><button class="mbtn pri" id="pwGo">Войти</button></div>`);
    const go=async()=>{ const h=await sha256($('#pwInput').value); if(h===getPwHash()){ setAdmin(true); closeModal(); toast('Режим редактора включён'); openPanel(); } else toast('Неверный пароль',true); };
    $('#pwGo').onclick=go; $('#pwInput').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
  }

  function openPanel(){
    openModal(`<div class="mh"><h3>Панель управления <span class="badge">${window.Store.mode}</span></h3><button data-close>✕</button></div>
      <div class="mb">
        <div class="tools">
          <button class="mbtn pri" id="pAdd">+ Новый прогноз</button>
          <button class="mbtn" id="pExport">Экспорт JSON</button>
          <button class="mbtn" id="pImport">Импорт JSON</button>
          <button class="mbtn" id="pPw">Сменить пароль</button>
          <button class="mbtn" id="pOut">Выйти</button>
        </div>
        <div class="hint">Прогнозов в базе: <b>${DATA.length}</b>. Редактирование — кнопками «Ред.» / «Пост» / «✕» в ленте.<br>Режим хранилища: <b>${window.Store.mode==='supabase'?'Supabase (общая база)':'localStorage (только этот браузер)'}</b>.</div>
        <input type="file" id="impFile" accept="application/json" hidden>
      </div>`);
    $('#pAdd').onclick=()=>openForm();
    $('#pExport').onclick=exportData;
    $('#pImport').onclick=()=>$('#impFile').click();
    $('#impFile').onchange=importData;
    $('#pPw').onclick=changePw;
    $('#pOut').onclick=()=>{ setAdmin(false); closeModal(); toast('Вышли из режима редактора'); };
  }

  function openForm(id){
    const p = id? DATA.find(x=>x.id===id) : {sport:'football',odds:1.85,conf:60,status:'upcoming',date:new Date().toISOString().slice(0,16),vip:false,league:'',match:'',pick:'',analysis:''};
    openModal(`<div class="mh"><h3>${id?'Редактировать':'Новый'} прогноз</h3><button data-close>✕</button></div>
      <div class="mb">
        <div class="row2">
          <div class="field"><label>Вид спорта</label><select id="f_sport">${SPORTS.map(s=>`<option value="${s.id}" ${p.sport===s.id?'selected':''}>${s.ico} ${s.name}</option>`).join('')}</select></div>
          <div class="field"><label>Лига / турнир</label><input id="f_league" value="${esc(p.league)}" placeholder="АПЛ · 27 тур"></div>
        </div>
        <div class="field"><label>Матч</label><input id="f_match" value="${esc(p.match)}" placeholder="Команда 1 — Команда 2"></div>
        <div class="field"><label>Ставка / исход</label><input id="f_pick" value="${esc(p.pick)}" placeholder="Тотал больше 2.5"></div>
        <div class="row3">
          <div class="field"><label>Кэф</label><input id="f_odds" type="number" step="0.01" min="1.01" value="${p.odds}"></div>
          <div class="field"><label>Уверенность %</label><input id="f_conf" type="number" min="1" max="100" value="${p.conf}"></div>
          <div class="field"><label>Статус</label><select id="f_status"><option value="upcoming" ${p.status==='upcoming'?'selected':''}>Ожидает</option><option value="win" ${p.status==='win'?'selected':''}>Прошёл</option><option value="lose" ${p.status==='lose'?'selected':''}>Не зашёл</option></select></div>
        </div>
        <div class="row2">
          <div class="field"><label>Дата и время</label><input id="f_date" type="datetime-local" value="${esc(p.date)}"></div>
          <div class="field check" style="align-self:end"><input type="checkbox" id="f_vip" ${p.vip?'checked':''}><label for="f_vip">VIP (закрытый, CTA в канал)</label></div>
        </div>
        <div class="field"><label>Разбор / аналитика</label><textarea id="f_analysis" placeholder="Почему эта ставка…">${esc(p.analysis)}</textarea></div>
      </div>
      <div class="mf"><button class="mbtn" data-close>Отмена</button><button class="mbtn pri" id="fSave">Сохранить</button></div>`);
    $('#fSave').onclick=()=>saveForm(id);
  }

  async function saveForm(id){
    const rec = {
      sport:$('#f_sport').value, league:$('#f_league').value.trim(), match:$('#f_match').value.trim(),
      pick:$('#f_pick').value.trim(), odds:+$('#f_odds').value, conf:+$('#f_conf').value,
      status:$('#f_status').value, date:$('#f_date').value, vip:$('#f_vip').checked, analysis:$('#f_analysis').value.trim()
    };
    if(!rec.match||!rec.pick){ toast('Заполни матч и ставку',true); return; }
    try{
      if(id){ const u=await window.Store.update(id,rec); const i=DATA.findIndex(x=>x.id===id); DATA[i]=u; }
      else { const c=await window.Store.create(rec); DATA.unshift(c); }
      renderAll(); closeModal(); tgHaptic('medium'); toast(id?'Прогноз обновлён':'Прогноз добавлен');
    }catch(e){ toast('Ошибка сохранения: '+(e.message||e),true); }
  }

  async function delPrediction(id){
    if(!confirm('Удалить этот прогноз?')) return;
    try{ await window.Store.remove(id); DATA=DATA.filter(x=>x.id!==id); renderAll(); toast('Прогноз удалён'); }
    catch(e){ toast('Ошибка удаления',true); }
  }

  function exportData(){
    const blob=new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`fora-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    toast('Экспорт готов');
  }
  async function importData(e){
    const file=e.target.files[0]; if(!file) return;
    try{ const arr=JSON.parse(await file.text());
      if(!Array.isArray(arr)) throw new Error('ожидался массив');
      DATA = await window.Store.replaceAll(arr);
      renderAll(); toast('Импортировано: '+DATA.length);
    }catch(err){ toast('Ошибка импорта: '+(err.message||err),true); }
  }
  async function changePw(){
    const np=prompt('Новый пароль админки:'); if(!np) return;
    try{ const h=await sha256(np); localStorage.setItem(PW_KEY,h); toast('Пароль изменён'); }catch(e){ toast('Не удалось сохранить',true); }
  }

  /* ---------- EVENTS ---------- */
  function bind(){
    ['burger','burger2'].forEach(id=>{ const b=$('#'+id); if(b) b.addEventListener('click',()=> $('#drawer').classList.contains('on')?closeDrawer():openDrawer()); });
    $('#dclose').addEventListener('click',closeDrawer);
    $('#scrim').addEventListener('click',closeDrawer);

    // тап по wordmark в шапке — короткая «волна» по буквам
    $$('.wm-head').forEach(wm=>{
      wm.addEventListener('click',()=>{
        wm.classList.remove('wave'); void wm.offsetWidth; wm.classList.add('wave');
        setTimeout(()=>wm.classList.remove('wave'), 700);
      });
    });

    // клики по навигации: nav-links (desktop), drawer, tabbar, CTA с data-go
    document.body.addEventListener('click',e=>{
      const t = e.target.closest('[data-go]');
      if(t){
        e.preventDefault();
        const id = t.dataset.go;
        if(t.closest('#drawer')) closeDrawer();
        showScreen(id);
        return;
      }
      // обычные якоря вида href="#guide" — тоже переключают экран
      const a = e.target.closest('a[href^="#"]');
      if(a && !a.hasAttribute('data-go') && !a.id){
        const href = a.getAttribute('href');
        if(HASH_TO_SCREEN[href]){
          e.preventDefault();
          showScreen(HASH_TO_SCREEN[href]);
          return;
        }
      }
    });

    // drawer: закрытие после клика на ссылку
    $$('#drawer nav a').forEach(a=> a.addEventListener('click',()=>{ if(a.id!=='drawerAdmin') closeDrawer(); }));
    $('#navAdmin').addEventListener('click',e=>{e.preventDefault(); admin?openPanel():openLogin();});
    $('#drawerAdmin').addEventListener('click',e=>{e.preventDefault(); closeDrawer(); admin?openPanel():openLogin();});

    ['#searchInput','#statusFilter','#sortBy'].forEach(s=> $(s).addEventListener('input',renderGuide));
    $('#sportTabs').addEventListener('click',e=>{ const b=e.target.closest('[data-sport]'); if(!b) return; activeSport=b.dataset.sport; renderTabs(); renderGuide(); });
    ['#c_bank','#c_risk','#c_odds','#c_prob'].forEach(s=> $(s).addEventListener('input',renderCalc));

    document.body.addEventListener('click',e=>{
      const o=e.target.closest('[data-open]'); if(o){ openDetail(o.dataset.open); return; }
      const ed=e.target.closest('[data-edit]'); if(ed){ openForm(ed.dataset.edit); return; }
      const dl=e.target.closest('[data-del]'); if(dl){ delPrediction(dl.dataset.del); return; }
      const po=e.target.closest('[data-post]'); if(po){ sharePost(po.dataset.post); return; }
      const sh=e.target.closest('[data-share]'); if(sh){ sharePost(sh.dataset.share); return; }
      if(e.target.closest('[data-close]') || e.target.id==='overlay') closeModal();
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeModal(); closeDrawer(); } });

    $('#subForm').addEventListener('submit',e=>{e.preventDefault(); $('#subEmail').value=''; toast('Спасибо! Рассылка скоро запустится.');});
    $('#tgLink').setAttribute('href', CFG.telegram.channelUrl||'#');

    // browser back/forward
    window.addEventListener('popstate',()=>{
      const h = location.hash;
      if(h.startsWith('#p=')){ const id=h.slice(3); openDetail(id); return; }
      const target = HASH_TO_SCREEN[h] || 'home';
      showScreen(target, false);
    });

    // deep-link на прогноз через #p=<id>
    if(location.hash.startsWith('#p=')){ const id=location.hash.slice(3); setTimeout(()=>openDetail(id),300); }
  }

  /* ---------- HEADER META ---------- */
  function headerMeta(){
    const now=new Date();
    const M=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    $('#tbDate').textContent = `${now.getDate()} ${M[now.getMonth()]} ${now.getFullYear()}`.toUpperCase();
    const start=new Date(now.getFullYear(),0,1);
    const week=Math.ceil((((now-start)/86400000)+start.getDay()+1)/7);
    $('#editionNo').textContent='№ '+pad2(week*4);
    $('#year').textContent=now.getFullYear();
  }

  /* ---------- INIT ---------- */
  async function init(){
    initTheme(); initTelegram(); headerMeta(); bind(); renderCalc();
    initPullToRefresh();
    // показываем skeletons сразу, до загрузки данных
    showSkeletons();
    try{ DATA = await window.Store.list(); }
    catch(e){ DATA=[]; toast('Не удалось загрузить данные',true); }
    renderAll();
    // стартовый экран по hash (для прямых ссылок из постов)
    const startScreen = HASH_TO_SCREEN[location.hash] || 'home';
    showScreen(startScreen, false);
    // deep-link на прогноз через #p=<id> или через TG start_param
    let deepId = null;
    if(location.hash.startsWith('#p=')) deepId = location.hash.slice(3);
    const tg = window._tg;
    if(tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param){
      const sp = tg.initDataUnsafe.start_param;
      if(sp.startsWith('p_')) deepId = sp.slice(2);
    }
    if(deepId){ setTimeout(()=>openDetail(deepId), 500); }
    // онбординг — показываем после небольшой задержки, чтобы данные успели отрисоваться
    setTimeout(showOnboarding, 800);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
