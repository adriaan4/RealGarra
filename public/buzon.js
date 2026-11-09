// BUZÓN de sugerencias y quejas — front. Usa de la web: dev (dispositivo), adm/pw (admin), load/lastJ (refrescar el nombre de GarraBet).
(() => {
  const $ = s => document.querySelector(s);
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = ms => { const d = new Date(ms); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
  const KINDS = [['sug', '💡 Sugerencia'], ['que', '😤 Queja'], ['dud', '❓ Duda'], ['otro', '💬 Otro']];
  const KL = Object.fromEntries(KINDS);
  const css = document.createElement('style');
  css.textContent = `
#buzon .bzBox{background:linear-gradient(160deg,#1c1612,#120e0b);border:1px solid var(--line,#3a2d22);border-radius:16px;padding:14px;margin:12px 0}
#buzon .bzK{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
#buzon .bzK button,.bzAd .bzK button{padding:8px 12px;border-radius:999px;font-size:16px;background:transparent;border:1px solid var(--line,#3a2d22);color:inherit}
#buzon .bzK button.on,.bzAd .bzK button.on{background:var(--gold,#e2ab2c);color:#0d0b09;border-color:var(--gold,#e2ab2c);font-weight:700}
#buzon textarea,.bzAd textarea{width:100%;min-height:110px;resize:vertical;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--line,#3a2d22);background:#0d0b09;color:inherit;font:inherit;font-size:17px}
#buzon .bzCnt{font-size:13px;opacity:.55;text-align:right;margin:2px 0 8px}
.bzMsg{background:#120e0b;border:1px solid var(--line,#3a2d22);border-radius:14px;padding:11px 13px;margin:9px 0}
.bzMsg.pend{border-left:4px solid var(--gold,#e2ab2c)}.bzMsg.done{border-left:4px solid #3fb86a}
.bzMsg small{opacity:.6;display:block;margin-bottom:4px}.bzMsg p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.bzRe{margin-top:9px;padding:9px 11px;border-radius:11px;background:rgba(226,171,44,.12);border:1px solid rgba(226,171,44,.35)}
.bzRe b{color:var(--gold,#e2ab2c)}
.bzAd .row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.bzAd textarea{min-height:70px}
.bzAd .bzMsg h4{margin:0 0 4px;font-size:18px}`;
  css.textContent += `#bzToast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,30px);opacity:0;pointer-events:none;background:#f6ecd8;color:#0d0b09;font:600 17px Barlow,sans-serif;padding:12px 18px;border-radius:14px;z-index:99999;max-width:88vw;text-align:center;transition:.25s}#bzToast.on{opacity:1;transform:translate(-50%,0)}`;
  document.head.appendChild(css);

  // ---------- Vista pública ----------
  let B = null, kind = 'sug', busy = false, sig = '', draft = '';
  const root = () => $('#bzRoot');
  const here = () => location.hash === '#buzon';
  async function api(u, m = 'GET', b) {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(d.error || 'Error'); return d;
  }
  let tt;
  function toast(t) {
    let el = $('#bzToast'); if (!el) { el = document.createElement('div'); el.id = 'bzToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600);
  }
  async function load(force) {
    if (!here() && !force) return;
    try { B = await api('/api/buzon?d=' + encodeURIComponent(dev)); } catch { return; }
    const s = JSON.stringify(B); if (s === sig && !force) return; sig = s;
    if (document.activeElement && ['bzTxt', 'bzName'].includes(document.activeElement.id)) return;   // no pisar lo que está escribiendo
    draw();
  }
  function draw() {
    const el = root(); if (!el || !B) return;
    const form = !B.me
      ? `<div class="bzBox"><b>Primero pon tu nombre</b><p class="sub" style="font-size:16px">Se usa el mismo nombre que en GarraBet, así sé quién me escribe.</p>
          <div class="row"><input id="bzName" maxlength="20" placeholder="Tu nombre" autocomplete="off"><button id="bzNameBtn">Guardar</button></div></div>`
      : B.off ? `<div class="bzBox">Tu nombre está desactivado por el admin.</div>`
      : `<div class="bzBox"><div>Escribiendo como <b>${E(B.me)}</b></div>
          <div class="bzK">${KINDS.map(([k, l]) => `<button type="button" data-k="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <textarea id="bzTxt" maxlength="600" placeholder="Cuéntame tu sugerencia, queja, duda... lo que sea">${E(draft)}</textarea>
          <div class="bzCnt"><span id="bzN">${draft.length}</span>/600</div>
          <button id="bzSend" style="width:100%">📮 Enviar</button></div>`;
    el.innerHTML = `<h2>📮 Sugerencias y quejas</h2><p class="sub">Escríbeme lo que quieras: ideas para la web, fallos, quejas o dudas. Te aviso aquí cuando te responda.</p>${form}
      ${B.items.length ? '<h3>Tus mensajes</h3>' + B.items.map(m => `<div class="bzMsg ${m.r ? 'done' : 'pend'}"><small>${KL[m.k] || ''} · ${when(m.d)} · ${m.r ? '✅ Respondido' : '⏳ Pendiente'}</small><p>${E(m.t)}</p>${m.r ? `<div class="bzRe"><b>Respuesta:</b> ${E(m.r)}</div>` : ''}</div>`).join('') : ''}`;
  }
  document.addEventListener('click', async e => {
    const k = e.target.closest('#buzon .bzK button'); if (k) { kind = k.dataset.k; const t = $('#bzTxt'); if (t) draft = t.value; draw(); return; }
    if (e.target.id === 'bzNameBtn') {
      try { await api('/api/garrabet/name', 'POST', { device: dev, name: $('#bzName').value }); try { lastJ = ''; } catch { } if (typeof window.load === 'function') window.load(); await load(true); toast('Nombre guardado'); } catch (x) { toast(x.message); }
    }
    if (e.target.id === 'bzSend' && !busy) {
      const t = $('#bzTxt').value; busy = true;
      try { await api('/api/buzon', 'POST', { device: dev, k: kind, t }); draft = ''; toast('📮 Enviado. ¡Gracias!'); await load(true); } catch (x) { toast(x.message); } finally { busy = false; }
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'bzTxt') { draft = e.target.value; const n = $('#bzN'); if (n) n.textContent = draft.length; } });
  addEventListener('hashchange', () => { if (here()) load(true); });
  setInterval(() => load(), 30000);
  if (here()) load(true);

  // ---------- Admin ----------
  let A = null, flt = 'pend';
  const pane = document.querySelector('.apane[data-ap=buzon]'), tabBtn = document.querySelector('.atab[data-at=buzon]');
  const ad = (u, m, b) => adm('/api/buzon-admin' + u, m, b);
  function aDraw() {
    const el = $('#bzAdmin'); if (!el || !A) return;
    const list = A.items.filter(m => flt === 'all' || (!m.ok && !m.r));
    el.innerHTML = `<div class="bzK"><button data-af="pend" class="${flt === 'pend' ? 'on' : ''}">Pendientes (${A.pend})</button><button data-af="all" class="${flt === 'all' ? 'on' : ''}">Todos (${A.items.length})</button></div>
      ${list.map(m => `<div class="bzMsg ${m.r || m.ok ? 'done' : 'pend'}" data-id="${m.id}"><h4>${E(m.name)}</h4><small>${KL[m.k] || ''} · ${when(m.d)}${m.ok && !m.r ? ' · ✅ Resuelto' : ''}</small><p>${E(m.t)}</p>
        <textarea placeholder="Tu respuesta (le llegará aviso)">${E(m.r)}</textarea>
        <div class="row"><button data-aa="reply">${m.r ? 'Actualizar respuesta' : 'Responder'}</button><button class="ghost" data-aa="ok">${m.ok ? 'Reabrir' : 'Marcar resuelto'}</button><button class="ghost" data-aa="del">Borrar</button></div></div>`).join('') || '<p>No hay mensajes.</p>'}`;
  }
  const badge = () => { if (tabBtn && A) tabBtn.textContent = '📮 Buzón' + (A.pend ? ' (' + A.pend + ')' : ''); };
  async function aLoad() { try { A = await ad(''); aDraw(); badge(); } catch (e) { const el = $('#bzAdmin'); if (el) el.innerHTML = '<p>' + E(e.message) + '</p>'; } }
  document.addEventListener('click', async e => {
    const f = e.target.closest('[data-af]'); if (f) { flt = f.dataset.af; aDraw(); return; }
    const b = e.target.closest('[data-aa]'); if (!b) return;
    const box = b.closest('.bzMsg'), id = box.dataset.id, m = A.items.find(x => x.id == id);
    try {
      if (b.dataset.aa === 'reply') { const r = box.querySelector('textarea').value; await ad('/' + id, 'PUT', { r }); toast(r ? 'Respuesta enviada' : 'Respuesta quitada'); }
      else if (b.dataset.aa === 'ok') await ad('/' + id, 'PUT', { ok: !m.ok });
      else if (b.dataset.aa === 'del') { if (!confirm('¿Borrar este mensaje?')) return; await ad('/' + id, 'DELETE'); }
      await aLoad();
    } catch (x) { toast(x.message); }
  });
  if (pane) new MutationObserver(() => { if (!pane.hidden) aLoad(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  // el número de pendientes se ve en la pestaña aunque no esté abierta
  setInterval(() => { if (typeof pw !== 'undefined' && pw && pane && pane.hidden) aLoad(); }, 60000);
})();
