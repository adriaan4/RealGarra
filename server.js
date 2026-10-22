const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

// ---- Datos en un archivo JSON. En Render apunta DATA_DIR al disco persistente (p. ej. /var/data) ----
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'data.json');
fs.mkdirSync(path.join(DIR, 'backups'), { recursive: true });

const TEAM = ['CARLOS', 'DAVID', 'ROBERT', 'ANTONIO', 'PABLO', 'JIMENEZ', 'MARIO', 'DODU', 'JORGE', 'ADRIAN', 'HUGO'];
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

// ---- Calendario de la liga (la hora, el campo y el resultado se rellenan desde Admin) ----
const CAL_SEED = [
  [1, '2026-10-25', 'Huerta FC'], [2, '2026-11-08', 'Bricomaniacos FC'], [4, '2026-11-22', 'Piso Piloto FC'], [5, '2026-11-29', 'ValdeCity'],
  [6, '2026-12-13', 'Pachanga FC'], [7, '2026-12-20', 'THE OFFICE'], [8, '2027-01-10', 'Atlético Sheriff'], [9, '2027-01-17', 'Los Chicos Del Patio'],
  [10, '2027-01-24', 'Gazilion'], [11, '2027-02-07', 'Potrero FC'], [12, '2027-02-14', 'Huerta FC'], [13, '2027-02-21', 'Bricomaniacos FC'],
  [15, '2027-03-14', 'Piso Piloto FC'], [16, '2027-03-21', 'ValdeCity'], [17, '2027-04-11', 'Pachanga FC'], [18, '2027-04-18', 'THE OFFICE'],
  [19, '2027-05-09', 'Atlético Sheriff'], [20, '2027-05-16', 'Los Chicos Del Patio'], [21, '2027-05-23', 'Gazilion'], [22, '2027-05-30', 'Potrero FC']
].map(([j, date, rival]) => ({ j, date, rival, time: '', field: '', result: '' }));

// ---- Plantilla oficial: dorsal, nombre y posición en el campo (x/y en % del césped, portería propia abajo) ----
const SQUAD_SEED = [
  [9, 'CARLOS', 50, 10, true], [10, 'PABLO', 50, 24], [8, 'DAVID', 50, 37],
  [30, 'DODU', 18, 47], [21, 'ROBER', 82, 47], [19, 'ADRI', 50, 57], [16, 'JORGE', 82, 57],
  [6, 'JIMÉNEZ', 30, 66], [11, 'MARIO', 72, 64], [3, 'HUGO', 30, 78], [24, 'PAJARES', 72, 75], [29, 'JUAN', 72, 86],
  [1, 'ANTONIO', 50, 95]
].map(([n, name, x, y, c]) => ({ n, name, x, y, c: !!c }));

const empty = () => ({ nextId: 1, squad: SQUAD_SEED.map(p => ({ ...p })), players: [], next: { date: '', rival: '', crest: '', field: '' }, round: { rival: '', votes: [] }, history: [], subs: [], reminded: '', ez: [], garro: null, calendar: [], calV1: false, calV2: false, crests: [] });

// ---- Almacenamiento externo gratuito (Upstash Redis, vía REST). Sobrevive a reinicios/redeploys de Render free ----
const R_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REMOTE = !!(R_URL && R_TOKEN);
const KEY = 'garra:db';
async function redis(...cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || 'Redis HTTP ' + r.status);
  return d.result;
}

