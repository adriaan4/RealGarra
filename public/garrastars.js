// GARRA STARS — front. Usa de la web: dev (dispositivo) y toast. El resultado de cada tiro SIEMPRE lo decide el
// servidor (physics.js corre igual en los dos sitios); aquí solo se manda el chute y se anima lo que responde.
(() => {
  const $ = s => document.querySelector(s);
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PH = window.GarraPhysics || { FW: 100, FH: 140, R_DISC: 6.2, R_BALL: 4, MAX_SPEED: 5.4, GOAL_L: 35, GOAL_R: 65 };
  const here = () => (location.hash || '#inicio').slice(1) === 'garrastars';
  const img = p => p && p.hasPhoto && p.id ? '/api/squad-photo/' + p.id + '?v=' + (p.photoV || 0) : 'escudo.png';
  const DIVC = { Bronce: '#8a5a2e', Plata: '#9aa0a6', Oro: '#e2ab2c', Platino: '#5fd4c6', Diamante: '#6fb3ff', Leyenda: '#d24fe0' };

  async function api(u, m = 'GET', b) {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const css = document.createElement('style');
  css.textContent = `
#gsRoot{max-width:460px;margin:0 auto}
.gsCard{background:linear-gradient(160deg,#4a2a12,#2a1608);border:2px solid var(--gold);border-radius:16px;padding:14px;margin:10px 0}
.gsMe{display:flex;align-items:center;gap:12px}
.gsMe img{width:58px;height:58px;border-radius:50%;object-fit:cover;border:3px solid var(--gold);background:#0d0b09;flex:none}
.gsMe b{display:block;font:800 22px "Barlow Condensed",sans-serif;color:var(--gold);text-transform:uppercase}
.gsDivTag{display:inline-block;font:700 13px "Barlow Condensed",sans-serif;padding:2px 10px;border-radius:99px;border:1px solid var(--line);margin-left:6px}
.gsStat{display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;font-size:15px}
.gsStat b{color:var(--gold)}
.gsTabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 8px}
.gsTab{background:transparent;color:var(--ink);border:2px solid var(--line);border-radius:99px;font:700 16px "Barlow Condensed",sans-serif;padding:5px 13px;min-height:36px}
.gsTab.on{background:var(--gold);color:#0d0b09;border-color:var(--gold)}
.gsRow{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--line);font-size:15px}
.gsRow.me{color:var(--gold)}
.gsRow b{flex:1;overflow-wrap:anywhere}
.gsPeers{display:flex;flex-direction:column;gap:8px;margin:8px 0}
.gsPeer{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gsPeer b{flex:1}
.gsPeer button{font-size:14px;padding:6px 10px}
.gsInv{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:10px;padding:10px 12px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.gsPick{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:10px 0}
.gsPl{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;background:var(--card);color:var(--ink);border:2px solid var(--line);border-radius:12px;font:700 17px/1.1 "Barlow Condensed",sans-serif;text-transform:uppercase;text-align:center}
.gsPl img{width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);background:#0d0b09}
.gsPl:hover,.gsPl:focus-visible{border-color:var(--gold);background:#2a1d0c}
.gsHud{display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:420px;margin:4px auto}
.gsHud b{color:var(--gold)}
.gsClock{font:800 30px "Barlow Condensed",sans-serif;color:#fff;min-width:70px;text-align:center;font-variant-numeric:tabular-nums;background:#0d0b09;border:2px solid var(--line);border-radius:10px;padding:0 8px}
.gsClock.low{color:var(--red);border-color:var(--red);animation:gsBlink 1s steps(2,start) infinite}
@keyframes gsBlink{50%{opacity:.45}}
#gsField.goal{animation:gsShake .35s 2}
@keyframes gsShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.gsOpen{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gsOpen b{flex:1;overflow-wrap:anywhere}
.gsOpen button{font-size:14px;padding:6px 10px}
.gsTag{font:700 13px "Barlow Condensed",sans-serif;opacity:.85}
.gsTurn{text-align:center;font:700 16px "Barlow Condensed",sans-serif;opacity:.9;margin:2px 0 6px}
#gsField{position:relative;width:100%;max-width:420px;margin:6px auto 8px;aspect-ratio:100/140;border:3px solid var(--gold);border-radius:16px;overflow:hidden;background:#1d5f27 url(cesped.jpg) center/cover;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none}
#gsField.mine{cursor:crosshair}
.gsGoal{position:absolute;left:35%;width:30%;height:7.5%;border:4px solid #f4f4f4;box-shadow:0 0 10px rgba(0,0,0,.5);background:repeating-linear-gradient(0deg,rgba(255,255,255,.2) 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,rgba(255,255,255,.2) 0 1px,transparent 1px 10px),rgba(0,0,0,.28);pointer-events:none}
.gsGoal.t{top:0;border-top:0;border-radius:0 0 6px 6px}
.gsGoal.b{bottom:0;border-bottom:0;border-radius:6px 6px 0 0}
.gsMid{position:absolute;left:4%;right:4%;top:50%;height:2px;background:rgba(255,255,255,.35);pointer-events:none}
.gsDisc{position:absolute;border-radius:50%;transform:translate(-50%,-50%);border:3px solid var(--gold);background:#0d0b09;overflow:hidden;z-index:2}
.gsDisc.b,.gsDisc.them{border-color:var(--red)}
.gsDisc img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.gsDisc.mine{box-shadow:0 0 0 2px rgba(226,171,44,.55)}
.gsBall{position:absolute;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 32% 28%,#fff,#e4e4e4 55%,#8f8f8f);box-shadow:0 4px 6px rgba(0,0,0,.5);z-index:1}
.gsAim{position:absolute;height:3px;background:var(--gold);transform-origin:0 50%;pointer-events:none;z-index:5;border-radius:3px}
.gsLbl{position:absolute;left:8px;z-index:3;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 14px "Barlow Condensed",sans-serif;text-transform:uppercase;padding:1px 9px;border-radius:99px;background:rgba(13,11,9,.78);pointer-events:none;border:1px solid var(--gold);color:var(--gold)}
.gsLbl.t{top:7px}.gsLbl.b{bottom:7px}
#gsField.land{aspect-ratio:140/100;max-width:none;width:min(100%,106vh)}
#gsField.land .gsGoal.l,#gsField.land .gsGoal.r{top:35%;width:7.5%;height:30%}
#gsField.land .gsGoal.l{left:0;right:auto;bottom:auto;border:4px solid #f4f4f4;border-left:0;border-radius:0 6px 6px 0}
#gsField.land .gsGoal.r{right:0;left:auto;bottom:auto;border:4px solid #f4f4f4;border-right:0;border-radius:6px 0 0 6px}
#gsField.land .gsMid{left:50%;right:auto;top:4%;bottom:4%;width:2px;height:auto}
#gsField.land .gsLbl.t{top:7px;bottom:auto;left:auto;right:8px}
#gsField.land .gsLbl.b{top:7px;bottom:auto;left:8px}
.gsLbl.opp{border-color:var(--red);color:#ff9f9d}
.gsMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.6);font:800 clamp(24px,8vw,42px)/1 "Barlow Condensed",Impact,sans-serif;color:var(--gold);text-shadow:0 3px 0 #0d0b09,0 0 18px rgba(0,0,0,.8);opacity:0;pointer-events:none;z-index:6;white-space:nowrap;text-transform:uppercase;transition:opacity .2s,transform .25s}
.gsMsg.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.gsEnd h3{margin:0 0 4px;font:800 28px "Barlow Condensed",sans-serif;color:var(--gold);text-transform:uppercase}
.gsHist{font-size:14px;opacity:.9}
.gsHistRow{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--line)}
.gsHistRow .w{color:#3fae55}.gsHistRow .l{color:#d8615f}.gsHistRow .d{color:var(--ink)}
.gsRotBtn{position:absolute;right:6px;bottom:6px;z-index:7;min-height:34px;padding:4px 10px;border-radius:99px;border:2px solid var(--gold);background:rgba(13,11,9,.82);color:var(--gold);font:800 15px "Barlow Condensed",sans-serif;text-transform:uppercase;cursor:pointer;touch-action:manipulation}
#gsRoot.gsFull{position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;max-width:none;margin:0;background:#0d0b09;box-sizing:border-box;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-rows:auto auto 1fr auto;column-gap:8px;align-items:start;padding:max(6px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}
#gsRoot.gsFull .gsHud{display:contents}
#gsRoot.gsFull .gsHud>b{display:flex;flex-direction:column;gap:2px;font:800 19px/1.1 "Barlow Condensed",sans-serif;text-transform:uppercase;overflow-wrap:anywhere;min-width:0}
#gsRoot.gsFull .gsHud>b>span{order:1;font:800 44px/1 "Barlow Condensed",sans-serif;color:#fff}
#gsRoot.gsFull .gsHud>b:first-child{grid-column:1;grid-row:1}
#gsRoot.gsFull .gsHud>b:last-child{grid-column:3;grid-row:1;text-align:right;align-items:flex-end}
#gsRoot.gsFull .gsHud>.gsClock{grid-column:1;grid-row:2;justify-self:start;font-size:28px;margin-top:6px}
#gsRoot.gsFull .gsTurn{grid-column:1;grid-row:3;align-self:start;margin:8px 0 0;text-align:left;font-size:15px;line-height:1.2}
#gsRoot.gsFull #gsField{grid-column:2;grid-row:1 / 5;align-self:center;margin:0}
#gsRoot.gsFull #gsField.land{width:min(calc((100vh - 14px) * 1.4),calc(100vw - 260px))}
#gsRoot.gsFull .gsLbl{display:none}
#gsRoot.gsFull .gsEnd{grid-column:3;grid-row:2 / 4;margin:6px 0 0;padding:8px 10px}
#gsRoot.gsFull .gsEnd h3{font-size:22px}
#gsRoot.gsFull .row{grid-column:3;grid-row:4;align-self:end;margin:0}
#gsRoot.gsFull .row{min-width:0}
#gsRoot.gsFull .row button{min-height:38px;padding:4px 8px;width:100%;min-width:0;white-space:normal;font-size:15px;line-height:1.1}
#gsRoot.gsFull .gsEnd,#gsRoot.gsFull .gsTurn{min-width:0}
#gsRoot.gsFull .gsVer{display:none}
@supports (height:100dvh){#gsRoot.gsFull #gsField.land{width:min(calc((100dvh - 14px) * 1.4),calc(100vw - 260px))}}
`;
  document.head.appendChild(css);

  let spectating = false, GS = null, pane = { tab: 'rank' }, matchId = null, M = null, busy = false, lastMatchStamp = '', liveTimer = null;
  let fails = 0, animStart = 0, lastLobbyLoad = 0, pendingQ = [], es = null, esKey = '', esOpen = false; // cola de tiros que llegan mientras animo + canal en directo (SSE)
  let ai = null; // modo entrenamiento contra la IA (nunca toca el servidor)
  const MATCH_MS = 3 * 60 * 1000, CELEB_MS = 1000, FRAME_MS = 16; // mismas cifras que el servidor (garrastars.js)
  let animating = 0, clock = null, timeUpAt = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Reloj: left = ms que quedaban al recibirlo, pause = ms que aún dura la celebración (durante ese rato el reloj está parado)
  function setClock(left, pause) { clock = { left: Math.max(0, left), t0: performance.now(), pause: Math.max(0, pause || 0) }; }
  function clockLeft() { if (!clock) return MATCH_MS; const el = performance.now() - clock.t0; return Math.max(0, clock.left - Math.max(0, el - clock.pause)); }
  const fmtClock = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const stampOf = d => d.status + '|' + d.turn + '|' + d.goalsA + '|' + d.goalsB + '|' + (d.updatedAt || '');

  const gbName = id => (GS.ranking.find(p => p.id === id) || GS.monthly.find(p => p.id === id) || {}).name
    || (GS.peers.find(p => p.id === id) || {}).name || '???';

  async function load(force) {
    if (!here() && !force) return;
    try {
      GS = await api('/api/stars?d=' + encodeURIComponent(dev));
      for (const k of ['squad', 'ranking', 'monthly', 'champions', 'open']) if (!Array.isArray(GS[k])) GS[k] = []; // si el servidor aún no está actualizado, no se rompe
      if (ai) return; // no pisar el entrenamiento en curso
      if (GS.activeId && GS.activeId !== matchId) { matchId = GS.activeId; await loadMatch(true); return; }
      if (!matchId) draw();
    } catch (e) { console.error(e); const r = $('#gsRoot'); if (r) r.innerHTML = '<p>' + E(e.message || 'Error') + '</p><div class="row"><button type="button" onclick="location.reload()">Reintentar</button></div>'; }
  }

  async function loadMatch(force) {
    if (!matchId || matchId === 'ai') return;
    const since = M && !force ? (M.updatedAt || 0) : 0;
    let d; try { d = await api(spectating ? '/api/stars/watch/' + matchId + '?since=' + since : '/api/stars/match/' + matchId + '?d=' + encodeURIComponent(dev) + '&since=' + since); } catch (e) {
      fails++; // un fallo de red suelto ya no echa a nadie del partido: solo si la partida ya no existe o falla varias veces seguidas
      if (/ya no|no encontrada/i.test(e.message || '') || fails >= 4) { fails = 0; recover(); }
      return;
    }
    fails = 0;
    if (!d || !d.a || !d.b || !Array.isArray(d.bodies)) { recover(); return; }
    applyMatch(d, force);
  }
  // Recibe el estado de la partida (por el canal en directo o por consulta). Si estoy animando un tiro, se guarda en cola y se enseña justo después.
  function recover() { // salida limpia al lobby si algo va mal: nunca se queda la web colgada
    matchId = null; spectating = false; M = null; ai = null; pendingQ = []; animating = 0; busy = false; drag = null; clock = null; lastMatchStamp = '';
    matchId2Stop(); syncStream(); const r = $('#gsRoot'); if (r) { r.style.maxWidth = ''; r.classList.remove('gsFull'); }
    load(true);
  }
  function applyMatch(d, force) { try { applyMatch_(d, force); } catch (x) { console.error('Garra Stars:', x); recover(); } }
  function applyMatch_(d, force) {
    if (!d || !d.a || !d.b || !Array.isArray(d.bodies) || !matchId || matchId === 'ai' || (d.id && d.id !== matchId)) return;
    const stamp = stampOf(d);
    if (!force && M && (d.updatedAt || 0) < (M.updatedAt || 0)) return; // dato más viejo que lo que ya tengo
    if (!force && (busy || animating)) {
      if (stamp !== lastMatchStamp && !pendingQ.some(q => stampOf(q) === stamp)) {
        pendingQ.push(d); pendingQ.sort((x, y) => (x.updatedAt || 0) - (y.updatedAt || 0));
        if (pendingQ.length > 6) pendingQ.splice(0, pendingQ.length - 6);
      }
      return;
    }
    if (force) pendingQ = [];
    const isNew = stamp !== lastMatchStamp || force;
    if (!isNew) { setClock(d.timeLeftMs, d.pauseMs); return; } // nada ha cambiado: solo se reajusta el reloj y no se repinta
    const prev = M && matchId !== 'ai' ? { a: M.goalsA, b: M.goalsB } : null; // marcador de antes, para no adelantar el gol
    lastMatchStamp = stamp; M = d; timeUpAt = 0;
    setClock(d.timeLeftMs, d.pauseMs);
    const path = !force && d.path && d.path.length ? d.path : null; // el tiro del rival se anima; al entrar de golpe no se repite
    drawMatch(path && prev ? prev : undefined);
    if (path) playShot(path, d.result, () => { if (M && M.status === 'live') drawMatch(); });
    if (M.status !== 'live') matchId2Stop();
    syncStream();
  }
  function drainQ() { if (busy || animating || !pendingQ.length) return; applyMatch(pendingQ.shift()); }
  function matchId2Stop() { clearInterval(liveTimer); liveTimer = null; }

  // ---- Canal en directo (SSE): el servidor empuja cada tiro al instante. Si no hay SSE, se sigue consultando como antes (más rápido) ----
  function syncStream() {
    const want = matchId ? (matchId === 'ai' ? '' : 'm' + matchId) : (here() && !ai ? 'lobby' : '');
    if (want === esKey) return;
    if (es) { try { es.close(); } catch { } es = null; }
    esOpen = false; esKey = want;
    if (!want || typeof EventSource === 'undefined') return;
    const e = es = new EventSource('/api/stars/stream?d=' + encodeURIComponent(dev) + (want === 'lobby' ? '' : '&match=' + matchId));
    e.onopen = () => { esOpen = true; if (want === 'lobby') { if (here() && !matchId && !ai) load(); } else loadMatch(); }; // al (re)conectar se pone al día
    e.onerror = () => { esOpen = false; }; // el navegador reconecta solo
    e.addEventListener('lobby', () => { if (here() && !matchId && !ai && Date.now() - lastLobbyLoad > 1500) { lastLobbyLoad = Date.now(); load(); } }); // como mucho 1 refresco cada 1,5 s
    e.addEventListener('match', ev => { try { applyMatch(JSON.parse(ev.data)); } catch (x) { console.error(x); } });
  }
  (function matchPoll() { // red de seguridad: con el canal abierto basta cada 2 s; sin él, cada 0,7 s
    setTimeout(() => { if (M && M.status === 'live' && matchId && matchId !== 'ai' && !busy && !animating && !pendingQ.length) loadMatch(); matchPoll(); }, esOpen ? 2000 : 700);
  })();

  function draw() {
    const el = $('#gsRoot'); if (!el) return;
    if (!GS) { el.innerHTML = '<p>Cargando…</p>'; return; }
    if (matchId && M) { drawMatch(); return; }
    el.style.maxWidth = ''; el.classList.remove('gsFull');
    if (!GS.me) {
      el.innerHTML = `<p class="sub">Para jugar usa el mismo nombre de GarraBet/Porra. Si no tienes, ponlo aquí:</p>
      <div class="row"><input id="gsNameIn" maxlength="18" placeholder="Tu nombre"><button id="gsNameBtn" type="button">Guardar</button></div>` + liveHtml();
      return;
    }
    if (!GS.me.ficha) {
      el.innerHTML = `<h2 style="margin:0 0 2px">Elige tu ficha</h2><p class="sub" style="font-size:16px">Es el jugador de la plantilla que te representará en el campo.</p>
      <div class="gsPick">${GS.squad.map(p => `<button type="button" class="gsPl" data-pl="${p.id}"><img src="${img(p)}" alt="" onerror="this.onerror=null;this.src='escudo.png'"><span>${E(p.name)}</span></button>`).join('')}</div>`;
      return;
    }
    const me = GS.me, mine = GS.squad.find(p => p.id === me.ficha);
    const t = pane.tab;
    el.innerHTML = `
    <div class="gsCard"><div class="gsMe"><img src="${img(mine)}" alt="" onerror="this.onerror=null;this.src='escudo.png'">
     <div><b>${E(me.name)}<span class="gsDivTag" style="border-color:${DIVC[me.div]};color:${DIVC[me.div]}">${me.div}</span></b>
     <div class="gsStat"><span><b>${me.pts}</b> pts</span><span><b>${me.w}</b>V</span><span><b>${me.l}</b>D</span><span><b>${me.d}</b>E</span><span>🔥 <b>${me.streak}</b></span></div></div></div></div>
    <h2 style="margin-top:18px">🎮 Jugar</h2>
    <p class="sub" style="font-size:15px;margin:0 0 8px">Partidos de 3 minutos: gana quien tenga más goles al acabar la cuenta atrás.</p>
    ${GS.waiting ? `<div class="gsInv"><span>⌛ Tu partida ${GS.waiting.friendly ? 'amistosa' : 'puntuable'} está abierta. Esperando rival…</span><button type="button" class="ghost" data-cancel="${GS.waiting.id}">Cancelar</button></div>` :
      `<div class="row"><button type="button" data-create="0">⭐ Crear partida puntuable</button><button type="button" class="ghost" data-create="1">🙂 Crear amistosa</button></div>`}
    <div class="row"><button type="button" class="ghost" id="gsAI">🤖 Entrenamiento vs IA (no puntúa)</button><button type="button" class="ghost" id="gsChFicha">👤 Cambiar ficha</button></div>
    <h3 style="margin:14px 0 6px;font:800 22px 'Barlow Condensed',sans-serif">🚪 Partidas abiertas</h3>
    <div class="gsPeers">${GS.open.length ? GS.open.map(o => `<div class="gsOpen"><b>${E(o.name)} <span class="gsDivTag" style="border-color:${DIVC[o.div]};color:${DIVC[o.div]}">${o.div}</span></b><span class="gsTag">${o.friendly ? '🙂 amistosa' : '⭐ puntúa'}</span><button type="button" data-join="${o.id}">Unirme</button></div>`).join('') : '<p class="sub" style="font-size:15px">No hay partidas abiertas ahora mismo. Crea una y espera rival, o entrena contra la IA.</p>'}</div>
    ${liveHtml()}
    <h2 style="margin-top:22px">🏆 Garra Stars</h2>
    <div class="gsTabs">
     <button type="button" class="gsTab${t === 'rank' ? ' on' : ''}" data-t="rank">General</button>
     <button type="button" class="gsTab${t === 'month' ? ' on' : ''}" data-t="month">Del mes</button>
     <button type="button" class="gsTab${t === 'hist' ? ' on' : ''}" data-t="hist">Mi historial</button>
     <button type="button" class="gsTab${t === 'champ' ? ' on' : ''}" data-t="champ">Campeones</button>
    </div>
    <div id="gsPane">${pane_(t, me.id)}</div>`;
  }

  function liveHtml() {
    const L = GS.live || [];
    return `<h2 style="margin-top:18px">🔴 Directo</h2><div class="gsPeers">${L.length ? L.map(m => `<div class="gsOpen"><b>${E(m.a)} ${m.goalsA} - ${m.goalsB} ${E(m.b)}</b><span class="gsTag">⏱️ ${fmtClock(m.timeLeftMs)}${m.friendly ? ' · 🙂' : ''}</span><button type="button" data-watch="${m.id}">👀 Ver</button></div>`).join('') : '<p class="sub" style="font-size:15px">Ahora mismo no hay ningún partido en juego.</p>'}</div>`;
  }
  function rankRows(list, meId) {
    if (!list.length) return '<p class="sub" style="font-size:15px">Todavía no hay partidas puntuables.</p>';
    return list.map((p, i) => `<div class="gsRow${p.id === meId ? ' me' : ''}"><span style="width:22px">${i + 1}</span><b>${E(p.name)}</b><span class="gsDivTag" style="border-color:${DIVC[p.div]};color:${DIVC[p.div]}">${p.div}</span><b>${p.pts}</b></div>`).join('');
  }
  function pane_(t, meId) {
    if (t === 'rank') return rankRows(GS.ranking, meId);
    if (t === 'month') return `<p class="sub" style="font-size:15px">Se reinicia cada mes: hay un campeón mensual y el ranking general no se borra nunca.</p>` + GS.monthly.map((p, i) => `<div class="gsRow${p.id === meId ? ' me' : ''}"><span style="width:22px">${i + 1}</span><b>${E(p.name)}</b><b>${p.mPts >= 0 ? '+' : ''}${p.mPts}</b></div>`).join('') || '<p class="sub">Nadie ha jugado este mes todavía.</p>';
    if (t === 'champ') return GS.champions.length ? GS.champions.map(c => `<div class="gsRow"><span>🏅</span><b>${E(c.name)}</b><span>${c.month}</span><b>${c.pts >= 0 ? '+' : ''}${c.pts}</b></div>`).join('') : '<p class="sub" style="font-size:15px">Todavía no ha habido un primer mes completo.</p>';
    const h = (GS.me && GS.me.hist) || [];
    return h.length ? h.map(x => `<div class="gsHistRow ${x.res}"><span>${x.res === 'w' ? '✅' : x.res === 'l' ? '❌' : '➖'}</span><b>vs ${E(x.oppName)}</b><span>${x.score[0]}-${x.score[1]}</span><span>${x.friendly ? 'amistoso' : (x.delta >= 0 ? '+' : '') + x.delta}</span></div>`).join('') : '<p class="sub" style="font-size:15px">Juega tu primera partida para que salga aquí.</p>';
  }

  // ---- Partida ----
  // Cada jugador se ve SIEMPRE abajo: si soy el equipo B se gira el campo 180° solo en mi pantalla (la física no cambia)
  const FLIP = () => !!(M && M.mine === 'b');
  // Orientación AUTOMÁTICA: si el móvil está en horizontal el campo se pone horizontal; en vertical, vertical.
  // (en ordenador, con ventana alta, se queda vertical). El botón 🔄 la cambia a mano solo hasta que gires el móvil.
  let horizPref = null;
  const mqLand = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 620px)') : null;
  const autoLand = () => (innerWidth > innerHeight && innerHeight <= 700) || !!(mqLand && mqLand.matches); // móvil en horizontal (por tamaño de ventana o por orientación)
  const LAND = () => !M ? false : horizPref !== null ? horizPref : autoLand();
  const FULL = () => LAND() && innerWidth > innerHeight; // móvil realmente en horizontal: el juego ocupa TODA la pantalla (sin cabecera ni pestañas)
  const FWW = PH.FW || 100;
  const VDIM = () => LAND() ? { w: PH.FH, h: FWW } : { w: FWW, h: PH.FH };
  const vpos = (x, y) => LAND() ? (FLIP() ? { x: y, y: FWW - x } : { x: PH.FH - y, y: x }) : FLIP() ? { x: FWW - x, y: PH.FH - y } : { x, y };
  function bodyStyle(b) {
    const v = vpos(b.x, b.y), D = VDIM(), dia = (b.isBall ? PH.R_BALL : PH.R_DISC) * 2;
    return `left:${v.x / D.w * 100}%;top:${v.y / D.h * 100}%;width:${dia / D.w * 100}%;height:${dia / D.h * 100}%`;
  }
  function placeBodies(bodies) {
    for (const b of bodies) { const n = $('#bd-' + b.id); if (n) { const v = vpos(b.x, b.y), D = VDIM(); n.style.left = (v.x / D.w * 100) + '%'; n.style.top = (v.y / D.h * 100) + '%'; } }
  }
  // hold: marcador anterior {a,b}: el gol no se enseña en el marcador hasta que el balón entra en la red
  function drawMatch(hold) {
    const el = $('#gsRoot'); if (!el || !M) return;
    const mine = M.mine, myTurn = mine && M.turn === mine;
    const done = M.status === 'done';
    const ga = hold ? hold.a : M.goalsA, gb = hold ? hold.b : M.goalsB;
    el.style.maxWidth = LAND() ? '100%' : '';
    el.classList.toggle('gsFull', FULL());
    const bot = FLIP() ? 'b' : 'a', top = bot === 'a' ? 'b' : 'a', G = { a: ga, b: gb }, nm = t => E(t === 'a' ? M.a.name : M.b.name); // abajo = yo (o el equipo A si solo miro)
    el.innerHTML = `
    <div class="gsHud" style="${LAND() && !FULL() ? 'max-width:min(100%,106vh)' : ''}"><b>${nm(bot)}${mine ? ' (tú)' : ''} <span id="gs${bot === 'a' ? 'SA' : 'SB'}">${G[bot]}</span></b><span class="gsClock" id="gsClock">${fmtClock(done ? 0 : clockLeft())}</span><b><span id="gs${top === 'a' ? 'SA' : 'SB'}">${G[top]}</span> ${nm(top)}</b></div>
    <p class="gsTurn">${done ? '' : spectating ? '👀 En directo · turno de ' + E(M.turn === 'a' ? M.a.name : M.b.name) : (M.friendly ? '🙂 Amistoso: no puntúa · ' : '') + (myTurn ? '🎯 ¡Tu turno! Arrastra una ficha hacia atrás y suelta' : '⌛ Turno de ' + E(mine === 'a' ? M.b.name : M.a.name))}</p>
    <div id="gsField" class="${myTurn && !done ? 'mine' : ''}${LAND() ? ' land' : ''}" role="application" aria-label="Campo de Garra Stars">
     <div class="gsMid"></div>${LAND() ? '<div class="gsGoal l"></div><div class="gsGoal r"></div>' : '<div class="gsGoal t"></div><div class="gsGoal b"></div>'}
     <div class="gsLbl t opp">${mine ? (LAND() ? '▶ Rival · ' : '⬆ Rival · ') : ''}${nm(top)}</div><div class="gsLbl b">${mine ? (LAND() ? '◀ TÚ · ' : '⬇ TÚ · ') : ''}${nm(bot)}</div>
     <div class="gsMsg" id="gsMsg"></div>
     <button type="button" class="gsRotBtn" aria-label="Girar el campo">🔄 ${LAND() ? 'Vertical' : 'Horizontal'}</button>
     <i class="gsAim" id="gsAimLine" style="display:none"></i>
     ${M.bodies.map(b => b.isBall ? `<div class="gsBall" id="bd-${b.id}" style="${bodyStyle(b)}"></div>` : `<div class="gsDisc ${mine ? (b.team === mine ? 'us' : 'them') : b.team}${b.team === mine ? ' mine' : ''}" id="bd-${b.id}" data-id="${b.id}" style="${bodyStyle(b)}"><img src="${img(squadFor(b.team))}" alt="" onerror="this.onerror=null;this.src='escudo.png'"></div>`).join('')}
    </div>
    ${done ? `<div class="gsEnd gsCard"><h3>${spectating ? (M.winner ? '🏁 Gana ' + E(M.winner === 'a' ? M.a.name : M.b.name) : '🤝 Empate') : M.winner === mine ? '🏆 ¡Victoria!' : M.winner ? '😬 Derrota' : '🤝 Empate'}</h3><p style="margin:0">${M.byTime ? '⏱️ Tiempo agotado · ' : ''}${E(M.a.name)} ${M.goalsA} - ${M.goalsB} ${E(M.b.name)}${M.payouts ? ' · ' + (mine === 'a' ? fmtDelta(M.payouts.deltaA) : fmtDelta(M.payouts.deltaB)) : ''}</p></div>
    <div class="row"><button type="button" id="gsBack">👈 Volver al lobby</button></div>` :
      spectating ? `<div class="row"><button type="button" class="ghost" id="gsBack">👈 Salir del directo</button></div>` : `<div class="row"><button type="button" class="ghost" id="gsResign">${matchId === 'ai' ? '👈 Salir del entrenamiento' : '🏳️ Rendirse'}</button></div>`}
    `;
    syncStream();
    el.insertAdjacentHTML('beforeend', '<p class="gsVer" style="font-size:11px;opacity:.45;text-align:center;margin:4px 0">Garra Stars v9</p>');
  }
  function fmtDelta(n) { return (n >= 0 ? '+' : '') + n + ' pts'; }
  function squadFor(team) { return M ? (team === 'a' ? M.a.ficha : M.b.ficha) : null; }

  function animatePath(path, done) {
    let i = 0;
    const step = () => {
      const frame = path[i];
      if (frame) placeBodies(frame);
      i++;
      if (i < path.length) setTimeout(step, FRAME_MS); else done();
    };
    step();
  }

  function flash(txt) { const m = $('#gsMsg'); if (!m) return; m.textContent = txt; m.classList.remove('on'); void m.offsetWidth; m.classList.add('on'); setTimeout(() => m.classList.remove('on'), 1200); }
  function goalSound(side) { if (!M || !M.mine) return; try { const a = new Audio(M && M.mine === side ? '/sonidos/siuuu.mp3' : '/sonidos/fah.mp3'); a.volume = .6; a.play().catch(() => { }); } catch { } }

  // Anima un tiro. Si acaba en gol: se enseña el gol, ~1 s de celebración (el reloj está parado) y entonces todo vuelve a la formación inicial.
  // after() se llama cuando ya está todo colocado con el estado nuevo (M.bodies).
  function playShot(path, result, after) {
    animating++; animStart = performance.now();
    const end = () => { if (M) placeBodies(M.bodies); animating--; if (after) after(); setTimeout(drainQ, 0); };
    const fin = () => {
      if (result === 'A' || result === 'B') {
        const sa = $('#gsSA'), sb = $('#gsSB'); if (M) { if (sa) sa.textContent = M.goalsA; if (sb) sb.textContent = M.goalsB; }
        const f = $('#gsField'); if (f) { f.classList.add('goal'); setTimeout(() => f.classList.remove('goal'), 800); }
        flash('⚽ ¡GOL' + (M ? ' de ' + (result === 'A' ? M.a.name : M.b.name) : '') + '!');
        goalSound(result.toLowerCase());
        setTimeout(end, CELEB_MS);
      } else end();
    };
    if (path && path.length) animatePath(path, fin); else fin();
  }

  // Reloj en pantalla (solo cambia el texto, no repinta el campo)
  setInterval(() => {
    if (animating && performance.now() - animStart > 9000) { animating = 0; if (M) placeBodies(M.bodies); } // por si una animación se quedara colgada
    drainQ(); syncStream();
    if (!M || M.status !== 'live' || !matchId) return;
    const left = clockLeft(), c = $('#gsClock');
    if (c) { c.textContent = fmtClock(left); c.classList.toggle('low', left > 0 && left <= 10000); }
    if (left > 0 || animating) return;
    if (matchId === 'ai') { finishAI(); return; }
    if (Date.now() - timeUpAt > 2000) { timeUpAt = Date.now(); loadMatch(true); } // el servidor cierra el partido y manda el resultado
  }, 200);

  // ---- Arrastrar para chutar ----
  let drag = null;
  function fieldPt(e, field) {
    const r = field.getBoundingClientRect();
    const D = VDIM();
    return { x: (e.clientX - r.left) / r.width * D.w, y: (e.clientY - r.top) / r.height * D.h }; // coordenadas de PANTALLA en las unidades del campo tal y como se ve (la física las deshace al chutar)
  }
  document.addEventListener('pointerdown', e => {
    const disc = e.target.closest('.gsDisc.mine'); const field = $('#gsField');
    if (!disc || !field || !field.classList.contains('mine') || busy || animating) return;
    const id = disc.dataset.id, b = (M.bodies || []).find(x => x.id === id);
    if (!b) return;
    const v = vpos(b.x, b.y);
    drag = { id, bx: v.x, by: v.y }; // posición de la ficha tal y como se ve en pantalla
    field.setPointerCapture && field.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const field = $('#gsField'); if (!field) return;
    const p = fieldPt(e, field);
    const line = $('#gsAimLine'); if (!line) return;
    const dx = p.x - drag.bx, dy = p.y - drag.by, dist = Math.hypot(dx, dy);
    const D = VDIM(), leftPct = drag.bx / D.w * 100, topPct = drag.by / D.h * 100;
    const ang = Math.atan2(dy * (field.clientHeight / D.h), dx * (field.clientWidth / D.w));
    line.style.display = 'block';
    line.style.left = leftPct + '%'; line.style.top = topPct + '%';
    line.style.width = (Math.min(60, dist) / D.w * 100) + '%';
    line.style.transform = `rotate(${ang}rad)`;
  });
  document.addEventListener('pointerup', async e => {
    if (!drag) return;
    const field = $('#gsField'); const line = $('#gsAimLine'); if (line) line.style.display = 'none';
    const p = field ? fieldPt(e, field) : { x: drag.bx, y: drag.by };
    let pullX = drag.bx - p.x, pullY = drag.by - p.y;
    const dist = Math.hypot(pullX, pullY);
    const d = drag; drag = null;
    if (dist < 2.5) return; // toque sin arrastrar: no dispara
    const MAXPULL = 26, k = Math.min(1, dist / MAXPULL) * PH.MAX_SPEED / dist;
    let vx = pullX * k, vy = pullY * k;
    // del tirón en pantalla al tirón en el campo real (deshacer el giro de la vista)
    if (LAND()) { const tx = vx, ty = vy; if (FLIP()) { vx = -ty; vy = tx; } else { vx = ty; vy = -tx; } }
    else if (FLIP()) { vx = -vx; vy = -vy; }
    if (busy || !M || M.status !== 'live') return;
    if (matchId === 'ai') { busy = true; try { await aiShot(d.id, vx, vy, 'a'); } finally { busy = false; } return; }
    busy = true;
    // Tiro instantáneo: la simulación es determinista (la misma del servidor), así que se anima ya y la respuesta del servidor solo confirma
    const hold = { a: M.goalsA, b: M.goalsB };
    const [cvx, cvy] = PH.clampPower ? PH.clampPower(vx, vy) : [vx, vy];
    const sim = M.bodies.map(b => ({ ...b })); const sh = sim.find(x => x.id === d.id); sh.vx = cvx; sh.vy = cvy;
    const loc = PH.simulate(sim, true);
    M = { ...M, bodies: loc.scored ? aiBodies() : loc.bodies, goalsA: M.goalsA + (loc.scored === 'A' ? 1 : 0), goalsB: M.goalsB + (loc.scored === 'B' ? 1 : 0), turn: loc.scored ? (loc.scored === 'A' ? 'b' : 'a') : (M.turn === 'a' ? 'b' : 'a') };
    if (loc.scored) setClock(clockLeft(), loc.path.length * FRAME_MS + CELEB_MS);
    drawMatch(hold);
    let reply = null;
    const req = api('/api/stars/match/' + matchId + '/shoot', 'POST', { device: dev, bodyId: d.id, vx, vy }).then(r => { reply = r; return r; });
    req.catch(() => { }); // el error se trata al acabar la animación
    playShot(loc.path, loc.scored, async () => {
      try {
        const r = reply || await req;
        M = r; lastMatchStamp = stampOf(r); timeUpAt = 0; setClock(r.timeLeftMs, r.pauseMs);
        busy = false; if (M.status !== 'live') matchId2Stop(); else drawMatch();
      } catch (err) { toast(err.message); busy = false; loadMatch(true); }
    });
  });

  document.addEventListener('click', async e => {
    if (!here() && !ai) return;
    const nb = e.target.closest('#gsNameBtn');
    if (nb) { try { await api('/api/garrabet/name', 'POST', { device: dev, name: $('#gsNameIn').value }); try { lastJ = ''; } catch { } if (typeof window.load === 'function') window.load(); toast('Nombre guardado'); await load(true); } catch (x) { toast(x.message); } return; }
    const pl = e.target.closest('[data-pl]');
    if (pl) { try { await api('/api/stars/ficha', 'POST', { device: dev, playerId: +pl.dataset.pl }); await load(true); } catch (x) { toast(x.message); } return; }
    if (e.target.closest('#gsChFicha')) { GS.me.ficha = 0; draw(); return; }
    const tb = e.target.closest('.gsTab'); if (tb) { pane.tab = tb.dataset.t; draw(); return; }
    const cr = e.target.closest('[data-create]');
    if (cr) { try { await api('/api/stars/create', 'POST', { device: dev, friendly: cr.dataset.create === '1' }); } catch (x) { toast(x.message); } await load(true); return; }
    const jn = e.target.closest('[data-join]');
    if (jn) {
      try { const r = await api('/api/stars/join/' + jn.dataset.join, 'POST', { device: dev }); if (r.note) toast(r.note); matchId = r.id; lastMatchStamp = ''; await loadMatch(true); }
      catch (x) { toast(x.message); await load(true); }
      return;
    }
    const wt = e.target.closest('[data-watch]');
    if (wt) { spectating = true; matchId = +wt.dataset.watch; lastMatchStamp = ''; M = null; pendingQ = []; animating = 0; fails = 0; await loadMatch(true); return; }
    const cn = e.target.closest('[data-cancel]');
    if (cn) { try { await api('/api/stars/open/' + cn.dataset.cancel + '/cancel', 'POST', { device: dev }); } catch (x) { toast(x.message); } await load(true); return; }
    if (e.target.closest('#gsResign')) {
      if (matchId === 'ai') { ai = null; matchId = null; M = null; clock = null; draw(); return; }
      if (!confirm('¿Rendirte? Cuenta como derrota.')) return;
      try { M = await api('/api/stars/match/' + matchId + '/resign', 'POST', { device: dev }); lastMatchStamp = stampOf(M); matchId2Stop(); drawMatch(); } catch (x) { toast(x.message); }
      return;
    }
    if (e.target.closest('.gsRotBtn')) {
      if (drag) return;
      horizPref = !LAND();
      drawMatch(); return;
    }
    if (e.target.closest('#gsBack')) { matchId = null; spectating = false; M = null; ai = null; clock = null; matchId2Stop(); await load(true); return; }
    if (e.target.closest('#gsAI')) { startAI(); return; }
  });

  // ---- Modo entrenamiento contra la IA: nunca toca el servidor ni el ranking. También dura 3 minutos con cuenta atrás ----
  function startAI() {
    const mine = GS.squad.find(p => p.id === GS.me.ficha), bot = GS.squad[(GS.squad.indexOf(mine) + 1) % GS.squad.length] || mine;
    ai = { id: Date.now() };
    M = { friendly: true, status: 'live', turn: 'a', mine: 'a', goalsA: 0, goalsB: 0, bodies: aiBodies(), a: { name: GS.me.name, ficha: mine }, b: { name: bot.name + ' (IA)', ficha: bot } };
    matchId = 'ai'; setClock(MATCH_MS, 0);
    drawMatch();
  }
  function aiBodies() {
    const k = PH.kickoff();
    return [
      { id: 'a1', team: 'a', isBall: false, x: k.a[0].x, y: k.a[0].y, vx: 0, vy: 0 },
      { id: 'a2', team: 'a', isBall: false, x: k.a[1].x, y: k.a[1].y, vx: 0, vy: 0 },
      { id: 'a3', team: 'a', isBall: false, x: k.a[2].x, y: k.a[2].y, vx: 0, vy: 0 },
      { id: 'b1', team: 'b', isBall: false, x: k.b[0].x, y: k.b[0].y, vx: 0, vy: 0 },
      { id: 'b2', team: 'b', isBall: false, x: k.b[1].x, y: k.b[1].y, vx: 0, vy: 0 },
      { id: 'b3', team: 'b', isBall: false, x: k.b[2].x, y: k.b[2].y, vx: 0, vy: 0 },
      { id: 'ball', team: null, isBall: true, x: k.ball.x, y: k.ball.y, vx: 0, vy: 0 },
    ];
  }
  function finishAI() {
    if (!ai || !M || M.status !== 'live') return;
    M.status = 'done'; M.byTime = true; setClock(0, 0);
    M.winner = M.goalsA > M.goalsB ? 'a' : M.goalsB > M.goalsA ? 'b' : null;
    drawMatch();
  }
  // Un tiro (del jugador o de la IA) pasa por la MISMA simulación que usa el servidor (PH.simulate), solo que corre aquí
  async function aiShot(bodyId, vx, vy, side) {
    const run = ai; if (!run || !M || M.status !== 'live') return;
    const bodies = M.bodies.map(b => ({ ...b }));
    const sh = bodies.find(x => x.id === bodyId); sh.vx = vx; sh.vy = vy;
    const { bodies: fin, scored, path } = PH.simulate(bodies, true);
    M.bodies = fin;
    if (scored) {
      if (scored === 'A') M.goalsA++; else M.goalsB++;
      M.bodies = aiBodies();                       // tras el gol, formación inicial...
      M.turn = scored === 'A' ? 'b' : 'a';         // ...y saca quien ha encajado
      setClock(clockLeft(), path.length * FRAME_MS + CELEB_MS); // vuelo + celebración: el reloj no corre
    } else M.turn = side === 'a' ? 'b' : 'a';
    await new Promise(res => playShot(path, scored, res));
    if (ai !== run || !M || M.status !== 'live') return;
    if (clockLeft() <= 0) { finishAI(); return; }
    drawMatch();
    if (M.turn === 'b') await aiTurn();
  }
  async function aiTurn() {
    const run = ai;
    await sleep(350);
    if (ai !== run || !M || M.status !== 'live') return;
    if (clockLeft() <= 0) { finishAI(); return; }
    const bodies = M.bodies.map(b => ({ ...b }));
    const ball = bodies.find(x => x.isBall);
    const mine3 = bodies.filter(x => x.team === 'b');
    mine3.sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
    const shooter = mine3[0];
    const ang = Math.atan2(ball.y - shooter.y, ball.x - shooter.x) + (Math.random() - 0.5) * 0.5;
    const power = (0.55 + Math.random() * 0.45) * PH.MAX_SPEED;
    await aiShot(shooter.id, Math.cos(ang) * power, Math.sin(ang) * power, 'b');
  }

  const onRotate = () => { horizPref = null; if (M && matchId && !drag) drawMatch(); }; // al girar el móvil manda la orientación del móvil
  if (mqLand) { if (mqLand.addEventListener) mqLand.addEventListener('change', onRotate); else if (mqLand.addListener) mqLand.addListener(onRotate); }
  addEventListener('orientationchange', () => setTimeout(onRotate, 250));
  // Red de seguridad: algunos móviles/apps instaladas no avisan bien al girar, así que también se vigila el tamaño de la ventana
  let lastAuto = autoLand();
  const checkRot = () => { const a = autoLand(); if (a !== lastAuto) { lastAuto = a; onRotate(); } };
  addEventListener('resize', () => setTimeout(checkRot, 120));
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(checkRot, 250));
  addEventListener('hashchange', () => { const r = $('#gsRoot'); if (here()) { load(true); if (M && matchId) drawMatch(); } else if (r) r.classList.remove('gsFull'); });
  (function lobbyLoop() { // en el lobby se refresca solo; más rápido mientras espero a que alguien se una a mi partida
    setTimeout(async () => { if (here() && !matchId && !ai) await load(); lobbyLoop(); }, GS && GS.waiting ? 3000 : 6000);
  })();
  if (here()) load(true);
})();
