// ---- MLA Sport: descarga y lectura de la clasificación y los resultados de un grupo ----
// Sin dependencias. Solo LEE y devuelve datos limpios; no toca la base de datos (eso lo hace server.js).
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ordm: 'º', ordf: 'ª' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m));
const clean = s => decode(String(s)).replace(/\s+/g, ' ').trim();

// HTML -> filas de celdas. Cada <tr> (o <li>/<div> suelto con texto) es una fila; <td>/<th> son celdas.
function toRows(html) {
  let h = String(html || '').replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<img[^>]*>/gi, ' ');                                   // el nombre del escudo (alt) duplicaría el del equipo
  h = h.replace(/<\/(td|th)\s*>/gi, '\u0001').replace(/<\/(tr|li|p|h[1-6]|div|section|article|table|ul|ol)\s*>|<br\s*\/?>|<(tr|li|h[1-6])[\s>]/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  return decode(h).split('\n').map(l => l.split('\u0001').map(clean).filter(Boolean)).filter(r => r.length);
}

const isInt = s => /^[+-]?\s*\d+$/.test(s);
const toInt = s => parseInt(String(s).replace(/\s+/g, ''), 10);
function cleanName(s) { // «01 Boca FC Boca FC» -> «Boca FC»
  let n = clean(s).replace(/^\d{1,2}[.\s)-]+(?=\D)/, '').trim();
  const w = n.split(' ');
  if (w.length >= 2 && w.length % 2 === 0 && w.slice(0, w.length / 2).join(' ').toLowerCase() === w.slice(w.length / 2).join(' ').toLowerCase()) n = w.slice(0, w.length / 2).join(' ');
  return n;
}

// Clasificación: fila con un nombre y al menos 7 cifras (PTS J G E P GF GC [DG]). El orden de columnas se toma de la cabecera si la hay.
const HEAD = { PTS: 'Pts', PT: 'Pts', P: 'P', J: 'PJ', PJ: 'PJ', G: 'G', E: 'E', GF: 'GF', GC: 'GC', DG: 'DG', DIF: 'DG' };
function parseStandings(rows) {
  let order = null; const out = [];
  for (const r of rows) {
    const up = r.map(c => c.toUpperCase().replace(/\./g, ''));
    if (up.filter(c => HEAD[c]).length >= 6 && up.includes('GF')) { // cabecera: PTS J G E P GF GC DG
      order = []; let seenP = false;
      for (const c of up) { if (c === 'PTS' || c === 'PT') order.push('Pts'); else if (c === 'J' || c === 'PJ') order.push('PJ'); else if (c === 'G') order.push('G'); else if (c === 'E') order.push('E'); else if (c === 'P') { order.push(order.includes('Pts') || seenP ? 'P' : 'Pts'); seenP = true; } else if (c === 'GF') order.push('GF'); else if (c === 'GC') order.push('GC'); else if (c === 'DG' || c === 'DIF') order.push('DG'); }
      continue;
    }
    const want = order ? order.length : 8; // la primera celda suelta puede ser la posición (1, 2, 3...)
    const body = isInt(r[0]) && r.filter(isInt).length === want + 1 ? r.slice(1) : r;
    const nums = [], names = [];
    for (const c of body) (isInt(c) ? nums : names).push(c);
    // «+ 40» y «- 20» pueden llegar como celdas sueltas: se unen
    if (names.length >= 1 && nums.length >= 7 && nums.length <= 12) {
      const name = cleanName(names.find(n => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(n)) || '');
      if (!name) continue;
      const cols = order && order.length === nums.length ? order : ['Pts', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG'].slice(0, nums.length);
      const t = { name }; cols.forEach((k, i) => { t[k] = toInt(nums[i]); });
      if ([t.Pts, t.PJ, t.G, t.E, t.P, t.GF, t.GC].every(Number.isInteger) && t.G + t.E + t.P === t.PJ) { if (!Number.isInteger(t.DG)) t.DG = t.GF - t.GC; out.push(t); }
    }
  }
  const seen = new Set();
  return out.filter(t => !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()));
}

// Resultados: fila «Equipo A | 3 - 1 | Equipo B» (o «A | 3 | - | 1 | B»). Jornada y fecha salen de los títulos / de la propia fila.
const SCORE = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/;
const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const iso = (d, m, y) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
function parseMatches(rows) {
  const out = []; let jr = null;
  for (let r of rows) {
    const joined = r.join(' ');
    const jm = /^jornada\s*(\d{1,2})\b/i.exec(joined) || /^j\s?(\d{1,2})\b(?!.*\d\s*[-–]\s*\d)/i.exec(joined);
    if (jm && r.length <= 3) { jr = +jm[1]; continue; }
    // localiza el marcador
    let k = r.findIndex(c => SCORE.test(c)), ga, gb;
    if (k >= 0) { const m = SCORE.exec(r[k]); ga = +m[1]; gb = +m[2]; }
    else { // 3 celdas seguidas: número, guion, número («A | 2 | - | 2 | B»)
      for (let i = 1; i < r.length - 2; i++) if (/^\d{1,2}$/.test(r[i]) && /^[-–]$/.test(r[i + 1]) && /^\d{1,2}$/.test(r[i + 2])) { ga = +r[i]; gb = +r[i + 2]; r = [...r.slice(0, i), ga + '-' + gb, ...r.slice(i + 3)]; k = i; break; }
    }
    let A, B;
    if (k >= 0) { A = r[k - 1]; B = r[k + 1]; }
    else { // todo en una sola celda: «Equipo A 3 - 1 Equipo B»
      const m = /^(.*?[A-Za-zÁÉÍÓÚÑáéíóúñ.)])\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zÁÉÍÓÚÑ0-9].*)$/.exec(joined);
      if (!m || r.length > 4) continue; A = m[1]; B = m[4]; ga = +m[2]; gb = +m[3];
    }
    if (!A || !B || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(A) || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(B) || ga > 30 || gb > 30) continue;
    const dm = DATE.exec(joined), jf = /\bJ\s?(\d{1,2})\b/.exec(joined);
    A = cleanName(A).replace(/\s*\bJ\s?\d{1,2}\b\s*[-–]?\s*/i, '').trim(); B = cleanName(B).trim();
    A = A.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '').replace(/\b\d{1,2}:\d{2}\b/g, '').replace(/^[\s|,-]+/, '').trim(); B = B.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '').replace(/\b\d{1,2}:\d{2}\b/g, '').trim();
    const sp = /^(?:jornada\s*\d+\s*[-–:]?\s*)/i; A = A.replace(sp, ''); // «J2 - Equipo»
    if (A && B && A.toLowerCase() !== B.toLowerCase()) out.push({ j: jf ? +jf[1] : jr, date: dm ? iso(dm[1], dm[2], dm[3]) : '', a: A, b: B, ga, gb });
  }
  return out;
}