function loadLocal() {
  const tried = [];
  for (const f of [FILE, FILE + '.bak']) {
    if (!fs.existsSync(f)) continue;
    try { return { ...empty(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; }
    catch (e) { tried.push(f); }
  }
  if (tried.length) { console.error('Datos ilegibles en ' + tried.join(', ') + '. No arranco para no pisarlos.'); process.exit(1); }
  return null;
}
async function loadRemote() {
  for (let i = 1; i <= 5; i++) {
    try {
      const raw = await redis('GET', KEY);
      return raw ? { ...empty(), ...JSON.parse(raw) } : null;
    } catch (e) { console.error('Redis no responde (intento ' + i + '/5): ' + e.message); await new Promise(r => setTimeout(r, 2000 * i)); }
  }
  // Si no podemos leer, NO arrancamos vacíos: sobrescribiríamos los datos reales.
  console.error('No se pudo leer la base de datos remota. No arranco para no pisar los datos.');
  process.exit(1);
}

let db = empty();
let dirty = false, pushing = null;
function saveLocal() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('No se pudo escribir el archivo local: ' + e.message); }
}
function push() { // encola la subida a Redis; siempre sube la última versión
  if (!REMOTE) return Promise.resolve();
  dirty = true;
  if (pushing) return pushing;
  pushing = (async () => {
    while (dirty) {
      dirty = false;
      try { await redis('SET', KEY, JSON.stringify(db)); }
      catch (e) { dirty = true; console.error('Fallo al guardar en Redis, reintento en 15 s: ' + e.message); break; }
    }
  })().finally(() => { pushing = null; });
  return pushing;
}
setInterval(() => { if (dirty && !pushing) push(); }, 15000); // reintento si Redis falló

async function save() { saveLocal(); await push(); }
function snapshot(tag) {
  const at = new Date().toISOString();
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, path.join(DIR, 'backups', at.replace(/[:.]/g, '-') + '-' + tag + '.json'));
  if (REMOTE) redis('SET', 'garra:backup:' + tag, JSON.stringify({ at, data: db })).catch(() => {}); // última copia de cada tipo
}

async function init() {
  let loaded = REMOTE ? await loadRemote() : null;
  if (REMOTE && !loaded) { // primera vez con Redis: sube lo que haya en local (o vacío)
    loaded = loadLocal() || empty();
    console.log('Redis vacío: subiendo los datos iniciales.');
  } else if (!REMOTE) {
    loaded = loadLocal() || empty();
    console.warn('AVISO: sin UPSTASH_REDIS_REST_URL/TOKEN los datos solo se guardan en disco local (en Render free se pierden).');
  }
  db = loaded;
  db.round.votes.forEach(v => { if (!v.id) v.id = db.nextId++; });

  // Migración de una sola vez: la lista de jugadores pasa a ser la de la votación MVP.
  if (!db.teamV2) {
    snapshot('antes-de-cambiar-jugadores');
    const old = db.players;
    db.players = TEAM.map(n => { const o = old.find(p => norm(p.name) === n); return { id: o ? o.id : db.nextId++, name: n }; });
    const ids = new Set(db.players.map(p => p.id));
    db.round.votes = db.round.votes.filter(v => ids.has(v.playerId));
    db.teamV2 = true;
  }
  // Migración de una sola vez: calendario nuevo (otros rivales). Reemplaza el anterior, con copia previa; hora, campo y resultado quedan por confirmar.
  if (!db.calV2) {
    if (Array.isArray(db.calendar) && db.calendar.length) snapshot('antes-de-cambiar-calendario');
    db.calendar = CAL_SEED.map(m => ({ ...m }));
    db.calV1 = db.calV2 = true;
  }
  // Migración de una sola vez: carga el calendario si todavía no existe (no toca nada más)
  if (!db.calV1) {
    if (!Array.isArray(db.calendar) || !db.calendar.length) db.calendar = CAL_SEED.map(m => ({ ...m }));
    db.calV1 = true;
  }
  if (db.next && typeof db.next.field !== 'string') db.next.field = '';
  if (!Array.isArray(db.squad) || !db.squad.length) db.squad = SQUAD_SEED.map(p => ({ ...p })); // plantilla por defecto si todavía no existe
  await save();
}

const PASS = process.env.ADMIN_PASSWORD || 'Garra26?';
const admin = (req, res, next) => (req.headers['x-admin'] === PASS ? next() : res.status(401).json({ error: 'Contraseña incorrecta' }));
const bad = (res, msg) => res.status(400).json({ error: msg });
const pub = ({ device, ...v }) => v; // el identificador del dispositivo nunca sale al público

