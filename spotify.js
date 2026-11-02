// ---- Spotify: playlist compartida de los previos ----
// Todo pasa por el servidor: la gente busca y añade canciones desde la web con su nombre; solo la cuenta propietaria (autorizada UNA vez por OAuth
// desde Admin) habla con Spotify. Las credenciales salen únicamente de variables de entorno y los tokens se guardan cifrados (AES-256-GCM) en el
// mismo almacenamiento que el resto (Upstash o disco), nunca salen del servidor ni en /api/state ni en la copia de seguridad.
//
// Variables de entorno: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI (la misma que en el panel de Spotify for Developers y
// terminada en la ruta del callback, p. ej. https://TU-WEB/api/spotify/callback). Opcionales: SPOTIFY_PLAYLIST_ID, SPOTIFY_MARKET.
// Endpoints según la revisión de febrero de 2026 de la Web API: /playlists/{id}/items (con respaldo a /tracks) y búsqueda de máximo 10 resultados.
const crypto = require('crypto');

const ACCOUNTS = 'https://accounts.spotify.com', API = 'https://api.spotify.com/v1';
const SCOPES = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
const DEFAULT_PLAYLIST = '7CycHt1RVObZ5901z2N0Vi'; // https://open.spotify.com/playlist/7CycHt1RVObZ5901z2N0Vi
const ID22 = /^[A-Za-z0-9]{22}$/;
const ADDS_PER_HOUR = 10, SEARCH_PER_MIN = 30, CACHE_MS = 20000, MAX_LOG = 3000;

const env = () => ({ id: (process.env.SPOTIFY_CLIENT_ID || '').trim(), secret: (process.env.SPOTIFY_CLIENT_SECRET || '').trim(), redirect: (process.env.SPOTIFY_REDIRECT_URI || '').trim() });
const missing = () => { const e = env(); return [['SPOTIFY_CLIENT_ID', e.id], ['SPOTIFY_CLIENT_SECRET', e.secret], ['SPOTIFY_REDIRECT_URI', e.redirect]].filter(x => !x[1]).map(x => x[0]); };
const playlistId = () => { const raw = String(process.env.SPOTIFY_PLAYLIST_ID || DEFAULT_PLAYLIST).trim(), m = /playlist[/:]([A-Za-z0-9]{22})/.exec(raw); return m ? m[1] : raw; };
const spErr = (msg, status) => Object.assign(new Error(msg), { status });

