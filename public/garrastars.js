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
.gsTurn{text-align:center;font:700 16px "Barlow Condensed",sans-serif;opacity:.9;margin:2px 0 6px}
#gsField{position:relative;width:100%;max-width:420px;margin:6px auto 8px;aspect-ratio:100/140;border:3px solid var(--gold);border-radius:16px;overflow:hidden;background:#1d5f27 url(cesped.jpg) center/cover;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none}
#gsField.mine{cursor:crosshair}
.gsGoal{position:absolute;left:35%;width:30%;height:7.5%;border:4px solid #f4f4f4;box-shadow:0 0 10px rgba(0,0,0,.5);background:repeating-linear-gradient(0deg,rgba(255,255,255,.2) 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,rgba(255,255,255,.2) 0 1px,transparent 1px 10px),rgba(0,0,0,.28);pointer-events:none}
.gsGoal.t{top:0;border-top:0;border-radius:0 0 6px 6px}
.gsGoal.b{bottom:0;border-bottom:0;border-radius:6px 6px 0 0}
.gsMid{position:absolute;left:4%;right:4%;top:50%;height:2px;background:rgba(255,255,255,.35);pointer-events:none}
.gsDisc{position:absolute;border-radius:50%;transform:translate(-50%,-50%);border:3px solid var(--gold);background:#0d0b09;overflow:hidden;z-index:2}
.gsDisc.b{border-color:var(--red)}
.gsDisc img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.gsDisc.mine{box-shadow:0 0 0 2px rgba(226,171,44,.55)}
.gsBall{position:absolute;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 32% 28%,#fff,#e4e4e4 55%,#8f8f8f);box-shadow:0 4px 6px rgba(0,0,0,.5);z-index:1}
.gsAim{position:absolute;height:3px;background:var(--gold);transform-origin:0 50%;pointer-events:none;z-index:5;border-radius:3px}
.gsMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.6);font:800 clamp(24px,8vw,42px)/1 "Barlow Condensed",Impact,sans-serif;color:var(--gold);text-shadow:0 3px 0 #0d0b09,0 0 18px rgba(0,0,0,.8);opacity:0;pointer-events:none;z-index:6;white-space:nowrap;text-transform:uppercase;transition:opacity .2s,transform .25s}
.gsMsg.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.gsEnd h3{margin:0 0 4px;font:800 28px "Barlow Condensed",sans-serif;color:var(--gold);text-transform:uppercase}
.gsHist{font-size:14px;opacity:.9}
.gsHistRow{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--line)}
.gsHistRow .w{color:#3fae55}.gsHistRow .l{color:#d8615f}.gsHistRow .d{color:var(--ink)}
`;
  document.head.appendChild(css);

  let GS = null, pane = { tab: 'rank' }, matchId = null, M = null, busy = false, lastMatchStamp = '', liveTimer = null, mainTimer = null;
  let ai = null; // modo entrenamiento contra la IA (nunca toca el servidor)

  const gbName = id => (GS.ranking.find(p => p.id === id) || GS.monthly.find(p => p.id === id) || {}).name
    || (GS.peers.find(p => p.id === id) || {}).name || '???';

  async function load(force) {
    if (!here() && !force) return;
    try { GS = await api('/api/stars?d=' + encodeURIComponent(dev)); } catch (e) { $('#gsRoot').innerHTML = '<p>' + E(e.message) + '</p>'; return; }
    if (ai) return; // no pisar el entrenamiento en curso
    if (GS.activeId && GS.activeId !== matchId) { matchId = GS.activeId; await loadMatch(true); return; }
    if (!matchId) draw();
  }

  async function loadMatch(force) {
    if (!matchId) return;
    let d; try { d = await api('/api/stars/match/' + matchId + '?d=' + encodeURIComponent(dev)); } catch (e) { matchId = null; await load(true); return; }
    const stamp = d.status + '|' + d.turn + '|' + d.goalsA + '|' + d.goalsB + '|' + (d.updatedAt || '');
    const isNew = stamp !== lastMatchStamp || force;
    const prevBodies = M ? M.bodies : null;
    M = d; lastMatchStamp = stamp;
    drawMatch(isNew ? (M.path && !force ? M.path : null) : null, prevBodies);
    if (M.status !== 'live') { matchId2Stop(); }
  }
  function matchId2Stop() { clearInterval(liveTimer); liveTimer = null; }
  function scheduleMatchPoll() {
    clearInterval(liveTimer);
    if (M && M.status === 'live') liveTimer = setInterval(() => { if (!busy) loadMatch(); }, 2200);
  }

  function draw() {
    const el = $('#gsRoot'); if (!el) return;
    if (!GS) { el.innerHTML = '<p>Cargando…</p>'; return; }
    if (matchId && M) { drawMatch(); return; }
    if (!GS.me) {
      el.innerHTML = `<p class="sub">Para jugar usa el mismo nombre de GarraBet/Porra. Si no tienes, ponlo aquí:</p>
      <div class="row"><input id="gsNameIn" maxlength="18" placeholder="Tu nombre"><button id="gsNameBtn" type="button">Guardar</button></div>`;
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
    ${GS.incoming.length ? GS.incoming.map(i => `<div class="gsInv"><span>⚔️ <b>${E(i.a.name)}</b> te ha retado${i.friendly ? ' (amistoso)' : ''}</span><span class="row" style="margin:0"><button type="button" data-acc="${i.id}">Aceptar</button><button type="button" class="ghost" data-dec="${i.id}">Rechazar</button></span></div>`).join('') : ''}
    ${GS.outgoing.length ? GS.outgoing.map(i => `<div class="gsInv"><span>⌛ Esperando a <b>${E(i.b.name)}</b>…</span><button type="button" class="ghost" data-dec="${i.id}">Cancelar</button></div>`).join('') : ''}
    <h2 style="margin-top:18px">⚔️ Retar a la peña</h2>
    <div class="gsPeers">${GS.peers.length ? GS.peers.map(p => `<div class="gsPeer"><b>${E(p.name)}</b><button type="button" data-ch="${p.id}">⭐ Retar</button><button type="button" class="ghost" data-chf="${p.id}">🙂 Amistoso</button></div>`).join('') : '<p class="sub" style="font-size:15px">Todavía no hay nadie más con nombre puesto.</p>'}</div>
    <div class="row"><button type="button" class="ghost" id="gsAI">🤖 Practicar contra la IA (no puntúa)</button><button type="button" class="ghost" id="gsChFicha">👤 Cambiar ficha</button></div>
    <h2 style="margin-top:22px">🏆 Garra Stars</h2>
    <div class="gsTabs">
     <button type="button" class="gsTab${t === 'rank' ? ' on' : ''}" data-t="rank">General</button>
     <button type="button" class="gsTab${t === 'month' ? ' on' : ''}" data-t="month">Del mes</button>
     <button type="button" class="gsTab${t === 'hist' ? ' on' : ''}" data-t="hist">Mi historial</button>
     <button type="button" class="gsTab${t === 'champ' ? ' on' : ''}" data-t="champ">Campeones</button>
    </div>
    <div id="gsPane">${pane_(t, me.id)}</div>`;
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
  function bodyStyle(b) {
    const left = b.x, top = b.y / PH.FH * 100;
    const wd = (b.isBall ? PH.R_BALL : PH.R_DISC) * 2, ht = wd / PH.FH * 100;
    return `left:${left}%;top:${top}%;width:${wd}%;height:${ht}%`;
  }
  function drawMatch(path, prevBodies) {
    const el = $('#gsRoot'); if (!el || !M) return;
    const mine = M.mine, myTurn = mine && M.turn === mine;
    const done = M.status === 'done';
    el.innerHTML = `
    <div class="gsHud"><b>${E(M.a.name)} ${M.goalsA}</b> — <b>${M.goalsB} ${E(M.b.name)}</b></div>
    <p class="gsTurn">${done ? '' : (M.friendly ? '🙂 Amistoso: no puntúa · ' : '') + (myTurn ? '🎯 ¡Tu turno! Arrastra una ficha hacia atrás y suelta' : '⌛ Turno de ' + E(mine === 'a' ? M.b.name : M.a.name))}</p>
    <div id="gsField" class="${myTurn && !done ? 'mine' : ''}" role="application" aria-label="Campo de Garra Stars">
     <div class="gsMid"></div><div class="gsGoal t"></div><div class="gsGoal b"></div>
     <div class="gsMsg" id="gsMsg"></div>
     <i class="gsAim" id="gsAimLine" style="display:none"></i>
     ${M.bodies.map(b => b.isBall ? `<div class="gsBall" id="bd-${b.id}" style="${bodyStyle(b)}"></div>` : `<div class="gsDisc ${b.team}${b.team === mine ? ' mine' : ''}" id="bd-${b.id}" data-id="${b.id}" style="${bodyStyle(b)}"><img src="${img(squadFor(b.team))}" alt="" onerror="this.onerror=null;this.src='escudo.png'"></div>`).join('')}
    </div>
    ${done ? `<div class="gsEnd gsCard"><h3>${M.winner === mine ? '🏆 ¡Victoria!' : M.winner ? '😬 Derrota' : 'Empate'}</h3><p style="margin:0">${M.a.name} ${M.goalsA} - ${M.goalsB} ${M.b.name}${M.payouts ? ' · ' + (mine === 'a' ? fmtDelta(M.payouts.deltaA) : fmtDelta(M.payouts.deltaB)) : ''}</p></div>
    <div class="row"><button type="button" id="gsBack">👈 Volver al lobby</button></div>` :
      `<div class="row"><button type="button" class="ghost" id="gsResign">${matchId === 'ai' ? '👈 Salir del entrenamiento' : '🏳️ Rendirse'}</button></div>`}
    `;
    if (path && path.length) animatePath(path, () => { });
    if (matchId !== 'ai') scheduleMatchPoll();
  }
  function fmtDelta(n) { return (n >= 0 ? '+' : '') + n + ' pts'; }
  function squadFor(team) { return M ? (team === 'a' ? M.a.ficha : M.b.ficha) : null; }

  function animatePath(path, done) {
    let i = 0;
    const step = () => {
      const frame = path[i];
      if (frame) for (const b of frame) { const n = $('#bd-' + b.id); if (n) { n.style.left = (b.x) + '%'; n.style.top = (b.y / PH.FH * 100) + '%'; } }
      i++;
      if (i < path.length) setTimeout(step, 28); else done();
    };
    step();
  }

  function flash(txt) { const m = $('#gsMsg'); if (!m) return; m.textContent = txt; m.classList.remove('on'); void m.offsetWidth; m.classList.add('on'); setTimeout(() => m.classList.remove('on'), 1200); }

  // ---- Arrastrar para chutar ----
  let drag = null;
  function fieldPt(e, field) {
    const r = field.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * PH.FH };
  }
  document.addEventListener('pointerdown', e => {
    const disc = e.target.closest('.gsDisc.mine'); const field = $('#gsField');
    if (!disc || !field || !field.classList.contains('mine') || busy) return;
    const id = disc.dataset.id, b = (M.bodies || []).find(x => x.id === id);
    if (!b) return;
    drag = { id, bx: b.x, by: b.y };
    field.setPointerCapture && field.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const field = $('#gsField'); if (!field) return;
    const p = fieldPt(e, field);
    const line = $('#gsAimLine'); if (!line) return;
    const dx = p.x - drag.bx, dy = p.y - drag.by, dist = Math.hypot(dx, dy);
    const leftPct = drag.bx, topPct = drag.by / PH.FH * 100;
    const ang = Math.atan2(dy * (field.clientHeight / PH.FH), dx * (field.clientWidth / 100));
    line.style.display = 'block';
    line.style.left = leftPct + '%'; line.style.top = topPct + '%';
    line.style.width = Math.min(60, dist) + '%';
    line.style.transform = `rotate(${ang}rad)`;
  });
  document.addEventListener('pointerup', async e => {
    if (!drag) return;
    const field = $('#gsField'); const line = $('#gsAimLine'); if (line) line.style.display = 'none';
    const p = field ? fieldPt(e, field) : drag;
    const pullX = drag.bx - p.x, pullY = drag.by - p.y, dist = Math.hypot(pullX, pullY);
    const d = drag; drag = null;
    if (dist < 2.5) return; // toque sin arrastrar: no dispara
    const MAXPULL = 26, k = Math.min(1, dist / MAXPULL) * PH.MAX_SPEED / dist;
    const vx = pullX * k, vy = pullY * k;
    if (busy) return;
    if (matchId === 'ai') { busy = true; await aiPlayerShoot(d.id, vx, vy); busy = false; return; }
    busy = true;
    try {
      const r = await api('/api/stars/match/' + matchId + '/shoot', 'POST', { device: dev, bodyId: d.id, vx, vy });
      lastMatchStamp = ''; M = r;
      const after = () => { if (r.result === 'A' || r.result === 'B') flash('⚽ ¡GOOOL!'); drawMatch(); busy = false; if (M.status !== 'live') matchId2Stop(); };
      if (r.path && r.path.length) animatePath(r.path, after); else after();
    } catch (err) { toast(err.message); busy = false; loadMatch(true); }
  });

  document.addEventListener('click', async e => {
    if (!here() && !ai) return;
    const nb = e.target.closest('#gsNameBtn');
    if (nb) { try { await api('/api/garrabet/name', 'POST', { device: dev, name: $('#gsNameIn').value }); try { lastJ = ''; } catch { } if (typeof window.load === 'function') window.load(); toast('Nombre guardado'); await load(true); } catch (x) { toast(x.message); } return; }
    const pl = e.target.closest('[data-pl]');
    if (pl) { try { await api('/api/stars/ficha', 'POST', { device: dev, playerId: +pl.dataset.pl }); await load(true); } catch (x) { toast(x.message); } return; }
    if (e.target.closest('#gsChFicha')) { GS.me.ficha = 0; draw(); return; }
    const tb = e.target.closest('.gsTab'); if (tb) { pane.tab = tb.dataset.t; draw(); return; }
    const chAny = e.target.closest('[data-ch],[data-chf]');
    if (chAny) {
      const toId = +(chAny.dataset.ch || chAny.dataset.chf), friendly = chAny.hasAttribute('data-chf');
      try { const r = await api('/api/stars/challenge', 'POST', { device: dev, toId, friendly }); if (r.note) toast(r.note); await load(true); } catch (x) { toast(x.message); }
      return;
    }
    const acc = e.target.closest('[data-acc]');
    if (acc) { try { await api('/api/stars/invite/' + acc.dataset.acc + '/accept', 'POST', { device: dev }); matchId = +acc.dataset.acc; await loadMatch(true); } catch (x) { toast(x.message); } return; }
    const dec = e.target.closest('[data-dec]');
    if (dec) { try { await api('/api/stars/invite/' + dec.dataset.dec + '/decline', 'POST', { device: dev }); await load(true); } catch (x) { toast(x.message); } return; }
    if (e.target.closest('#gsResign')) {
      if (matchId === 'ai') { ai = null; matchId = null; M = null; draw(); return; }
      if (!confirm('¿Rendirte? Cuenta como derrota.')) return;
      try { M = await api('/api/stars/match/' + matchId + '/resign', 'POST', { device: dev }); drawMatch(); } catch (x) { toast(x.message); }
      return;
    }
    if (e.target.closest('#gsBack')) { matchId = null; M = null; ai = null; matchId2Stop(); await load(true); return; }
    if (e.target.closest('#gsAI')) { startAI(); return; }
  });

  // ---- Modo entrenamiento contra la IA: nunca toca el servidor ni el ranking ----
  function startAI() {
    const mine = GS.squad.find(p => p.id === GS.me.ficha), bot = GS.squad[(GS.squad.indexOf(mine) + 1) % GS.squad.length] || mine;
    const k = PH.kickoff ? PH.kickoff() : null;
    ai = { bodies: aiBodies(), goalsA: 0, goalsB: 0, turn: 'a', botFicha: bot };
    M = { friendly: true, status: 'live', turn: 'a', mine: 'a', goalsA: 0, goalsB: 0, bodies: ai.bodies, a: { name: GS.me.name, ficha: mine }, b: { name: bot.name + ' (IA)', ficha: bot } };
    matchId = 'ai';
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
  // El chute del jugador en modo IA pasa por la MISMA simulación (PH.simulate), solo que corre aquí en vez de en el servidor
  async function aiPlayerShoot(bodyId, vx, vy) {
    const bodies = M.bodies.map(b => ({ ...b }));
    const b = bodies.find(x => x.id === bodyId); b.vx = vx; b.vy = vy;
    const { bodies: fin, scored, path } = PH.simulate(bodies, true);
    M.bodies = fin;
    if (scored === 'A') { M.goalsA++; const bl = M.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (scored === 'B') { M.goalsB++; const bl = M.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (!scored) M.turn = 'b';
    animatePath(path, async () => {
      if (M.goalsA >= 3 || M.goalsB >= 3) { M.status = 'done'; M.winner = M.goalsA > M.goalsB ? 'a' : 'b'; drawMatch(); return; }
      drawMatch();
      if (M.turn === 'b') await aiTurn();
    });
  }
  async function aiTurn() {
    await new Promise(r => setTimeout(r, 650));
    const bodies = M.bodies.map(b => ({ ...b }));
    const ball = bodies.find(x => x.isBall);
    const mine3 = bodies.filter(x => x.team === 'b');
    mine3.sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
    const shooter = mine3[0];
    let ang = Math.atan2(ball.y - shooter.y, ball.x - shooter.x) + (Math.random() - 0.5) * 0.5;
    const power = (0.55 + Math.random() * 0.45) * PH.MAX_SPEED;
    const b = bodies.find(x => x.id === shooter.id); b.vx = Math.cos(ang) * power; b.vy = Math.sin(ang) * power;
    const { bodies: fin, scored, path } = PH.simulate(bodies, true);
    M.bodies = fin;
    if (scored === 'A') { M.goalsA++; const bl = M.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (scored === 'B') { M.goalsB++; const bl = M.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (!scored) M.turn = 'a';
    animatePath(path, async () => {
      if (M.goalsA >= 3 || M.goalsB >= 3) { M.status = 'done'; M.winner = M.goalsA > M.goalsB ? 'a' : 'b'; drawMatch(); return; }
      drawMatch();
      if (M.turn === 'b') await aiTurn();
    });
  }

  addEventListener('hashchange', () => { if (here()) load(true); });
  mainTimer = setInterval(() => { if (here() && !matchId) load(); }, 20000);
  if (here()) load(true);
})();
