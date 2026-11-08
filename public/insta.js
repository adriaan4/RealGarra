// ---- Admin → 📸 Instagram: diseñador manual de Matchday / Resultado / Próximo partido ----
// Todo se dibuja en un <canvas> en el navegador (sin IA, sin servidor). Los datos salen del calendario de la web
// y se pueden cambiar a mano; cada elemento se arrastra con el dedo o el ratón. Se descarga en PNG o se comparte.
(() => {
  'use strict';
  const TZ = 'Europe/Madrid';
  const $ = (s, r = document) => r.querySelector(s);
  const FM = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1080 } };
  const FONT = '"Barlow Condensed",Impact,"Arial Narrow",sans-serif';
  const COL = { win: '#3ecf6e', draw: '#e2ab2c', lose: '#e0474c' };
  const st = { fmt: 'story', tipo: 'matchday', j: '', local: true, bg: 'cesped', dark: 45, frame: true, accent: '#e2ab2c', ink: '#f6eedb',
    league: '3ª B DOMINGO TARDE · GRUPO 1', footer: '#VamosGarra', photo: '', els: [], sel: null };
  let built = false, drag = null, raf = 0, nid = 0;

  const SS = () => (typeof S !== 'undefined' ? S : { calendar: [], next: {}, crests: [] });
  const nrm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const todayMad = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '').toUpperCase() : '';
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // ---- imágenes (con caché) ----
  const cache = new Map();
  const getImg = src => {
    if (!src) return Promise.resolve(null);
    if (!cache.has(src)) cache.set(src, new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
    return cache.get(src);
  };

  // ---- datos del partido elegido ----
  const cal = () => (SS().calendar || []).slice().sort((a, b) => a.j - b.j);
  function crestSrc(rival) {
    const s = SS(), c = (s.crests || []).find(x => nrm(x.name) === nrm(rival));
    if (c) return '/api/crest/' + c.id + '?v=' + c.v;
    const nx = s.next || {};
    return nx.crest && nrm(nx.rival) === nrm(rival) ? nx.crest : '';
  }
  function matchInfo() {
    const s = SS(), m = cal().find(x => String(x.j) === String(st.j)) || {}, nx = s.next || {};
    let time = m.time || '', field = m.field || '';
    if (nx.rival && nrm(nx.rival) === nrm(m.rival)) {
      if (!field) field = nx.field || '';
      if (!time && nx.date) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nx.date)).map(x => [x.type, x.value])); if (p.hour) time = p.hour + ':' + p.minute; }
    }
    const r = /^(\d+)\s*-\s*(\d+)$/.exec(String(m.result || '').trim());
    return { j: m.j, rival: m.rival || '', date: m.date || '', time, field, gf: r ? +r[1] : null, gc: r ? +r[2] : null, crest: crestSrc(m.rival) };
  }
  function defaultJ(tipo) {
    const c = cal(), t = todayMad();
    if (tipo === 'resultado') { const d = c.filter(m => m.result).sort((a, b) => b.date.localeCompare(a.date) || b.j - a.j)[0]; if (d) return d.j; }
    const n = c.find(m => m.date >= t && !m.result) || c.find(m => !m.result) || c[c.length - 1];
    return n ? n.j : '';
  }

  // ---- diseño base: lista de elementos (texto o imagen) con posición propia ----
  function build() {
    const f = FM[st.fmt], m = matchInfo(), story = st.fmt === 'story', t = st.tipo, W = f.w, H = f.h;
    const els = [], add = o => els.push({ id: 'e' + (++nid), role: 'ink', color: null, ...o });
    const tx = (label, text, x, y, size, o = {}) => add({ k: 't', label, text, x, y, size, ...o });
    const garra = { name: 'REAL GARRA', src: '/escudo.png', ini: 'RG' }, riv = { name: (m.rival || 'RIVAL').toUpperCase(), src: m.crest, ini: initials(m.rival) };
    const [A, B] = st.local ? [garra, riv] : [riv, garra];
    const res = t === 'resultado';
    const cs = story ? 330 : (res ? 210 : 260), cy = story ? (res ? 800 : 860) : (res ? 350 : 480);
    const ax = story ? 265 : (res ? 190 : 250), bx = W - ax;
    const nameY = cy + cs / 2 + (story ? 70 : 52), nameS = story ? 58 : 44;

    tx('Cabecera', st.league, W / 2, story ? 150 : 70, story ? 44 : 32, { role: 'accent', key: 'tag', maxW: W - 160 });
    if (t === 'matchday') tx('Título', 'MATCHDAY', W / 2, story ? 330 : 175, story ? 210 : 130, { role: 'accent' });
    else if (t === 'proximo') tx('Título', story ? 'PRÓXIMO\nPARTIDO' : 'PRÓXIMO PARTIDO', W / 2, story ? 360 : 175, story ? 170 : 115, { role: 'accent', lh: .92 });
    else tx('Título', 'RESULTADO', W / 2, story ? 330 : 160, story ? 200 : 115, { role: 'accent' });
    if (m.j) tx('Jornada', 'JORNADA ' + m.j, W / 2, story ? (t === 'proximo' ? 570 : 520) : 262, story ? 60 : 44);

    add({ k: 'i', label: 'Escudo izquierda', src: A.src, ini: A.ini, x: ax, y: cy, size: cs });
    add({ k: 'i', label: 'Escudo derecha', src: B.src, ini: B.ini, x: bx, y: cy, size: cs });
    tx('Nombre izquierda', A.name, ax, nameY, nameS, { maxW: story ? 470 : 400 });
    tx('Nombre derecha', B.name, bx, nameY, nameS, { maxW: story ? 470 : 400 });

    if (res) {
      const has = m.gf !== null, [l, r] = st.local ? [m.gf, m.gc] : [m.gc, m.gf];
      tx('Marcador', has ? l + ' - ' + r : '0 - 0', W / 2, story ? 1290 : cy, story ? 380 : 220, { role: 'accent', w: 800 });
      if (has) { const k = m.gf > m.gc ? 'win' : m.gf < m.gc ? 'lose' : 'draw'; tx('Resultado', k === 'win' ? 'VICTORIA' : k === 'lose' ? 'DERROTA' : 'EMPATE', W / 2, story ? 1530 : 640, story ? 90 : 64, { color: COL[k] }); }
      tx('Fecha', fmtDate(m.date), W / 2, story ? 1660 : 750, story ? 62 : 52);
      if (m.field) tx('Campo', m.field.toUpperCase(), W / 2, story ? 1745 : 820, story ? 44 : 36, { maxW: W - 160 });
    } else {
      tx('VS', 'VS', W / 2, cy, story ? 130 : 110, { role: 'accent' });
      tx('Fecha', fmtDate(m.date) || 'FECHA POR CONFIRMAR', W / 2, story ? 1370 : 790, story ? 92 : 66, { maxW: W - 120 });
      tx('Hora', m.time ? m.time + ' H' : 'HORA POR CONFIRMAR', W / 2, story ? 1500 : 890, story ? 170 : 110, { role: 'accent', maxW: W - 120 });
      tx('Campo', m.field ? m.field.toUpperCase() : 'CAMPO POR CONFIRMAR', W / 2, story ? 1650 : 980, story ? 52 : 38, { maxW: W - 140 });
    }
    tx('Pie', st.footer, W / 2, H - (story ? 90 : 38), story ? 46 : 30, { role: 'accent', key: 'foot', maxW: W - 160 });
    st.els = els; st.sel = null;
    return Promise.all(els.filter(e => e.k === 'i').map(async e => { e.img = await getImg(e.src); }));
  }

  // ---- dibujo ----
  const cover = (c, img, w, h) => { const r = Math.max(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r; c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); };
  let bgImg = null, photoImg = null;
  function drawBg(c, w, h) {
    const photo = st.bg === 'cesped' ? bgImg : st.bg === 'foto' ? photoImg : null;
    if (photo) {
      cover(c, photo, w, h);
      c.fillStyle = 'rgba(0,0,0,' + st.dark / 100 + ')'; c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    } else {
      const g = c.createLinearGradient(0, 0, w, h);
      if (st.bg === 'rojo') { g.addColorStop(0, '#b3242a'); g.addColorStop(1, '#2b0809'); } else { g.addColorStop(0, '#0d0b09'); g.addColorStop(1, '#2e200d'); }
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.save(); c.globalAlpha = .08; c.fillStyle = st.accent; c.translate(w / 2, h / 2); c.rotate(-.5);
      for (let i = -6; i < 7; i++) c.fillRect(-w * 1.5, i * 170, w * 3, 70);
      c.restore();
    }
    if (st.frame) { c.strokeStyle = st.accent; c.lineWidth = 6; c.strokeRect(34, 34, w - 68, h - 68); }
  }
  function drawEl(c, e) {
    const col = e.color || (e.role === 'accent' ? st.accent : st.ink);
    if (e.k === 't') {
      const lines = String(e.text || '').split('\n'); let size = e.size;
      const setF = () => { c.font = (e.w || 800) + ' ' + size + 'px ' + FONT; };
      setF(); const mw = () => Math.max(...lines.map(l => c.measureText(l).width), 1);
      if (e.maxW) while (size > 14 && mw() > e.maxW) { size -= 2; setF(); }
      const lh = size * (e.lh || 1.05), y0 = e.y - (lines.length - 1) * lh / 2, w = mw();
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = size * .12; c.shadowOffsetY = size * .03;
      lines.forEach((l, i) => c.fillText(l, e.x, y0 + i * lh)); c.restore();
      e._b = { x: e.x - w / 2, y: e.y - lines.length * lh / 2, w, h: lines.length * lh };
    } else {
      const s = e.size, img = e.img;
      c.save();
      if (img) { const r = s / Math.max(img.width, img.height), dw = img.width * r, dh = img.height * r; c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 24; c.drawImage(img, e.x - dw / 2, e.y - dh / 2, dw, dh); }
      else { c.strokeStyle = st.accent; c.lineWidth = 8; c.beginPath(); c.arc(e.x, e.y, s / 2 - 8, 0, 7); c.stroke(); c.fillStyle = st.ink; c.font = '800 ' + s * .34 + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.ini || '?', e.x, e.y); }
      c.restore(); e._b = { x: e.x - s / 2, y: e.y - s / 2, w: s, h: s };
    }
  }
  function paint(cv, preview) {
    const f = FM[st.fmt]; if (cv.width !== f.w) cv.width = f.w; if (cv.height !== f.h) cv.height = f.h;
    const c = cv.getContext('2d'); c.clearRect(0, 0, f.w, f.h);
    drawBg(c, f.w, f.h); st.els.forEach(e => drawEl(c, e));
    if (preview) {
      if (drag && drag.snapX) { c.save(); c.strokeStyle = '#ff4fa3'; c.lineWidth = 3; c.setLineDash([14, 10]); c.beginPath(); c.moveTo(f.w / 2, 0); c.lineTo(f.w / 2, f.h); c.stroke(); c.restore(); }
      const e = st.els.find(x => x.id === st.sel);
      if (e && e._b) { c.save(); c.strokeStyle = '#4fc3ff'; c.lineWidth = 4; c.setLineDash([12, 8]); c.strokeRect(e._b.x - 10, e._b.y - 10, e._b.w + 20, e._b.h + 20); c.restore(); }
    }
  }
  const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const cv = $('#igCv'); if (cv) paint(cv, true); }); };
  const toBlob = () => new Promise(ok => { const cv = document.createElement('canvas'); paint(cv, false); cv.toBlob(ok, 'image/png'); });

  // ---- interfaz ----
  const say = t => { const m = $('#igMsg'); if (m) m.textContent = t || ''; };
  function fillMatches() {
    const sel = $('#igJ'), keep = String(st.j);
    sel.innerHTML = cal().map(m => `<option value="${m.j}">J${m.j} · ${String(m.rival).replace(/[<>&"]/g, '')} · ${m.date ? m.date.split('-').reverse().slice(0, 2).join('/') : ''}${m.result ? ' · ' + m.result : ''}</option>`).join('');
    sel.value = keep;
  }
  function fillSel() { $('#igSel').innerHTML = st.els.map(e => `<option value="${e.id}">${e.label}</option>`).join('') + ''; $('#igSel').value = st.sel || ''; syncEdit(); }
  function syncEdit() {
    const e = st.els.find(x => x.id === st.sel), box = $('#igEdit');
    box.hidden = !e; if ($('#igSel').value !== (st.sel || '')) $('#igSel').value = st.sel || '';
    if (!e) return;
    $('#igTxtRow').hidden = e.k !== 't'; $('#igColRow').hidden = e.k !== 't'; $('#igImgRow').hidden = e.k !== 'i';
    if (e.k === 't') { $('#igTxt').value = e.text; $('#igCol').value = e.color || (e.role === 'accent' ? st.accent : st.ink); }
    $('#igSize').min = e.k === 't' ? 20 : 80; $('#igSize').max = e.k === 't' ? 420 : 900; $('#igSize').value = e.size;
  }
  async function rebuild() { say('Preparando…'); await build(); fillSel(); redraw(); say(''); }
  function fit() { const cv = $('#igCv'), r = FM[st.fmt]; cv.style.aspectRatio = r.w + ' / ' + r.h; cv.style.width = st.fmt === 'story' ? 'min(100%, 380px)' : 'min(100%, 560px)'; }
  async function pickFile(inp) { const f = inp.files && inp.files[0]; inp.value = ''; return f ? URL.createObjectURL(f) : ''; }

  async function init() {
    built = true; // evita abrirlo dos veces si se pulsa la pestaña varias veces seguidas
    const root = $('#igRoot');
    const css = document.createElement('style');
    css.textContent = '#igRoot .igw{display:grid;gap:18px;align-items:start}@media(min-width:900px){#igRoot .igw{grid-template-columns:minmax(0,auto) minmax(0,1fr)}}' +
      '#igRoot canvas{display:block;border:2px solid var(--line);border-radius:10px;background:#000;touch-action:none;cursor:grab;margin:0 auto}' +
      '#igRoot .igc label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#igRoot .igc h3{margin:16px 0 4px;font:800 22px "Barlow Condensed",sans-serif;color:var(--gold)}' +
      '#igRoot input[type=color]{width:46px;height:40px;padding:2px;border-radius:8px;border:1px solid var(--line);background:var(--card)}#igRoot textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)}#igRoot input[type=range]{flex:1;min-width:120px}';
    document.head.appendChild(css);
    root.innerHTML = `<p class="sub">Diseños hechos por ti, sin IA. Elige formato y tipo, ajusta los textos y <b>arrastra cualquier elemento</b> con el dedo o el ratón (toca uno para editarlo). Los datos salen del calendario; si cambias formato, tipo o partido el diseño se rehace.</p>
<div class="igw"><div><canvas id="igCv"></canvas><p class="sub" id="igMsg" style="text-align:center"></p></div>
<div class="igc">
 <h3>Qué quieres subir</h3>
 <div class="row"><select id="igFmt" aria-label="Formato"><option value="story">Historia · 9:16 vertical</option><option value="post">Publicación · 1:1 cuadrada</option></select>
 <select id="igTipo" aria-label="Tipo"><option value="matchday">Matchday</option><option value="resultado">Resultado</option><option value="proximo">Próximo partido</option></select></div>
 <div class="row"><select id="igJ" aria-label="Partido"></select><select id="igLocal" aria-label="Local o visitante"><option value="1">Real Garra juega de local</option><option value="0">Real Garra juega de visitante</option></select></div>
 <div class="row"><input id="igLeague" placeholder="Cabecera" maxlength="60" style="flex:1"><input id="igFoot" placeholder="Pie (hashtag…)" maxlength="40"></div>
 <h3>Fondo y colores</h3>
 <div class="row"><select id="igBg" aria-label="Fondo"><option value="cesped">Césped</option><option value="negro">Negro y dorado</option><option value="rojo">Rojo Garra</option><option value="foto">Mi foto</option></select>
 <label>Subir foto: <input id="igPhoto" type="file" accept="image/*"></label></div>
 <div class="row"><label style="flex:1">Oscurecer <input id="igDark" type="range" min="0" max="90" value="45"></label><label><input id="igFrame" type="checkbox" checked> Marco</label></div>
 <div class="row"><label>Acento <input id="igAcc" type="color" value="#e2ab2c"></label><label>Texto <input id="igInk" type="color" value="#f6eedb"></label></div>
 <h3>Elemento seleccionado</h3>
 <div class="row"><select id="igSel" aria-label="Elemento"></select><button id="igDel" type="button" class="ghost">Borrar</button></div>
 <div id="igEdit" hidden>
  <div id="igTxtRow"><textarea id="igTxt" rows="2"></textarea></div>
  <div class="row"><label style="flex:1">Tamaño <input id="igSize" type="range" min="20" max="420" value="100"></label><span id="igColRow"><label>Color <input id="igCol" type="color" value="#ffffff"></label></span></div>
  <div class="row" id="igImgRow"><label>Cambiar imagen: <input id="igImgFile" type="file" accept="image/*"></label></div>
 </div>
 <div class="row"><button id="igAddT" type="button" class="ghost">+ Texto</button><label class="ghost" style="cursor:pointer;border:1px solid var(--line);border-radius:8px;padding:8px 14px;min-height:44px;box-sizing:border-box">+ Imagen<input id="igAddI" type="file" accept="image/*" hidden></label><button id="igReset" type="button" class="ghost">↺ Rehacer diseño</button></div>
 <div class="row"><button id="igDl" type="button">⬇ Descargar PNG</button><button id="igShare" type="button">📤 Compartir (Instagram)</button></div>
</div></div>`;
    bgImg = await getImg('/cesped.jpg');
    try { await Promise.race([document.fonts.load('800 80px "Barlow Condensed"'), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* se usa la letra de reserva */ }
    st.j = defaultJ(st.tipo); fillMatches(); $('#igJ').value = st.j; fit();

    const cv = $('#igCv'), pt = ev => { const r = cv.getBoundingClientRect(), f = FM[st.fmt]; return { x: (ev.clientX - r.left) * f.w / r.width, y: (ev.clientY - r.top) * f.h / r.height }; };
    cv.addEventListener('pointerdown', ev => {
      const p = pt(ev), hit = st.els.slice().reverse().find(e => e._b && p.x >= e._b.x - 20 && p.x <= e._b.x + e._b.w + 20 && p.y >= e._b.y - 20 && p.y <= e._b.y + e._b.h + 20);
      st.sel = hit ? hit.id : null; drag = hit ? { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y, snapX: false } : null;
      if (hit) { try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ } }
      syncEdit(); redraw();
    });
    cv.addEventListener('pointermove', ev => {
      if (!drag) return; const e = st.els.find(x => x.id === drag.id); if (!e) return; const p = pt(ev), W = FM[st.fmt].w;
      e.x = Math.round(p.x + drag.dx); e.y = Math.round(p.y + drag.dy);
      drag.snapX = Math.abs(e.x - W / 2) < 16; if (drag.snapX) e.x = W / 2;
      redraw();
    });
    const up = () => { drag = null; redraw(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    $('#igFmt').onchange = async e => { st.fmt = e.target.value; fit(); await rebuild(); };
    $('#igTipo').onchange = async e => { st.tipo = e.target.value; st.j = defaultJ(st.tipo); $('#igJ').value = st.j; await rebuild(); };
    $('#igJ').onchange = async e => { st.j = e.target.value; await rebuild(); };
    $('#igLocal').onchange = async e => { st.local = e.target.value === '1'; await rebuild(); };
    $('#igLeague').oninput = e => { st.league = e.target.value; const t = st.els.find(x => x.key === 'tag'); if (t) t.text = st.league; syncEdit(); redraw(); };
    $('#igFoot').oninput = e => { st.footer = e.target.value; const t = st.els.find(x => x.key === 'foot'); if (t) t.text = st.footer; syncEdit(); redraw(); };
    $('#igLeague').value = st.league; $('#igFoot').value = st.footer;
    $('#igBg').onchange = e => { st.bg = e.target.value; if (st.bg === 'foto' && !photoImg) say('Sube tu foto con «Subir foto».'); redraw(); };
    $('#igPhoto').onchange = async e => { const u = await pickFile(e.target); if (!u) return; photoImg = await getImg(u); st.bg = 'foto'; $('#igBg').value = 'foto'; say(''); redraw(); };
    $('#igDark').oninput = e => { st.dark = +e.target.value; redraw(); };
    $('#igFrame').onchange = e => { st.frame = e.target.checked; redraw(); };
    $('#igAcc').oninput = e => { st.accent = e.target.value; syncEdit(); redraw(); };
    $('#igInk').oninput = e => { st.ink = e.target.value; syncEdit(); redraw(); };
    $('#igSel').onchange = e => { st.sel = e.target.value || null; syncEdit(); redraw(); };
    $('#igTxt').oninput = e => { const el = st.els.find(x => x.id === st.sel); if (el) { el.text = e.target.value; redraw(); } };
    $('#igSize').oninput = e => { const el = st.els.find(x => x.id === st.sel); if (el) { el.size = +e.target.value; redraw(); } };
    $('#igCol').oninput = e => { const el = st.els.find(x => x.id === st.sel); if (el) { el.color = e.target.value; redraw(); } };
    $('#igImgFile').onchange = async e => { const el = st.els.find(x => x.id === st.sel), u = await pickFile(e.target); if (!el || !u) return; el.src = u; el.img = await getImg(u); redraw(); };
    $('#igDel').onclick = () => { if (!st.sel) { say('Toca primero un elemento.'); return; } st.els = st.els.filter(x => x.id !== st.sel); st.sel = null; fillSel(); redraw(); };
    $('#igAddT').onclick = () => { const f = FM[st.fmt], e = { id: 'e' + (++nid), k: 't', label: 'Texto nuevo', text: 'TEXTO', x: f.w / 2, y: f.h / 2, size: 80, role: 'ink', color: null }; st.els.push(e); st.sel = e.id; fillSel(); redraw(); };
    $('#igAddI').onchange = async e => { const u = await pickFile(e.target); if (!u) return; const f = FM[st.fmt], el = { id: 'e' + (++nid), k: 'i', label: 'Imagen nueva', src: u, img: await getImg(u), x: f.w / 2, y: f.h / 2, size: 300, role: 'ink', color: null }; st.els.push(el); st.sel = el.id; fillSel(); redraw(); };
    $('#igReset').onclick = rebuild;
    const name = () => 'garra-' + st.tipo + '-' + (st.fmt === 'story' ? 'historia' : 'post') + (st.j ? '-J' + st.j : '') + '.png';
    $('#igDl').onclick = async () => { const b = await toBlob(); if (!b) { say('No se pudo crear la imagen.'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Imagen descargada.'); };
    $('#igShare').onclick = async () => {
      const b = await toBlob(); if (!b) { say('No se pudo crear la imagen.'); return; }
      const file = new File([b], name(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* cancelado */ } }
      else { say('Este navegador no puede compartir directamente: descarga el PNG y súbelo a Instagram.'); $('#igDl').click(); }
    };
    await rebuild();
  }

  // Se abre al entrar en la pestaña; si ya estaba abierta, solo se refresca la lista de partidos por si cambió el calendario.
  function open() {
    if (!built) { init(); return; }
    const keep = st.j; fillMatches(); $('#igJ').value = keep;
  }
  // La pestaña puede abrirse con un clic o por sí sola (el panel recuerda la última pestaña): se vigila cuando el panel deja de estar oculto.
  const pane = $('.apane[data-ap=insta]');
  if (pane) { new MutationObserver(() => { if (!pane.hidden) open(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] }); if (!pane.hidden) open(); }
})();