// ---- Avisos push (Android, iPhone y ordenador) con Web Push + VAPID ----
// Genera las claves una vez con:  npx web-push generate-vapid-keys
// y ponlas como variables de entorno: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto:tu@correo.com)
const VAPID_PUB = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY || '';
const PUSH = !!(VAPID_PUB && VAPID_PRIV);
if (PUSH) {
  try { webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUB, VAPID_PRIV); }
  catch (e) { console.error('Claves VAPID no válidas: ' + e.message); process.exit(1); }
} else console.warn('AVISO: sin VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY los avisos push están desactivados.');
const TZ = process.env.TZ_AVISOS || 'Europe/Madrid';
const fmtDate = iso => new Date(iso).toLocaleString('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

async function notifyAll(title, body, url = '/#inicio', tag = 'garra') {
  if (!PUSH || !db.subs.length) return { sent: 0, removed: 0 };
  const payload = JSON.stringify({ title, body, url, tag });
  let sent = 0;
  const dead = new Set();
  await Promise.all(db.subs.map(async s => {
    try { await webpush.sendNotification(s, payload, { TTL: 86400 }); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.endpoint); // suscripción caducada o dada de baja
      else console.error('Fallo al enviar aviso (' + (e.statusCode || e.message) + ')');
    }
  }));
  if (dead.size) { db.subs = db.subs.filter(s => !dead.has(s.endpoint)); await save(); }
  return { sent, removed: dead.size };
}
const notify = (...a) => notifyAll(...a).catch(e => console.error('Aviso push: ' + e.message));

// Recordatorio automático cuando falten 24 h o menos para el partido (una sola vez por partido)
setInterval(async () => {
  try {
    const d = db.next && db.next.date;
    if (!PUSH || !d || db.reminded === d) return;
    const t = new Date(d) - Date.now();
    if (t <= 0 || t > 24 * 36e5) return;
    db.reminded = d;
    await save();
    notify('⏰ ¡Que juega el Garra!', '🦁 Garra vs ' + (db.next.rival || 'rival por confirmar') + ' · ' + fmtDate(d) + '. ¡No faltes!', '/#inicio', 'recordatorio');
  } catch (e) { console.error('Recordatorio: ' + e.message); }
}, 5 * 60 * 1000);

// ---- Público ----
app.get('/api/state', (req, res) => {
  const d = String(req.query.d || '');
  const mine = d && db.round.votes.find(v => v.device === d);
  res.json({
    players: db.players,
    next: db.next,
    calendar: db.calendar,
    round: { rival: db.round.rival, votes: db.round.votes.map(pub) },
    history: db.history.map(h => ({ ...h, votes: (h.votes || []).map(pub) })),
    mine: mine ? { playerId: mine.playerId } : null,
    ez: db.ez.map(({ device, ...e }) => e),
    ezPts: EZ_PTS,
    garro: db.garro || null,
    squad: db.squad,
    crests: db.crests.map(({ id, name, v }) => ({ id, name, v })), // las imágenes se piden aparte (/api/crest/:id)
    ezMine: d ? (db.ez.find(e => e.device === d) || {}).id || null : null
  });
});

app.post('/api/vote', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80);
  const pl = db.players.find(p => p.id === +req.body.playerId);
  if (device.length < 8) return bad(res, 'No se pudo identificar tu dispositivo');
  if (!pl) return bad(res, 'Elige un jugador');
  if (db.round.votes.some(v => v.device === device)) return bad(res, 'Ya has votado en esta votación');
  db.round.votes.push({ id: db.nextId++, playerId: pl.id, playerName: pl.name, device });
  await save();
  res.json({ ok: true });
});


// ---- GARRA VS EZ: quién ha bebido más (puntos por unidad) ----
const EZ_PTS = { cigarros: 0.5, cubatas: 3, chupitos: 2, cervezas: 1, porros: 3 };
const ezCounts = b => {
  const o = {};
  for (const k of Object.keys(EZ_PTS)) { const n = Math.floor(Number(b && b[k])); o[k] = Number.isFinite(n) ? Math.min(Math.max(n, 0), 999) : 0; }
  return o;
};
// Cada dispositivo tiene su propia ficha: la crea y la puede cambiar cuando quiera (el nombre queda fijo)
app.post('/api/ez', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80);
  if (device.length < 8) return bad(res, 'No se pudo identificar tu dispositivo');
  const mine = db.ez.find(e => e.device === device);
  const name = mine ? mine.name : String(req.body.name || '').trim().toUpperCase().slice(0, 30);
  if (!name) return bad(res, 'Pon tu nombre');
  if (!mine && db.ez.some(e => norm(e.name) === norm(name))) return bad(res, 'Ese nombre ya está en la clasificación. Si eres tú desde otro móvil, pídele al admin que lo cambie');
  const c = ezCounts(req.body.counts);
  if (mine) Object.assign(mine, c); else db.ez.push({ id: db.nextId++, name, device, ...c });
  await save();
  res.json({ ok: true });
});

