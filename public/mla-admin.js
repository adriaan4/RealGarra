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
  // se actualiza el estado cuando se abre la pestaña «Más»
  new MutationObserver(() => { if (!pane.hidden) status(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  if (!pane.hidden) status();
})();
