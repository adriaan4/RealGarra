// RUEDA DE PRENSA — panel de admin. La vista para la afición vive ahora dentro de «Del Barro al Garro» (/barro/),
// pero se sigue escribiendo aquí porque es donde está el resto de la administración de la web (contraseña de Admin).
// Solo lo escribe el admin; la lectura pública es /api/prensa (la consume /barro/public/index.html).
(() => {
  const $ = s => document.querySelector(s);
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
.prsAd .prsRow{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.prsAd input{flex:1;min-width:140px}
.prsAd textarea{width:100%;min-height:60px;resize:vertical;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid var(--line,#3a2d22);background:#0d0b09;color:inherit;font:inherit;margin:6px 0}
.prsAd h4{margin:20px 0 2px;color:var(--gold,#e2ab2c)}
.prsAd .sub2{margin:0 0 8px;opacity:.7;font-size:14px}
`;
  document.head.appendChild(css);
  const toast = t => { const el = $('#amsg'); if (el) { el.textContent = t; return; } alert(t); };

  // ---------- Admin ----------
  let A = null;
  const pane = document.querySelector('.apane[data-ap=prensa]');
  function block(cual, titulo) {
    const c = (A && A[cual]) || { rival: '', pregunta: '', respuesta: '', portavoz: '', resultado: '' };
    return `<h4>${titulo}</h4>
 <p class="sub2">Esto es lo que verá la afición en «Del Barro al Garro», pestaña «${cual === 'previa' ? 'Previa' : 'Post-partido'}».</p>
 <div class="prsRow"><input id="prs-${cual}-rival" placeholder="Rival" maxlength="60" value="${E(c.rival)}"><input id="prs-${cual}-portavoz" placeholder="Nombre del portavoz" maxlength="60" value="${E(c.portavoz)}">${cual === 'post' ? `<input id="prs-post-resultado" placeholder="Resultado (ej. 3-1)" maxlength="20" value="${E(c.resultado)}">` : ''}</div>
 <textarea id="prs-${cual}-pregunta" maxlength="220" placeholder="Pregunta del periodista">${E(c.pregunta)}</textarea>
 <textarea id="prs-${cual}-respuesta" maxlength="400" placeholder="Respuesta del portavoz">${E(c.respuesta)}</textarea>
 <div class="prsRow"><button type="button" data-save="${cual}">💾 Guardar ${cual === 'previa' ? 'previa' : 'post-partido'}</button><button type="button" class="ghost" data-clear="${cual}">✕ Borrar</button></div>`;
  }
  function aDraw() {
    const el = $('#prsAdmin'); if (!el) return;
    if (!A) { el.innerHTML = '<p>Cargando…</p>'; return; }
    el.innerHTML = `<p class="sub2">Esta rueda de prensa se ve en <b>Del Barro al Garro</b> (/barro/), no en la web principal. La foto de fondo es siempre la misma; aquí solo cambian el rival, quién habla y lo que dice.</p>` + block('previa', '📰 Rueda de prensa previa') + block('post', '🏁 Rueda de prensa post-partido');
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
        toast('Rueda de prensa guardada'); await aLoad();
      } catch (x) { toast(x.message); }
      return;
    }
    const cl = e.target.closest('[data-clear]');
    if (cl && e.target.closest('.prsAd')) {
      if (!confirm('¿Borrar esta rueda de prensa?')) return;
      try { await adm('/api/prensa-admin/' + cl.dataset.clear, 'DELETE'); toast('Borrada'); await aLoad(); } catch (x) { toast(x.message); }
    }
  });
  if (pane) new MutationObserver(() => { if (!pane.hidden) aLoad(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
