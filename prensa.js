// RUEDA DE PRENSA: previa (antes del partido) y post-partido (después). Lo escribe el admin; todo el mundo lo puede leer.
// Las dos conviven siempre (db.prensa = { previa:{...}, post:{...} }), así se ven ambas aunque el partido ya se haya jugado o todavía no.
module.exports = ({ app, getDb, save, admin, bad }) => {
  const MAXQ = 220, MAXR = 400, MAXN = 60, MAXRES = 20;
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const blank = () => ({ rival: '', pregunta: '', respuesta: '', portavoz: '', resultado: '', d: 0 });
  const P = () => {
    const d = getDb();
    if (!d.prensa || typeof d.prensa !== 'object') d.prensa = { previa: blank(), post: blank() };
    if (!d.prensa.previa || typeof d.prensa.previa !== 'object') d.prensa.previa = blank();
    if (!d.prensa.post || typeof d.prensa.post !== 'object') d.prensa.post = blank();
    return d.prensa;
  };
  const out = c => ({ rival: c.rival || '', pregunta: c.pregunta || '', respuesta: c.respuesta || '', portavoz: c.portavoz || '', resultado: c.resultado || '', d: c.d || 0 });
  const setFrom = (c, b) => {
    c.rival = clean(b.rival, MAXN);
    c.pregunta = clean(b.pregunta, MAXQ);
    c.respuesta = clean(b.respuesta, MAXR);
    c.portavoz = clean(b.portavoz, MAXN);
    c.resultado = clean(b.resultado, MAXRES);
    c.d = Date.now();
  };

  // ---- Público: solo lectura ----
  app.get('/api/prensa', (req, res) => {
    const p = P();
    res.json({ previa: out(p.previa), post: out(p.post) });
  });

  // ---- Admin ----
  app.get('/api/prensa-admin', admin, (req, res) => {
    const p = P();
    res.json({ previa: out(p.previa), post: out(p.post) });
  });

  app.post('/api/prensa-admin/:cual', admin, async (req, res) => {
    const cual = req.params.cual;
    if (cual !== 'previa' && cual !== 'post') return bad(res, 'Rueda de prensa no válida');
    const respuesta = clean(req.body.respuesta, MAXR);
    if (!respuesta) return bad(res, 'Escribe al menos la respuesta');
    const p = P();
    setFrom(p[cual], req.body);
    await save();
    res.json({ ok: true });
  });

  app.delete('/api/prensa-admin/:cual', admin, async (req, res) => {
    const cual = req.params.cual;
    if (cual !== 'previa' && cual !== 'post') return bad(res, 'Rueda de prensa no válida');
    const p = P();
    p[cual] = blank();
    await save();
    res.json({ ok: true });
  });
};
