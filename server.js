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

const empty = () => ({ nextId: 1, squad: SQUAD_SEED.map(p => ({ ...p })), players: [], next: { date: '', rival: '', crest: '', field: '' }, round: { rival: '', votes: [] }, history: [], subs: [], adminSubs: [], reminded: '', ez: [], garro: null, garrabet: { odds: {}, users: [], tickets: [] }, calendar: [], calV1: false, calV2: false, crests: [] });

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
  if (!Array.isArray(db.adminSubs)) db.adminSubs = []; // dispositivos del admin (avisos privados de apuestas y porras)

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
  // Cuotas de la jornada 2 (Real Garra - Bricomaniacos FC): se cargan solo si esa jornada aún no tiene cuotas; goleadores y amarillas usan las de por defecto. Luego se pueden editar en Admin
  if (!db.garrabet.odds[2]) db.garrabet.odds[2] = {"res":{"1":2.35,"X":3.25,"2":2.85},"scored":{"0.5":{"o":1.33,"u":3.07},"1.5":{"o":2.74,"u":1.4},"2.5":{"o":7.68,"u":1.05},"3.5":{"o":27.42,"u":1.01},"4.5":{"o":119.54,"u":1.01},"5.5":{"o":617.19,"u":1.01},"6.5":{"o":1000,"u":1.01},"7.5":{"o":1000,"u":1.01}},"conceded":{"0.5":{"o":1.42,"u":2.65},"1.5":{"o":3.28,"u":1.29},"2.5":{"o":10.32,"u":1.02},"3.5":{"o":41.69,"u":1.01},"4.5":{"o":206.43,"u":1.01},"5.5":{"o":1000,"u":1.01},"6.5":{"o":1000,"u":1.01},"7.5":{"o":1000,"u":1.01}},"total":{"1.5":{"o":1.41,"u":2.7},"2.5":{"o":2.37,"u":1.52},"3.5":{"o":4.86,"u":1.14},"4.5":{"o":11.87,"u":1.01},"5.5":{"o":33.84,"u":1.01},"6.5":{"o":110.6,"u":1.01},"7.5":{"o":408.42,"u":1.01},"8.5":{"o":1000,"u":1.01},"9.5":{"o":1000,"u":1.01},"10.5":{"o":1000,"u":1.01},"11.5":{"o":1000,"u":1.01}},"dc":{"1X":1.37,"12":1.29,"X2":1.52},"btts":{"y":2.04,"n":1.7}};
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

