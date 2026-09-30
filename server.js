const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '6mb' })); // 6mb: hueco de sobra para el escudo del rival en base64
app.use(express.static(path.join(__dirname, 'public')));

// ---- Datos en un archivo JSON. En Render apunta DATA_DIR al disco persistente (p. ej. /var/data) ----
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'data.json');
fs.mkdirSync(path.join(DIR, 'backups'), { recursive: true });

const SEED = ['CARLOS', 'DAVID', 'ROBERT', 'ANTONIO', 'PABLO', 'JIMENEZ', 'MARIO', 'DODU', 'JORGE', 'ADRIAN', 'HUGO'];
const empty = () => ({ nextId: 1, salt: crypto.randomBytes(8).toString('hex'), seeded: false, players: [], next: { date: '', rival: '', crest: '' }, round: { rival: '', votes: [] }, history: [] });
function load() {
  const bad = [];
  for (const f of [FILE, FILE + '.bak']) {
    if (!fs.existsSync(f)) continue;
    try { return { ...empty(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { bad.push(f); }
  }
  if (bad.length) { console.error('Datos ilegibles en ' + bad.join(', ') + '. No arranco para no pisarlos.'); process.exit(1); }
  return empty();
}
let db = load();
function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
  fs.renameSync(tmp, FILE); // escritura atómica
}
function snapshot(tag) {
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, path.join(DIR, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + tag + '.json'));
}
if (!db.seeded) { // los nombres iniciales se cargan una sola vez
  if (!db.players.length) SEED.forEach(name => db.players.push({ id: db.nextId++, name, number: null, position: '' }));
  db.seeded = true; save();
}

// ---- Cookies, IP y admin ----
const PASS = process.env.ADMIN_PASSWORD || 'Garra26?';
const MAX_IP = +process.env.MAX_VOTES_PER_IP || 0; // 0 = límite por IP desactivado
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(a => a[0] && a[1]));
const setCookie = (req, res, name, val, maxAge) =>
  res.append('Set-Cookie', `${name}=${val}; Path=/; HttpOnly; SameSite=${name === 'garra_admin' ? 'Strict' : 'Lax'}; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);
const clientIp = req => String(req.headers['true-client-ip'] || req.ip || '');
const ipHash = req => crypto.createHash('sha256').update(db.salt + clientIp(req)).digest('hex').slice(0, 16);
const sha = s => crypto.createHash('sha256').update(s).digest();
const adminToken = () => crypto.createHmac('sha256', PASS).update('garra-admin').digest('hex');
const isAdmin = req => {
  const c = cookies(req).garra_admin;
  return !!c && /^[a-f0-9]{64}$/.test(c) && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(adminToken()));
};
const admin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'No autorizado' }));
const bad = (res, msg) => res.status(400).json({ error: msg });
function getVid(req, res) {
  let v = cookies(req).garra_vid;
  if (!/^[a-f0-9]{32}$/.test(v || '')) { v = crypto.randomBytes(16).toString('hex'); setCookie(req, res, 'garra_vid', v, 31536000); }
  return v;
}

// ---- Público ----
app.get('/api/state', (req, res) => {
  const vid = getVid(req, res);
  const counts = {};
  db.round.votes.forEach(v => (counts[v.playerId] = (counts[v.playerId] || 0) + 1));
  const mine = db.round.votes.find(v => v.vid === vid);
  res.set('Cache-Control', 'no-store');
  res.json({
    players: db.players, next: db.next,
    round: { rival: db.round.rival, counts, total: db.round.votes.length },
    history: db.history.map(({ id, rival, closedAt, mvps, totalVotes, tally }) => ({ id, rival, closedAt, mvps, totalVotes, tally })),
    myVote: mine ? mine.playerId : null,
  });
});

app.post('/api/vote', (req, res) => {
  const vid = getVid(req, res);
  const pl = db.players.find(p => p.id === +req.body.playerId);
  if (!pl) return bad(res, 'Jugador no válido');
  if (db.round.votes.some(v => v.vid === vid)) return res.status(409).json({ error: 'Ya has votado en este partido' });
  const ip = ipHash(req);
  if (MAX_IP && db.round.votes.filter(v => v.ip === ip).length >= MAX_IP) return res.status(409).json({ error: 'Ya se ha votado el máximo de veces desde esta conexión' });
  db.round.votes.push({ playerId: pl.id, vid, ip });
  save();
  res.json({ ok: true });
});

// ---- Admin: acceso ----
const fails = {};
app.post('/api/admin/login', (req, res) => {
  const ip = clientIp(req);
  const f = (fails[ip] = fails[ip] && Date.now() - fails[ip].t < 9e5 ? fails[ip] : { n: 0, t: Date.now() });
  if (f.n >= 5) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  if (!crypto.timingSafeEqual(sha(String(req.body.password || '')), sha(PASS))) { f.n++; return res.status(401).json({ error: 'Contraseña incorrecta' }); }
  delete fails[ip];
  setCookie(req, res, 'garra_admin', adminToken(), 604800);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { setCookie(req, res, 'garra_admin', '', 0); res.json({ ok: true }); });
// La página del panel solo se envía a quien ha iniciado sesión; el resto ve solo el formulario de acceso
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'views', isAdmin(req) ? 'admin.html' : 'login.html'));
});
app.get('/api/admin/info', admin, (req, res) => res.json({ ip: clientIp(req), maxIp: MAX_IP, file: FILE }));

// ---- Admin: acciones ----
app.post('/api/players', admin, (req, res) => {
  const name = String(req.body.name || '').trim().toUpperCase();
  if (!name) return bad(res, 'Falta el nombre');
  const p = { id: db.nextId++, name, number: req.body.number ? +req.body.number : null, position: String(req.body.position || '').trim() };
  db.players.push(p);
  db.players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  save();
  res.json(p);
});
app.delete('/api/players/:id', admin, (req, res) => {
  const id = +req.params.id;
  db.players = db.players.filter(p => p.id !== id);
  db.round.votes = db.round.votes.filter(v => v.playerId !== id); // el historial de MVPs no se toca
  save();
  res.json({ ok: true });
});
app.put('/api/match', admin, (req, res) => {
  let crest = db.next.crest || '';
  if (req.body.removeCrest) crest = '';
  else if (req.body.crestData) {
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(req.body.crestData)) return bad(res, 'Imagen no válida');
    if (req.body.crestData.length > 4_000_000) return bad(res, 'La imagen es demasiado grande');
    crest = req.body.crestData;
  }
  db.next = { date: req.body.date || '', rival: String(req.body.rival || '').trim(), crest };
  if (!db.round.rival && !db.round.votes.length) db.round.rival = db.next.rival;
  save();
  res.json({ ok: true });
});
app.put('/api/round', admin, (req, res) => { db.round.rival = String(req.body.rival || '').trim(); save(); res.json({ ok: true }); });
app.post('/api/round/reset', admin, (req, res) => { snapshot('antes-de-vaciar-votos'); db.round.votes = []; save(); res.json({ ok: true }); });
app.post('/api/round/close', admin, (req, res) => {
  const c = {};
  db.round.votes.forEach(v => (c[v.playerId] = (c[v.playerId] || 0) + 1));
  const tally = db.players.filter(p => c[p.id]).map(p => ({ id: p.id, name: p.name, votes: c[p.id] })).sort((a, b) => b.votes - a.votes);
  if (!tally.length) return bad(res, 'Todavía no hay votos');
  const entry = { id: db.nextId++, rival: db.round.rival || 'rival por confirmar', closedAt: new Date().toISOString(), mvps: tally.filter(t => t.votes === tally[0].votes), totalVotes: db.round.votes.length, tally };
  db.history.unshift(entry);
  db.round = { rival: '', votes: [] };
  save();
  snapshot('cierre-votacion');
  res.json(entry);
});
app.get('/api/export', admin, (_, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=garra-datos.json');
  res.json(db);
});
app.post('/api/import', admin, (req, res) => {
  const d = req.body;
  if (!d || !Array.isArray(d.players) || !Array.isArray(d.history)) return bad(res, 'Archivo no válido');
  snapshot('antes-de-importar');
  db = { ...empty(), ...d, seeded: true };
  save();
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Web en http://localhost:' + port + '  |  panel en /admin  |  datos en ' + FILE));