// ---- Avisos push: suscripción de dispositivos ----
app.get('/api/push/key', (_, res) => res.json({ enabled: PUSH, key: PUSH ? VAPID_PUB : '' }));
app.post('/api/push/subscribe', async (req, res) => {
  if (!PUSH) return bad(res, 'Los avisos no están activados en el servidor');
  const s = req.body && req.body.sub;
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2000
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  if (!ok) return bad(res, 'Suscripción no válida');
  const clean = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  const i = db.subs.findIndex(x => x.endpoint === clean.endpoint);
  if (i >= 0) { if (JSON.stringify(db.subs[i]) === JSON.stringify(clean)) return res.json({ ok: true }); db.subs[i] = clean; }
  else { if (db.subs.length >= 2000) return bad(res, 'Demasiados dispositivos suscritos'); db.subs.push(clean); }
  await save();
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', async (req, res) => {
  const ep = String((req.body && req.body.endpoint) || '');
  const n = db.subs.length;
  db.subs = db.subs.filter(x => x.endpoint !== ep);
  if (db.subs.length !== n) await save();
  res.json({ ok: true });
});
app.post('/api/push/send', admin, async (req, res) => {
  if (!PUSH) return bad(res, 'Los avisos no están activados en el servidor (faltan las claves VAPID)');
  const title = String(req.body.title || '').trim().slice(0, 80) || 'Real Garra Balonpié';
  const body = String(req.body.body || '').trim().slice(0, 200);
  if (!body) return bad(res, 'Escribe el texto del aviso');
  res.json(await notifyAll(title, body));
});

// ---- Admin ----
app.get('/api/admin/check', admin, (_, res) => res.json({ ok: true }));