async function sendPush(list, payload) { // list = 'subs' (todos) o 'adminSubs' (solo el admin)
  if (!PUSH || !(db[list] || []).length) return { sent: 0, removed: 0 };
  let sent = 0;
  const dead = new Set();
  await Promise.all(db[list].map(async s => {
    try { await webpush.sendNotification(s, payload, { TTL: 86400 }); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.endpoint); // suscripción caducada o dada de baja
      else console.error('Fallo al enviar aviso (' + (e.statusCode || e.message) + ')');
    }
  }));
  if (dead.size) { db[list] = db[list].filter(s => !dead.has(s.endpoint)); await save(); }
  return { sent, removed: dead.size };
}
async function notifyAll(title, body, url = '/#inicio', tag = 'garra') {
  return sendPush('subs', JSON.stringify({ title, body, url, tag }));
}
const notify = (...a) => notifyAll(...a).catch(e => console.error('Aviso push: ' + e.message));
// Avisos PRIVADOS: solo llegan a los dispositivos que el admin ha activado (apuestas, combinadas y porras de la gente)
const notifyAdmin = (title, body, tag = 'admin') => sendPush('adminSubs', JSON.stringify({ title, body, url: '/#admin', tag })).catch(e => console.error('Aviso admin: ' + e.message));

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
    calendar: db.calendar.map(({ cron, ...m }) => cron ? { ...m, cron: { title: cron.title || '', text: cron.text || '', hasPhoto: !!cron.photo, v: cron.v || 0, at: cron.at || 0 } } : m), // las fotos de las crónicas se piden aparte (/api/cronica-photo/:j)
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
app.post('/api/push/admin-subscribe', admin, async (req, res) => { // el admin activa los avisos privados en este dispositivo
  if (!PUSH) return bad(res, 'Los avisos no están activados en el servidor (faltan las claves VAPID)');
  const s = req.body && req.body.sub;
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2000
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  if (!ok) return bad(res, 'Suscripción no válida');
  const clean = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  const i = db.adminSubs.findIndex(x => x.endpoint === clean.endpoint);
  if (i >= 0) db.adminSubs[i] = clean; else { if (db.adminSubs.length >= 20) return bad(res, 'Demasiados dispositivos de admin'); db.adminSubs.push(clean); }
  await save();
  res.json({ ok: true });
});
app.post('/api/push/admin-unsubscribe', admin, async (req, res) => {
  const ep = String((req.body && req.body.endpoint) || '');
  const n = db.adminSubs.length;
  db.adminSubs = db.adminSubs.filter(x => x.endpoint !== ep);
  if (db.adminSubs.length !== n) await save();
  res.json({ ok: true });
});
app.post('/api/push/admin-status', admin, (req, res) => { // ¿este dispositivo ya recibe los avisos del admin?
  const ep = String((req.body && req.body.endpoint) || '');
  res.json({ on: !!ep && db.adminSubs.some(x => x.endpoint === ep) });
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
    // goles encajados: solo el portero (Antonio) los tiene; los demás jugadores nunca
    const conceded = norm(name) !== 'ANTONIO' ? null : (Number.isFinite(Number(p.conceded)) && p.conceded !== '' && p.conceded != null ? Math.min(999, Math.max(0, Math.floor(Number(p.conceded)))) : (Number.isFinite(prev.conceded) ? prev.conceded : 0));
    // foto: sin campo = se conserva; '' = se quita; imagen en base64 (ya reducida en el navegador) = se cambia
    let photo = prev.photo || '', photoV = prev.photoV || 0;
    if (typeof p.photo === 'string') {
      if (p.photo === '') { photo = ''; photoV = Date.now(); }
      else if (/^data:image\/(?:png|jpeg|webp);base64,/.test(p.photo) && p.photo.length <= 400000) { photo = p.photo; photoV = Date.now(); }
      else return bad(res, 'Foto no válida en ' + name + ' (máximo ~300 KB)');
    }
    out.push({ id: prev.id || db.nextId++, n, name, x: clamp(p.x, 50), y: clamp(p.y, 50), c: !!p.c, goals, conceded, quote, photo, photoV });
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
// ---- Crónicas de partido: titular (opcional), texto y la foto con el resultado que se sube a Instagram ----
app.get('/api/cronica-photo/:j', (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  const r = m && m.cron && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(m.cron.photo || '');
  if (!r) return res.status(404).end();
  res.set('Content-Type', r[1]);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // la URL lleva ?v= y cambia al subir otra foto
  res.send(Buffer.from(r[2], 'base64'));
});
app.put('/api/cronica/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  const prev = m.cron || {};
  const title = String(req.body.title || '').trim().slice(0, 90);
  const text = String(req.body.text || '').replace(/\r\n/g, '\n').trim().slice(0, 2500);
  // foto: sin campo = se conserva; '' = se quita; imagen en base64 (ya reducida en el navegador) = se cambia
  let photo = prev.photo || '', v = prev.v || 0;
  if (typeof req.body.photo === 'string') {
    if (req.body.photo === '') { photo = ''; v = Date.now(); }
    else if (/^data:image\/(?:png|jpeg|webp);base64,/.test(req.body.photo) && req.body.photo.length <= 700000) { photo = req.body.photo; v = Date.now(); }
    else return bad(res, 'Foto no válida (máximo ~500 KB)');
  }
  if (!text && !photo && !title) return bad(res, 'Escribe la crónica o sube una foto');
  m.cron = { title, text, photo, v, at: prev.at || Date.now() };
  await save();
  res.json({ ok: true });
});
app.delete('/api/cronica/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m || !m.cron) return bad(res, 'Esa jornada no tiene crónica');
  snapshot('antes-de-borrar-cronica');
  delete m.cron;
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
  res.json({ ...db, subs: [], adminSubs: [] }); // las suscripciones de avisos no se exportan
});
app.post('/api/import', admin, async (req, res) => {
  const d = req.body;
  if (!d || !Array.isArray(d.players) || !Array.isArray(d.history)) return bad(res, 'Archivo no válido');
  snapshot('antes-de-importar');
  db = { ...empty(), ...d, teamV2: true, subs: db.subs, adminSubs: db.adminSubs };
  if (!Array.isArray(db.calendar) || !db.calendar.length) db.calendar = CAL_SEED.map(m => ({ ...m })); // si el archivo es antiguo y no trae calendario
  db.calV1 = db.calV2 = true; // se mantienen los dispositivos suscritos a avisos
  await save();
  res.json({ ok: true });
});

