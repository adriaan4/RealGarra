// ---- REAL GARRA FANTASY ----
// Modo privado (solo con código de invitación). Todo vive en db.fantasy, dentro de la MISMA base de datos que el resto de la web
// (Upstash o data.json) y reutiliza la plantilla (db.squad): los jugadores NO se duplican, el id es el de la plantilla.
// Pensado para ocupar muy poco: números sueltos y mapas pequeños; al cerrar una jornada se borran las notas individuales y solo queda la media.
module.exports = function fantasy({ app, getDb, save, admin, bad, norm, crypto, snapshot }) {
  const BUDGET = 100;                       // millones iniciales
  const MIN_P = 3, MAX_P = 60;              // límites de precio (M)
  const r1 = n => Math.round(n * 10) / 10;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const POS_NAME = { POR: 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: 'Delantero' };
  const BASE = { POR: 11, DEF: 12, MED: 14, DEL: 16 };       // precio de salida por posición (+ goles de la plantilla)
  const GOAL = { POR: 8, DEF: 6, MED: 5, DEL: 4 };          // puntos por gol (los de atrás valen más)
  const CS = { POR: 4, DEF: 3, MED: 1, DEL: 0 };            // portería a cero
  const RULES = { play: 1, assist: 3, yellow: -1, red: -3, mvp: 4, mvp2: 1, rate: 2 }; // «rate»: puntos por cada punto de nota sobre 5

  const F = () => {
    const db = getDb();
    let f = db.fantasy;
    if (!f || typeof f !== 'object') f = db.fantasy = {};
    if (!f.cfg || typeof f.cfg !== 'object') f.cfg = {};
    f.cfg.max = clamp(Math.floor(Number(f.cfg.max)) || 7, 3, 14);
    f.cfg.mk = [0, 1, 2].includes(f.cfg.mk) ? f.cfg.mk : 0;       // 0 = automático, 1 = abierto a la fuerza, 2 = cerrado a la fuerza
    for (const k of ['codes', 'users', 'jor']) if (!Array.isArray(f[k])) f[k] = [];
    for (const k of ['pr', 'pp', 'av']) if (!f[k] || typeof f[k] !== 'object') f[k] = {};
    return f;
  };
  // posición según el sitio que ocupa en el campo de la plantilla (portería abajo)
  const posOf = p => (p.y >= 88 ? 'POR' : p.y >= 62 ? 'DEF' : p.y >= 33 ? 'MED' : 'DEL');
  const squad = () => getDb().squad || [];
  const byId = id => squad().find(p => p.id === id);

  // Deja todo coherente: precios iniciales de la plantilla actual y equipos sin jugadores que ya no existen (se devuelve su precio)
  function ensure() {
    const f = F(), ids = new Set(squad().map(p => p.id));
    let ch = false;
    for (const p of squad()) if (!(p.id in f.pr)) { f.pr[p.id] = clamp(r1(BASE[posOf(p)] + Math.min(8, (Number(p.goals) || 0) * 0.5)), MIN_P, MAX_P); ch = true; }
    for (const u of f.users) {
      const keep = u.t.filter(id => ids.has(id));
      if (keep.length !== u.t.length) { u.b = r1(u.b + u.t.filter(id => !ids.has(id)).reduce((s, id) => s + (f.pr[id] || 0), 0)); u.t = keep; ch = true; }
    }
    return ch;
  }
  const locked = f => f.cfg.mk === 2 || (f.cfg.mk === 0 && f.jor.some(j => j.st === 'rate'));

  // ---- Puntuación de un jugador en una jornada (las notas pesan más que cualquier otra cosa) ----
  function playerPts(j, pid) {
    if (!j.pl.includes(pid)) return 0;
    if (j.ov && Number.isFinite(j.ov[pid])) return j.ov[pid];     // el admin puede fijar los puntos a mano
    const sq = byId(pid), pos = sq ? posOf(sq) : 'MED', s = j.s[pid] || [0, 0, 0, 0], ra = j.ra[pid];
    let p = RULES.play;
    if (ra && ra[1]) p += (ra[0] - 5) * RULES.rate;                // nota media de los participantes
    p += s[0] * GOAL[pos] + s[1] * RULES.assist + s[2] * RULES.yellow + s[3] * RULES.red;
    if (j.gc === 0) p += CS[pos];
    const top = Math.max(0, ...Object.values(j.mv || {}));         // votos de MVP de la web
    const v = (j.mv || {})[pid] || 0;
    if (top > 0 && v === top) p += RULES.mvp; else if (v > 0) p += RULES.mvp2;
    return r1(p);
  }
  const avgOf = (rt, pid) => { const v = Object.values((rt || {})[pid] || {}); return v.length ? [r1(v.reduce((a, b) => a + b, 0) / v.length), v.length] : null; };
  const liveRa = j => { const o = {}; for (const pid of j.pl) { const a = avgOf(j.rt, pid); if (a) o[pid] = a; } return o; };

  function scoreJor(j, snapTeams) { // calcula puntos de jugadores y de cada participante
    const f = F();
    j.pt = {}; for (const pid of j.pl) j.pt[pid] = playerPts(j, pid);
    const tm = snapTeams || j.tm || {};
    j.up = {}; for (const u of f.users) { const t = tm[u.id]; if (t) j.up[u.id] = r1(t.reduce((s, id) => s + (j.pt[id] || 0), 0)); }
  }
  // Datos de la votación MVP de la web para un rival: la votación actual si es de ese rival y, si no, la última ya cerrada.
  // Devuelve quién jugó (los marcados en MVP) y los votos de MVP de cada jugador. Los ids de MVP y de Fantasy son los mismos (los de la plantilla).
  const sameRival = (a, b) => !!norm(a) && norm(a) === norm(b);
  function mvpFor(rival) {
    const db = getDb(), r = db.round || {}, ids = new Set(squad().map(p => p.id));
    let votes = [], played = [];
    if (sameRival(r.rival, rival) && ((r.votes || []).length || (r.played || []).length)) { votes = r.votes || []; played = r.played || []; }
    else { const h = (db.history || []).find(x => sameRival(x.rival, rival)); if (h) { votes = h.votes || []; played = h.played || []; } }
    const mv = {}; for (const v of votes) if (ids.has(v.playerId)) mv[v.playerId] = (mv[v.playerId] || 0) + 1;
    const pl = [...new Set([...played, ...Object.keys(mv).map(Number)])].filter(id => ids.has(id));
    return { pl, mv };
  }
  function blankJor(j, rival, pl) { return { j, rival: String(rival || '').slice(0, 40), st: 'rate', pl, rt: {}, s: {}, mv: {}, gc: null, ov: {}, ra: {}, pt: {}, up: {}, tm: {} }; }

  // ---- Acceso: el token lo genera el servidor al canjear un código; viaja en la cabecera x-fk ----
  const me = req => { const t = String(req.headers['x-fk'] || ''); return t.length > 20 ? F().users.find(u => u.tk === t) : null; };
  const member = (req, res, next) => { const u = me(req); if (!u) return res.status(403).json({ error: 'Acceso privado: necesitas un código de invitación' }); if (u.off) return res.status(403).json({ error: 'Tu acceso a Fantasy está desactivado por el admin' }); req.fu = u; if (ensure()) save(); next(); };
  const fails = new Map(); // freno a quien prueba códigos al azar: 8 fallos cada 10 min por IP
  const ipOf = req => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const mkCode = () => { let s = ''; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return s.slice(0, 4) + '-' + s.slice(4); };
  const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.+)$/, '$1-$2');
  const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 16);

  // ---- Vista para participantes ----
  function jorOut(j) {
    const o = { j: j.j, rival: j.rival, st: j.st, pl: j.pl };
    if (j.st === 'done') { o.pt = j.pt; o.ra = j.ra; o.up = j.up; o.s = j.s; o.mv = j.mv; o.gc = j.gc; }
    else { o.n = Object.fromEntries(j.pl.map(pid => [pid, Object.keys(j.rt[pid] || {}).length])); }
    return o;
  }
  function view(u) {
    const f = F(), team = {};
    f.users.forEach(x => x.t.forEach(id => { team[id] = (team[id] || 0) + 1; }));
    const gen = {};
    for (const j of f.jor) if (j.st === 'done') for (const [id, p] of Object.entries(j.up)) gen[id] = r1((gen[id] || 0) + p);
    const val = x => r1(x.b + x.t.reduce((s, id) => s + (f.pr[id] || 0), 0));
    const open = f.jor.find(j => j.st === 'rate');
    return {
      me: { id: u.id, name: u.name, b: u.b, t: u.t },
      cfg: { max: f.cfg.max, budget: BUDGET, locked: locked(f), forced: f.cfg.mk, rules: { ...RULES, GOAL, CS } },
      pl: squad().map(p => { const pos = posOf(p), a = f.av[p.id]; return { id: p.id, n: p.n, name: p.name, pos, ph: p.photo ? (p.photoV || 1) : 0, pr: f.pr[p.id], pp: f.pp[p.id] ?? f.pr[p.id], av: a && a[1] ? r1(a[0] / a[1]) : null, tn: team[p.id] || 0 }; }),
      us: f.users.filter(x => !x.off).map(x => ({ id: x.id, name: x.name, t: x.t, pts: gen[x.id] || 0, val: val(x) })),
      jor: f.jor.slice().sort((a, b) => a.j - b.j).map(jorOut),
      mine: open ? Object.fromEntries(open.pl.filter(pid => (open.rt[pid] || {})[u.id]).map(pid => [pid, open.rt[pid][u.id]])) : {}
    };
  }

  app.get('/api/fantasy', (req, res) => {
    const u = me(req);
    if (!u || u.off) return res.json({ me: null });  // sin acceso: no se revela nada de Fantasy
    if (ensure()) save();
    res.json(view(u));
  });
  app.post('/api/fantasy/join', async (req, res) => {
    const ip = ipOf(req), now = Date.now(), fl = (fails.get(ip) || []).filter(t => now - t < 6e5);
    if (fl.length >= 8) return bad(res, 'Demasiados intentos. Espera unos minutos');
    const f = F(), code = cleanCode(req.body.code), c = f.codes.find(x => x.c === code);
    if (!c) { fl.push(now); fails.set(ip, fl); return bad(res, 'Código no válido o ya usado'); }
    let u;
    if (c.u) { // código de recuperación: vuelve a entrar un participante que ya existía (otro móvil, datos borrados...)
      u = f.users.find(x => x.id === c.u);
      if (!u) { f.codes = f.codes.filter(x => x !== c); await save(); return bad(res, 'Ese participante ya no existe'); }
    } else {
      const name = cleanName(req.body.name);
      if (name.length < 2) return bad(res, 'Elige tu nombre fantasy (mínimo 2 letras)');
      if (f.users.some(x => norm(x.name) === norm(name))) return bad(res, 'Ese nombre fantasy ya está cogido');
      u = { id: getDb().nextId++, tk: '', name, b: BUDGET, t: [] };
      f.users.push(u);
    }
    u.tk = crypto.randomBytes(18).toString('base64url');
    f.codes = f.codes.filter(x => x !== c);   // un solo uso: el código desaparece (así no pesa en la base de datos)
    await save();
    res.json({ ok: true, tk: u.tk });
  });
  app.post('/api/fantasy/buy', member, async (req, res) => {
    const f = F(), u = req.fu, p = byId(+req.body.pid);
    if (!p) return bad(res, 'Jugador no encontrado');
    if (locked(f)) return bad(res, 'El mercado está cerrado (jornada en curso)');
    if (u.t.includes(p.id)) return bad(res, 'Ya tienes a ' + p.name);
    if (u.t.length >= f.cfg.max) return bad(res, 'Tu plantilla está completa (' + f.cfg.max + ' jugadores). Vende a alguien antes');
    const pr = f.pr[p.id];
    if (u.b < pr) return bad(res, 'Te faltan ' + r1(pr - u.b) + ' M para fichar a ' + p.name);
    u.b = r1(u.b - pr); u.t.push(p.id);
    await save(); res.json({ ok: true, ...view(u) });
  });
  app.post('/api/fantasy/sell', member, async (req, res) => {
    const f = F(), u = req.fu, id = +req.body.pid;
    if (!u.t.includes(id)) return bad(res, 'Ese jugador no está en tu plantilla');
    if (locked(f)) return bad(res, 'El mercado está cerrado (jornada en curso)');
    u.b = r1(u.b + (f.pr[id] || 0)); u.t = u.t.filter(x => x !== id);
    await save(); res.json({ ok: true, ...view(u) });
  });
  // Notas de 1 a 10. Una sola nota por persona y jugador: lo ya votado no se puede cambiar
  app.post('/api/fantasy/rate', member, async (req, res) => {
    const f = F(), u = req.fu, j = f.jor.find(x => x.j === +req.body.j), r = req.body.r || {};
    if (!j || j.st !== 'rate') return bad(res, 'Esa jornada no está abierta a notas');
    let n = 0;
    for (const [k, v] of Object.entries(r)) {
      const pid = +k, g = Math.round(Number(v));
      if (!j.pl.includes(pid) || !(g >= 1 && g <= 10)) continue;
      const m = j.rt[pid] || (j.rt[pid] = {});
      if (m[u.id]) continue;
      m[u.id] = g; n++;
    }
    if (!n) return bad(res, 'No había notas nuevas que guardar');
    await save(); res.json({ ok: true, saved: n, ...view(u) });
  });

  // ---- Enlace con la votación MVP de la web ----
  // Al cerrarse una votación, sus votos suman puntos a los jugadores de la jornada abierta con el mismo rival.
  async function onMvp({ rival }) {
    const f = F(), j = f.jor.filter(x => x.st === 'rate' && sameRival(x.rival, rival)).sort((a, b) => b.j - a.j)[0];
    if (!j) return;
    const m = mvpFor(rival); j.mv = m.mv;
    if (!j.pl.length) j.pl = m.pl;
    await save();
  }
  // Si el admin cambia quién juega en la votación MVP, la jornada abierta con ese rival puntúa a los mismos (se conservan los que ya tienen notas).
  async function onPlayed({ rival, played }) {
    const f = F(), j = f.jor.filter(x => x.st === 'rate' && sameRival(x.rival, rival)).sort((a, b) => b.j - a.j)[0];
    if (!j || !played.length) return;
    const ids = new Set(squad().map(p => p.id));
    j.pl = [...new Set([...played, ...Object.keys(j.rt).map(Number)])].filter(id => ids.has(id));
    await save();
  }

  // ---- Administración ----
  const A = (m, p, fn) => app[m]('/api/fantasy-admin' + p, admin, async (req, res) => { try { await fn(req, res); } catch (e) { console.error('Fantasy admin: ' + e.message); bad(res, 'Error: ' + e.message); } });
  A('get', '/all', (req, res) => {
    const f = F(); if (ensure()) save();
    const gen = {};
    for (const j of f.jor) if (j.st === 'done') for (const [id, p] of Object.entries(j.up)) gen[id] = r1((gen[id] || 0) + p);
    res.json({
      cfg: { max: f.cfg.max, mk: f.cfg.mk, locked: locked(f) },
      codes: f.codes,
      users: f.users.map(u => ({ id: u.id, name: u.name, b: u.b, n: u.t.length, off: !!u.off, pts: gen[u.id] || 0, linked: !!u.tk })),
      pl: squad().map(p => ({ id: p.id, n: p.n, name: p.name, pos: posOf(p), pr: f.pr[p.id], av: f.av[p.id] && f.av[p.id][1] ? r1(f.av[p.id][0] / f.av[p.id][1]) : null })),
      jor: f.jor.slice().sort((a, b) => b.j - a.j).map(j => ({ ...j, ra: j.st === 'rate' ? liveRa(j) : j.ra, tm: undefined, np: j.pl.length }))
    });
  });
  A('post', '/codes', async (req, res) => {
    const f = F(), n = clamp(Math.floor(Number(req.body.n)) || 1, 1, 20), out = [];
    for (let i = 0; i < n; i++) { let c; do { c = mkCode(); } while (f.codes.some(x => x.c === c)); f.codes.push({ c }); out.push(c); }
    await save(); res.json({ ok: true, codes: out });
  });
  A('delete', '/code/:c', async (req, res) => { const f = F(); f.codes = f.codes.filter(x => x.c !== req.params.c); await save(); res.json({ ok: true }); });
  A('post', '/user/:id/relink', async (req, res) => { // código de un solo uso para que ese participante entre desde otro dispositivo (el anterior deja de valer)
    const f = F(), u = f.users.find(x => x.id === +req.params.id);
    if (!u) return bad(res, 'Participante no encontrado');
    f.codes = f.codes.filter(x => x.u !== u.id);
    let c; do { c = mkCode(); } while (f.codes.some(x => x.c === c));
    f.codes.push({ c, u: u.id }); await save(); res.json({ ok: true, code: c });
  });
  A('put', '/user/:id', async (req, res) => {
    const f = F(), u = f.users.find(x => x.id === +req.params.id);
    if (!u) return bad(res, 'Participante no encontrado');
    if (req.body.name != null) {
      const name = cleanName(req.body.name);
      if (name.length < 2) return bad(res, 'Nombre demasiado corto');
      if (f.users.some(x => x !== u && norm(x.name) === norm(name))) return bad(res, 'Ese nombre ya existe');
      u.name = name;
    }
    if (req.body.b != null) { const b = Number(req.body.b); if (!Number.isFinite(b) || b < 0 || b > 1000) return bad(res, 'Presupuesto no válido'); u.b = r1(b); }
    if (req.body.off != null) { if (req.body.off) u.off = true; else delete u.off; }
    await save(); res.json({ ok: true });
  });
  A('delete', '/user/:id', async (req, res) => {
    const f = F(), id = +req.params.id;
    f.users = f.users.filter(x => x.id !== id); f.codes = f.codes.filter(x => x.u !== id);
    for (const j of f.jor) { delete j.up[id]; delete j.tm[id]; for (const m of Object.values(j.rt)) delete m[id]; }
    await save(); res.json({ ok: true });
  });
  A('put', '/cfg', async (req, res) => {
    const f = F();
    if (req.body.max != null) f.cfg.max = clamp(Math.floor(Number(req.body.max)) || 7, 3, 14);
    if (req.body.mk != null && [0, 1, 2].includes(+req.body.mk)) f.cfg.mk = +req.body.mk;
    await save(); res.json({ ok: true });
  });
  A('put', '/price/:pid', async (req, res) => {
    const f = F(), p = byId(+req.params.pid), v = Number(req.body.pr);
    if (!p) return bad(res, 'Jugador no encontrado');
    if (!Number.isFinite(v) || v < MIN_P || v > MAX_P) return bad(res, 'Precio entre ' + MIN_P + ' y ' + MAX_P + ' M');
    f.pp[p.id] = f.pr[p.id]; f.pr[p.id] = r1(v); await save(); res.json({ ok: true });
  });
  A('post', '/prices/reset', async (req, res) => { // vuelve a los precios de salida (por posición y goles)
    const f = F(); snapshot('antes-de-reset-precios-fantasy'); f.pr = {}; f.pp = {}; f.av = {}; ensure(); await save(); res.json({ ok: true });
  });
  A('post', '/jor', async (req, res) => {
    const f = F(), db = getDb(), j = Math.floor(Number(req.body.j));
    if (!(j >= 1 && j <= 99)) return bad(res, 'Jornada no válida');
    if (f.jor.some(x => x.j === j)) return bad(res, 'Esa jornada ya existe');
    const m = (db.calendar || []).find(x => x.j === j), rival = String(req.body.rival || (m && m.rival) || '');
    const m2 = mvpFor(rival), nj = blankJor(j, rival, m2.pl); nj.mv = m2.mv;   // quién jugó y los votos MVP salen de la pestaña MVP
    f.jor.push(nj); await save(); res.json({ ok: true });
  });
  A('put', '/jor/:j', async (req, res) => { // jugadores que jugaron, estadísticas, goles encajados, votos MVP y puntos fijados a mano
    const f = F(), j = f.jor.find(x => x.j === +req.params.j), b = req.body, ids = new Set(squad().map(p => p.id));
    if (!j) return bad(res, 'Jornada no encontrada');
    const int = (v, mx) => clamp(Math.floor(Number(v)) || 0, 0, mx);
    if (typeof b.rival === 'string') j.rival = b.rival.slice(0, 40);
    if (Array.isArray(b.pl)) j.pl = [...new Set(b.pl.map(Number))].filter(id => ids.has(id));
    if (b.s && typeof b.s === 'object') { j.s = {}; for (const [k, v] of Object.entries(b.s)) { const a = [int(v[0], 20), int(v[1], 20), int(v[2], 3), int(v[3], 1)]; if (a.some(Boolean) && ids.has(+k)) j.s[+k] = a; } }
    if (b.gc !== undefined) j.gc = b.gc === '' || b.gc === null ? null : int(b.gc, 99);
    if (b.mv && typeof b.mv === 'object') { j.mv = {}; for (const [k, v] of Object.entries(b.mv)) if (int(v, 999) && ids.has(+k)) j.mv[+k] = int(v, 999); }
    if (b.ov && typeof b.ov === 'object') { j.ov = {}; for (const [k, v] of Object.entries(b.ov)) if (v !== '' && v != null && Number.isFinite(Number(v)) && ids.has(+k)) j.ov[+k] = r1(clamp(Number(v), -30, 60)); }
    if (j.st === 'done') scoreJor(j); // si ya estaba cerrada, se recalculan los puntos (los precios no se tocan)
    await save(); res.json({ ok: true });
  });
  A('post', '/jor/:j/mvp', async (req, res) => { // trae de la pestaña MVP quién jugó y los votos de MVP
    const f = F(), j = f.jor.find(x => x.j === +req.params.j);
    if (!j) return bad(res, 'Jornada no encontrada');
    const m = mvpFor(j.rival);
    if (!m.pl.length) return bad(res, 'No hay datos de MVP para «' + j.rival + '» (marca quién juega en Admin → Votaciones)');
    if (j.st === 'rate') j.pl = [...new Set([...m.pl, ...Object.keys(j.rt).map(Number)])]; else j.pl = m.pl;
    j.mv = m.mv; if (j.st === 'done') scoreJor(j);
    await save(); res.json({ ok: true, n: j.pl.length });
  });
  A('put', '/jor/:j/rate', async (req, res) => { // el admin pone, cambia (1-10) o quita (0) la nota de un participante a un jugador
    const f = F(), j = f.jor.find(x => x.j === +req.params.j), pid = +req.body.pid, uid = +req.body.uid, n = Math.round(Number(req.body.n));
    if (!j || j.st !== 'rate') return bad(res, 'Solo se tocan notas de jornadas abiertas');
    if (!j.pl.includes(pid) || !f.users.some(x => x.id === uid)) return bad(res, 'Jugador o participante no válido');
    const m = j.rt[pid] || (j.rt[pid] = {});
    if (n >= 1 && n <= 10) m[uid] = n; else { delete m[uid]; if (!Object.keys(m).length) delete j.rt[pid]; }
    await save(); res.json({ ok: true });
  });
  A('post', '/jor/:j/close', async (req, res) => { // cierra: fija notas medias, puntúa a jugadores y participantes y mueve los precios según la media
    const f = F(), j = f.jor.find(x => x.j === +req.params.j);
    if (!j) return bad(res, 'Jornada no encontrada');
    if (j.st === 'done') return bad(res, 'Esa jornada ya está cerrada');
    snapshot('cierre-fantasy-j' + j.j);
    if (!Object.keys(j.mv || {}).length) j.mv = mvpFor(j.rival).mv;
    j.ra = liveRa(j);
    j.tm = {}; for (const u of f.users) j.tm[u.id] = u.t.slice();
    scoreJor(j, j.tm);
    for (const pid of j.pl) {
      const ra = j.ra[pid]; if (!ra) continue;
      const a = f.av[pid] || (f.av[pid] = [0, 0]); a[0] = r1(a[0] + ra[0]); a[1]++;              // media de temporada = media de las medias de cada jornada
      const old = f.pr[pid], pct = clamp(0.06 * (ra[0] - 6), -0.15, 0.15);                        // nota 6 = neutro; 8 → +12 %; 4 → −12 % (máx. ±15 %)
      f.pp[pid] = old; f.pr[pid] = clamp(r1(old * (1 + pct)), MIN_P, MAX_P);
    }
    j.rt = {}; j.st = 'done';  // las notas individuales ya no hacen falta: solo queda la media
    await save(); res.json({ ok: true });
  });
  A('post', '/jor/:j/recalc', async (req, res) => { const f = F(), j = f.jor.find(x => x.j === +req.params.j); if (!j || j.st !== 'done') return bad(res, 'Solo jornadas cerradas'); scoreJor(j); await save(); res.json({ ok: true }); });
  A('delete', '/jor/:j', async (req, res) => { const f = F(); f.jor = f.jor.filter(x => x.j !== +req.params.j); await save(); res.json({ ok: true }); });

  return { onMvp, onPlayed, ensure, posOf };
};
