// RUEDA DE PRENSA — front. Previa y post-partido, con la foto real del portavoz en la sala de prensa del Garra.
// Solo lo escribe el admin; todo el mundo lo puede leer. Las dos ruedas (previa y post) están siempre visibles, cada una en su pestaña.
(() => {
  const $ = s => document.querySelector(s);
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
#prensa .prsTabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
#prensa .prsTabs button{border-radius:999px;background:transparent;border:1px solid var(--line,#3a2d22);color:inherit}
#prensa .prsTabs button.on{background:var(--red,#a01f22);border-color:var(--red,#a01f22);color:var(--ink,#f6eedb);font-weight:700}
.prsCard{position:relative;border-radius:16px;overflow:hidden;border:2px solid var(--gold,#e2ab2c);background:#000;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.prsPhoto{position:relative;aspect-ratio:3/4;max-height:72vh;background:#000}
.prsPhoto img{width:100%;height:100%;object-fit:cover;display:block;object-position:50% 15%}
.prsBadges{position:absolute;top:10px;left:10px;right:10px;min-height:46px;display:flex;justify-content:space-between;align-items:center;pointer-events:none}
.prsBadges img{height:46px;width:46px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.8));flex:none}
.prsBadges span{flex:none}
.prsVs{color:var(--gold,#e2ab2c);font:800 12px "Barlow Condensed",sans-serif;text-align:center;line-height:1.2;text-shadow:0 2px 4px #000;letter-spacing:.05em}
.prsQ{position:absolute;top:66px;left:10px;right:10px;background:rgba(13,11,9,.85);border:1px solid rgba(226,171,44,.5);border-radius:12px;padding:10px 13px;backdrop-filter:blur(2px)}
.prsQ small{display:block;color:var(--gold,#e2ab2c);font-weight:700;margin-bottom:3px}
.prsQ p{margin:0;font-size:15px;line-height:1.35}
.prsA{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.92),rgba(0,0,0,.75) 70%,transparent);padding:16px 14px 14px}
.prsA .nm{display:block;font:800 19px "Barlow Condensed",sans-serif;color:var(--gold,#e2ab2c);margin-bottom:2px}
.prsA p{margin:0;font-size:16px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}
.prsQ .resu{background:var(--red,#a01f22);border:1px solid var(--gold,#e2ab2c);border-radius:6px;padding:1px 8px;margin-left:6px;font-weight:800;letter-spacing:.03em}
.prsEmpty{padding:30px 16px;text-align:center}
.prsAd .prsRow{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.prsAd input{flex:1;min-width:140px}
.prsAd textarea{width:100%;min-height:60px;resize:vertical;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid var(--line,#3a2d22);background:#0d0b09;color:inherit;font:inherit;margin:6px 0}
.prsAd h4{margin:20px 0 2px;color:var(--gold,#e2ab2c)}
.prsAd .sub2{margin:0 0 8px;opacity:.7;font-size:14px}
`;
  document.head.appendChild(css);
  const toast = t => { const el = $('#amsg'); if (el) { el.textContent = t; return; } alert(t); };

  // ---------- Vista pública ----------
  let V = null, sig = '', tab = 'previa';
  const root = () => $('#prsRoot');
  const here = () => location.hash === '#prensa';
  async function load(force) {
    if (!here() && !force) return;
    try { V = await api('/api/prensa'); } catch { return; }
    const s = JSON.stringify(V); if (s === sig && !force) return; sig = s;
    draw();
  }
  function card(c, cual) {
    if (!c.respuesta) return '<div class="prsCard"><div class="prsEmpty sub">Todavía no hay rueda de prensa ' + (cual === 'previa' ? 'previa' : 'post-partido') + '.</div></div>';
    const rivalCrest = (c.rival && typeof crestImg === 'function') ? crestImg(c.rival) : '';
    return `<div class="prsCard">
  <div class="prsPhoto"><img src="prensa-portavoz.jpg" alt="${E(c.portavoz || 'Portavoz')} en la sala de prensa del Real Garra"></div>
  <div class="prsBadges"><img src="escudo.png" alt="Real Garra">${c.rival ? `<span class="prsVs">REAL GARRA<br>vs<br>${E(c.rival).toUpperCase()}</span>` : '<span></span>'}${rivalCrest || '<span></span>'}</div>
  <div class="prsQ"><small>🎙️ ${cual === 'previa' ? 'PREVIA DEL PARTIDO' : 'TRAS EL PARTIDO'}${cual === 'post' && c.resultado ? `<span class="resu">${E(c.resultado)}</span>` : ''}</small><p>${E(c.pregunta) || (cual === 'previa' ? '¿Cómo encara el equipo el próximo partido?' : '¿Qué análisis hace del partido?')}</p></div>
  <div class="prsA"><b class="nm">${E(c.portavoz || 'Real Garra')}:</b><p>${E(c.respuesta)}</p></div>
 </div>`;
  }
  function draw() {
    const el = root(); if (!el || !V) return;
    el.innerHTML = `<div class="prsTabs" role="tablist" aria-label="Rueda de prensa">
   <button type="button" class="${tab === 'previa' ? 'on' : ''}" data-pv="previa" role="tab">📰 Previa</button>
   <button type="button" class="${tab === 'post' ? 'on' : ''}" data-pv="post" role="tab">🏁 Post-partido</button>
  </div>
  <div id="prsBody"></div>`;
    $('#prsBody').innerHTML = card(V[tab], tab);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#prensa .prsTabs button[data-pv]');
    if (b) { tab = b.dataset.pv; draw(); }
  });
  addEventListener('hashchange', () => { if (here()) load(true); });
  setInterval(() => load(), 30000);
  if (here()) load(true);

  // ---------- Admin ----------
  let A = null;
  const pane = document.querySelector('.apane[data-ap=prensa]');
  function block(cual, titulo) {
    const c = (A && A[cual]) || { rival: '', pregunta: '', respuesta: '', portavoz: '', resultado: '' };
    return `<h4>${titulo}</h4>
 <p class="sub2">Esto es lo que verá la afición en la pestaña «${cual === 'previa' ? 'Previa' : 'Post-partido'}».</p>
 <div class="prsRow"><input id="prs-${cual}-rival" placeholder="Rival" maxlength="60" value="${E(c.rival)}"><input id="prs-${cual}-portavoz" placeholder="Nombre del portavoz" maxlength="60" value="${E(c.portavoz)}">${cual === 'post' ? `<input id="prs-post-resultado" placeholder="Resultado (ej. 3-1)" maxlength="20" value="${E(c.resultado)}">` : ''}</div>
 <textarea id="prs-${cual}-pregunta" maxlength="220" placeholder="Pregunta del periodista">${E(c.pregunta)}</textarea>
 <textarea id="prs-${cual}-respuesta" maxlength="400" placeholder="Respuesta del portavoz">${E(c.respuesta)}</textarea>
 <div class="prsRow"><button type="button" data-save="${cual}">💾 Guardar ${cual === 'previa' ? 'previa' : 'post-partido'}</button><button type="button" class="ghost" data-clear="${cual}">✕ Borrar</button></div>`;
  }
  function aDraw() {
    const el = $('#prsAdmin'); if (!el) return;
    if (!A) { el.innerHTML = '<p>Cargando…</p>'; return; }
    el.innerHTML = `<p class="sub2">La foto de fondo es siempre la misma (la de la sala de prensa del Garra); aquí solo cambian el rival, quién habla y lo que dice.</p>` + block('previa', '📰 Rueda de prensa previa') + block('post', '🏁 Rueda de prensa post-partido');
  }
  async function aLoad() { try { A = await adm('/api/prensa-admin'); aDraw(); } catch (e) { const el = $('#prsAdmin'); if (el) el.innerHTML = '<p>' + E(e.message) + '</p>'; } }
  document.addEventListener('click', async e => {
    const sv = e.target.closest('[data-save]');
    if (sv && e.target.closest('.prsAd')) {
      const cual = sv.dataset.save;
      try {
        await adm('/api/prensa-admin/' + cual, 'POST', {
          rival: $('#prs-' + cual + '-rival').value,
          portavoz: $('#prs-' + cual + '-portavoz').value,
          pregunta: $('#prs-' + cual + '-pregunta').value,
          respuesta: $('#prs-' + cual + '-respuesta').value,
          resultado: cual === 'post' ? $('#prs-post-resultado').value : ''
        });
        toast('Rueda de prensa guardada'); await aLoad(); await load(true);
      } catch (x) { toast(x.message); }
      return;
    }
    const cl = e.target.closest('[data-clear]');
    if (cl && e.target.closest('.prsAd')) {
      if (!confirm('¿Borrar esta rueda de prensa?')) return;
      try { await adm('/api/prensa-admin/' + cl.dataset.clear, 'DELETE'); toast('Borrada'); await aLoad(); await load(true); } catch (x) { toast(x.message); }
    }
  });
  if (pane) new MutationObserver(() => { if (!pane.hidden) aLoad(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