// ---- Respaldo para páginas hechas con <div>/<span> (sin <table>): se lee el texto en orden, sin fiarse de la estructura ----
function toTokens(html) {
  let h = String(html || '').replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<img[^>]*>/gi, ' ');
  return decode(h.replace(/<[^>]+>/g, '\n')).split('\n').map(clean).filter(Boolean);
}
const hasLetters = s => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s) && !/^(POS|EQUIPO|PTS|PJ|G|E|P|GF|GC|DG|J)$/i.test(s);
function standingsFromTokens(tk) { // [posición] nombre + 8 cifras (PTS PJ G E P GF GC DG)
  const out = [];
  for (let i = 0; i < tk.length; i++) {
    if (!hasLetters(tk[i]) || tk[i].length > 45) continue;
    const n = tk.slice(i + 1, i + 9);
    if (n.length < 8 || !n.every(isInt)) continue;
    const [Pts, PJ, G, E, P, GF, GC, DG] = n.map(toInt);
    if (G + E + P !== PJ || Pts !== G * 3 + E || GF - GC !== DG) continue; // coherencia: si no cuadra, no es una fila de clasificación
    out.push({ name: cleanName(tk[i]), Pts, PJ, G, E, P, GF, GC, DG }); i += 8;
  }
  const seen = new Set(); return out.filter(t => !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()));
}
function matchesFromTokens(tk) { // «A» «3 - 1» «B»  /  «A» «3» «-» «1» «B»; la jornada sale del último «Jornada N»
  const out = []; let jr = null, date = '';
  for (let i = 0; i < tk.length; i++) {
    const jm = /^jornada\s*(\d{1,2})\b/i.exec(tk[i]); if (jm) { jr = +jm[1]; date = ''; continue; }
    const dm = DATE.exec(tk[i]); if (dm && tk[i].length < 25) { date = iso(dm[1], dm[2], dm[3]); continue; }
    let sc = SCORE.exec(tk[i]), len = 1;
    if (!sc && /^\d{1,2}$/.test(tk[i]) && /^[-–]$/.test(tk[i + 1] || '') && /^\d{1,2}$/.test(tk[i + 2] || '')) { sc = [0, tk[i], tk[i + 2]]; len = 3; }
    if (!sc) continue;
    const A = tk[i - 1], B = tk[i + len];
    if (!A || !B || !hasLetters(A) || !hasLetters(B) || A.length > 45 || B.length > 45 || +sc[1] > 30 || +sc[2] > 30) continue;
    out.push({ j: jr, date, a: cleanName(A), b: cleanName(B), ga: +sc[1], gb: +sc[2] });
  }
  return out;
}
const parseHtml = html => {
  const rows = toRows(html); let standings = parseStandings(rows), matches = parseMatches(rows);
  if (!standings.length || !matches.length) { const tk = toTokens(html); if (!standings.length) standings = standingsFromTokens(tk); if (!matches.length) matches = matchesFromTokens(tk); }
  return { standings, matches };
};

async function fetchPage(url, timeoutMs = 20000) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': process.env.MLA_UA || 'Mozilla/5.0 (compatible; RealGarraSync/1.0)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'es-ES,es;q=0.9' } });
    if (!r.ok) throw new Error('MLA respondió HTTP ' + r.status);
    const t = await r.text();
    if (t.length < 200) throw new Error('MLA devolvió una página vacía');
    return t;
  } finally { clearTimeout(to); }
}

// Descarga todas las páginas configuradas y junta lo leído. Si alguna falla, lanza error (el llamador conserva los datos anteriores).
async function readGroup(urls) {
  const standings = [], matches = [];
  for (const u of urls) { const p = parseHtml(await fetchPage(u)); standings.push(...p.standings); matches.push(...p.matches); }
  const seen = new Set(), st = standings.filter(t => !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()));
  const ms = new Set(), mt = matches.filter(m => { const k = [m.j || m.date, ...[m.a, m.b].map(x => x.toLowerCase()).sort()].join('|'); return !ms.has(k) && ms.add(k); });
  if (!st.length && !mt.length) throw new Error('No he reconocido clasificación ni resultados en la página de MLA (¿cambió el formato?)');
  return { standings: st, matches: mt };
}

module.exports = { parseHtml, readGroup, fetchPage, toRows, parseStandings, parseMatches };
