// VESTUARIO: entre jornada y jornada, mensajes de los jugadores (al mister) y ofertas de otros equipos por nuestros jugadores.
// Lo escribe el admin (no los jugadores): todo vive en db.vestuario = { msgs: [], offers: [] }. Mismo almacenamiento que el resto (Upstash o disco): se guarda solo con save().
module.exports = ({ app, getDb, save, admin, bad }) => {
  const MSG_KINDS = { jugar: '🙋 Necesita jugar', debe: '💪 Cree que debe jugar', gracias: '🙏 Agradece la confianza', sueldo: '💶 Pide subida de sueldo', otro: '💬 Otro' };
  const MAXLEN = 300, KEEP = 150;
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const V = () => { const d = getDb(); if (!d.vestuario || typeof d.vestuario !== 'object') d.vestuario = { msgs: [], offers: [] }; if (!Array.isArray(d.vestuario.msgs)) d.vestuario.msgs = []; if (!Array.isArray(d.vestuario.offers)) d.vestuario.offers = []; return d.vestuario; };
  const player = id => (getDb().squad || []).find(p => p.id === +id);
  const outMsg = m => ({ id: m.id, playerId: m.playerId, playerName: m.playerName, k: m.k, t: m.t || '', d: m.d });
  const outOffer = o => ({ id: o.id, playerId: o.playerId, playerName: o.playerName, team: o.team, amount: o.amount || '', t: o.t || '', d: o.d });
  const trim = arr => { while (arr.length > KEEP) arr.pop(); };

  // ---- Público: solo lectura ----
  app.get('/api/vestuario', (req, res) => {
    const v = V();
    res.json({
      kinds: MSG_KINDS,
      msgs: v.msgs.slice().sort((a, b) => b.d - a.d).map(outMsg),
      offers: v.offers.slice().sort((a, b) => b.d - a.d).map(outOffer)
    });
  });

  // ---- Admin: mensajes de jugadores ----
  app.get('/api/vestuario-admin', admin, (req, res) => {
    const v = V();
    res.json({
      kinds: MSG_KINDS,
      msgs: v.msgs.slice().sort((a, b) => b.d - a.d).map(outMsg),
      offers: v.offers.slice().sort((a, b) => b.d - a.d).map(outOffer)
    });
  });

  app.post('/api/vestuario-admin/msg', admin, async (req, res) => {
    const p = player(req.body.playerId);
    if (!p) return bad(res, 'Elige un jugador de la plantilla');
    const k = MSG_KINDS[req.body.k] ? req.body.k : 'otro';
    const t = clean(req.body.t, MAXLEN);
    if (k === 'otro' && t.length < 2) return bad(res, 'Escribe el mensaje (o elige un tipo de frase hecha)');
    const d = getDb(), v = V();
    v.msgs.unshift({ id: d.nextId++, playerId: p.id, playerName: p.name, k, t, d: Date.now() });
    trim(v.msgs);
    await save();
    res.json({ ok: true });
  });

  app.delete('/api/vestuario-admin/msg/:id', admin, async (req, res) => {
    const v = V();
    v.msgs = v.msgs.filter(m => m.id !== +req.params.id);
    await save(); res.json({ ok: true });
  });

  // ---- Admin: ofertas de otros equipos por nuestros jugadores ----
  app.post('/api/vestuario-admin/oferta', admin, async (req, res) => {
    const p = player(req.body.playerId);
    if (!p) return bad(res, 'Elige un jugador de la plantilla');
    const team = clean(req.body.team, 60);
    if (!team) return bad(res, 'Pon el equipo que hace la oferta');
    const amount = clean(req.body.amount, 40), t = clean(req.body.t, MAXLEN);
    const d = getDb(), v = V();
    v.offers.unshift({ id: d.nextId++, playerId: p.id, playerName: p.name, team, amount, t, d: Date.now() });
    trim(v.offers);
    await save();
    res.json({ ok: true });
  });

  app.delete('/api/vestuario-admin/oferta/:id', admin, async (req, res) => {
    const v = V();
    v.offers = v.offers.filter(o => o.id !== +req.params.id);
    await save(); res.json({ ok: true });
  });
};
