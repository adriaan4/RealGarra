// ---- GARRA STARS: minijuego 1v1 estilo Soccer Stars (Miniclip) con ranking propio ----
// Usa el mismo nombre que GarraBet/Porra (un nombre por dispositivo, db.garrabet.users): no hay cuentas nuevas.
// Cada persona elige una "ficha" (un jugador de la plantilla) como su avatar en el campo.
// El resultado de cada tiro lo recalcula el SERVIDOR con el mismo motor de físicas que el navegador
// (public/physics.js): el cliente solo manda el chute (qué ficha y con qué fuerza), nunca el resultado.
// Lobby: alguien crea una partida abierta y otra persona se une. Cada partido dura 3 minutos (cuenta atrás en el servidor);
// tras un gol todo vuelve a la formación inicial, saca quien ha encajado y la celebración no resta tiempo.
// Las partidas amistosas y contra la IA no puntúan; la IA se juega entera en el navegador (no pasa por aquí).
module.exports = function garraStars({ app, getDb, save, admin, bad, norm, crypto, sendPush }) {
  const PH = require('./public/physics.js');
  const MATCH_MS = 3 * 60 * 1000;          // el partido dura 3 minutos (cuenta atrás); gana quien tenga más goles al acabar
  const CELEB_MS = 1000;                   // pausa de celebración tras un gol: NO se descuenta de la cuenta atrás
  const FRAME_MS = 16;                     // ms por fotograma al animar un tiro (igual que en el navegador)
  const OPEN_TTL_MS = 15 * 60 * 1000;      // una partida abierta que nadie coge se borra sola
  const COOLDOWN_MS = 2 * 3600 * 1000;     // entre los mismos dos rivales: si juegan más seguido, la revancha es amistosa (no puntúa)
  const HIST_KEEP = 25;
  const SEARCH_PUSH_COOLDOWN_MS = 2 * 60 * 1000; // aviso de "busca partida": como mucho 1 cada 2 min por persona (evita spam si crea/cancela sin parar)
  const lastSearchPush = new Map();        // uid -> instante del último aviso
  const SIM_BAND = 100;                    // diferencia de puntos que se considera "nivel similar"
  const r0 = n => Math.round(n);

  // ---- Tiempo real (SSE): el servidor EMPUJA cada tiro a los dos jugadores y a quien mira, sin esperar a que pregunten ----
  const matchStreams = new Map();          // id de partida -> Set de conexiones {res, uid}
  const lobbyStreams = new Set();          // conexiones que están en el lobby (para refrescar partidas abiertas / directos al instante)
  const lastCheer = new Map();             // uid -> instante del último confeti (anti-spam)
  const CHEER_GAP_MS = 2000;               // un confeti cada 2 segundos por persona
  const pollWatch = new Map();             // id partida -> Map(clave -> último instante en que consultó) : respaldo si el SSE no llega (proxy que lo corta)
  const WATCH_WIN_MS = 8000;
  const cheerLog = new Map();              // id partida -> { seq, list:[{n, side, cid, t}] } : el confeti también viaja por consulta, no solo por SSE
  function touchWatch(id, key) { let w = pollWatch.get(id); if (!w) pollWatch.set(id, w = new Map()); const now = Date.now(); w.set(key, now); if (w.size > 200) for (const [k, t] of w) if (now - t > WATCH_WIN_MS) w.delete(k); }
  function pollViewers(id) { const w = pollWatch.get(id); if (!w) return 0; const now = Date.now(); let n = 0; for (const [k, t] of w) { if (now - t <= WATCH_WIN_MS) n++; else w.delete(k); } return n; }
  const viewersOf = id => { const set = matchStreams.get(id); let n = 0; if (set) for (const c of set) if (c.watch) n++; return Math.max(n, pollViewers(id)); }; // 👁 los que MIRAN (SSE o consulta; el mayor de los dos para no contar doble)
  function pushViewers(id) { const set = matchStreams.get(id); if (!set || !set.size) return; const n = String(viewersOf(id)); for (const c of set) sseWrite(c, 'viewers', n); }
  function sseWrite(c, ev, data) { try { c.res.write('event: ' + ev + '\ndata: ' + data + '\n\n'); } catch (e) { /* se limpia en 'close' */ } }
  function pushMatch(m, skipUid) { // manda el estado de la partida a todos los que la siguen (cada uno con su 'mine')
    const set = matchStreams.get(m.id); if (!set || !set.size) return;
    const base = matchOut(m, null), cache = {};
    for (const c of set) {
      if (skipUid != null && c.uid === skipUid) continue; // quien ha tirado ya lo anima en local y recibe la respuesta del POST
      const mine = c.uid != null && m.a.uid === c.uid ? 'a' : c.uid != null && m.b && m.b.uid === c.uid ? 'b' : null;
      sseWrite(c, 'match', cache[mine] || (cache[mine] = JSON.stringify({ ...base, mine })));
    }
  }
  let lobbyTimer = null;
  function pushLobby() { // junta varios avisos seguidos en uno
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => { lobbyTimer = null; for (const c of lobbyStreams) sseWrite(c, 'lobby', '1'); }, 120);
  }
  // Guardar en disco/Redis TARDA (se escribe toda la base de datos): en los tiros ya no se espera a ello para contestar.
  let saveTimer = null;
  function saveSoon() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; Promise.resolve(save()).catch(() => { }); }, 300); }

  function ST() {
    const db = getDb();
    let s = db.stars;
    if (!s || typeof s !== 'object') s = db.stars = {};
    if (!s.users || typeof s.users !== 'object' || Array.isArray(s.users)) s.users = {};
    if (!s.matches || typeof s.matches !== 'object' || Array.isArray(s.matches)) s.matches = {};
    if (!Array.isArray(s.champions)) s.champions = [];
    if (!s.month) s.month = monthKey();
    return s;
  }
  const monthKey = () => new Date().toISOString().slice(0, 7);
  const divOf = pts => pts >= 3000 ? 'Leyenda' : pts >= 2500 ? 'Diamante' : pts >= 2000 ? 'Platino' : pts >= 1500 ? 'Oro' : pts >= 1000 ? 'Plata' : 'Bronce';

  function profile(uid) {
    const s = ST();
    let u = s.users[uid];
    if (!u) u = s.users[uid] = { id: uid, ficha: 0, pts: 1000, w: 0, l: 0, d: 0, streak: 0, best: 0, mW: 0, mL: 0, mD: 0, mPts: 0, hist: [], lastVs: {} };
    for (const k of ['pts']) if (typeof u[k] !== 'number' || !Number.isFinite(u[k])) u[k] = 1000;
    for (const k of ['w', 'l', 'd', 'streak', 'best', 'mW', 'mL', 'mD', 'mPts', 'ficha']) if (typeof u[k] !== 'number' || !Number.isFinite(u[k])) u[k] = 0;
    if (!Array.isArray(u.hist)) u.hist = [];
    if (!u.lastVs || typeof u.lastVs !== 'object') u.lastVs = {};
    return u;
  }

  // Si ha cambiado el mes desde la última vez: se archiva el campeón del mes anterior y se reinician los contadores mensuales
  // (el ranking global -puntos, victorias, derrotas- NUNCA se borra, solo esto)
  function cleanup() { // partidas abiertas que nadie ha cogido, retos antiguos y partidas acabadas tras 7 días (ya aplicadas al ranking)
    const s = ST(), now = Date.now();
    for (const id in s.matches) {
      const m = s.matches[id];
      if (m.status === 'invite') delete s.matches[id]; // sistema antiguo de retos directos: ya no existe
      else if (m.status === 'open' && now - m.createdAt > OPEN_TTL_MS) delete s.matches[id];
      else if (m.status === 'done' && now - (m.updatedAt || m.createdAt) > 7 * 86400e3) delete s.matches[id];
    }
  }

  // ---- Reloj del partido: endsAt es el instante en que acaba; cada gol lo retrasa lo que dura la celebración (pausedUntil) ----
  function timeLeft(m, now) {
    if (!m.endsAt) m.endsAt = now + MATCH_MS; // partidas en juego del sistema antiguo: empiezan con 3 min completos
    return Math.max(0, m.endsAt - Math.max(now, m.pausedUntil || 0));
  }
  function finishByTime(m, now) { // se acabó el tiempo: gana quien tenga más goles; empate = empate
    m.status = 'done'; m.byTime = true;
    m.winner = m.goalsA > m.goalsB ? 'a' : m.goalsB > m.goalsA ? 'b' : null;
    m._path = null; m._result = null;
    m.payouts = applyResult(m);
    m.updatedAt = now;
    pushMatch(m); pushLobby();
  }
  function sweepExpired() { // cierra las partidas cuyo reloj ha llegado a 0 (aunque nadie las esté mirando)
    const s = ST(), now = Date.now(); let n = 0;
    for (const m of Object.values(s.matches)) if (m.status === 'live' && timeLeft(m, now) <= 0) { finishByTime(m, now); n++; }
    return n;
  }
  setInterval(async () => { try { if (getDb() && sweepExpired()) await save(); } catch (e) { /* se reintenta en 5 s */ } }, 5000).unref();

  function ensureMonth() {
    cleanup();
    const s = ST(), key = monthKey();
    if (s.month === key) return;
    const ranked = Object.values(s.users).filter(u => u.mW + u.mL + u.mD > 0).sort((a, b) => b.mPts - a.mPts);
    if (ranked.length) {
      const champ = ranked[0], gu = (getDb().garrabet.users || []).find(x => x.id === champ.id);
      s.champions.unshift({ month: s.month, uid: champ.id, name: gu ? gu.name : '???', pts: champ.mPts });
      s.champions = s.champions.slice(0, 24);
    }
    for (const u of Object.values(s.users)) { u.mW = 0; u.mL = 0; u.mD = 0; u.mPts = 0; }
    s.month = key;
  }

  const squad = () => getDb().squad || [];
  const gbUsers = () => getDb().garrabet.users || [];
  const gbName = uid => { const u = gbUsers().find(x => x.id === uid); return u ? u.name : null; };
  const who = req => {
    const d = String(req.query.d || req.body.device || '').slice(0, 80);
    return d.length >= 8 ? gbUsers().find(x => x.device === d) : null;
  };

  function winBonus(diff) { // diff = puntos del rival - puntos míos (positivo = rival más fuerte)
    if (diff > SIM_BAND) { const d = Math.min(500, diff); return 30 + Math.round(Math.min(1, (d - SIM_BAND) / 400) * 10); } // 30..40
    if (diff < -SIM_BAND) { const d = Math.min(500, -diff); return 20 - Math.round(Math.min(1, (d - SIM_BAND) / 400) * 5); } // 20..15
    return 25;
  }
  function loseAmount(diff) { return diff > SIM_BAND ? -10 : diff < -SIM_BAND ? -30 : -20; }

  function outProfile(uid) {
    const u = profile(uid);
    return { id: uid, name: gbName(uid) || '???', ficha: u.ficha, pts: u.pts, div: divOf(u.pts), w: u.w, l: u.l, d: u.d, streak: u.streak, best: u.best, mPts: u.mPts, mW: u.mW, mL: u.mL, mD: u.mD };
  }
  function ranking() {
    return Object.keys(ST().users).map(k => outProfile(+k)).filter(p => p.name !== '???' && p.w + p.l + p.d > 0).sort((a, b) => b.pts - a.pts || b.w - a.w);
  }
  function monthlyRanking() {
    return Object.keys(ST().users).map(k => outProfile(+k)).filter(p => p.name !== '???' && p.mW + p.mL + p.mD > 0).sort((a, b) => b.mPts - a.mPts);
  }

  // ---- Aplica el resultado de una partida YA TERMINADA a los dos perfiles (puntos, racha, liga, historial) ----
  function applyResult(match) {
    const s = ST(), ua = profile(match.a.uid), ub = profile(match.b.uid);
    const friendly = !!match.friendly;
    const now = Date.now();
    ua.lastVs[match.b.uid] = now; ub.lastVs[match.a.uid] = now;
    let resA, resB, deltaA = 0, deltaB = 0;
    if (match.goalsA === match.goalsB) { resA = resB = 'd'; }
    else if (match.goalsA > match.goalsB) { resA = 'w'; resB = 'l'; } else { resA = 'l'; resB = 'w'; }

    function settle(u, opp, res, abandoned) {
      if (friendly) { if (res === 'w') u.streak = 0; return 0; } // amistoso: no toca puntos ni racha
      const diff = opp.pts - u.pts;
      let delta;
      if (res === 'd') { delta = 5; u.streak = 0; }
      else if (res === 'w') {
        u.streak++;
        delta = winBonus(diff);
        if (u.streak === 3) delta += 10; else if (u.streak === 5) delta += 20;
        if (res === 'w' && ((u === ua && match.goalsB === 0) || (u === ub && match.goalsA === 0))) delta += 5; // portería a cero
      } else {
        u.streak = 0;
        delta = abandoned ? -30 : loseAmount(diff);
      }
      u.pts = Math.max(0, u.pts + delta);
      if (res === 'w') u.w++; else if (res === 'l') u.l++; else u.d++;
      if (res === 'w') { u.mW++; u.mPts += delta; } else if (res === 'l') { u.mL++; u.mPts += delta; } else { u.mD++; u.mPts += delta; }
      if (u.streak > u.best) u.best = u.streak;
      return delta;
    }
    deltaA = settle(ua, ub, resA, match.abandonedBy === 'a');
    deltaB = settle(ub, ua, resB, match.abandonedBy === 'b');

    const push = (u, oppUid, res, delta) => {
      u.hist.unshift({ at: now, opp: oppUid, oppName: gbName(oppUid) || '???', res, delta, friendly, score: u === ua ? [match.goalsA, match.goalsB] : [match.goalsB, match.goalsA] });
      u.hist = u.hist.slice(0, HIST_KEEP);
    };
    push(ua, match.b.uid, resA, deltaA);
    push(ub, match.a.uid, resB, deltaB);
    return { deltaA, deltaB };
  }

  function squadMini(id) { const p = squad().find(x => x.id === id); return p ? { id: p.id, name: p.name, hasPhoto: !!p.photo, photoV: p.photoV || 0 } : null; }
  function side(uid, ficha) { return { uid, ficha, name: gbName(uid), ...PH.kickoff() }; } // se rellena luego con bodies reales

  function sideOut(x) { return x ? { uid: x.uid, name: gbName(x.uid) || x.name, ficha: squadMini(x.ficha) } : { uid: null, name: '…', ficha: null }; }
  function matchOut(m, forUid) {
    const now = Date.now(), live = m.status === 'live';
    return {
      id: m.id, friendly: !!m.friendly, status: m.status, turn: m.turn, matchMs: MATCH_MS, byTime: !!m.byTime, updatedAt: m.updatedAt || 0,
      goalsA: m.goalsA, goalsB: m.goalsB, bodies: m.bodies,
      timeLeftMs: live ? timeLeft(m, now) : m.status === 'done' ? 0 : MATCH_MS,
      pauseMs: live ? Math.max(0, (m.pausedUntil || 0) - now) : 0, // celebración en curso: el reloj está parado
      viewers: live ? viewersOf(m.id) : 0,
      cheerSeq: (cheerLog.get(m.id) || { seq: 0 }).seq, cheers: live && cheerLog.get(m.id) ? cheerLog.get(m.id).list.filter(c => now - c.t < 6000) : [],
      a: sideOut(m.a), b: sideOut(m.b),
      mine: m.a.uid === forUid ? 'a' : m.b && m.b.uid === forUid ? 'b' : null,
      winner: m.winner || null, path: m._path || null, result: m._result || null, payouts: m.payouts || null
    };
  }

  function freshBodies() {
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

  const isMine = (m, uid) => m.a.uid === uid || (m.b && m.b.uid === uid);
  const busyFor = uid => Object.values(ST().matches).some(m => (m.status === 'open' || m.status === 'live') && isMine(m, uid));

  // ---- Estado general + mi perfil + ranking + plantilla + partidas abiertas (lobby) ----
  app.get('/api/stars', async (req, res) => {
    ensureMonth();
    if (sweepExpired()) await save();
    const d = String(req.query.d || '').slice(0, 80), me = d.length >= 8 ? who({ query: { d } }) : null;
    const s = ST(), all = Object.values(s.matches);
    const open = all.filter(m => m.status === 'open' && (!me || m.a.uid !== me.id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30)
      .map(m => { const u = profile(m.a.uid); return { id: m.id, name: gbName(m.a.uid) || m.a.name, ficha: squadMini(m.a.ficha), pts: u.pts, div: divOf(u.pts), friendly: !!m.friendly }; });
    const waiting = me ? all.find(m => m.status === 'open' && m.a.uid === me.id) : null;
    const now = Date.now();
    const live = all.filter(m => m.status === 'live').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20)
      .filter(m => m.b).map(m => ({ id: m.id, a: gbName(m.a.uid) || m.a.name, b: gbName(m.b.uid) || m.b.name, goalsA: m.goalsA, goalsB: m.goalsB, timeLeftMs: timeLeft(m, now), friendly: !!m.friendly, viewers: viewersOf(m.id) }));
    res.json({
      me: me ? { ...outProfile(me.id), hist: profile(me.id).hist } : null,
      squad: squad().map(p => ({ id: p.id, name: p.name, hasPhoto: !!p.photo, photoV: p.photoV || 0 })),
      ranking: ranking().slice(0, 100),
      monthly: monthlyRanking().slice(0, 100),
      champions: s.champions,
      live,                                                   // partidos en directo (para mirarlos)
      open,                                                   // partidas creadas por otras personas esperando rival
      waiting: waiting ? { id: waiting.id, friendly: !!waiting.friendly } : null, // la mía, si tengo una abierta
      activeId: me ? (all.find(m => m.status === 'live' && isMine(m, me.id)) || {}).id || null : null
    });
  });

  // ---- Canal en directo (SSE): ?match=ID para seguir una partida (jugando o mirando); sin match = lobby ----
  app.get('/api/stars/stream', (req, res) => {
    const me = who(req), mid = +req.query.match || 0;
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    if (req.socket) { req.socket.setTimeout(0); req.socket.setNoDelay(true); req.socket.setKeepAlive(true); }
    res.flushHeaders && res.flushHeaders();
    res.write('retry: 1000\n\n');
    const c = { res, uid: me ? me.id : null, watch: !!mid && String(req.query.watch || '') === '1' };
    res.on('error', () => { });            // un cliente que se corta no tumba el servidor
    let set;
    if (mid) { set = matchStreams.get(mid); if (!set) matchStreams.set(mid, set = new Set()); } else set = lobbyStreams;
    if (set.size >= 400) { try { res.end(); } catch (e) { } return; } // tope de seguridad por canal
    set.add(c);
    if (c.watch) { pushViewers(mid); pushLobby(); } // alguien se ha puesto a mirar: el ojo sube para todos
    const hb = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) { } }, 15000);
    res.on('close', () => { clearInterval(hb); set.delete(c); if (mid && !set.size) matchStreams.delete(mid); if (c.watch) { pushViewers(mid); pushLobby(); } }); // res (no req): en Node moderno req 'close' salta al acabar de leer la petición
  });

  app.post('/api/stars/ficha', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const p = squad().find(x => x.id === +req.body.playerId);
    if (!p) return bad(res, 'Elige un jugador de la plantilla');
    profile(me.id).ficha = p.id;
    await save(); res.json({ ok: true });
  });

  // ---- Aviso push a todos los dispositivos suscritos (menos el de quien busca): "X está buscando partida ... en Garra Stars" ----
  function notifySearching(me, friendly, matchId, device) {
    if (typeof sendPush !== 'function') return;
    const now = Date.now();
    if (now - (lastSearchPush.get(me.id) || 0) < SEARCH_PUSH_COOLDOWN_MS) return;
    lastSearchPush.set(me.id, now);
    const payload = JSON.stringify({
      title: '⭐ Garra Stars',
      body: me.name + ' está buscando partida ' + (friendly ? 'amistosa' : 'competitiva') + ' en Garra Stars',
      url: '/#garrastars',
      tag: 'stars-search-' + me.id
    });
    sendPush('subs', payload, s => !device || s.device !== device).catch(e => console.error('Aviso Garra Stars: ' + e.message));
  }

  // ---- Crear una partida abierta (cualquiera puede unirse) ----
  app.post('/api/stars/create', async (req, res) => {
    ensureMonth();
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const you = profile(me.id); if (!you.ficha) return bad(res, 'Elige primero tu ficha');
    if (sweepExpired()) await save();
    if (busyFor(me.id)) return bad(res, 'Ya tienes una partida abierta o en marcha');
    const s = ST(), id = getDb().nextId++;
    s.matches[id] = {
      id, a: { uid: me.id, ficha: you.ficha, name: me.name }, b: null,
      goalsA: 0, goalsB: 0, turn: 'a', bodies: freshBodies(),
      friendly: !!req.body.friendly, status: 'open', winner: null, createdAt: Date.now(), updatedAt: Date.now()
    };
    pushLobby(); saveSoon();
    notifySearching(me, !!req.body.friendly, id, String(req.body.device || '').slice(0, 80));
    res.json({ ok: true, id });
  });

  // ---- Unirse a la partida abierta de otra persona: en ese momento empieza la cuenta atrás ----
  app.post('/api/stars/join/:id', async (req, res) => {
    ensureMonth();
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const mine = profile(me.id); if (!mine.ficha) return bad(res, 'Elige primero tu ficha');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'open') return bad(res, 'Esa partida ya no está disponible');
    if (m.a.uid === me.id) return bad(res, 'Esa partida es tuya: espera a que se una alguien');
    if (busyFor(me.id)) return bad(res, 'Ya tienes una partida abierta o en marcha');
    const host = profile(m.a.uid), now = Date.now();
    let note = '';
    const last = Math.max(host.lastVs[me.id] || 0, mine.lastVs[m.a.uid] || 0);
    if (!m.friendly && now - last < COOLDOWN_MS) { m.friendly = true; note = 'Habéis jugado hace muy poco: esta va de amistoso y no puntúa (para que nadie se infle el ranking jugando siempre contra el mismo rival)'; }
    m.b = { uid: me.id, ficha: mine.ficha, name: me.name };
    m.status = 'live'; m.turn = 'a'; m.bodies = freshBodies();
    m.endsAt = now + MATCH_MS; m.pausedUntil = 0; m.updatedAt = now;
    pushLobby(); saveSoon();
    res.json({ ok: true, id: m.id, note });
  });

  app.post('/api/stars/open/:id/cancel', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'open' || m.a.uid !== me.id) return bad(res, 'Esa partida ya no existe');
    delete s.matches[m.id];
    pushLobby(); saveSoon(); res.json({ ok: true });
  });

  // ---- Ver una partida (también cierra la partida si el reloj ya ha llegado a 0) ----
  app.get('/api/stars/match/:id', async (req, res) => {
    const me = who(req);
    const m = ST().matches[+req.params.id];
    if (!m || !me || !isMine(m, me.id)) return bad(res, 'Partida no encontrada');
    if (m.status === 'live' && timeLeft(m, Date.now()) <= 0) { finishByTime(m, Date.now()); await save(); }
    const out = matchOut(m, me.id);
    if (+req.query.since === (m.updatedAt || 0)) out.path = null; // nada nuevo: no se reenvía la animación
    res.json(out);
  });

  // ---- Mirar un partido en directo (cualquiera, sin poder tocar nada) ----
  app.get('/api/stars/watch/:id', async (req, res) => {
    const m = ST().matches[+req.params.id];
    if (!m || (m.status !== 'live' && m.status !== 'done')) return bad(res, 'Ese partido ya no está');
    if (m.status === 'live' && timeLeft(m, Date.now()) <= 0) { finishByTime(m, Date.now()); await save(); }
    if (m.status === 'live') { const me = who(req); touchWatch(m.id, me ? 'u' + me.id : 'd' + String(req.query.d || req.ip || '').slice(0, 80)); }
    const out = matchOut(m, null);
    if (+req.query.since === (m.updatedAt || 0)) out.path = null;
    res.json(out);
  });

  // ---- Confeti: solo el PÚBLICO (quien mira, no quien juega) anima a un bando; lo ven los dos jugadores y todos los espectadores ----
  app.post('/api/stars/match/:id/cheer', (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para animar');
    const m = ST().matches[+req.params.id];
    if (!m || m.status !== 'live' || !m.b) return bad(res, 'Ese partido ya no está en directo');
    if (isMine(m, me.id)) return bad(res, 'El confeti es para el público: tú estás jugando');
    const side = req.body.side === 'a' ? 'a' : req.body.side === 'b' ? 'b' : null;
    if (!side) return bad(res, 'Elige a quién animar');
    const now = Date.now();
    if (now - (lastCheer.get(me.id) || 0) < CHEER_GAP_MS) return bad(res, '🎉 Espera un par de segundos para el siguiente confeti');
    lastCheer.set(me.id, now);
    if (lastCheer.size > 500) for (const [k, t] of lastCheer) if (now - t > 60000) lastCheer.delete(k);
    let lg = cheerLog.get(m.id); if (!lg) cheerLog.set(m.id, lg = { seq: 0, list: [] });
    const cid = String(req.body.cid || '').slice(0, 24), n = ++lg.seq;
    lg.list.push({ n, side, cid, t: now }); lg.list = lg.list.filter(c => now - c.t < 6000).slice(-20);
    const set = matchStreams.get(m.id);
    if (set) { const data = JSON.stringify({ side, n, cid }); for (const c of set) if (c.uid !== me.id) sseWrite(c, 'cheer', data); } // quien lo manda ya lo ve en local
    res.json({ ok: true, n });
  });

  // ---- Tirar: el cliente solo manda la ficha y la fuerza del chute; el servidor vuelve a simular él solo ----
  app.post('/api/stars/match/:id/shoot', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'live') return bad(res, 'Esa partida no está en juego');
    const mySide = m.a.uid === me.id ? 'a' : m.b && m.b.uid === me.id ? 'b' : null;
    if (!mySide) return bad(res, 'Esta partida no es tuya');
    const now = Date.now();
    if (timeLeft(m, now) <= 0) { finishByTime(m, now); await save(); return bad(res, '⏱️ Se acabó el tiempo'); }
    if (now < (m.pausedUntil || 0)) return bad(res, 'Espera a que acabe la celebración');
    if (m.turn !== mySide) return bad(res, 'Todavía no es tu turno');
    const bodyId = String(req.body.bodyId || '');
    const b = m.bodies.find(x => x.id === bodyId && x.team === mySide);
    if (!b) return bad(res, 'Elige una de tus fichas');
    let vx = Number(req.body.vx), vy = Number(req.body.vy);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return bad(res, 'Tiro no válido');
    [vx, vy] = PH.clampPower(vx, vy); // el servidor manda: la potencia nunca pasa del máximo aunque el cliente mienta
    const bodies = m.bodies.map(x => ({ ...x }));
    const shooter = bodies.find(x => x.id === bodyId); shooter.vx = vx; shooter.vy = vy;
    const { bodies: final, scored, path } = PH.simulate(bodies, true);
    m._path = path; m._result = scored;
    if (scored) {
      if (scored === 'A') m.goalsA++; else m.goalsB++;
      m.bodies = freshBodies();                    // tras un gol todo vuelve a la formación inicial (3 fichas + balón al centro)
      m.turn = scored === 'A' ? 'b' : 'a';         // y saca quien ha encajado el gol
      const pause = path.length * FRAME_MS + CELEB_MS; // vuelo del balón hasta la red + celebración: el reloj no corre
      m.pausedUntil = now + pause; m.endsAt += pause;
    } else {
      m.bodies = final.map(({ id, team, isBall, x, y }) => ({ id, team, isBall, x: r0(x * 100) / 100, y: r0(y * 100) / 100, vx: 0, vy: 0 }));
      m.turn = m.turn === 'a' ? 'b' : 'a';
    }
    m.updatedAt = now;
    pushMatch(m, me.id);                   // el rival y los que miran lo ven YA (sin esperar al guardado)
    if (scored) pushLobby();               // marcador del directo en el lobby
    saveSoon();                            // el guardado va en segundo plano: no hace esperar a nadie
    res.json(matchOut(m, me.id));
  });

  app.post('/api/stars/match/:id/resign', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'live') return bad(res, 'Esa partida no está en juego');
    const mySide = m.a.uid === me.id ? 'a' : m.b && m.b.uid === me.id ? 'b' : null;
    if (!mySide) return bad(res, 'Esta partida no es tuya');
    m.status = 'done'; m.abandonedBy = mySide; m.winner = mySide === 'a' ? 'b' : 'a';
    if (mySide === 'a') m.goalsB = Math.max(m.goalsB, m.goalsA + 1); else m.goalsA = Math.max(m.goalsA, m.goalsB + 1);
    m._path = null; m._result = null; m.updatedAt = Date.now();
    m.payouts = applyResult(m);
    pushMatch(m, me.id); pushLobby();
    await save();                          // aquí sí: cambia el ranking
    res.json(matchOut(m, me.id));
  });
};