// ---- Cifrado de los tokens guardados (la clave sale del SPOTIFY_CLIENT_SECRET: sin él, lo guardado no sirve de nada) ----
const keyOf = tag => crypto.createHash('sha256').update('garra-spotify-' + tag + '|' + env().secret).digest();
function seal(txt) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf('v1'), iv);
  const ct = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function unseal(s) {
  try {
    if (typeof s !== 'string' || !s.startsWith('v1.')) return '';
    const b = Buffer.from(s.slice(3), 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', keyOf('v1'), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

// ---- «state» del OAuth: firmado y con caducidad (10 min), de un solo uso. Solo lo emite el admin al pulsar «Conectar» ----
const usedStates = new Map();
function makeState() {
  const nonce = crypto.randomBytes(18).toString('hex'), exp = Date.now() + 10 * 60 * 1000;
  const sig = crypto.createHmac('sha256', keyOf('state')).update(nonce + '.' + exp).digest('hex');
  return nonce + '.' + exp + '.' + sig;
}
function checkState(st) {
  const p = String(st || '').split('.');
  if (p.length !== 3 || !/^[0-9a-f]{36}$/.test(p[0]) || !/^\d+$/.test(p[1]) || !/^[0-9a-f]{64}$/.test(p[2])) return false;
  const want = crypto.createHmac('sha256', keyOf('state')).update(p[0] + '.' + p[1]).digest();
  if (!crypto.timingSafeEqual(want, Buffer.from(p[2], 'hex')) || Date.now() > +p[1] || usedStates.has(p[0])) return false;
  const now = Date.now();
  for (const [k, e] of usedStates) if (e < now) usedStates.delete(k);
  usedStates.set(p[0], +p[1]);
  return true;
}

// ---- HTTP con tiempo máximo ----
async function http(url, opt = {}, ms = 15000) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal });
    const txt = await r.text();
    let body = {};
    try { body = txt ? JSON.parse(txt) : {}; } catch { body = { raw: txt.slice(0, 200) }; }
    return { ok: r.ok, status: r.status, body, retry: Number(r.headers.get('retry-after')) || 0 };
  } catch (e) {
    throw spErr(e.name === 'AbortError' ? 'Spotify tarda demasiado en responder. Prueba en un momento' : 'No se pudo conectar con Spotify. Prueba en un momento', 502);
  } finally { clearTimeout(to); }
}
async function tokenCall(params) {
  const e = env();
  return http(ACCOUNTS + '/api/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(e.id + ':' + e.secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
}
function apiMsg(r) {
  const m = r.body && r.body.error && (r.body.error.message || r.body.error);
  const why = r.status === 403 ? 'Spotify rechaza la operación (403): la cuenta conectada tiene que ser propietaria o colaboradora de la playlist y la app tiene que seguir activa (en modo desarrollo el dueño necesita Premium)' : r.status === 404 ? 'Spotify no encuentra eso (404)' : r.status === 400 ? 'Spotify no acepta la petición (400)' : 'Spotify ha respondido con un error (' + r.status + ')';
  return why + (typeof m === 'string' && m && r.status !== 403 ? ': ' + m : '');
}

module.exports = {
  // la copia exportable nunca lleva tokens; al importar se conservan los tokens actuales y se toma el registro de «quién añadió qué» del archivo
  exportSafe: s => ({ adds: (s && Array.isArray(s.adds) ? s.adds : []) }),
  mergeImport: (incoming, current) => ({
    adds: incoming && Array.isArray(incoming.adds) ? incoming.adds : (current && Array.isArray(current.adds) ? current.adds : []),
    ...(current && current.auth ? { auth: current.auth } : {}), ...(current && current.err ? { err: current.err } : {})
  }),
  seal, unseal, makeState, checkState, playlistId,

  mount({ app, db: getDb, save, admin, bad, gbUser }) {
    const SP = () => { const d = getDb(); if (!d.spotify || typeof d.spotify !== 'object') d.spotify = {}; if (!Array.isArray(d.spotify.adds)) d.spotify.adds = []; return d.spotify; };
    const wrap = fn => async (req, res) => {
      try { await fn(req, res); } catch (e) {
        const st = e.status >= 400 && e.status < 600 ? e.status : 500;
        if (!e.status) console.error('Spotify: ' + e.message);
        if (!res.headersSent) res.status(st === 401 ? 502 : st).json({ error: e.status ? e.message : 'Error interno con Spotify' });
      }
    };

    // ---- Tokens: se renuevan solos un minuto antes de caducar; si Spotify revoca la autorización se desconecta y se avisa al admin ----
    let refreshing = null;
    async function dropAuth(msg) { const s = SP(); delete s.auth; s.err = { at: new Date().toISOString(), msg }; await save(); }
    async function refresh() {
      const s = SP(), a = s.auth, rt = a && unseal(a.refresh);
      if (!rt) { const m = 'No se pueden leer los tokens guardados (¿ha cambiado SPOTIFY_CLIENT_SECRET?). Vuelve a conectar Spotify desde Admin'; await dropAuth(m); throw spErr(m, 503); }
      const r = await tokenCall({ grant_type: 'refresh_token', refresh_token: rt });
      if (!r.ok) {
        if (r.status === 400 && r.body && r.body.error === 'invalid_grant') { const m = 'Spotify ha revocado o caducado la autorización. El admin tiene que volver a conectar la cuenta en Admin → Más → Spotify'; await dropAuth(m); throw spErr(m, 503); }
        throw spErr('Spotify no ha renovado el acceso (' + r.status + '). Prueba en un momento', 502);
      }
      const b = r.body;
      if (!b.access_token) throw spErr('Spotify no ha devuelto un acceso válido', 502);
      a.access = seal(b.access_token); a.exp = Date.now() + (Number(b.expires_in) || 3600) * 1000;
      if (b.refresh_token) a.refresh = seal(b.refresh_token); // Spotify puede rotarlo: si llega uno nuevo, sustituye al anterior
      if (b.scope) a.scope = b.scope;
      delete s.err;
      await save();
      return b.access_token;
    }
    async function accessToken(force) {
      const a = SP().auth;
      if (!a) throw spErr('La playlist todavía no está conectada a Spotify. El admin tiene que conectarla en Admin → Más → Spotify', 503);
      if (!force && a.access && a.exp - Date.now() > 60000) { const t = unseal(a.access); if (t) return t; }
      if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
      return refreshing;
    }
    async function sp(method, path, o = {}) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const tok = await accessToken(attempt > 0);
        const r = await http(API + path + (o.query ? '?' + new URLSearchParams(o.query) : ''), { method, headers: { Authorization: 'Bearer ' + tok, ...(o.body ? { 'Content-Type': 'application/json' } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
        if (r.status === 401 && attempt === 0) continue; // el acceso había caducado antes de tiempo: se renueva y se repite una vez
        if (r.status === 429) throw spErr('Spotify pide esperar' + (r.retry ? ' ' + Math.min(r.retry, 120) + ' s' : ' un momento') + ' antes de volver a probar', 429);
        if (!r.ok) throw spErr(apiMsg(r), r.status);
        return r.body;
      }
      throw spErr('Spotify no acepta el acceso. El admin tiene que volver a conectar la cuenta', 502);
    }

    // ---- Playlist: /items (nuevo) con respaldo a /tracks si Spotify no lo reconoce ----
    let legacy = false;
    async function plCall(method, o = {}) {
      const path = '/playlists/' + playlistId() + (legacy ? '/tracks' : '/items');
      try { return await sp(method, path, o); } catch (e) {
        if (legacy || e.status !== 404) throw e;
        const r = await sp(method, '/playlists/' + playlistId() + '/tracks', o); // si también falla, se devuelve el error original
        legacy = true;
        return r;
      }
    }
    const coverOf = a => { const im = ((a && a.images) || []).slice().sort((x, y) => (x.width || 0) - (y.width || 0)); const p = im.find(i => (i.width || 0) >= 120) || im[im.length - 1]; return p && /^https:\/\//.test(p.url || '') ? p.url : ''; };
    const shape = t => ({ id: t.id, uri: t.uri, title: String(t.name || ''), artists: (t.artists || []).map(a => a.name).filter(Boolean).join(', '), album: String((t.album && t.album.name) || ''), cover: coverOf(t.album), ms: Number(t.duration_ms) || 0, explicit: !!t.explicit });
    async function readTracks() {
      const out = []; let offset = 0;
      for (let i = 0; i < 40; i++) {
        const b = await plCall('GET', { query: { limit: 50, offset } });
        const items = Array.isArray(b.items) ? b.items : [];
        for (const it of items) { const t = it && (it.item || it.track); if (t && t.id && !t.is_local && (!t.type || t.type === 'track')) out.push({ ...shape(t), addedAt: it.added_at || '' }); }
        offset += items.length;
        if (!items.length || offset >= (Number(b.total) || 0)) break;
      }
      return out;
    }
    let cache = null, inflight = null;
    async function playlist(force) {
      if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
      if (!force && inflight) return inflight;
      const run = (async () => {
        const [meta, tracks] = await Promise.all([sp('GET', '/playlists/' + playlistId(), { query: { fields: 'id,name,images,external_urls,owner(id,display_name),collaborative' } }), readTracks()]);
        const data = { id: playlistId(), name: String(meta.name || 'Playlist de los garros'), url: (meta.external_urls && meta.external_urls.spotify) || 'https://open.spotify.com/playlist/' + playlistId(), image: coverOf(meta), owner: (meta.owner && (meta.owner.display_name || meta.owner.id)) || '', ownerId: (meta.owner && meta.owner.id) || '', collaborative: !!meta.collaborative, tracks };
        cache = { at: Date.now(), data };
        return data;
      })();
      if (!force) { inflight = run.finally(() => { inflight = null; }); return inflight; }
      return run;
    }
    let lock = Promise.resolve();
    const exclusive = fn => { const run = lock.then(fn); lock = run.catch(() => {}); return run; };

    // ---- Quién ha añadido cada canción: registro propio (Spotify solo sabe que la añadió la cuenta propietaria) ----
    const nameOf = a => { const u = (getDb().garrabet.users || []).find(x => x.id === a.uid); return (u && u.name) || a.name || ''; };
    function withAuthors(data) {
      const last = new Map();
      for (const a of SP().adds) last.set(a.id, a);
      return data.tracks.map(t => { const a = last.get(t.id); return { ...t, by: a ? nameOf(a) : '', at: a ? a.at : t.addedAt }; });
    }
    const hits = new Map();
    const limited = (key, max, ms) => { const now = Date.now(), l = (hits.get(key) || []).filter(t => now - t < ms); if (l.length >= max) { hits.set(key, l); return true; } l.push(now); hits.set(key, l); if (hits.size > 5000) hits.clear(); return false; };
    const who = (req, body) => {
      const device = String((body ? req.body && req.body.device : req.query.d) || '').slice(0, 80), u = device.length >= 8 ? gbUser(device) : null;
      if (!u) throw spErr('Pon tu nombre para usar la playlist (es el mismo que en GarraBet)', 400);
      return { device, user: u };
    };

    // ---- Público ----
    app.get('/api/spotify/playlist', wrap(async (req, res) => {
      const d = String(req.query.d || '').slice(0, 80), me = d.length >= 8 ? gbUser(d) : null, ez = !me && d.length >= 8 ? ((getDb().ez || []).find(e => e.device === d) || {}).name : '';
      const base = { me: me ? me.name : null, suggest: ez ? String(ez).slice(0, 20) : '', addsPerHour: ADDS_PER_HOUR };
      const m = missing();
      if (m.length) return res.json({ ...base, connected: false, message: 'La playlist todavía no está configurada en el servidor.' });
      if (!SP().auth) return res.json({ ...base, connected: false, message: 'El admin todavía no ha conectado la cuenta de Spotify. En cuanto lo haga, aquí podréis buscar y añadir canciones.' });
      try {
        const p = await playlist(false), tr = withAuthors(p);
        res.json({ ...base, connected: true, playlist: { name: p.name, url: p.url, image: p.image, owner: p.owner, count: tr.length, totalMs: tr.reduce((a, t) => a + t.ms, 0) }, tracks: tr });
      } catch (e) {
        if (!SP().auth) return res.json({ ...base, connected: false, message: 'La conexión con Spotify ha caducado. El admin tiene que volver a conectarla.' });
        res.json({ ...base, connected: true, error: e.message, tracks: [] });
      }
    }));
    app.get('/api/spotify/search', wrap(async (req, res) => {
      const { device } = who(req, false);
      if (limited('s:' + device, SEARCH_PER_MIN, 60000)) throw spErr('Demasiadas búsquedas seguidas. Espera unos segundos', 429);
      const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (q.length < 2) throw spErr('Escribe al menos 2 letras', 400);
      const offset = Math.min(40, Math.max(0, Math.floor(Number(req.query.offset) / 10) * 10 || 0));
      const link = /(?:open\.spotify\.com\/(?:intl-[a-z]{2,5}\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(q);
      let tracks, more = false;
      if (link) { const t = await sp('GET', '/tracks/' + link[1]); tracks = t && t.id ? [shape(t)] : []; } // enlace de Spotify pegado en el buscador
      else {
        const b = await sp('GET', '/search', { query: { q, type: 'track', limit: 10, offset } });
        const items = ((b.tracks && b.tracks.items) || []).filter(t => t && t.id && t.is_playable !== false);
        tracks = items.map(shape);
        more = !!(b.tracks && b.tracks.next) && offset < 40;
      }
      res.json({ tracks, more });
    }));
    app.post('/api/spotify/add', wrap(async (req, res) => {
      const { user } = who(req, true);
      if (user.disabled) throw spErr('Tu nombre está desactivado por el admin: no puedes añadir canciones', 400);
      const uri = String(req.body.uri || '').trim(), m = /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri);
      if (!m) throw spErr('Canción no válida', 400);
      const since = Date.now() - 3600 * 1000;
      if (SP().adds.filter(a => a.uid === user.id && Date.parse(a.at) > since).length >= ADDS_PER_HOUR) throw spErr('Has añadido ' + ADDS_PER_HOUR + ' canciones en la última hora. Deja algo para los demás y vuelve más tarde 😉', 429);
      const track = await exclusive(async () => {
        const t = shape(await sp('GET', '/tracks/' + m[1]));
        if (!t.id) throw spErr('Spotify no encuentra esa canción', 404);
        const p = await playlist(true);
        if (p.tracks.some(x => x.id === t.id)) throw spErr('«' + t.title + '» ya está en la playlist', 409);
        await plCall('POST', { body: { uris: [t.uri] } });
        const s = SP();
        s.adds.push({ id: t.id, uid: user.id, name: user.name, at: new Date().toISOString() });
        if (s.adds.length > MAX_LOG) s.adds = s.adds.slice(-MAX_LOG);
        cache = null;
        await save();
        return t;
      });
      res.json({ ok: true, track });
    }));

    // ---- Admin ----
    const redirectWarn = () => { try { const u = new URL(env().redirect); return u.protocol === 'https:' || ['127.0.0.1', '[::1]'].includes(u.hostname) ? '' : 'Spotify solo acepta redirect URIs https (o http://127.0.0.1 para pruebas)'; } catch { return 'SPOTIFY_REDIRECT_URI no es una URL válida'; } };
    app.get('/api/spotify/admin', admin, wrap(async (req, res) => {
      const s = SP(), a = s.auth, m = missing();
      res.json({ configured: !m.length, missing: m, redirectUri: env().redirect, redirectWarning: m.includes('SPOTIFY_REDIRECT_URI') ? '' : redirectWarn(), playlistId: playlistId(), connected: !!a, account: a ? { id: a.userId, name: a.userName } : null, since: a ? a.at : null, scope: a ? a.scope : '', error: s.err || null, adds: s.adds.length });
    }));
    app.post('/api/spotify/admin/connect', admin, wrap(async (req, res) => {
      const m = missing();
      if (m.length) throw spErr('Faltan variables de entorno en el servidor: ' + m.join(', '), 400);
      const w = redirectWarn(); if (w) throw spErr(w, 400);
      const e = env();
      res.json({ url: ACCOUNTS + '/authorize?' + new URLSearchParams({ response_type: 'code', client_id: e.id, scope: SCOPES, redirect_uri: e.redirect, state: makeState(), show_dialog: 'true' }).toString() });
    }));
    app.post('/api/spotify/admin/disconnect', admin, wrap(async (req, res) => {
      const s = SP(); delete s.auth; delete s.err; cache = null; await save();
      res.json({ ok: true });
    }));
    app.post('/api/spotify/admin/test', admin, wrap(async (req, res) => {
      const me = await sp('GET', '/me'), p = await playlist(true), a = SP().auth;
      res.json({ ok: true, account: me.display_name || me.id, playlist: p.name, owner: p.owner, tracks: p.tracks.length, canEdit: p.ownerId === me.id || p.collaborative, expiresIn: Math.max(0, Math.round((a.exp - Date.now()) / 1000)) });
    }));
    app.delete('/api/spotify/admin/track', admin, wrap(async (req, res) => {
      const uri = String((req.body && req.body.uri) || '').trim();
      if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) throw spErr('Canción no válida', 400);
      await exclusive(async () => {
        await plCall('DELETE', { body: legacy ? { tracks: [{ uri }] } : { items: [{ uri }] } });
        const s = SP(); s.adds = s.adds.filter(a => 'spotify:track:' + a.id !== uri);
        cache = null; await save();
      });
      res.json({ ok: true });
    }));

    // ---- Vuelta de Spotify tras autorizar (SPOTIFY_REDIRECT_URI). Solo vale con un «state» emitido por el admin ----
    const page = (res, ok, title, msg) => {
      res.status(ok ? 200 : 400).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      res.send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><body style="font-family:system-ui,sans-serif;background:#0d0b09;color:#f6eedb;max-width:560px;margin:12vh auto;padding:0 20px;line-height:1.5"><h1 style="color:#e2ab2c">' + esc(title) + '</h1><p>' + esc(msg) + '</p><p><a style="color:#e2ab2c;font-weight:700" href="/#admin">Volver a la web</a></p>' + (ok ? '<script>setTimeout(function(){location.href="/#admin"},2500)</script>' : '') + '</body></html>');
    };
    let cbPath = '';
    try { cbPath = new URL(env().redirect).pathname; } catch { /* sin redirect válido no hay callback */ }
    if (cbPath && cbPath !== '/') {
      app.get(cbPath, async (req, res) => {
        try {
          if (req.query.error) return page(res, false, 'Spotify no se ha conectado', 'Se canceló la autorización en Spotify (' + String(req.query.error).slice(0, 60) + '). Pulsa «Conectar» en Admin para repetirlo.');
          if (!checkState(req.query.state)) return page(res, false, 'Enlace caducado', 'Este enlace ya no vale (caduca a los 10 minutos y solo se usa una vez). Vuelve a Admin → Más → Spotify y pulsa «Conectar».');
          const code = String(req.query.code || '');
          if (!code || missing().length) return page(res, false, 'Spotify no se ha conectado', 'Falta el código de autorización o la configuración del servidor.');
          const r = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: env().redirect });
          if (!r.ok || !r.body.access_token || !r.body.refresh_token) return page(res, false, 'Spotify no se ha conectado', 'Spotify no ha aceptado el código (' + (r.body.error_description || r.body.error || r.status) + '). Comprueba que SPOTIFY_REDIRECT_URI es exactamente la misma que en el panel de Spotify for Developers.');
          const scope = String(r.body.scope || '');
          if (!/playlist-modify-(public|private)/.test(scope)) return page(res, false, 'Faltan permisos', 'No se concedió permiso para modificar playlists. Repite la conexión y acepta todos los permisos.');
          const H = { headers: { Authorization: 'Bearer ' + r.body.access_token } };
          const me = await http(API + '/me', H);
          if (!me.ok || !me.body.id) return page(res, false, 'Spotify no se ha conectado', 'No se pudo leer la cuenta de Spotify (' + me.status + ').' + (me.status === 403 ? ' Con la app en modo desarrollo, la cuenta tiene que ser la del dueño de la app o estar añadida en User Management, y el dueño necesita Premium.' : ''));
          const pl = await http(API + '/playlists/' + playlistId() + '?' + new URLSearchParams({ fields: 'id,name,owner(id,display_name),collaborative' }), H);
          if (!pl.ok) return page(res, false, 'No se encuentra la playlist', 'Con la cuenta «' + (me.body.display_name || me.body.id) + '» no se puede abrir la playlist (' + pl.status + '). Entra en Spotify con la cuenta propietaria de la playlist y repite.');
          if (!(pl.body.owner && pl.body.owner.id === me.body.id) && !pl.body.collaborative) return page(res, false, 'Cuenta equivocada', 'La cuenta «' + (me.body.display_name || me.body.id) + '» no es propietaria ni colaboradora de «' + pl.body.name + '» (propietaria: ' + ((pl.body.owner && (pl.body.owner.display_name || pl.body.owner.id)) || '?') + '). Cierra sesión en Spotify, entra con la cuenta correcta y repite.');
          const s = SP();
          s.auth = { access: seal(r.body.access_token), refresh: seal(r.body.refresh_token), exp: Date.now() + (Number(r.body.expires_in) || 3600) * 1000, scope, userId: me.body.id, userName: me.body.display_name || me.body.id, at: new Date().toISOString() };
          delete s.err; cache = null;
          await save();
          page(res, true, '✅ Spotify conectado', 'Cuenta «' + (me.body.display_name || me.body.id) + '» conectada a la playlist «' + pl.body.name + '». Ya se pueden añadir canciones desde la web.');
        } catch (e) {
          console.error('Spotify callback: ' + e.message);
          page(res, false, 'Spotify no se ha conectado', e.status ? e.message : 'Ha ocurrido un error inesperado. Prueba otra vez.');
        }
      });
    } else console.warn('AVISO: sin SPOTIFY_REDIRECT_URI válida no se puede conectar Spotify.');
    const m0 = missing();
    console.log(m0.length ? 'AVISO: Spotify sin configurar (faltan ' + m0.join(', ') + ').' : 'Spotify listo: callback en ' + cbPath + ' · playlist ' + playlistId());
  }
};