// ---- GARRABET: mercados Over/Under + 1X2 + resultado exacto, boletos sencillos y combinados, con nombre por dispositivo ----
const gbRange = (from, n) => Array.from({ length: n }, (_, i) => (from + i + 0.5).toFixed(1));
const GB_LINES = { scored: gbRange(0, 8), conceded: gbRange(0, 8), total: gbRange(1, 11) }; // 0.5–7.5 / 0.5–7.5 / 1.5–11.5
const GB_MAX_SELS = 8, GB_MAX_TICKETS = 60, GB_EX_MAX = 9, GB_EX_GRID = 5, GB_EX_MARGIN = 1.12, GB_EX_CAP = 150, GB_EX_FAR_CAP = 500;
const GB_START = 100, GB_MIN_STAKE = 1; // pavos con los que empieza cada jugador y apuesta mínima
const gbMoney = n => Math.round(n * 100) / 100;
// Goleadores (marca en cualquier momento): cuotas por defecto, de la más baja a la más alta. El admin las puede cambiar por jornada
const GB_SC_DEF = { MARIO: 2.5, 'JIMÉNEZ': 3, CARLOS: 3.5, PABLO: 4.5, DODU: 5.5, DAVID: 7, ADRI: 8.5, JORGE: 9.5, ROBER: 11, HUGO: 13, PAJARES: 15, JUAN: 17, ANTONIO: 30 };
const gbScNames = () => [...new Set((db.squad || []).map(p => String(p.name).toUpperCase()))];
const gbScDef = n => { const k = Object.keys(GB_SC_DEF).find(x => norm(x) === norm(n)); return k ? GB_SC_DEF[k] : 15; };
const gbScorerDefault = () => { const o = {}; gbScNames().forEach(n => { o[n] = gbScDef(n); }); return o; };
const gbScorerOdds = od => { const o = {}; gbScNames().forEach(n => { const v = od && od.scorer ? od.scorer[n] : gbScDef(n); if (v) o[n] = v; }); return o; };
// Tarjeta amarilla (recibe amarilla en el partido): cuotas inventadas por defecto, de menor a mayor. El admin las puede cambiar por jornada
const GB_YC_DEF = { PAJARES: 2.2, JUAN: 2.4, 'JIMÉNEZ': 2.6, HUGO: 2.8, MARIO: 3.2, JORGE: 3.5, ROBER: 3.8, DODU: 4.2, ADRI: 4.8, PABLO: 5.5, DAVID: 6.5, CARLOS: 7, ANTONIO: 12 };
const gbYcDef = n => { const k = Object.keys(GB_YC_DEF).find(x => norm(x) === norm(n)); return k ? GB_YC_DEF[k] : 6; };
const gbYellowDefault = () => { const o = {}; gbScNames().forEach(n => { o[n] = gbYcDef(n); }); return o; };
// «Ninguno»: nadie del Garra ve amarilla en el partido (se apuesta como una selección más del mercado de amarillas)
const GB_YC_NONE = 'NINGUNO', GB_YC_NONE_DEF = 3.5;
const gbYellowOdds = od => { const o = {}; gbScNames().forEach(n => { const v = od && od.yellow ? od.yellow[n] : gbYcDef(n); if (v) o[n] = v; }); const nv = od && od.yellow && GB_YC_NONE in od.yellow ? od.yellow[GB_YC_NONE] : GB_YC_NONE_DEF; if (nv) o[GB_YC_NONE] = nv; return o; };
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
  for (let i = 0; i <= GB_EX_MAX; i++) for (let j = 0; j <= GB_EX_MAX; j++) out[i + '-' + j] = Math.round(Math.min(i > GB_EX_GRID || j > GB_EX_GRID ? GB_EX_FAR_CAP : GB_EX_CAP, Math.max(1.01, 1 / (H[i] * A[j] * GB_EX_MARGIN))) * 100) / 100; // fuera de la parrilla 0-5 = «otro resultado» (cuota más alta)
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
  if (market === 'yellow') return side === 's' ? (gbYellowOdds(od)[line] || null) : null;
  if (market === 'exact') { const ex = gbExactFor(j); return side === 's' && ex ? (ex[line] || null) : null; }
  if (!GB_LINES[market] || !GB_LINES[market].includes(line) || !['o', 'u'].includes(side)) return null;
  const c = od[market][line];
  return (c && c[side]) || null;
}
const gbSelStatus = x => {
  const m = db.calendar.find(c => c.j === x.j), r = gbResult(m);
  if (x.market === 'scorer') { // en cuanto el admin guarda quién marcó, se liquida (no hace falta el resultado); sin goles del Garra pierde
    if (r && r.gf === 0) return 'lose';
    if (!m || !Array.isArray(m.scorers)) return 'pending';
    return m.scorers.includes(x.line) ? 'win' : 'lose';
  }
  if (x.market === 'yellow') { // en cuanto el admin guarda quién vio amarilla, se liquida
    if (!m || !Array.isArray(m.yellows)) return 'pending';
    if (x.line === GB_YC_NONE) return m.yellows.length === 0 ? 'win' : 'lose';
    return m.yellows.includes(x.line) ? 'win' : 'lose';
  }
  if (!r) return 'pending';
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
  const dc = {}, scorerOdds = {}, scorers = {}, yellowOdds = {}, yellows = {};
  Object.keys(db.garrabet.odds).forEach(j => { const od = db.garrabet.odds[j]; dc[j] = {}; Object.keys(GB_DC).forEach(k => { dc[j][k] = gbDcOdd(od, k); }); scorerOdds[j] = gbScorerOdds(od); yellowOdds[j] = gbYellowOdds(od); });
  db.calendar.forEach(m => { if (Array.isArray(m.scorers)) scorers[m.j] = m.scorers; if (Array.isArray(m.yellows)) yellows[m.j] = m.yellows; });
  const me = d && gbUser(d);
  // Ranking de la peña: pavos actuales y apuestas acertadas (boletos ganados / resueltos); las anuladas no cuentan
  const ranking = db.garrabet.users.map(u => {
    let won = 0, lost = 0, pending = 0;
    for (const t of db.garrabet.tickets) if (t.device === u.device) { const st = gbTicketOut(t).status; if (st === 'win') won++; else if (st === 'lose') lost++; else if (st === 'pending') pending++; }
    return { name: u.name, balance: gbBalance(u), won, lost, pending, me: !!d && u.device === d };
  }).sort((a, b) => b.balance - a.balance || b.won - a.won || a.name.localeCompare(b.name));
  return { ranking, odds: db.garrabet.odds, exact, dc, scorerOdds, scorers, scorerDef: gbScorerDefault(), yellowOdds, yellows, yellowDef: gbYellowDefault(), yellowNoneDef: GB_YC_NONE_DEF, results, lines: GB_LINES, me: me ? me.name : null, balance: me ? gbBalance(me) : null, minStake: GB_MIN_STAKE, mine: d ? db.garrabet.tickets.filter(t => t.device === d).map(gbTicketOut) : [] };
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
  if (body.yellow) {
    out.yellow = {};
    for (const n of gbScNames()) { const o = gbOdd(body.yellow[n]); if (o === undefined) return bad(res, 'Cuota no válida en amarilla ' + n + ' (mínimo 1,01)'); out.yellow[n] = o; }
    if (body.yellow[GB_YC_NONE] !== undefined) { const o = gbOdd(body.yellow[GB_YC_NONE]); if (o === undefined) return bad(res, 'Cuota no válida en amarilla Ninguno (mínimo 1,01)'); out.yellow[GB_YC_NONE] = o; }
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
    if (gbResult(m) || (market === 'scorer' && Array.isArray(m.scorers)) || (market === 'yellow' && Array.isArray(m.yellows))) return bad(res, 'La jornada ' + j + ' ya está cerrada para esa apuesta');
    const odd = gbSelOdd(j, market, line, side);
    if (!odd) return bad(res, 'Una de las selecciones ya no tiene cuota');
    const k = j + '|' + market + (market === 'scorer' || market === 'yellow' ? '|' + line : '');
    if (seen.has(k)) return bad(res, 'No puedes combinar dos selecciones del mismo mercado en un partido (por ejemplo +2,5 y +3,5 de goles totales). Solo los goleadores (y las amarillas) se pueden combinar entre sí');
    seen.add(k);
    sels.push({ j, market, line, side, odd });
  }
  // «Ninguno» (nadie ve amarilla) se contradice con cualquier jugador del mismo partido
  for (const a of sels.filter(x => x.market === 'yellow' && x.line === GB_YC_NONE)) {
    if (sels.some(x => x.market === 'yellow' && x.j === a.j && x.line !== GB_YC_NONE)) return bad(res, 'En la jornada ' + a.j + ' no puedes combinar «Ninguna amarilla» con la amarilla de un jugador: se contradicen');
  }
  // Doble oportunidad + 1X2 del mismo partido: no multiplican (el 1X2 ya está dentro de la doble; se cuenta solo la cuota del 1X2).
  // Si se contradicen (por ejemplo Gana Garra + Empate o rival), el boleto no se puede hacer.
  for (const a of sels.filter(x => x.market === 'res')) {
    const b = sels.find(x => x.market === 'dc' && x.j === a.j);
    if (!b) continue;
    if (!GB_DC[b.side].includes(a.side)) return bad(res, 'En la jornada ' + a.j + ' esas dos selecciones se contradicen (1X2 y doble oportunidad). Elige otra combinación');
    b.nm = true; // no multiplica
  }
  const odd = Math.round(sels.reduce((p, x) => p * (x.nm ? 1 : x.odd), 1) * 100) / 100;
  const sig = t => t.sels.map(x => [x.j, x.market, x.line, x.side].join(':')).sort().join(',');
  const dupe = { sels };
  if (db.garrabet.tickets.some(t => t.device === device && sig(t) === sig(dupe) && gbTicketOut(t).status === 'pending')) return bad(res, 'Ya tienes ese mismo boleto');
  const tid = db.nextId++;
  db.garrabet.tickets.push({ id: tid, device, at: new Date().toISOString(), sels, odd, stake });
  await save();
  res.json({ ok: true });
  const fm = n => String(n).replace('.', ',');
  notifyAdmin(sels.length > 1 ? '🎟️ Nueva COMBINADA' : '🎟️ Nueva apuesta',
    user.name + ' apuesta ' + fm(stake) + ' pavos' + (sels.length > 1 ? ' a una combinada de ' + sels.length : '') + ' · cuota ' + fm(odd) + ' · puede ganar ' + fm(gbMoney(stake * odd)), 'adm-ticket-' + tid);
});
app.delete('/api/garrabet/ticket/:id', async (req, res) => { // el usuario puede quitar su boleto mientras ningún partido suyo esté cerrado
  const device = String(req.query.d || '').slice(0, 80), t = db.garrabet.tickets.find(x => x.id === +req.params.id && x.device === device);
  if (!t) return bad(res, 'Apuesta no encontrada');
  if (t.forced) return bad(res, 'El admin ya ha resuelto esta apuesta: no se puede quitar');
  if (t.sels.some(x => gbSelStatus(x) !== 'pending' || gbResult(db.calendar.find(m => m.j === x.j)))) return bad(res, 'Ya hay resultado en alguno de esos partidos: no se puede quitar');
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
// Admin: quién vio amarilla en cada partido (para liquidar las apuestas de tarjetas). Lista vacía = no vio amarilla nadie del Garra
app.put('/api/garrabet-admin/yellows/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  const names = gbScNames();
  m.yellows = [...new Set((Array.isArray(req.body.yellows) ? req.body.yellows : []).map(n => String(n).toUpperCase()).filter(n => names.includes(n)))];
  await save();
  res.json({ ok: true });
});
// Admin: reabrir goleadores o amarillas de una jornada cerrada por error (las apuestas vuelven a quedar pendientes)
app.delete('/api/garrabet-admin/scorers/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  delete m.scorers;
  await save();
  res.json({ ok: true });
});
app.delete('/api/garrabet-admin/yellows/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  delete m.yellows;
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

// ---- PORRA GARRA: porra de partidos + porra final de temporada ----
// Usa EXACTAMENTE los mismos nombres/usuarios que GarraBet (db.garrabet.users, un nombre por dispositivo). No hay registros ni contraseñas nuevas.
// Todo se guarda en db.porra (mismo almacenamiento que el resto: Upstash o disco). El resultado real es el mismo del Calendario (m.result, «3-1»).
const PR_EXACT = 5, PR_SIGN = 3, PR_MAX_GOALS = 30; // puntos por resultado exacto / por acertar ganador o empate
const PR_TZ = 'Europe/Madrid';
const PR_PLAYER_KEYS = ['scorer', 'assister', 'yellows', 'mvp'];
const PR_LABELS = { scorer: 'Máximo goleador', position: 'Posición final de Garra en liga', conceded: 'Goles que encajará Antonio', assister: 'Máximo asistente', yellows: 'Jugador con más amarillas', mvp: 'MVP de la temporada' };
const PR_KEYS = ['scorer', 'position', 'conceded', 'assister', 'yellows', 'mvp'];
const PR_FINAL_PTS_DEF = { scorer: 10, position: 10, conceded: 10, assister: 10, yellows: 10, mvp: 10 }; // editables desde Admin
const PR_FINAL_TOL = { position: 1, conceded: 3 }; // en estos dos campos, quedarse cerca da la mitad de los puntos
function PR() { // siempre devuelve la estructura completa (también tras importar copias antiguas)
  const p = db.porra && typeof db.porra === 'object' ? db.porra : (db.porra = {});
  if (!Array.isArray(p.preds)) p.preds = [];
  if (!Array.isArray(p.finals)) p.finals = [];
  if (!p.locks || typeof p.locks !== 'object') p.locks = {};
  if (!p.cfg || typeof p.cfg !== 'object') p.cfg = {};
  const c = p.cfg;
  if (typeof c.open !== 'boolean') c.open = true;
  c.pts = { ...PR_FINAL_PTS_DEF, ...(c.pts || {}) };
  if (!c.result || typeof c.result !== 'object') c.result = {};
  if (!Number.isInteger(c.forceJ)) c.forceJ = null;
  return p;
}
const prName = uid => (db.garrabet.users.find(u => u.id === uid) || {}).name || 'SIN NOMBRE';
const prCal = () => db.calendar.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.j - b.j);
const prTeams = () => Math.max(2, new Set(db.calendar.map(m => norm(m.rival))).size + 1); // rivales distintos + Garra
const prGoals = v => { if (v === '' || v == null || (typeof v !== 'number' && typeof v !== 'string')) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= PR_MAX_GOALS ? n : null; };
const prAdj = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && Math.abs(n) <= 1000 ? Math.round(n * 100) / 100 : undefined; };

