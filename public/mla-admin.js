// ---- Admin → Más → 📊 Clasificación MLA: estado de la lectura automática, «Actualizar ahora» y clasificación pegada a mano ----
(() => {
  'use strict';
  const q = s => document.querySelector(s), pane = q('.apane[data-ap=mas]');
  if (!pane || !q('#mlaNow')) return;
  const when = iso => iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca';
  const info = t => { q('#mlaInfo').textContent = t; };
  async function status() {
    try {
      const d = await adm('/api/mla/status');
      info('Se lee sola cada 30 minutos. Última lectura correcta: ' + when(d.lastOk) + '. Equipos guardados: ' + (d.standings || []).length + '.' + (d.error ? ' ⚠️ Último error: ' + d.error : ''));
    } catch (e) { info('No se pudo consultar el estado: ' + e.message); }
  }
  q('#mlaNow').onclick = async () => {
    info('Leyendo MLA…');
    try {
      const r = await adm('/api/mla/sync', 'POST');
      if (typeof load === 'function') { try { await load(); } catch (e) { /* se refresca solo */ } }
      await status();
      if (!r.ok) info(q('#mlaInfo').textContent + ' · ' + (r.error || 'No se pudo leer MLA'));
    } catch (e) { info('Error: ' + e.message); }
  };
  q('#mlaSave').onclick = async () => {
    const text = q('#mlaPaste').value.trim();
    if (!text) { info('Pega primero la tabla de clasificación.'); return; }
    try {
      const r = await adm('/api/mla/paste', 'POST', { text });
      q('#mlaPaste').value = '';
      if (typeof load === 'function') { try { await load(); } catch (e) { /* se refresca solo */ } }
      await status();
      info(q('#mlaInfo').textContent + ' · Guardados ' + r.teams + ' equipos' + (r.changes.length ? '.' : ' (ya estaba igual).'));
    } catch (e) { info('Error: ' + e.message); }
  };

  q('#mlaFileBtn').onclick = () => q('#mlaFile').click();
  q('#mlaFile').onchange = async () => {
    const file = q('#mlaFile').files[0];
    q('#mlaFile').value = ''; // para poder volver a elegir el mismo archivo si hace falta
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { info('Ese archivo pesa demasiado (máximo 20 MB).'); return; }
    info('Leyendo ' + file.name + '…');
    try {
      const text = await file.text();
      const r = await fetch('/api/mla/upload', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'x-admin': pw }, body: text });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Error');
      if (typeof load === 'function') { try { await load(); } catch (e) { /* se refresca solo */ } }
      await status();
      info(q('#mlaInfo').textContent + ' · Guardados ' + d.teams + ' equipos desde ' + file.name + (d.changes.length ? '.' : ' (ya estaba igual).'));
    } catch (e) { info('Error al leer el archivo: ' + e.message); }
  };

  // ---- marcador de un clic ----
  // Esta función se convierte en el marcador (se ejecuta en la página de MLA, en tu navegador). Sin comentarios y con «;» en todo, porque se pasa a una sola línea.
  function marcador(origin, token) {
    var t = document.body.innerText.replace(/[\u2212\u2013\u2014]/g, '-').split(/[\n\t\r]+/).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean), o = [], i, n;
    for (i = 0; i < t.length; i++) {
      if (!/[A-Za-z\u00C0-\u00FF]/.test(t[i]) || t[i].length > 45) continue;
      n = t.slice(i + 1, i + 9);
      if (n.length < 8 || !n.every(function (v) { return /^[+-]?\d+$/.test(v); })) continue;
      n = n.map(Number);
      if (n[2] + n[3] + n[4] !== n[1] || n[0] !== 3 * n[2] + n[3] || n[5] - n[6] !== n[7]) continue;
      o.push(t[i] + '\t' + n.join('\t'));
      i += 8;
    }
    if (o.length < 2) { alert('No encuentro la clasificación en esta página. Abre la clasificación del grupo en MLA y vuelve a pulsar.'); return; }
    var f = document.createElement('form');
    f.method = 'POST'; f.action = origin + '/api/mla/import'; f.target = '_blank';
    [['t', token], ['text', o.join('\n')]].forEach(function (p) { var e = document.createElement('input'); e.type = 'hidden'; e.name = p[0]; e.value = p[1]; f.appendChild(e); });
    document.body.appendChild(f); f.submit();
  }
  let bmCode = '';
  async function bookmarklet() {
    try {
      const d = await adm('/api/mla/bookmarklet');
      bmCode = 'javascript:' + ('(' + marcador.toString() + ')(' + JSON.stringify(location.origin) + ',' + JSON.stringify(d.token) + ');').replace(/\s*\n\s*/g, ' ');
      q('#mlaBm').setAttribute('href', 'javascript:' + encodeURIComponent(bmCode.slice(11)));
    } catch (e) { /* sin sesión de admin todavía */ }
  }
  q('#mlaBm').onclick = e => { e.preventDefault(); info('Arrastra el botón a la barra de marcadores de tu navegador (no lo pulses aquí).'); };
  q('#mlaBmCopy').onclick = async () => {
    if (!bmCode) await bookmarklet();
    try { await navigator.clipboard.writeText(bmCode); info('Código copiado. Crea un marcador nuevo y pega este código como dirección (URL).'); }
    catch (e) { window.prompt('Copia este código y pégalo como dirección de un marcador nuevo:', bmCode); }
  };
  // se actualiza el estado cuando se abre la pestaña «Más»
  new MutationObserver(() => { if (!pane.hidden) { status(); bookmarklet(); } }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  if (!pane.hidden) { status(); bookmarklet(); }
})();