app.post('/api/players', admin, async (req, res) => {
  const name = String(req.body.name || '').trim().toUpperCase().slice(0, 30);
  if (!name) return bad(res, 'Falta el nombre');
  if (db.players.some(p => norm(p.name) === norm(name))) return bad(res, 'Ese jugador ya está en la lista');
  const p = { id: db.nextId++, name };
  db.players.push(p);
  await save();
  res.json(p);
});
app.delete('/api/players/:id', admin, async (req, res) => {
  const id = +req.params.id;
  db.players = db.players.filter(p => p.id !== id);
  db.round.votes = db.round.votes.filter(v => v.playerId !== id); // el historial de MVPs no se toca
  await save();
  res.json({ ok: true });
});
app.put('/api/squad', admin, async (req, res) => {
  const a = req.body && req.body.squad;
  if (!Array.isArray(a) || !a.length || a.length > 30) return bad(res, 'Plantilla no válida');
  const clamp = (v, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v * 10) / 10)) : d; };
  const out = [];
  for (const p of a) {
    const name = String((p && p.name) || '').trim().toUpperCase().slice(0, 14);
    const n = Math.floor(Number(p && p.n));
    if (!name) return bad(res, 'Hay un jugador sin nombre');
    if (!Number.isFinite(n) || n < 0 || n > 99) return bad(res, 'Dorsal no válido en ' + name + ' (0 a 99)');
    out.push({ n, name, x: clamp(p.x, 50), y: clamp(p.y, 50), c: !!p.c });
  }
  if (out.some(p => p.c)) { const i = out.findIndex(p => p.c); out.forEach((p, k) => (p.c = k === i)); } // un solo capitán
  db.squad = out;
  await save();
  res.json({ ok: true });
});
app.put('/api/match', admin, async (req, res) => {
  // el escudo llega como imagen ya comprimida en base64 desde el navegador; si no se envía, se conserva el que hubiera
  const crest = typeof req.body.crest === 'string' ? req.body.crest.slice(0, 400000) : (db.next.crest || '');
  const prev = db.next || {};
  db.next = { date: req.body.date || '', rival: String(req.body.rival || '').trim(), crest, field: String(req.body.field || '').trim().slice(0, 80) };
  if (!db.round.rival && !db.round.votes.length) db.round.rival = db.next.rival;
  const t = db.next.date ? new Date(db.next.date) - Date.now() : -1;
  const changed = prev.date !== db.next.date || prev.rival !== db.next.rival;
  if (t > 0 && t <= 24 * 36e5) db.reminded = db.next.date; // si ya falta menos de un día, no mandar además el recordatorio
  await save();
  res.json({ ok: true });
  if (changed && t > 0 && db.next.rival) notify('⚽ ¡Hay partido, Garra!', '🦁 Garra vs ' + db.next.rival + ' · ' + fmtDate(db.next.date), '/#inicio', 'partido');
});
app.put('/api/calendar/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  const time = String(req.body.time || '').trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad(res, 'Hora no válida');
  m.time = time;
  m.field = String(req.body.field || '').trim().slice(0, 80);
  m.result = String(req.body.result || '').trim().slice(0, 20);
  await save();
  res.json({ ok: true });
});
app.put('/api/round', admin, async (req, res) => { db.round.rival = String(req.body.rival || '').trim(); await save(); res.json({ ok: true }); });
app.delete('/api/votes/:id', admin, async (req, res) => {
  const id = +req.params.id;
  db.round.votes = db.round.votes.filter(v => v.id !== id); // quita el voto: ese dispositivo podrá votar otra vez
  await save();
  res.json({ ok: true });
});
app.post('/api/round/close', admin, async (req, res) => {
  const c = {};
  db.round.votes.forEach(v => (c[v.playerId] = (c[v.playerId] || 0) + 1));
  const max = Math.max(0, ...Object.values(c));
  if (!max) return bad(res, 'Todavía no hay votos');
  const mvps = Object.keys(c).filter(id => c[id] === max).map(id => ({ id: +id, name: db.round.votes.find(v => v.playerId == id).playerName, votes: max }));
  const entry = { id: db.nextId++, rival: db.round.rival || 'rival por confirmar', closedAt: new Date().toISOString(), mvps, totalVotes: db.round.votes.length, votes: db.round.votes };
  db.history.unshift(entry);
  db.round = { rival: '', votes: [] };
  await save();
  snapshot('cierre-votacion');
  res.json({ ...entry, votes: entry.votes.map(pub) });
  notify('🏆 ¡Ya hay MVP!', entry.mvps.map(m => m.name).join(' y ') + (entry.mvps.length > 1 ? ' se reparten el MVP' : ' es el MVP') + ' contra ' + entry.rival + ' 👏', '/#mvp', 'mvp');
});
app.delete('/api/history/:id', admin, async (req, res) => {
  const id = +req.params.id;
  if (!db.history.some(h => h.id === id)) return bad(res, 'MVP no encontrado');
  snapshot('antes-de-borrar-mvp');
  db.history = db.history.filter(h => h.id !== id);
  await save();
  res.json({ ok: true });
});
app.put('/api/ez/:id', admin, async (req, res) => {
  const e = db.ez.find(x => x.id === +req.params.id);
  if (!e) return bad(res, 'Persona no encontrada');
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    const name = req.body.name.trim().toUpperCase().slice(0, 30);
    if (db.ez.some(x => x !== e && norm(x.name) === norm(name))) return bad(res, 'Ese nombre ya existe');
    e.name = name;
  }
  Object.assign(e, ezCounts(req.body.counts));
  await save();
  res.json({ ok: true });
});
app.delete('/api/ez/:id', admin, async (req, res) => {
  db.ez = db.ez.filter(x => x.id !== +req.params.id);
  await save();
  res.json({ ok: true });
});
app.post('/api/ez/reset', admin, async (req, res) => {
  snapshot('antes-de-vaciar-ez');
  db.ez = [];
  await save();
  res.json({ ok: true });
});