// Hora (Madrid) -> instante. El servidor puede estar en otra zona horaria (Render usa UTC)
function prMadridEpoch(dateStr, timeStr) {
  const [y, mo, d] = String(dateStr).split('-').map(Number), [h, mi] = String(timeStr || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = t => { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: PR_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).forEach(p => { o[p.type] = p.value; }); return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - t; };
  return guess - off(guess - off(guess));
}
const prMadridDate = t => new Intl.DateTimeFormat('en-CA', { timeZone: PR_TZ }).format(new Date(t));
// Hora de inicio: la del Calendario; si no hay, la de «Próximo partido» (si es ese mismo día); si tampoco, el inicio del día del partido
function prKick(m) {
  if (m.time && /^\d\d:\d\d$/.test(m.time)) return { t: prMadridEpoch(m.date, m.time), known: true };
  const n = db.next, t = n && n.date ? new Date(n.date).getTime() : NaN;
  if (Number.isFinite(t) && prMadridDate(t) === m.date) return { t, known: true };
  return { t: prMadridEpoch(m.date, '00:00'), known: false };
}
// Partido activo = el primero del calendario que todavía no tiene resultado (o el que fije el admin)
function prActive() {
  const c = PR().cfg, cal = prCal();
  if (c.forceJ != null) { const m = cal.find(x => x.j === c.forceJ); if (m) return m; }
  return cal.find(m => !gbResult(m)) || null;
}
function prClosed(m) {
  if (gbResult(m)) return true;
  const L = PR().locks[m.j];
  if (L === 'closed') return true;
  if (L === 'open') return false;
  return Date.now() >= prKick(m).t;
}
const prSign = (a, b) => Math.sign(a - b);
const prCalc = (p, r) => !r ? null : p.gf === r.gf && p.gc === r.gc ? PR_EXACT : prSign(p.gf, p.gc) === prSign(r.gf, r.gc) ? PR_SIGN : 0;
const prPoints = (p, m) => Number.isFinite(p.adj) ? p.adj : prCalc(p, gbResult(m)); // null = pendiente de resultado

