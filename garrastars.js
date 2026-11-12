// ---- GARRA STARS: minijuego 1v1 estilo Soccer Stars (Miniclip) con ranking propio ----
// Usa el mismo nombre que GarraBet/Porra (un nombre por dispositivo, db.garrabet.users): no hay cuentas nuevas.
// Cada persona elige una "ficha" (un jugador de la plantilla) como su avatar en el campo.
// El resultado de cada tiro lo recalcula el SERVIDOR con el mismo motor de físicas que el navegador
// (public/physics.js): el cliente solo manda el chute (qué ficha y con qué fuerza), nunca el resultado.
// Las partidas amistosas y contra la IA no puntúan; la IA se juega entera en el navegador (no pasa por aquí).
module.exports = function garraStars({ app, getDb, save, admin, bad, norm, crypto }) {
  const PH = require('./public/physics.js');
  const TARGET_GOALS = 3;                 // primero en marcar esto gana el partido
  const COOLDOWN_MS = 2 * 3600 * 1000;     // entre los mismos dos rivales: si juegan más seguido, la revancha es amistosa (no puntúa)
  const HIST_KEEP = 25;
  const SIM_BAND = 100;                    // diferencia de puntos que se considera "nivel similar"
  const r0 = n => Math.round(n);

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
  function cleanup() { // retos sin responder tras 1h y partidas acabadas tras 7 días (ya aplicadas al ranking, no hace falta guardar el campo para siempre)
    const s = ST(), now = Date.now();
    for (const id in s.matches) {
      const m = s.matches[id];
      if (m.status === 'invite' && now - m.createdAt > 3600e3) delete s.matches[id];
      else if (m.status === 'done' && now - (m.updatedAt || m.createdAt) > 7 * 86400e3) delete s.matches[id];
    }
  }

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

  function matchOut(m, forUid) {
    return {
      id: m.id, friendly: !!m.friendly, target: m.target, status: m.status, turn: m.turn,
      goalsA: m.goalsA, goalsB: m.goalsB, bodies: m.bodies,
      a: { uid: m.a.uid, name: gbName(m.a.uid) || m.a.name, ficha: squadMini(m.a.ficha) },
      b: { uid: m.b.uid, name: gbName(m.b.uid) || m.b.name, ficha: squadMini(m.b.ficha) },
      mine: m.a.uid === forUid ? 'a' : m.b.uid === forUid ? 'b' : null,
      winner: m.winner || null, path: m._path || null, result: m._result || null
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

  // ---- Estado general + mi perfil + ranking + plantilla + retos pendientes ----
  app.get('/api/stars', (req, res) => {
    ensureMonth();
    const d = String(req.query.d || '').slice(0, 80), me = d.length >= 8 ? who({ query: { d } }) : null;
    const s = ST();
    const peers = gbUsers().filter(u => !me || u.id !== me.id).map(u => ({ id: u.id, name: u.name }));
    const invites = Object.values(s.matches).filter(m => m.status === 'invite');
    res.json({
      me: me ? { ...outProfile(me.id), hist: profile(me.id).hist } : null,
      squad: squad().map(p => ({ id: p.id, name: p.name, hasPhoto: !!p.photo, photoV: p.photoV || 0 })),
      ranking: ranking().slice(0, 100),
      monthly: monthlyRanking().slice(0, 100),
      champions: s.champions,
      peers,
      incoming: me ? invites.filter(m => m.b.uid === me.id).map(m => matchOut(m, me.id)) : [],
      outgoing: me ? invites.filter(m => m.a.uid === me.id).map(m => matchOut(m, me.id)) : [],
      activeId: me ? (Object.values(s.matches).find(m => m.status === 'live' && (m.a.uid === me.id || m.b.uid === me.id)) || {}).id || null : null
    });
  });

  app.post('/api/stars/ficha', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const p = squad().find(x => x.id === +req.body.playerId);
    if (!p) return bad(res, 'Elige un jugador de la plantilla');
    profile(me.id).ficha = p.id;
    await save(); res.json({ ok: true });
  });

  // ---- Retar a alguien (o jugar amistoso) ----
  app.post('/api/stars/challenge', async (req, res) => {
    ensureMonth();
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const you = profile(me.id); if (!you.ficha) return bad(res, 'Elige primero tu ficha');
    const toId = +req.body.toId, rival = gbUsers().find(x => x.id === toId);
    if (!rival || rival.id === me.id) return bad(res, 'Elige un rival válido');
    const rp = profile(rival.id); if (!rp.ficha) return bad(res, (rival.name) + ' todavía no ha elegido su ficha');
    const s = ST();
    const busy = Object.values(s.matches).some(m => (m.status === 'invite' || m.status === 'live') && [m.a.uid, m.b.uid].includes(me.id));
    if (busy) return bad(res, 'Ya tienes un reto o una partida en marcha');
    let friendly = !!req.body.friendly;
    const last = Math.max(you.lastVs[rival.id] || 0, rp.lastVs[me.id] || 0);
    let note = '';
    if (!friendly && Date.now() - last < COOLDOWN_MS) { friendly = true; note = 'Habéis jugado hace muy poco: esta va de amistoso y no puntúa (para que nadie se infle el ranking jugando siempre contra el mismo rival)'; }
    const id = getDb().nextId++;
    s.matches[id] = {
      id, a: { uid: me.id, ficha: you.ficha, name: me.name }, b: { uid: rival.id, ficha: rp.ficha, name: rival.name },
      goalsA: 0, goalsB: 0, target: TARGET_GOALS, turn: 'a', bodies: freshBodies(),
      friendly, status: 'invite', winner: null, createdAt: Date.now(), updatedAt: Date.now()
    };
    await save();
    res.json({ ok: true, id, note });
  });

  app.post('/api/stars/invite/:id/accept', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'invite' || m.b.uid !== me.id) return bad(res, 'Ese reto ya no existe');
    m.status = 'live'; m.updatedAt = Date.now();
    await save(); res.json({ ok: true });
  });
  app.post('/api/stars/invite/:id/decline', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'invite' || (m.b.uid !== me.id && m.a.uid !== me.id)) return bad(res, 'Ese reto ya no existe');
    delete s.matches[m.id];
    await save(); res.json({ ok: true });
  });

  // ---- Ver una partida (para ir mirando si ya es tu turno) ----
  app.get('/api/stars/match/:id', (req, res) => {
    const me = who(req);
    const m = ST().matches[+req.params.id];
    if (!m || (me && m.a.uid !== me.id && m.b.uid !== me.id)) return bad(res, 'Partida no encontrada');
    res.json(matchOut(m, me ? me.id : null));
  });

  // ---- Tirar: el cliente solo manda la ficha y la fuerza del chute; el servidor vuelve a simular él solo ----
  app.post('/api/stars/match/:id/shoot', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'live') return bad(res, 'Esa partida no está en juego');
    const mySide = m.a.uid === me.id ? 'a' : m.b.uid === me.id ? 'b' : null;
    if (!mySide) return bad(res, 'Esta partida no es tuya');
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
    m.bodies = final.map(({ id, team, isBall, x, y }) => ({ id, team, isBall, x: r0(x * 100) / 100, y: r0(y * 100) / 100, vx: 0, vy: 0 }));
    m._path = path; m._result = scored;
    let payouts = null;
    if (scored === 'A') { m.goalsA++; const bl = m.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (scored === 'B') { m.goalsB++; const bl = m.bodies.find(x => x.isBall); bl.x = 50; bl.y = 70; }
    if (scored) { /* quien marca, repite turno */ } else { m.turn = m.turn === 'a' ? 'b' : 'a'; }
    if (m.goalsA >= m.target || m.goalsB >= m.target) {
      m.status = 'done'; m.winner = m.goalsA > m.goalsB ? 'a' : 'b';
      payouts = applyResult(m);
    }
    m.updatedAt = Date.now();
    await save();
    res.json({ ...matchOut(m, me.id), payouts });
  });

  app.post('/api/stars/match/:id/resign', async (req, res) => {
    const me = who(req); if (!me) return bad(res, 'Pon tu nombre para jugar');
    const s = ST(), m = s.matches[+req.params.id];
    if (!m || m.status !== 'live') return bad(res, 'Esa partida no está en juego');
    const mySide = m.a.uid === me.id ? 'a' : m.b.uid === me.id ? 'b' : null;
    if (!mySide) return bad(res, 'Esta partida no es tuya');
    m.status = 'done'; m.abandonedBy = mySide; m.winner = mySide === 'a' ? 'b' : 'a';
    if (mySide === 'a') m.goalsB = Math.max(m.goalsB, m.goalsA + 1); else m.goalsA = Math.max(m.goalsA, m.goalsB + 1);
    const payouts = applyResult(m);
    await save();
    res.json({ ...matchOut(m, me.id), payouts });
  });
};
