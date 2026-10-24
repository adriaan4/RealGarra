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
  // Delanteros: Carlos de punta; Pablo y David de segundos delanteros
  [9, 'CARLOS', 50, 9, true], [10, 'PABLO', 30, 25], [8, 'DAVID', 70, 25],
  // Centro del campo y bandas: Dodu banda izquierda; Rober y Jorge banda derecha; Adri en el centro
  [30, 'DODU', 13, 46], [19, 'ADRI', 50, 49], [21, 'ROBER', 87, 38], [16, 'JORGE', 87, 56],
  // Defensas (en dos alturas para que no se pisen los nombres)
  [6, 'JIMÉNEZ', 12, 70], [3, 'HUGO', 31, 78], [11, 'MARIO', 50, 70], [24, 'PAJARES', 69, 78], [29, 'JUAN', 88, 70],
  // Portero
  [1, 'ANTONIO', 50, 94]
].map(([n, name, x, y, c]) => ({ n, name, x, y, c: !!c }));

const empty = () => ({ nextId: 1, squad: SQUAD_SEED.map(p => ({ ...p })), players: [], next: { date: '', rival: '', crest: '', field: '' }, round: { rival: '', votes: [] }, history: [], subs: [], reminded: '', ez: [], garro: null, garrabet: { odds: {}, users: [], tickets: [] }, calendar: [], calV1: false, calV2: false, crests: [] });

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
  if (!db.garrabet || typeof db.garrabet !== 'object') db.garrabet = { odds: {}, users: [], tickets: [] };
  if (!db.garrabet.odds || typeof db.garrabet.odds !== 'object') db.garrabet.odds = {};
  if (!Array.isArray(db.garrabet.users)) db.garrabet.users = [];
  if (!Array.isArray(db.garrabet.tickets)) db.garrabet.tickets = [];
  if (db.next && typeof db.next.field !== 'string') db.next.field = '';
  if (!Array.isArray(db.squad) || !db.squad.length) db.squad = SQUAD_SEED.map(p => ({ ...p })); // plantilla por defecto si todavía no existe
  for (const p of db.squad) if (!p.id) p.id = db.nextId++; // cada jugador de la plantilla tiene id (para su ficha y su foto)
  // Migración de una sola vez: recoloca en el campo a los jugadores de la plantilla ya guardada (solo x/y; dorsal, nombre y capitán no se tocan)
  if (!db.squadV2) {
    snapshot('antes-de-recolocar-plantilla');
    for (const p of db.squad) {
      const t = SQUAD_SEED.find(q => norm(q.name) === norm(p.name));
      if (t) { p.x = t.x; p.y = t.y; }
    }
    db.squadV2 = true;
  }
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
    garrabet: gbPublic(d),
    squad: db.squad.map(({ photo, ...r }) => ({ ...r, hasPhoto: !!photo })), // las fotos se piden aparte (/api/squad-photo/:id)
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
const EZ_START = new Date('2026-10-25T18:00:00+01:00'); // hasta esta hora (fin de la cuenta atrás) la gente no puede apuntar nada; el admin sí
// Cada dispositivo tiene su propia ficha: la crea y la puede cambiar cuando quiera (el nombre queda fijo)
app.post('/api/ez', async (req, res) => {
  if (Date.now() < EZ_START.getTime()) return bad(res, 'Todavía no ha empezado: hasta que termine la cuenta atrás no se puede apuntar nada');
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
app.get('/api/squad-photo/:id', (req, res) => {
  const p = db.squad.find(x => x.id === +req.params.id);
  const m = p && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(p.photo || '');
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // la URL lleva ?v= y cambia al subir otra foto
  res.send(Buffer.from(m[2], 'base64'));
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
    const prev = db.squad.find(q => q.id === +p.id) || {};
    const goals = Math.min(999, Math.max(0, Math.floor(Number(p.goals)) || 0));
    const quote = String(p.quote || '').trim().slice(0, 140);
    // foto: sin campo = se conserva; '' = se quita; imagen en base64 (ya reducida en el navegador) = se cambia
    let photo = prev.photo || '', photoV = prev.photoV || 0;
    if (typeof p.photo === 'string') {
      if (p.photo === '') { photo = ''; photoV = Date.now(); }
      else if (/^data:image\/(?:png|jpeg|webp);base64,/.test(p.photo) && p.photo.length <= 400000) { photo = p.photo; photoV = Date.now(); }
      else return bad(res, 'Foto no válida en ' + name + ' (máximo ~300 KB)');
    }
    out.push({ id: prev.id || db.nextId++, n, name, x: clamp(p.x, 50), y: clamp(p.y, 50), c: !!p.c, goals, quote, photo, photoV });
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

// ---- GARRABET: mercados Over/Under + 1X2 + resultado exacto, boletos sencillos y combinados, con nombre por dispositivo ----
const gbRange = (from, n) => Array.from({ length: n }, (_, i) => (from + i + 0.5).toFixed(1));
const GB_LINES = { scored: gbRange(0, 8), conceded: gbRange(0, 8), total: gbRange(1, 11) }; // 0.5–7.5 / 0.5–7.5 / 1.5–11.5
const GB_MAX_SELS = 8, GB_MAX_TICKETS = 60, GB_EX_MAX = 5, GB_EX_MARGIN = 1.12, GB_EX_CAP = 150;
const GB_START = 100, GB_MIN_STAKE = 1; // pavos con los que empieza cada jugador y apuesta mínima
const gbMoney = n => Math.round(n * 100) / 100;
// Goleadores (marca en cualquier momento): cuotas por defecto, de la más baja a la más alta. El admin las puede cambiar por jornada
const GB_SC_DEF = { MARIO: 2.5, 'JIMÉNEZ': 3, CARLOS: 3.5, PABLO: 4.5, DODU: 5.5, DAVID: 7, ADRI: 8.5, JORGE: 9.5, ROBER: 11, HUGO: 13, PAJARES: 15, JUAN: 17, ANTONIO: 30 };
const gbScNames = () => [...new Set((db.squad || []).map(p => String(p.name).toUpperCase()))];
const gbScDef = n => { const k = Object.keys(GB_SC_DEF).find(x => norm(x) === norm(n)); return k ? GB_SC_DEF[k] : 15; };
const gbScorerDefault = () => { const o = {}; gbScNames().forEach(n => { o[n] = gbScDef(n); }); return o; };
const gbScorerOdds = od => { const o = {}; gbScNames().forEach(n => { const v = od && od.scorer ? od.scorer[n] : gbScDef(n); if (v) o[n] = v; }); return o; };
// Doble oportunidad: si el admin no pone cuota, sale sola a partir de 1/X/2
const GB_DC = { '1X': ['1', 'X'], '12': ['1', '2'], 'X2': ['X', '2'] };
function gbDcOdd(od, side) {
  if (!od || !GB_DC[side]) return null;
  if (od.dc && od.dc[side]) return od.dc[side];
  const [a, b] = GB_DC[side].map(k => od.res && od.res[k]);
  return a && b ? Math.max(1.01, gbMoney(1 / (1 / a + 1 / b))) : null;
}
const gbOdd = v => { // '' o null = sin cuota; acepta coma decimal
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 1.01 && n <= 1000 ? Math.round(n * 100) / 100 : undefined;
};
const gbResult = m => { const r = /(\d+)\s*[-–:]\s*(\d+)/.exec((m && m.result) || ''); return r ? { gf: +r[1], gc: +r[2] } : null; }; // «3-1» = Real Garra 3, rival 1
const gbWin = (market, line, side, r) => {
  if (market === 'res') return (side === '1' ? r.gf > r.gc : side === '2' ? r.gf < r.gc : r.gf === r.gc);
  if (market === 'exact') return line === r.gf + '-' + r.gc;
  if (market === 'btts') return side === 'y' ? (r.gf > 0 && r.gc > 0) : !(r.gf > 0 && r.gc > 0); // ambos marcan: y = sí, n = no
  if (market === 'dc') return side === '1X' ? r.gf >= r.gc : side === '2X' || side === 'X2' ? r.gf <= r.gc : r.gf !== r.gc;
  const t = market === 'scored' ? r.gf : market === 'conceded' ? r.gc : r.gf + r.gc;
  return side === 'o' ? t > Number(line) : t < Number(line);
};

// Resultado exacto: se genera solo a partir de las cuotas 1/X/2 del admin (se quita el margen y se ajustan dos Poisson a esas probabilidades)
const gbExCache = new Map();
function gbExact(res) {
  const k = [res['1'], res.X, res['2']].join('|');
  if (gbExCache.has(k)) return gbExCache.get(k);
  const q = [1 / res['1'], 1 / res.X, 1 / res['2']], sum = q[0] + q[1] + q[2], [pw, pd, pl] = q.map(x => x / sum), N = 25;
  const pmf = l => { const a = [Math.exp(-l)]; for (let i = 1; i < N; i++) a.push(a[i - 1] * l / i); return a; };
  const err = (H, A) => { let w = 0, d = 0, l = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const p = H[i] * A[j]; if (i > j) w += p; else if (i === j) d += p; else l += p; } return (w - pw) ** 2 + (d - pd) ** 2 + (l - pl) ** 2; };
  let best = [1, 1, Infinity];
  for (let h = 0.1; h <= 8.001; h += 0.1) { const H = pmf(h); for (let a = 0.1; a <= 8.001; a += 0.1) { const e = err(H, pmf(a)); if (e < best[2]) best = [h, a, e]; } }
  const [h0, a0] = best;
  for (let h = Math.max(0.05, h0 - 0.1); h <= h0 + 0.1; h += 0.01) { const H = pmf(h); for (let a = Math.max(0.05, a0 - 0.1); a <= a0 + 0.1; a += 0.01) { const e = err(H, pmf(a)); if (e < best[2]) best = [h, a, e]; } }
  const H = pmf(best[0]), A = pmf(best[1]), out = {};
  for (let i = 0; i <= GB_EX_MAX; i++) for (let j = 0; j <= GB_EX_MAX; j++) out[i + '-' + j] = Math.round(Math.min(GB_EX_CAP, Math.max(1.01, 1 / (H[i] * A[j] * GB_EX_MARGIN))) * 100) / 100;
  if (gbExCache.size > 200) gbExCache.clear();
  gbExCache.set(k, out);
  return out;
}
const gbExactFor = j => { const od = db.garrabet.odds[j]; return od && od.res && od.res['1'] && od.res.X && od.res['2'] ? gbExact(od.res) : null; };
function gbSelOdd(j, market, line, side) { // cuota vigente de una selección (null si no existe)
  const od = db.garrabet.odds[j];
  if (!od) return null;
  if (market === 'res') return ['1', 'X', '2'].includes(side) ? (od.res[side] || null) : null;
  if (market === 'dc') return gbDcOdd(od, side);
  if (market === 'btts') return ['y', 'n'].includes(side) ? ((od.btts && od.btts[side]) || null) : null;
  if (market === 'scorer') return side === 's' ? (gbScorerOdds(od)[line] || null) : null;
  if (market === 'exact') { const ex = gbExactFor(j); return side === 's' && ex ? (ex[line] || null) : null; }
  if (!GB_LINES[market] || !GB_LINES[market].includes(line) || !['o', 'u'].includes(side)) return null;
  const c = od[market][line];
  return (c && c[side]) || null;
}
const gbSelStatus = x => {
  const m = db.calendar.find(c => c.j === x.j), r = gbResult(m);
  if (!r) return 'pending';
  if (x.market === 'scorer') { // sin goles del Garra pierde; si el admin aún no ha marcado goleadores, queda pendiente
    if (r.gf === 0) return 'lose';
    if (!Array.isArray(m.scorers)) return 'pending';
    return m.scorers.includes(x.line) ? 'win' : 'lose';
  }
  return gbWin(x.market, x.line, x.side, r) ? 'win' : 'lose';
};
function gbTicketOut(t) {
  const sels = t.sels.map(x => ({ ...x, status: gbSelStatus(x) }));
  const forced = ['win', 'lose', 'void'].includes(t.forced) ? t.forced : ''; // el admin puede dar la apuesta por ganada o anularla (se devuelve el importe)
  const status = forced === 'void' ? 'void' : forced === 'win' ? 'win' : forced === 'lose' ? 'lose' : sels.some(x => x.status === 'lose') ? 'lose' : sels.every(x => x.status === 'win') ? 'win' : 'pending';
  const stake = gbMoney(Number(t.stake) || 0); // las apuestas antiguas (sin importe) cuentan como 0 y no tocan el saldo
  return { id: t.id, at: t.at, odd: t.odd, sels, status, stake, payout: status === 'win' ? gbMoney(stake * t.odd) : status === 'void' ? stake : 0, forced };
}
const gbUser = d => db.garrabet.users.find(u => u.device === d);
// Saldo = 100 iniciales + ingresos del admin − importes apostados + premios de apuestas ganadas (se calcula siempre desde las apuestas, así nunca se descuadra)
function gbBalance(u) {
  let b = GB_START + (Number(u.bonus) || 0);
  for (const t of db.garrabet.tickets) if (t.device === u.device) { const o = gbTicketOut(t); b += -o.stake + o.payout; }
  return gbMoney(b);
}
function gbPublic(d) {
  const results = {}, exact = {};
  db.calendar.forEach(m => { const r = gbResult(m); if (r) results[m.j] = r; });
  Object.keys(db.garrabet.odds).forEach(j => { const ex = gbExactFor(j); if (ex) exact[j] = ex; });
  const dc = {}, scorerOdds = {}, scorers = {};
  Object.keys(db.garrabet.odds).forEach(j => { const od = db.garrabet.odds[j]; dc[j] = {}; Object.keys(GB_DC).forEach(k => { dc[j][k] = gbDcOdd(od, k); }); scorerOdds[j] = gbScorerOdds(od); });
  db.calendar.forEach(m => { if (Array.isArray(m.scorers)) scorers[m.j] = m.scorers; });
  const me = d && gbUser(d);
  return { odds: db.garrabet.odds, exact, dc, scorerOdds, scorers, scorerDef: gbScorerDefault(), results, lines: GB_LINES, me: me ? me.name : null, balance: me ? gbBalance(me) : null, minStake: GB_MIN_STAKE, mine: d ? db.garrabet.tickets.filter(t => t.device === d).map(gbTicketOut) : [] };
}
app.put('/api/garrabet/:j', admin, async (req, res) => { // el admin guarda todas las cuotas de un partido (sin tocar código)
  const j = +req.params.j;
  if (!db.calendar.some(m => m.j === j)) return bad(res, 'Jornada no encontrada');
  const body = req.body || {}, out = { res: {}, scored: {}, conceded: {}, total: {} };
  for (const k of ['1', 'X', '2']) { const o = gbOdd(body.res && body.res[k]); if (o === undefined) return bad(res, 'Cuota no válida en Resultado (mínimo 1,01)'); out.res[k] = o; }
  for (const mk of Object.keys(GB_LINES)) for (const l of GB_LINES[mk]) {
    const src = (body[mk] && body[mk][l]) || {}, o = gbOdd(src.o), u = gbOdd(src.u);
    if (o === undefined || u === undefined) return bad(res, 'Cuota no válida en ' + mk + ' ' + l + ' (mínimo 1,01)');
    out[mk][l] = { o, u };
  }
  out.dc = {};
  for (const k of Object.keys(GB_DC)) { const o = gbOdd(body.dc && body.dc[k]); if (o === undefined) return bad(res, 'Cuota no válida en Doble oportunidad (mínimo 1,01)'); out.dc[k] = o; }
  out.btts = {};
  for (const k of ['y', 'n']) { const o = gbOdd(body.btts && body.btts[k]); if (o === undefined) return bad(res, 'Cuota no válida en Ambos marcan (mínimo 1,01)'); out.btts[k] = o; }
  if (body.scorer) { // si no viene, se mantienen las cuotas por defecto
    out.scorer = {};
    for (const n of gbScNames()) { const o = gbOdd(body.scorer[n]); if (o === undefined) return bad(res, 'Cuota no válida en goleador ' + n + ' (mínimo 1,01)'); out.scorer[n] = o; }
  }
  db.garrabet.odds[j] = out;
  await save();
  res.json({ ok: true });
});
// Nombre por dispositivo: se elige una vez (único); el admin puede cambiarlo
app.post('/api/garrabet/name', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80), name = String(req.body.name || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 20);
  if (device.length < 8) return bad(res, 'No se pudo identificar tu dispositivo');
  if (gbUser(device)) return bad(res, 'Este dispositivo ya tiene nombre');
  if (name.length < 2) return bad(res, 'Pon tu nombre (mínimo 2 letras)');
  if (db.garrabet.users.some(u => norm(u.name) === norm(name))) return bad(res, 'Ese nombre ya está cogido. Si eres tú desde otro móvil, pídele al admin que lo cambie');
  db.garrabet.users.push({ id: db.nextId++, device, name });
  await save();
  res.json({ ok: true });
});
// Boleto: 1 selección = sencilla, 2 o más = combinada (cuota = producto). Solo una selección por mercado y partido
app.post('/api/garrabet/ticket', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80), raw = Array.isArray(req.body.sels) ? req.body.sels : [];
  if (device.length < 8) return bad(res, 'No se pudo identificar tu dispositivo');
  const user = gbUser(device);
  if (!user) return bad(res, 'Pon tu nombre para apostar');
  const stake = gbMoney(Number(String(req.body.stake == null ? '' : req.body.stake).replace(',', '.')));
  if (!Number.isFinite(stake) || stake < GB_MIN_STAKE) return bad(res, 'Pon cuántos pavos apuestas (mínimo ' + GB_MIN_STAKE + ')');
  if (stake > gbBalance(user)) return bad(res, 'No tienes tantos pavos. Te quedan ' + gbBalance(user));
  if (!raw.length) return bad(res, 'El boleto está vacío');
  if (raw.length > GB_MAX_SELS) return bad(res, 'Máximo ' + GB_MAX_SELS + ' selecciones por boleto');
  if (db.garrabet.tickets.filter(t => t.device === device).length >= GB_MAX_TICKETS) return bad(res, 'Has llegado al máximo de apuestas');
  const sels = [], seen = new Set();
  for (const r of raw) {
    const j = +r.j, market = String(r.market || ''), side = String(r.side || ''), line = market === 'res' ? '' : String(r.line || '');
    const m = db.calendar.find(x => x.j === j);
    if (!m) return bad(res, 'Partido no válido');
    if (gbResult(m)) return bad(res, 'La jornada ' + j + ' ya está cerrada');
    const odd = gbSelOdd(j, market, line, side);
    if (!odd) return bad(res, 'Una de las selecciones ya no tiene cuota');
    const k = j + '|' + market + (market === 'scorer' ? '|' + line : '');
    if (seen.has(k)) return bad(res, 'No puedes combinar dos selecciones del mismo mercado en un partido (por ejemplo +2,5 y +3,5 de goles totales). Solo los goleadores se pueden combinar entre sí');
    seen.add(k);
    sels.push({ j, market, line, side, odd });
  }
  const odd = Math.round(sels.reduce((p, x) => p * x.odd, 1) * 100) / 100;
  const sig = t => t.sels.map(x => [x.j, x.market, x.line, x.side].join(':')).sort().join(',');
  const dupe = { sels };
  if (db.garrabet.tickets.some(t => t.device === device && sig(t) === sig(dupe) && gbTicketOut(t).status === 'pending')) return bad(res, 'Ya tienes ese mismo boleto');
  db.garrabet.tickets.push({ id: db.nextId++, device, at: new Date().toISOString(), sels, odd, stake });
  await save();
  res.json({ ok: true });
});
app.delete('/api/garrabet/ticket/:id', async (req, res) => { // el usuario puede quitar su boleto mientras ningún partido suyo esté cerrado
  const device = String(req.query.d || '').slice(0, 80), t = db.garrabet.tickets.find(x => x.id === +req.params.id && x.device === device);
  if (!t) return bad(res, 'Apuesta no encontrada');
  if (t.forced) return bad(res, 'El admin ya ha resuelto esta apuesta: no se puede quitar');
  if (t.sels.some(x => gbResult(db.calendar.find(m => m.j === x.j)))) return bad(res, 'Ya hay resultado en alguno de esos partidos: no se puede quitar');
  db.garrabet.tickets = db.garrabet.tickets.filter(x => x !== t);
  await save();
  res.json({ ok: true });
});
// Admin: todas las apuestas (sencillas y combinadas) con el nombre de cada persona
app.get('/api/garrabet-admin/all', admin, (_, res) => {
  const name = d => (gbUser(d) || {}).name || 'SIN NOMBRE';
  res.json({
    users: db.garrabet.users.map(u => ({ id: u.id, name: u.name, balance: gbBalance(u) })),
    tickets: db.garrabet.tickets.slice().sort((a, b) => b.id - a.id).map(t => ({ ...gbTicketOut(t), name: name(t.device), userId: (gbUser(t.device) || {}).id || 0 }))
  });
});
app.put('/api/garrabet-admin/user/:id', admin, async (req, res) => {
  const u = db.garrabet.users.find(x => x.id === +req.params.id), name = String(req.body.name || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 20);
  if (!u) return bad(res, 'Persona no encontrada');
  if (name.length < 2) return bad(res, 'Nombre demasiado corto');
  if (db.garrabet.users.some(x => x !== u && norm(x.name) === norm(name))) return bad(res, 'Ese nombre ya existe');
  u.name = name;
  await save();
  res.json({ ok: true });
});
// Admin: ingresar pavos (o quitarlos con un número negativo) a una persona o a todas
const gbAmount = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) && n !== 0 && Math.abs(n) <= 100000 ? gbMoney(n) : null; };
app.post('/api/garrabet-admin/money-all', admin, async (req, res) => {
  const amt = gbAmount(req.body.amount);
  if (amt === null) return bad(res, 'Cantidad no válida');
  db.garrabet.users.forEach(u => { u.bonus = gbMoney((Number(u.bonus) || 0) + amt); });
  await save();
  res.json({ ok: true });
});
app.post('/api/garrabet-admin/user/:id/money', admin, async (req, res) => {
  const u = db.garrabet.users.find(x => x.id === +req.params.id), amt = gbAmount(req.body.amount);
  if (!u) return bad(res, 'Persona no encontrada');
  if (amt === null) return bad(res, 'Cantidad no válida');
  u.bonus = gbMoney((Number(u.bonus) || 0) + amt);
  await save();
  res.json({ ok: true, balance: gbBalance(u) });
});
// Admin: dar una apuesta por ganada, anularla (se devuelve el importe) o quitar la marca
app.post('/api/garrabet-admin/ticket/:id/settle', admin, async (req, res) => {
  const t = db.garrabet.tickets.find(x => x.id === +req.params.id), a = String(req.body.action || '');
  if (!t) return bad(res, 'Apuesta no encontrada');
  if (!['win', 'lose', 'void', 'reset'].includes(a)) return bad(res, 'Acción no válida');
  if (a === 'reset') delete t.forced; else t.forced = a;
  await save();
  res.json({ ok: true });
});
// Admin: quién marcó en cada partido (para liquidar los goleadores). Lista vacía = no marcó nadie del Garra
app.put('/api/garrabet-admin/scorers/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  const names = gbScNames();
  m.scorers = [...new Set((Array.isArray(req.body.scorers) ? req.body.scorers : []).map(n => String(n).toUpperCase()).filter(n => names.includes(n)))];
  await save();
  res.json({ ok: true });
});
app.delete('/api/garrabet-admin/ticket/:id', admin, async (req, res) => {
  const n = db.garrabet.tickets.length;
  db.garrabet.tickets = db.garrabet.tickets.filter(t => t.id !== +req.params.id);
  if (db.garrabet.tickets.length === n) return bad(res, 'Apuesta no encontrada');
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