// Porra final: resultados reales guardados por el admin (jugadores: lista por si hay empate; position/conceded: número)
function prRes() {
  const R = PR().cfg.result, o = {};
  for (const k of PR_PLAYER_KEYS) o[k] = Array.isArray(R[k]) ? R[k].filter(x => typeof x === 'string' && x) : [];
  for (const k of ['position', 'conceded']) o[k] = Number.isInteger(R[k]) ? R[k] : null;
  return o;
}
function prFinalOut(f) {
  const R = prRes(), pts = {}, vals = {}, P = PR().cfg.pts;
  let sum = 0, any = false;
  for (const k of PR_KEYS) {
    vals[k] = f[k] == null ? null : f[k];
    const set = PR_PLAYER_KEYS.includes(k) ? R[k].length > 0 : R[k] !== null;
    if (!set) { pts[k] = null; continue; }
    any = true;
    let g = 0;
    if (vals[k] !== null) {
      if (PR_PLAYER_KEYS.includes(k)) g = R[k].some(n => norm(n) === norm(vals[k])) ? P[k] : 0;
      else { const d = Math.abs(vals[k] - R[k]); g = d === 0 ? P[k] : d <= PR_FINAL_TOL[k] ? Math.floor(P[k] / 2) : 0; }
    }
    pts[k] = g; sum += g;
  }
  const adj = Number.isFinite(f.adj) ? f.adj : null;
  return { id: f.id, uid: f.uid, name: prName(f.uid), values: vals, pts, adj, total: adj !== null ? adj : (any ? sum : null), at: f.at };
}
function prTotals() { // puntos de cada persona: partidos + final
  const P = PR(), by = {};
  const get = uid => by[uid] || (by[uid] = { uid, name: prName(uid), match: 0, final: 0, exact: 0, sign: 0, played: 0 });
  for (const p of P.preds) {
    const m = db.calendar.find(x => x.j === p.j); if (!m) continue;
    const u = get(p.uid), pt = prPoints(p, m);
    u.played++;
    if (pt !== null) { u.match += pt; const c = prCalc(p, gbResult(m)); if (c === PR_EXACT) u.exact++; else if (c === PR_SIGN) u.sign++; }
  }
  for (const f of P.finals) { const t = prFinalOut(f).total; get(f.uid).final += t || 0; }
  for (const gu of db.garrabet.users) get(gu.id); // todos los que tienen nombre (de GarraBet o de la porra) salen también en la clasificación de la porra, con 0 si aún no han jugado
  return Object.values(by).map(u => ({ ...u, total: Math.round((u.match + u.final) * 100) / 100 })).sort((a, b) => b.total - a.total || b.exact - a.exact || a.name.localeCompare(b.name));
}
function prFinalFields(b) { // valida los 6 campos de la porra final. Vacío = sin predicción en ese campo
  const names = gbScNames(), v = {};
  for (const k of PR_PLAYER_KEYS) {
    const s = String(b[k] == null ? '' : b[k]).trim();
    if (!s) { v[k] = null; continue; }
    const n = names.find(x => norm(x) === norm(s));
    if (!n) return { error: 'Jugador no válido en «' + PR_LABELS[k] + '»' };
    v[k] = n;
  }
  const num = (k, lo, hi) => {
    if (b[k] === '' || b[k] == null) { v[k] = null; return null; }
    const n = Number(b[k]);
    if (typeof b[k] === 'boolean' || !Number.isInteger(n) || n < lo || n > hi) return 'Número no válido en «' + PR_LABELS[k] + '» (de ' + lo + ' a ' + hi + ')';
    v[k] = n; return null;
  };
  const e = num('position', 1, prTeams()) || num('conceded', 0, 999);
  if (e) return { error: e };
  if (PR_KEYS.every(k => v[k] === null)) return { error: 'Rellena al menos una predicción' };
  return { v };
}
const prNow = () => new Date().toISOString();
function prUpsertPred(j, uid, gf, gc) {
  const P = PR(), cur = P.preds.find(p => p.j === j && p.uid === uid);
  if (cur) { cur.gf = gf; cur.gc = gc; cur.upd = prNow(); return cur; }
  const p = { id: db.nextId++, j, uid, gf, gc, at: prNow() };
  P.preds.push(p);
  return p;
}