// ---- GARRO DE ORO: el que más puntos suma en la clasificación (se proclama desde Admin y sale en el inicio) ----
const ezScore = e => { const c = ezCounts(e); return Object.keys(EZ_PTS).reduce((t, k) => t + c[k] * EZ_PTS[k], 0); };
app.post('/api/garro/close', admin, async (req, res) => {
  const rk = db.ez.map(e => ({ e, p: ezScore(e) }));
  const max = Math.max(0, ...rk.map(x => x.p));
  if (!max) return bad(res, 'Todavía nadie tiene puntos en la clasificación');
  snapshot('antes-de-garro-de-oro');
  db.garro = { at: new Date().toISOString(), pts: max, winners: rk.filter(x => x.p === max).map(x => ({ name: x.e.name, counts: ezCounts(x.e) })) };
  await save();
  res.json(db.garro);
  const names = db.garro.winners.map(w => w.name).join(' y ');
  notify('🍺🏆 ¡Tenemos GARRO DE ORO!', names + (db.garro.winners.length > 1 ? ' se lo reparten' : ' se lleva el trofeo') + ' con ' + max + ' puntos. ¡Salud! 🥂', '/#inicio', 'garro');
});
app.delete('/api/garro', admin, async (req, res) => {
  snapshot('antes-de-quitar-garro');
  db.garro = null;
  await save();
  res.json({ ok: true });
});

// ---- Escudos de equipos (carpeta de escudos): se suben una vez en Admin y salen solos en el Inicio y el calendario ----
// Se guardan dentro de los datos (Upstash o disco local), así que no se pierden con deploys.
app.get('/api/crest/:id', (req, res) => {
  const c = db.crests.find(x => x.id === +req.params.id);
  const m = c && /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(c.img);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // la URL lleva ?v= y cambia al subir otro escudo
  res.send(Buffer.from(m[2], 'base64'));
});
app.put('/api/crests', admin, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40);
  const img = String(req.body.img || '');
  if (!name) return bad(res, 'Falta el nombre del equipo');
  if (img.length > 150000 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(img)) return bad(res, 'Imagen no válida o demasiado pesada');
  const rest = db.crests.filter(c => norm(c.name) !== norm(name));
  if (rest.reduce((t, c) => t + c.img.length, 0) + img.length > 600000) return bad(res, 'Hay demasiados escudos guardados; quita alguno');
  const cur = db.crests.find(c => norm(c.name) === norm(name));
  if (cur) { cur.img = img; cur.v = Date.now(); } // se conserva el nombre con el que se creó
  else db.crests.push({ id: db.nextId++, name, img, v: Date.now() });
  await save();
  res.json({ ok: true });
});
app.delete('/api/crests/:id', admin, async (req, res) => {
  const id = +req.params.id;
  if (!db.crests.some(c => c.id === id)) return bad(res, 'Escudo no encontrado');
  db.crests = db.crests.filter(c => c.id !== id);
  await save();
  res.json({ ok: true });
});
app.get('/api/export', admin, (_, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=garra-datos.json');
  res.json({ ...db, subs: [] }); // las suscripciones de avisos no se exportan
});
app.post('/api/import', admin, async (req, res) => {
  const d = req.body;
  if (!d || !Array.isArray(d.players) || !Array.isArray(d.history)) return bad(res, 'Archivo no válido');
  snapshot('antes-de-importar');
  db = { ...empty(), ...d, teamV2: true, subs: db.subs };
  if (!Array.isArray(db.calendar) || !db.calendar.length) db.calendar = CAL_SEED.map(m => ({ ...m })); // si el archivo es antiguo y no trae calendario
  db.calV1 = db.calV2 = true; // se mantienen los dispositivos suscritos a avisos
  await save();
  res.json({ ok: true });
});

// ---- Mantener despierto (Render free duerme la web tras ~15 min sin visitas) ----
app.get('/healthz', (_, res) => res.send('ok'));
const SELF = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL; // Render pone RENDER_EXTERNAL_URL solo
if (SELF) {
  setInterval(() => { fetch(SELF.replace(/\/$/, '') + '/healthz').catch(() => {}); }, 4 * 60 * 1000); // cada 4 min
  console.log('Keep-alive activo hacia ' + SELF);
}

const port = process.env.PORT || 3000;
init().then(() => app.listen(port, () => console.log('Web en http://localhost:' + port + '  |  datos en ' + (REMOTE ? 'Upstash Redis' : FILE))));
