// BUZÓN de sugerencias y quejas. Se conecta con el nombre de GarraBet (mismo dispositivo → mismo nombre) y avisa al admin con una notificación.
// Todo vive en db.buzon (una lista pequeña: id, uid, nombre, tipo, texto, fecha, respuesta). Cada persona solo ve sus mensajes; el admin ve todos.
module.exports = ({ app, getDb, save, admin, bad, gbUser, notifyAdmin, sendPush }) => {
  const KIND = { sug: '💡 Sugerencia', que: '😤 Queja', dud: '❓ Duda', otro: '💬 Otro' };
  const MAXLEN = 600, PER_DAY = 6, KEEP = 400;
  const B = () => { const d = getDb(); return d.buzon || (d.buzon = []); };
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const who = req => { const d = String(req.query.d || req.body.device || '').slice(0, 80); return d.length >= 8 ? gbUser(d) : null; };
  const out = m => ({ id: m.id, k: m.k, t: m.t, d: m.d, r: m.r || '', rd: m.rd || 0, ok: !!m.ok });

  app.get('/api/buzon', (req, res) => {
    const u = who(req);
    res.json({ me: u ? u.name : null, off: !!(u && u.disabled), kinds: KIND, items: u ? B().filter(m => m.u === u.id).sort((a, b) => b.d - a.d).map(out) : [] });
  });

  app.post('/api/buzon', async (req, res) => {
    const u = who(req);
    if (!u) return bad(res, 'Pon tu nombre de GarraBet para poder escribir');
    if (u.disabled) return bad(res, 'Tu nombre está desactivado por el admin');
    const t = clean(req.body.t, MAXLEN), k = KIND[req.body.k] ? req.body.k : 'otro';
    if (t.length < 3) return bad(res, 'Escribe algo (mínimo 3 letras)');
    const now = Date.now(), b = B();
    if (b.filter(m => m.u === u.id && now - m.d < 864e5).length >= PER_DAY) return bad(res, 'Has escrito muchos mensajes hoy: prueba mañana');
    const d = getDb(), m = { id: d.nextId++, u: u.id, nm: u.name, k, t, d: now };
    b.push(m);
    if (b.length > KEEP) { const i = b.findIndex(x => x.ok || x.r); b.splice(i >= 0 ? i : 0, 1); }   // para no engordar la base de datos: se borra el más viejo ya resuelto
    await save();
    res.json({ ok: true });
    notifyAdmin('📮 ' + KIND[k].slice(3) + ' de ' + u.name, t.slice(0, 140), 'adm-buzon-' + m.id);
  });

  // ---- Admin ----
  app.get('/api/buzon-admin', admin, (req, res) => {
    const b = B(), us = new Map((getDb().garrabet.users || []).map(u => [u.id, u.name]));
    res.json({ pend: b.filter(m => !m.ok && !m.r).length, kinds: KIND, items: b.slice().sort((a, c) => c.d - a.d).map(m => ({ ...out(m), name: us.get(m.u) || m.nm })) });
  });
  app.put('/api/buzon-admin/:id', admin, async (req, res) => {
    const m = B().find(x => x.id === +req.params.id);
    if (!m) return bad(res, 'Mensaje no encontrado');
    if (req.body.r != null) {
      m.r = clean(req.body.r, MAXLEN); m.rd = m.r ? Date.now() : 0;
      if (m.r) { m.ok = true; const u = (getDb().garrabet.users || []).find(x => x.id === m.u); if (u) sendPush('subs', JSON.stringify({ title: '📮 El admin te ha respondido', body: m.r.slice(0, 120), url: '/#buzon', tag: 'buzon-' + m.id }), s => s.device === u.device).catch(() => { }); }
    }
    if (req.body.ok != null) m.ok = !!req.body.ok;
    await save(); res.json({ ok: true });
  });
  app.delete('/api/buzon-admin/:id', admin, async (req, res) => {
    const d = getDb(); d.buzon = B().filter(x => x.id !== +req.params.id);
    await save(); res.json({ ok: true });
  });
};