// ---- Público ----
app.get('/api/porra', (req, res) => {
  const d = String(req.query.d || '').slice(0, 80), me = d && gbUser(d), P = PR(), act = prActive(), cal = prCal();
  const out = { me: me ? me.name : null, exact: PR_EXACT, sign: PR_SIGN, teams: prTeams(), squad: gbScNames(), labels: PR_LABELS, keys: PR_KEYS, now: Date.now() };
  out.active = null; out.mine = null; out.who = []; out.revealed = [];
  if (act) {
    const closed = prClosed(act), k = prKick(act), preds = P.preds.filter(p => p.j === act.j), mine = me && preds.find(p => p.uid === me.id);
    out.active = { j: act.j, date: act.date, time: act.time || '', rival: act.rival, field: act.field || '', kick: new Date(k.t).toISOString(), kickKnown: k.known, closed, lock: P.locks[act.j] || 'auto', hasResult: !!gbResult(act) };
    out.mine = mine ? { gf: mine.gf, gc: mine.gc } : null;
    out.who = preds.map(p => prName(p.uid)).sort((a, b) => a.localeCompare(b));
    if (closed) out.revealed = preds.map(p => ({ name: prName(p.uid), gf: p.gf, gc: p.gc, me: !!me && p.uid === me.id })).sort((a, b) => a.name.localeCompare(b.name));
  }
  out.history = cal.filter(m => gbResult(m)).reverse().map(m => ({
    j: m.j, date: m.date, rival: m.rival, result: gbResult(m),
    preds: P.preds.filter(p => p.j === m.j).map(p => ({ name: prName(p.uid), gf: p.gf, gc: p.gc, pts: prPoints(p, m), me: !!me && p.uid === me.id })).sort((a, b) => (b.pts || 0) - (a.pts || 0) || a.name.localeCompare(b.name))
  }));
  out.mineAll = me ? P.preds.filter(p => p.uid === me.id).map(p => { const m = db.calendar.find(x => x.j === p.j); return m ? { j: m.j, date: m.date, rival: m.rival, gf: p.gf, gc: p.gc, result: gbResult(m), pts: prPoints(p, m) } : null; }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || b.j - a.j) : [];
  out.ranking = prTotals().map(u => ({ ...u, uid: undefined, me: !!me && u.uid === me.id }));
  const myF = me && P.finals.find(f => f.uid === me.id);
  out.final = { open: P.cfg.open, pts: P.cfg.pts, tol: PR_FINAL_TOL, result: prRes(), mine: myF ? prFinalOut(myF) : null, all: P.cfg.open ? [] : P.finals.map(prFinalOut).sort((a, b) => a.name.localeCompare(b.name)), count: P.finals.length };
  res.json(out);
});
// Una predicción por persona y partido; se puede cambiar hasta que empiece (o el admin cierre la porra)
app.post('/api/porra/pred', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80), user = device.length >= 8 && gbUser(device);
  if (!user) return bad(res, 'Pon tu nombre para jugar (arriba, en «Pon tu nombre para jugar»)');
  const act = prActive();
  if (!act) return bad(res, 'No hay ningún partido pendiente en el calendario');
  if (req.body.j != null && +req.body.j !== act.j) return bad(res, 'Ese partido ya no es el activo. Recarga la página');
  if (prClosed(act)) return bad(res, 'La porra de este partido ya está cerrada');
  const gf = prGoals(req.body.gf), gc = prGoals(req.body.gc);
  if (gf === null || gc === null) return bad(res, 'Pon los goles de los dos equipos (de 0 a ' + PR_MAX_GOALS + ')');
  const had = PR().preds.some(p => p.j === act.j && p.uid === user.id);
  prUpsertPred(act.j, user.id, gf, gc);
  await save();
  res.json({ ok: true });
  notifyAdmin('🦁 Porra de partido', user.name + (had ? ' ha cambiado' : ' ha hecho') + ' su porra de la J' + act.j + ' vs ' + act.rival + ': ' + gf + '-' + gc, 'adm-porra-' + act.j + '-' + user.id);
});
app.post('/api/porra/final', async (req, res) => {
  const device = String(req.body.device || '').slice(0, 80), user = device.length >= 8 && gbUser(device), P = PR();
  if (!user) return bad(res, 'Pon tu nombre para jugar (arriba, en «Pon tu nombre para jugar»)');
  if (!P.cfg.open) return bad(res, 'La porra final ya está cerrada');
  const r = prFinalFields(req.body || {});
  if (r.error) return bad(res, r.error);
  const cur = P.finals.find(f => f.uid === user.id);
  if (cur) Object.assign(cur, r.v, { upd: prNow() }); else P.finals.push({ id: db.nextId++, uid: user.id, ...r.v, at: prNow() });
  await save();
  res.json({ ok: true });
  notifyAdmin('🏆 Porra final', user.name + (cur ? ' ha cambiado' : ' ha hecho') + ' su porra final de temporada', 'adm-final-' + user.id);
});

