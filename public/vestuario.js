// VESTUARIO — front. Mensajes de jugadores y ofertas de otros equipos, entre jornada y jornada. Solo lo escribe el admin; todo el mundo lo puede leer.
(() => {
  const $ = s => document.querySelector(s);
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = ms => { const d = new Date(ms); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
  const KINDS = [['jugar', '🙋 Necesita jugar'], ['debe', '💪 Cree que debe jugar'], ['gracias', '🙏 Agradece la confianza'], ['sueldo', '💶 Pide subida de sueldo'], ['otro', '💬 Otro']];
  const KL = Object.fromEntries(KINDS);
  const css = document.createElement('style');
  css.textContent = `
#vestuario .vsCard{background:linear-gradient(160deg,#1c1612,#120e0b);border:1px solid var(--line,#3a2d22);border-radius:14px;padding:12px 13px;margin:9px 0}
#vestuario .vsCard.off{border-left:4px solid var(--gold,#e2ab2c)}
#vestuario h3{margin:22px 0 4px}
.vsCard small{opacity:.6;display:block;margin-bottom:4px}.vsCard p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.vsCard b.nm{color:var(--gold,#e2ab2c)}
.vAd .row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.vAd select,.vAd input{padding:10px;border-radius:10px;border:1px solid var(--line,#3a2d22);background:#0d0b09;color:inherit;font:inherit}
.vAd textarea{width:100%;min-height:60px;resize:vertical;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid var(--line,#3a2d22);background:#0d0b09;color:inherit;font:inherit;margin:8px 0}
.vAd .vsK{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.vAd .vsK button{padding:7px 11px;border-radius:999px;font-size:15px;background:transparent;border:1px solid var(--line,#3a2d22);color:inherit}
.vAd .vsK button.on{background:var(--gold,#e2ab2c);color:#0d0b09;border-color:var(--gold,#e2ab2c);font-weight:700}
.vAd .vsCard{position:relative}.vAd .vsCard .del{position:absolute;top:8px;right:8px}`;
  document.head.appendChild(css);
  const toast = t => { if (typeof window.toast === 'function') return window.toast(t); alert(t); };

  // ---------- Vista pública ----------
  let V = null, sig = '';
  const root = () => $('#vsRoot');
  const here = () => location.hash === '#vestuario';
  async function load(force) {
    if (!here() && !force) return;
    try { V = await api('/api/vestuario'); } catch { return; }
    const s = JSON.stringify(V); if (s === sig && !force) return; sig = s;
    draw();
  }
  function msgCard(m) { return `<div class="vsCard"><small>${KL[m.k] || ''} · ${when(m.d)}</small><p><b class="nm">${E(m.playerName)}:</b> ${m.t ? E(m.t) : '<i>' + (KL[m.k] || '').replace(/^\S+\s/, '') + '</i>'}</p></div>`; }
  function offCard(o) { return `<div class="vsCard off"><small>📞 Oferta · ${when(o.d)}</small><p><b class="nm">${E(o.team)}</b> pregunta por <b>${E(o.playerName)}</b>${o.amount ? ' · ' + E(o.amount) : ''}</p>${o.t ? `<p>${E(o.t)}</p>` : ''}</div>`; }
  function draw() {
    const el = root(); if (!el || !V) return;
    el.innerHTML = `<p class="sub">Lo que se cuece en el vestuario entre jornada y jornada: lo que dicen los jugadores y lo que preguntan otros equipos por ellos.</p>
      <h3>📣 Mensajes de los jugadores</h3>${V.msgs.length ? V.msgs.map(msgCard).join('') : '<p class="sub">De momento nadie ha dicho nada.</p>'}
      <h3>📞 Ofertas de otros equipos</h3>${V.offers.length ? V.offers.map(offCard).join('') : '<p class="sub">De momento no hay ofertas por ningún jugador.</p>'}`;
  }
  addEventListener('hashchange', () => { if (here()) load(true); });
  setInterval(() => load(), 30000);
  if (here()) load(true);

  // ---------- Admin ----------
  let A = null, msgK = 'jugar';
  const pane = document.querySelector('.apane[data-ap=vestuario]');
  const sqOpts = () => (S.squad || []).map(p => `<option value="${p.id}">${E(p.name)}</option>`).join('');
  function aDraw() {
    const el = $('#vsAdmin'); if (!el || !A) return;
    el.innerHTML = `
      <h3>📣 Añadir mensaje de un jugador</h3>
      <div class="row"><select id="vsMPlayer" aria-label="Jugador">${sqOpts()}</select></div>
      <div class="vsK">${KINDS.map(([k, l]) => `<button type="button" data-mk="${k}" class="${msgK === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <textarea id="vsMTxt" maxlength="300" placeholder="Texto del mensaje (opcional salvo en «Otro»)"></textarea>
      <div class="row"><button type="button" id="vsMAdd">➕ Añadir mensaje</button></div>
      ${A.msgs.map(m => `<div class="vsCard" data-id="${m.id}"><button type="button" class="ghost del" data-dm="${m.id}">✕</button><small>${KL[m.k] || ''} · ${when(m.d)}</small><p><b class="nm">${E(m.playerName)}:</b> ${m.t ? E(m.t) : '<i>' + (KL[m.k] || '').replace(/^\S+\s/, '') + '</i>'}</p></div>`).join('') || '<p class="sub">No hay mensajes.</p>'}
      <h3>📞 Añadir oferta de otro equipo</h3>
      <div class="row"><select id="vsOPlayer" aria-label="Jugador nuestro">${sqOpts()}</select><input id="vsOTeam" placeholder="Equipo que pregunta" maxlength="60"><input id="vsOAmount" placeholder="Importe/pavos (opcional)" maxlength="40"></div>
      <textarea id="vsOTxt" maxlength="300" placeholder="Detalle de la oferta (opcional)"></textarea>
      <div class="row"><button type="button" id="vsOAdd">➕ Añadir oferta</button></div>
      ${A.offers.map(o => `<div class="vsCard off" data-id="${o.id}"><button type="button" class="ghost del" data-doff="${o.id}">✕</button><small>📞 Oferta · ${when(o.d)}</small><p><b class="nm">${E(o.team)}</b> pregunta por <b>${E(o.playerName)}</b>${o.amount ? ' · ' + E(o.amount) : ''}</p>${o.t ? `<p>${E(o.t)}</p>` : ''}</div>`).join('') || '<p class="sub">No hay ofertas.</p>'}`;
  }
  async function aLoad() { try { A = await adm('/api/vestuario-admin'); aDraw(); } catch (e) { const el = $('#vsAdmin'); if (el) el.innerHTML = '<p>' + E(e.message) + '</p>'; } }
  document.addEventListener('click', async e => {
    const mk = e.target.closest('.vAd .vsK button[data-mk]'); if (mk) { msgK = mk.dataset.mk; aDraw(); return; }
    if (e.target.id === 'vsMAdd') {
      try { await adm('/api/vestuario-admin/msg', 'POST', { playerId: $('#vsMPlayer').value, k: msgK, t: $('#vsMTxt').value }); toast('Mensaje añadido'); await aLoad(); } catch (x) { toast(x.message); }
      return;
    }
    if (e.target.id === 'vsOAdd') {
      try { await adm('/api/vestuario-admin/oferta', 'POST', { playerId: $('#vsOPlayer').value, team: $('#vsOTeam').value, amount: $('#vsOAmount').value, t: $('#vsOTxt').value }); toast('Oferta añadida'); await aLoad(); } catch (x) { toast(x.message); }
      return;
    }
    const dm = e.target.closest('[data-dm]'); if (dm) { if (!confirm('¿Borrar este mensaje?')) return; try { await adm('/api/vestuario-admin/msg/' + dm.dataset.dm, 'DELETE'); await aLoad(); } catch (x) { toast(x.message); } return; }
    const doff = e.target.closest('[data-doff]'); if (doff) { if (!confirm('¿Borrar esta oferta?')) return; try { await adm('/api/vestuario-admin/oferta/' + doff.dataset.doff, 'DELETE'); await aLoad(); } catch (x) { toast(x.message); } return; }
  });
  if (pane) new MutationObserver(() => { if (!pane.hidden) aLoad(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