// ---- Admin ----
app.get('/api/porra-admin/all', admin, (_, res) => {
  const P = PR(), act = prActive();
  res.json({
    users: db.garrabet.users.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    activeJ: act ? act.j : null, forceJ: P.cfg.forceJ, squad: gbScNames(), teams: prTeams(), labels: PR_LABELS, keys: PR_KEYS,
    matches: prCal().map(m => ({
      j: m.j, date: m.date, time: m.time || '', rival: m.rival, result: gbResult(m), closed: prClosed(m), lock: P.locks[m.j] || 'auto', kickKnown: prKick(m).known,
      preds: P.preds.filter(p => p.j === m.j).map(p => ({ id: p.id, uid: p.uid, name: prName(p.uid), gf: p.gf, gc: p.gc, calc: prCalc(p, gbResult(m)), adj: Number.isFinite(p.adj) ? p.adj : null, pts: prPoints(p, m), at: p.at }))
    })),
    cfg: { open: P.cfg.open, pts: P.cfg.pts, result: prRes(), tol: PR_FINAL_TOL },
    finals: P.finals.map(prFinalOut),
    ranking: prTotals().map(u => ({ ...u }))
  });
});
// Resultado real: se guarda en el Calendario (el mismo que usa GarraBet), así todo se calcula solo y a la vez
app.put('/api/porra-admin/result/:j', admin, async (req, res) => {
  const m = db.calendar.find(x => x.j === +req.params.j);
  if (!m) return bad(res, 'Jornada no encontrada');
  if (req.body.clear || (req.body.gf === '' && req.body.gc === '')) m.result = '';
  else {
    const gf = prGoals(req.body.gf), gc = prGoals(req.body.gc);
    if (gf === null || gc === null) return bad(res, 'Pon los goles de los dos equipos (de 0 a ' + PR_MAX_GOALS + ')');
    m.result = gf + '-' + gc;
  }
  await save();
  res.json({ ok: true });
});
app.put('/api/porra-admin/pred', admin, async (req, res) => { // crear o corregir la predicción de una persona (también con el partido cerrado)
  const j = +req.body.j, uid = +req.body.uid, m = db.calendar.find(x => x.j === j);
  if (!m) return bad(res, 'Jornada no encontrada');
  if (!db.garrabet.users.some(u => u.id === uid)) return bad(res, 'Persona no encontrada');
  const gf = prGoals(req.body.gf), gc = prGoals(req.body.gc);
  if (gf === null || gc === null) return bad(res, 'Pon los goles de los dos equipos (de 0 a ' + PR_MAX_GOALS + ')');
  prUpsertPred(j, uid, gf, gc);
  await save();
  res.json({ ok: true });
});
app.delete('/api/porra-admin/pred/:id', admin, async (req, res) => {
  const P = PR(), n = P.preds.length;
  P.preds = P.preds.filter(p => p.id !== +req.params.id);
  if (P.preds.length === n) return bad(res, 'Predicción no encontrada');
  await save();
  res.json({ ok: true });
});
app.post('/api/porra-admin/pred/:id/points', admin, async (req, res) => { // corregir a mano los puntos de una predicción (vacío = volver al cálculo automático)
  const p = PR().preds.find(x => x.id === +req.params.id), v = prAdj(req.body.pts);
  if (!p) return bad(res, 'Predicción no encontrada');
  if (v === undefined) return bad(res, 'Puntos no válidos');
  if (v === null) delete p.adj; else p.adj = v;
  await save();
  res.json({ ok: true });
});
app.post('/api/porra-admin/recalc', admin, async (req, res) => { // quita las correcciones manuales: vuelve el cálculo automático (5 / 3 / 0)
  const P = PR(), j = req.body && req.body.j != null && req.body.j !== '' ? +req.body.j : null;
  snapshot('antes-de-recalcular-porra');
  for (const p of P.preds) if (j === null || p.j === j) delete p.adj;
  if (j === null && req.body.final) for (const f of P.finals) delete f.adj;
  await save();
  res.json({ ok: true });
});
app.put('/api/porra-admin/lock/:j', admin, async (req, res) => { // auto = se cierra solo al empezar; open/closed = forzar
  const j = +req.params.j, mode = String(req.body.mode || '');
  if (!db.calendar.some(m => m.j === j)) return bad(res, 'Jornada no encontrada');
  if (!['auto', 'open', 'closed'].includes(mode)) return bad(res, 'Opción no válida');
  const L = PR().locks;
  if (mode === 'auto') delete L[j]; else L[j] = mode;
  await save();
  res.json({ ok: true });
});
app.put('/api/porra-admin/active', admin, async (req, res) => { // null = automático (el siguiente sin resultado)
  const c = PR().cfg, j = req.body.j === null || req.body.j === '' || req.body.j === undefined ? null : +req.body.j;
  if (j !== null && !db.calendar.some(m => m.j === j)) return bad(res, 'Jornada no encontrada');
  c.forceJ = j;
  await save();
  res.json({ ok: true });
});
app.put('/api/porra-admin/final-cfg', admin, async (req, res) => { // abrir/cerrar la porra final, puntos por acierto y resultados reales
  const c = PR().cfg, b = req.body || {};
  if (typeof b.open === 'boolean') c.open = b.open;
  if (b.pts) for (const k of PR_KEYS) if (b.pts[k] !== undefined) { const v = Number(String(b.pts[k]).replace(',', '.')); if (!Number.isFinite(v) || v < 0 || v > 1000) return bad(res, 'Puntos no válidos en «' + PR_LABELS[k] + '»'); c.pts[k] = Math.round(v * 100) / 100; }
  if (b.result) {
    const names = gbScNames(), out = {};
    for (const k of PR_PLAYER_KEYS) {
      const arr = Array.isArray(b.result[k]) ? b.result[k] : [];
      out[k] = [...new Set(arr.map(x => names.find(n => norm(n) === norm(x))).filter(Boolean))];
    }
    for (const k of ['position', 'conceded']) {
      const v = b.result[k];
      if (v === '' || v == null) out[k] = null;
      else { const n = Number(v); if (typeof v === 'boolean' || !Number.isInteger(n) || n < (k === 'position' ? 1 : 0) || n > (k === 'position' ? prTeams() : 999)) return bad(res, 'Resultado no válido en «' + PR_LABELS[k] + '»'); out[k] = n; }
    }
    c.result = out;
  }
  await save();
  res.json({ ok: true });
});
app.put('/api/porra-admin/final', admin, async (req, res) => { // crear o corregir la porra final de una persona (aunque esté cerrada)
  const P = PR(), uid = +req.body.uid;
  if (!db.garrabet.users.some(u => u.id === uid)) return bad(res, 'Persona no encontrada');
  const r = prFinalFields(req.body || {});
  if (r.error) return bad(res, r.error);
  const cur = P.finals.find(f => f.uid === uid);
  if (cur) Object.assign(cur, r.v, { upd: prNow() }); else P.finals.push({ id: db.nextId++, uid, ...r.v, at: prNow() });
  await save();
  res.json({ ok: true });
});
app.delete('/api/porra-admin/final/:id', admin, async (req, res) => {
  const P = PR();
  if (!P.finals.some(f => f.id === +req.params.id)) return bad(res, 'Porra final no encontrada');
  snapshot('antes-de-borrar-porra-final');
  P.finals = P.finals.filter(f => f.id !== +req.params.id);
  await save();
  res.json({ ok: true });
});
app.post('/api/porra-admin/final/:id/points', admin, async (req, res) => {
  const f = PR().finals.find(x => x.id === +req.params.id), v = prAdj(req.body.pts);
  if (!f) return bad(res, 'Porra final no encontrada');
  if (v === undefined) return bad(res, 'Puntos no válidos');
  if (v === null) delete f.adj; else f.adj = v;
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
