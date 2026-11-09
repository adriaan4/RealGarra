// REAL GARRA FANTASY — front. Usa los ayudantes de la web (adm, S) solo en el panel de admin; todo lo demás es independiente.
(() => {
  const $ = s => document.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const E = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = n => Math.round(n * 10) / 10;
  const fm = n => r1(n).toFixed(1).replace('.', ',');                         // 12,4
  const M = n => fm(n) + ' M';
  const fp = n => { const r = r1(n); return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); };
  const POSL = { POR: 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: 'Delantero' };
  const gc = n => 'hsl(' + Math.round((n - 1) * 13) + ',78%,55%)';              // color de la nota: 1 rojo → 10 verde
  const ICON = {
    team: '<path d="M4 4h16v16H4z"/><path d="M4 12h16"/><circle cx="12" cy="12" r="3"/>',
    market: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>',
    rate: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    rank: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
    rules: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>'
  };
  const VER = '20261109c';
  const TABS = [['team', 'Equipo'], ['market', 'Mercado'], ['rate', 'Notas'], ['rank', 'Ranking'], ['rules', 'Reglas']];

  let tk = ''; try { tk = localStorage.getItem('fk') || ''; } catch { }
  let D = null, tab = 'team', filt = 'ALL', sort = 'pr', rsel = 'g', rview = 'u', pfilt = 'ALL', pend = {}, sig = '', busy = false, skew = 0, reloading = false;

  async function fapi(u, m = 'GET', b) {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'x-fk': tk }, body: b ? JSON.stringify(b) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Error');
    return d;
  }
  let tt;
  function toast(msg, err) {
    $('.fxToast')?.remove(); const t = document.createElement('div'); t.className = 'fxToast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); clearTimeout(tt); tt = setTimeout(() => t.remove(), 2600);
  }

  // ---------- datos derivados ----------
  const P = id => D.pl.find(p => p.id === id);
  const done = () => D.jor.filter(j => j.st === 'done');
  const openJ = () => D.jor.find(j => j.st === 'rate');
  const ranking = () => D.us.slice().sort((a, b) => b.pts - a.pts || b.val - a.val || a.name.localeCompare(b.name));
  // Foto de la plantilla (la misma de la pestaña Plantilla). Se muestra ENTERA (object-fit: contain), así nunca se corta la cabeza.
  // Sin foto: el círculo con el dorsal de siempre. Las fotos las sirve /api/squad-photo/:id con caché larga (?v= cambia al subir otra).
  const photo = p => p.ph ? '/api/squad-photo/' + p.id + '?v=' + p.ph : '';
  const av = (p, big) => p.ph ? `<span class="fxAv${big ? ' big' : ''}"><img loading="lazy" decoding="async" src="${photo(p)}" alt="${E(p.name)}"><i>${p.n}</i></span>` : `<span class="fxNum">${p.n}</span>`;
  const trend = p => { const d = r1(p.pr - p.pp); return d > 0 ? `<em class="up">▲ ${fm(d)}</em>` : d < 0 ? `<em class="dn">▼ ${fm(-d)}</em>` : '<em class="eq">—</em>'; };
  const pn = id => (P(id) || {}).name || '?';
  // Reloj del servidor: se guarda la diferencia con el del móvil y se quita del objeto para que no cambie la «firma» de los datos
  const take = d => { if (d && d.cfg && d.cfg.mkt) { skew = d.cfg.mkt.now - Date.now(); delete d.cfg.mkt.now; } return d; };
  const left = () => Math.max(0, D.cfg.mkt.end - (Date.now() + skew));
  const cd = () => { const t = Math.ceil(left() / 1000); return [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  // Formaciones «D-M-F» (siempre 1 portero): mismas reglas que el servidor, para avisar antes de pulsar
  const parseFm = s => { const m = /^(?:(\d{1,2})-)?(\d{1,2})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '')); return m ? { POR: m[1] ? +m[1] : 1, DEF: +m[2], MED: +m[3], DEL: +m[4] } : null; };
  // Reparto en el campo: cada jugador en su línea; los que sobran de una línea ocupan los huecos libres de otra (fuera de posición)
  const layout = (ids, q) => {
    const L = { POR: [], DEF: [], MED: [], DEL: [] }, over = [], by = { POR: [], DEF: [], MED: [], DEL: [] };
    const ps = D.me.ps || {}; ids.map(P).filter(Boolean).forEach(p => { const k = p.pos !== 'POR' && ps[p.id] ? ps[p.id] : p.pos; by[k].push(k !== p.pos ? Object.assign({}, p, { oop: 1 }) : p); });
    for (const k of ['POR', 'DEF', 'MED', 'DEL']) { L[k] = by[k].slice(0, q[k]); over.push(...by[k].slice(q[k])); }
    for (const k of ['MED', 'DEF', 'DEL', 'POR']) while (over.length && L[k].length < q[k]) L[k].push(Object.assign({}, over.shift(), { oop: 1 }));
    return L;
  };
  const pendingRate = () => { const j = openJ(); return j ? j.pl.filter(id => !D.mine[id]).length : 0; };

  // ---------- pantallas ----------
  function gate() {
    let c = ''; try { c = new URLSearchParams(location.search).get('fc') || ''; } catch { }
    return `<div class="fxGate"><img src="escudo.png" alt=""><div class="tagl">🔒 Acceso privado</div><h1>REAL GARRA<br>FANTASY</h1>
    <p>Al entrar recibes un equipo aleatorio de la plantilla del Garra y <b>40 M</b> para fichar: mejóralo, puntúa a tus compañeros tras cada partido y sube en la clasificación. Solo entra quien tenga un código de invitación.</p>
    <input id="fxCode" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código de invitación" value="${E(c)}">
    <input id="fxName" placeholder="Tu nombre fantasy" maxlength="16" autocomplete="off" aria-label="Nombre fantasy (distinto de tu usuario de GarraBet)">
    <button class="fxBtn" data-act="join">Entrar</button><div class="fxMsg" id="fxMsg" role="alert"></div>
    <small style="opacity:.55">Si vuelves a entrar con un código de recuperación del admin, no hace falta nombre.</small></div>`;
  }
  function top() {
    const r = ranking(), idx = r.findIndex(x => x.id === D.me.id), me = r[idx] || { pts: 0 }, tv = [...D.me.t, D.me.bn].filter(Boolean).map(P).filter(Boolean).reduce((s, p) => s + p.pr, 0);
    return `<div class="fxTop"><div class="fxHi"><img src="escudo.png" alt=""><div><small>Real Garra Fantasy</small><b>${E(D.me.name)}</b></div></div>
    <div class="fxStats"><div class="fxStat"><small>Valor plantilla</small><b>${fm(tv)}<span>M</span></b></div><div class="fxStat gold"><small>Presupuesto</small><b>${fm(D.me.b)}<span>M</span></b></div><div class="fxStat"><small>Patrimonio</small><b>${fm(tv + D.me.b)}<span>M</span></b></div><div class="fxStat"><small>Puntos</small><b>${fp(me.pts)}</b></div><div class="fxStat"><small>Puesto</small><b>${idx + 1}<span>/ ${r.length}</span></b></div></div></div>`;
  }
  const tok = (p, last) => `<button class="fxTok fxP-${p.pos}${p.oop ? ' oop' : ''}" data-act="pl" data-id="${p.id}" aria-label="${E(p.name)}, ${POSL[p.pos]}"><span class="sh${p.ph ? ' ph' : ''}">${p.ph ? `<img loading="lazy" decoding="async" src="${photo(p)}" alt=""><u>${p.n}</u>` : p.n}${last && last.pt && last.pt[p.id] != null ? `<span class="bd${last.pt[p.id] < 0 ? ' neg' : ''}">${fp(last.pt[p.id])}</span>` : ''}</span><b>${E(p.name)}</b><i>${M(p.pr)}</i></button>`;
  function viewTeam() {
    const mine = D.me.t.map(P).filter(Boolean), bn = D.me.bn ? P(D.me.bn) : null, last = done().slice(-1)[0], free = D.cfg.max - mine.length;
    const val = mine.reduce((s, p) => s + p.pr, 0) + (bn ? bn.pr : 0), q = parseFm(D.me.fm) || { POR: 1, DEF: 0, MED: 0, DEL: 0 };
    const L = layout(D.me.t, q);
    const lines = ['DEL', 'MED', 'DEF', 'POR'].map(pos => {
      const ps = L[pos], emp = Math.max(0, q[pos] - ps.length), n = ps.length + emp; if (!n) return '';
      return `<div class="fxLine${n >= 4 ? ' dense' : ''}">${ps.map(p => tok(p, last)).join('')}${Array.from({ length: emp }, () => `<button class="fxTok empty" data-act="slot" data-pos="${pos}" aria-label="Hueco libre de ${POSL[pos].toLowerCase()}: ir al mercado"><span class="sh">+</span><b>${POSL[pos]}</b></button>`).join('')}</div>`;
    }).join('');
    const fms = D.cfg.fms, all8 = [...D.me.t, D.me.bn].filter(Boolean).map(P).filter(Boolean);
    const bars = done(), sb = last && last.sb && last.sb[D.me.id], canUp = bn && free > 0;
    const mx = Math.max(1, ...bars.map(j => Math.abs((j.up || {})[D.me.id] || 0)));
    return `${mine.length ? '' : '<div class="fxNote">Tu equipo está vacío. Ve al <b>Mercado</b> y ficha a tus primeros jugadores: tienes ' + M(D.me.b) + '.</div>'}
    <div class="fxH2" style="margin:14px 2px 6px">Formación<small>${D.cfg.locked ? '🔒 bloqueada mientras se puntúa' : 'elige la que quieras'}</small></div>
    <div class="fxChips fxFm">${fms.map(k => `<button class="fxChip${k === D.me.fm ? ' on' : ''}" data-act="fm" data-k="${k}"${D.cfg.locked ? ' disabled' : ''} aria-label="Formación ${k}">${k}</button>`).join('')}</div>
    <div class="fxPitch" aria-label="Tu equipo">${lines}</div>
    ${all8.length > 1 ? `<div class="fxH2" style="margin:14px 2px 6px">Banquillo<small>${D.cfg.locked ? '🔒 bloqueado' : 'elige quién es tu suplente'}</small></div>
    <div class="fxChips fxFm">${all8.map(p => `<button class="fxChip${D.me.bn === p.id ? ' on' : ''}" ${D.me.bn === p.id ? '' : `data-act="swap" data-id="${p.id}"`}${D.cfg.locked ? ' disabled' : ''} aria-label="Suplente: ${E(p.name)}">${E(p.name)}</button>`).join('')}</div>` : ''}
    <div class="fxBench bn"><small>🪑 Suplente (8.º jugador) · puntúa <b>solo si entra</b>: sustituye a un titular de su posición que no juegue</small>${bn ? tok(bn) : '<button class="fxTok empty" data-act="go" data-t="market"><span class="sh">+</span><b>Libre</b></button>'}${bn ? '<small>Toca al jugador para meterlo en el campo</small>' : ''}${canUp ? `<small class="fxWarn">⚠️ Tienes ${free} hueco${free > 1 ? 's' : ''} en el campo: sube a ${E(bn.name)} para que puntúe</small>` : ''}${sb ? `<small class="fxWarn">🔄 En la J${last.j} entró ${E(pn(sb[1]))} por ${E(pn(sb[0]))} (no jugó)</small>` : ''}</div>
    <div class="fxBench"><small>${free > 0 ? free + ' hueco' + (free > 1 ? 's' : '') + ' libre' + (free > 1 ? 's' : '') + ' en el campo (toca el +)' : 'Campo completo (' + D.cfg.max + ' titulares)'}${bn ? '' : ' · suplente libre'} · valor del equipo ${M(val)}</small>${last ? `<small>🟡 La insignia de cada jugador son sus puntos en la J${last.j}</small>` : ''}</div>
    <div class="fxH2">Mis puntos por jornada</div>
    ${bars.length ? `<div class="fxBars">${bars.map(j => { const v = (j.up || {})[D.me.id] || 0; return `<div><b>${fp(v)}</b><i style="height:${Math.max(4, Math.abs(v) / mx * 62)}px"></i><small>J${j.j}</small></div>`; }).join('')}</div>` : '<p class="sub" style="font-size:16px">Aún no hay jornadas puntuadas. Aquí verás tus puntos tras cada partido.</p>'}`;
  }
  function viewMarket() {
    const owned = new Set([...D.me.t, D.me.bn].filter(Boolean)), cap = D.cfg.max + 1, full = owned.size >= cap, off = new Set(D.cfg.mkt.ids);
    let list = D.pl.filter(p => (off.has(p.id) || owned.has(p.id)) && (filt === 'ALL' || p.pos === filt));
    list.sort(sort === 'pr' ? (a, b) => b.pr - a.pr : sort === 'av' ? (a, b) => (b.av ?? -1) - (a.av ?? -1) || b.pr - a.pr : (a, b) => b.tn - a.tn || b.pr - a.pr);
    const nU = Math.max(1, D.us.length);
    return `${D.cfg.locked ? '<div class="fxNote lock">🔒 <b>Mercado cerrado</b> mientras se juega y se puntúa la jornada. Se reabre al cerrarla, con los precios nuevos.</div>' : '<div class="fxNote">💶 Tienes <b>' + M(D.me.b) + '</b> · plantilla <b>' + owned.size + '/' + cap + '</b> (' + D.cfg.max + ' titulares + suplente)' + (full ? ' — <b>está llena: vende a alguien para poder fichar</b>' : '') + '. Vendes al precio actual: si un jugador sube, ganas.</div>'}
    <div class="fxNote fxCdN">⏳ Hoy hay <b>${off.size}</b> jugadores a la venta. La lista se renueva en <b class="fxCd" id="fxCd">${cd()}</b>. Si vendes a alguien, vuelve a la lista de hoy.</div>
    <div class="fxChips">${['ALL', 'POR', 'DEF', 'MED', 'DEL'].map(k => `<button class="fxChip${filt === k ? ' on' : ''}" data-act="filt" data-k="${k}">${k === 'ALL' ? 'Todos' : POSL[k] + 's'}</button>`).join('')}</div>
    <div class="fxChips">${[['pr', '💶 Precio'], ['av', '⭐ Nota'], ['tn', '👥 Más fichados']].map(([k, l]) => `<button class="fxChip${sort === k ? ' on' : ''}" data-act="sort" data-k="${k}">${l}</button>`).join('')}</div>
    ${list.map(p => { const own = owned.has(p.id), dis = D.cfg.locked || (!own && (full || D.me.b < p.pr));
      return `<div class="fxRow fxP-${p.pos}${own ? ' mine' : ''}">${av(p)}
      <div class="fxNm" data-act="pl" data-id="${p.id}" role="button" tabindex="0"><b>${E(p.name)}</b><small><u>${POSL[p.pos]}</u> · ${p.av != null ? '⭐ ' + fm(p.av) : 'sin nota'} · 👥 ${Math.round(p.tn / nU * 100)}%${D.me.bn === p.id ? ' · 🪑 suplente' : ''}${own && !off.has(p.id) ? ' · ya no está en venta' : ''}</small></div>
      <div class="fxPr"><b>${M(p.pr)}</b>${trend(p)}</div>
      <button class="act${own ? ' sell' : ''}" data-act="${own ? 'sell' : 'buy'}" data-id="${p.id}"${dis ? ' disabled' : ''}>${own ? 'Vender' : D.cfg.locked ? 'Cerrado' : full ? 'Llena' : D.me.b < p.pr ? 'Sin saldo' : 'Fichar'}</button></div>`; }).join('') || '<div class="fxNote">No hay jugadores de esa posición en el mercado de hoy.</div>'}`;
  }
  function viewRate() {
    const j = openJ();
    if (!j) return `<div class="fxNote">⭐ No hay ninguna jornada abierta para puntuar. Cuando el admin la abra aparecerán aquí los jugadores que han jugado para que les pongas nota.</div>
      ${done().length ? '<button class="fxBtn sm" data-act="go" data-t="rank">Ver resultados</button>' : ''}`;
    const pl = j.pl.map(P).filter(Boolean), n = Object.keys(pend).length;
    return `<div class="fxH2">Jornada ${j.j}<small>vs ${E(j.rival || 'rival')}</small></div>
    <div class="fxNote">Pon nota del <b>1 al 10</b> a cada jugador. <b>Solo una nota por jugador</b>: una vez enviada no se puede cambiar. Las notas mueven los puntos y el precio.</div>
    ${pl.map(p => { const m = D.mine[p.id];
      return `<div class="fxRate fxP-${p.pos}" data-p="${p.id}"><div class="hd">${av(p)}<div class="fxNm"><b>${E(p.name)}</b><small><u>${POSL[p.pos]}</u> · ${j.n && j.n[p.id] ? j.n[p.id] + ' nota' + (j.n[p.id] > 1 ? 's' : '') : 'sin notas aún'}</small></div>
      ${m ? `<span class="fxDone" style="--gc:${gc(m)}">🔒 ${m}</span>` : ''}</div>
      ${m ? '' : `<div class="fxGs">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => `<button class="fxG${pend[p.id] === g ? ' on' : ''}" style="--gc:${gc(g)}" data-act="g" data-p="${p.id}" data-n="${g}" aria-label="Nota ${g} a ${E(p.name)}">${g}</button>`).join('')}</div>`}</div>`; }).join('') || '<p class="sub">El admin aún no ha marcado quién ha jugado.</p>'}
    <div class="fxSend"><button class="fxBtn" data-act="send" id="fxSend"${n ? '' : ' disabled'}>${n ? 'Enviar ' + n + ' nota' + (n > 1 ? 's' : '') : (pendingRate() ? 'Elige una nota' : '✔ Ya has puntuado a todos')}</button></div>`;
  }
  function viewRank() {
    const dj = done(), sel = rsel === 'g' || !dj.some(j => j.j === rsel) ? 'g' : rsel;
    const chips = `<div class="fxChips"><button class="fxChip${sel === 'g' ? ' on' : ''}" data-act="rsel" data-k="g">General</button>${dj.map(j => `<button class="fxChip${sel === j.j ? ' on' : ''}" data-act="rsel" data-k="${j.j}">J${j.j}</button>`).join('')}</div>`;
    const tg = `<div class="fxChips">${[['u', '👥 Participantes'], ['p', '⚽ Jugadores']].map(([k, l]) => `<button class="fxChip${rview === k ? ' on' : ''}" data-act="rview" data-k="${k}">${l}</button>`).join('')}</div>`;
    if (rview === 'p') return tg + chips + viewPlayers(sel, dj);
    let rows, extra = '';
    if (sel === 'g') rows = ranking().map(u => ({ u, v: u.pts, sub: 'Patrimonio ' + M(u.val) }));
    else {
      const j = dj.find(x => x.j === sel);
      rows = D.us.filter(u => j.up && u.id in j.up).map(u => ({ u, v: j.up[u.id], sub: '' })).sort((a, b) => b.v - a.v || a.u.name.localeCompare(b.u.name));
      const best = j.pl.map(id => ({ p: P(id), pt: (j.pt || {})[id] || 0, ra: (j.ra || {})[id] })).filter(x => x.p).sort((a, b) => b.pt - a.pt).slice(0, 6);
      extra = `<div class="fxH2">Mejores de la J${j.j}<small>vs ${E(j.rival)}${j.gc != null ? ' · ' + j.gc + ' GC' : ''}</small></div>` + best.map(x => `<div class="fxRow fxP-${x.p.pos}">${av(x.p)}<div class="fxNm"><b>${E(x.p.name)}</b><small>${x.ra ? '⭐ ' + fm(x.ra[0]) + ' (' + x.ra[1] + ' notas)' : 'sin notas'}${(j.mv || {})[x.p.id] ? ' · 🏆 ' + j.mv[x.p.id] + ' MVP' : ''}</small></div><div class="fxPr"><b>${fp(x.pt)}</b><em class="eq">pts</em></div><span></span></div>`).join('');
    }
    if (!rows.length) return tg + chips + '<div class="fxNote">Todavía no hay jornadas puntuadas. Cuando el admin cierre la primera, aquí aparecerá la clasificación.</div>' + (sel === 'g' ? '' : extra);
    // el mismo puesto para los empates
    let pos = 0, prev = null; rows.forEach((r, i) => { if (prev === null || r.v !== prev) pos = i + 1; r.pos = pos; prev = r.v; });
    const pod = rows.length >= 3 && rows[0].v > 0 ? `<div class="fxPod">${[1, 0, 2].map(i => { const r = rows[i]; return `<div class="${i === 0 ? 'm1' : ''}${r.u.id === D.me.id ? ' me' : ''}" data-act="usr" data-id="${r.u.id}"><span class="mdl">${['🥇', '🥈', '🥉'][i]}</span><b>${E(r.u.name)}</b><span class="fxPts">${fp(r.v)}</span><small>puntos</small></div>`; }).join('')}</div>` : '';
    return tg + chips + pod + rows.slice(pod ? 3 : 0).map(r => `<div class="fxRk${r.u.id === D.me.id ? ' me' : ''}" data-act="usr" data-id="${r.u.id}" role="button" tabindex="0"><span class="pos">${r.pos}</span><div><b>${E(r.u.name)}</b><small>${r.sub || 'Jornada ' + sel}</small></div><span class="fxPts">${fp(r.v)}<small>pts</small></span></div>`).join('') + extra;
  }
  // Ranking de jugadores: puntos de Fantasy de cada jugador (de la temporada o de una jornada), de más a menos
  function viewPlayers(sel, dj) {
    if (!dj.length) return '<div class="fxNote">Todavía no hay jornadas puntuadas. Cuando el admin cierre la primera, aquí verás qué jugadores suman más puntos.</div>';
    const st = {};
    (sel === 'g' ? dj : dj.filter(j => j.j === sel)).forEach(j => j.pl.forEach(id => {
      const p = P(id); if (!p) return; const e = st[id] || (st[id] = { p, v: 0, pj: 0, g: 0, a: 0, ra: 0, rn: 0, mv: 0 }), s = (j.s || {})[id], ra = (j.ra || {})[id];
      e.v += (j.pt || {})[id] || 0; e.pj++; if (s) { e.g += s[0]; e.a += s[1]; } if (ra) { e.ra += ra[0]; e.rn++; } e.mv += (j.mv || {})[id] || 0;
    }));
    const rows = Object.values(st).filter(e => pfilt === 'ALL' || e.p.pos === pfilt);
    rows.forEach(e => { e.v = r1(e.v); e.avg = e.pj ? e.v / e.pj : 0; e.nt = e.rn ? e.ra / e.rn : null; });
    rows.sort((a, b) => b.v - a.v || b.avg - a.avg || (b.nt ?? 0) - (a.nt ?? 0) || a.p.name.localeCompare(b.p.name));
    let pos = 0, prev = null; rows.forEach((r, i) => { if (prev === null || r.v !== prev) pos = i + 1; r.pos = pos; prev = r.v; });
    const pf = `<div class="fxChips">${['ALL', 'POR', 'DEF', 'MED', 'DEL'].map(k => `<button class="fxChip${pfilt === k ? ' on' : ''}" data-act="pfilt" data-k="${k}">${k === 'ALL' ? 'Todos' : POSL[k] + 's'}</button>`).join('')}</div>`;
    return pf + (rows.map(r => {
      const sub = [sel === 'g' ? r.pj + ' partido' + (r.pj === 1 ? '' : 's') + ' · ⌀ ' + fp(r.avg) + ' pts' : '', r.nt != null ? '⭐ ' + fm(r.nt) : '', r.g ? '⚽ ' + r.g : '', r.a ? '🅰️ ' + r.a : '', r.mv ? '🏆 ' + r.mv : ''].filter(Boolean).join(' · ');
      return `<div class="fxRow pk fxP-${r.p.pos}" data-act="pl" data-id="${r.p.id}" role="button" tabindex="0"><span class="pos">${r.pos <= 3 && r.v > 0 && rows.filter(x => x.pos === r.pos).length <= 2 ? ['🥇', '🥈', '🥉'][r.pos - 1] : r.pos}</span>${av(r.p)}<div class="fxNm"><b>${E(r.p.name)}</b><small><u>${POSL[r.p.pos]}</u>${sub ? ' · ' + sub : ''}</small></div><div class="fxPr"><b>${fp(r.v)}</b><em class="eq">pts</em></div></div>`;
    }).join('') || '<div class="fxNote">Ningún jugador de esa posición ha puntuado todavía.</div>') + '<p class="sub" style="font-size:14px;margin-top:12px;text-align:center">Puntos de Fantasy de cada jugador. Solo salen los que han jugado. Toca uno para ver su ficha.</p>';
  }
  function viewRules() {
    const R = D.cfg.rules;
    return `<div class="fxH2">Cómo funciona</div><ul class="fxRules">
    <li>💶 Recibes un <b>equipo aleatorio</b> al entrar y empiezas con <b>${D.cfg.budget} M</b> de presupuesto para fichar. Tu alineación son <b>${D.cfg.max} titulares + 1 suplente</b> (hasta ${D.cfg.max + 1} de la plantilla del Garra). Varios participantes pueden fichar al mismo jugador.</li>
    <li>📋 <b>Formaciones:</b> elige cómo juegas (${D.cfg.fms.join(', ')}: defensas-medios-delanteros, siempre con 1 portero). Puedes cambiarla cuando quieras: cada jugador va a su línea y, si en una línea sobran, ocupan huecos libres de otra (fuera de posición; puntúan igual por lo que hagan). Tú eliges también quién es tu suplente. La alineación solo se toca con el mercado abierto: al cerrarse la jornada cuenta la que tengas en ese momento.</li>
    <li>🪑 <b>Suplente (el 8.º jugador):</b> no puntúa mientras está en el banco, pero si un titular no juega el partido y el suplente sí, <b>entra automáticamente por él</b> (mejor por uno de su misma posición; si no hay, por cualquiera que no jugara). Si no hace falta, no suma.</li>
    <li>⭐ <b>Las notas mandan.</b> Tras cada partido todos puntúan del 1 al 10 a los que han jugado (una nota por persona y jugador). Cada punto de media por encima de 5 suma <b>${R.rate}</b> puntos (y por debajo, resta).</li>
    <li>⚽ <b>Estadísticas:</b> jugar +${R.play} · gol (portero ${R.GOAL.POR}, defensa ${R.GOAL.DEF}, medio ${R.GOAL.MED}, delantero ${R.GOAL.DEL}) · asistencia +${R.assist} · amarilla ${R.yellow} · roja ${R.red}.</li>
    <li>🧤 <b>Portería a cero:</b> portero +${R.CS.POR}, defensas +${R.CS.DEF}, medios +${R.CS.MED}.</li>
    <li>🏆 <b>MVP de la web:</b> el más votado en la pestaña MVP gana +${R.mvp} y quien reciba algún voto +${R.mvp2}.</li>
    <li>📈 <b>Precios dinámicos:</b> al cerrar cada jornada el precio se mueve con la nota media: una media de 8 sube ~12 %, de 4 baja ~12 % (tope ±15 %). El 6 es neutro.</li>
    <li>🛒 <b>Mercado cada 24 h:</b> cada día sale a la venta una selección de jugadores (la misma para todos) y solo puedes fichar a los que estén en ella. La lista se renueva sola cada 24 h. Si vendes a alguien, vuelve a la lista de hoy. Vendes al precio del momento.</li>
    <li>🔒 El mercado y la alineación se cierran mientras se puntúa la jornada y se reabren al cerrarla.</li>
    <li>📊 <b>Ranking de jugadores:</b> en Ranking → Jugadores ves quién suma más puntos, en toda la temporada o en cada jornada.</li>
    <li>🏁 Tu puntuación de cada jornada es la suma de los puntos de tus titulares (y del suplente si ha entrado).</li></ul>
    <p style="text-align:center;margin-top:22px"><small style="opacity:.45">Fantasy v${VER}</small><br><button class="fxLink" data-act="logout">Salir de Fantasy en este dispositivo</button></p>`;
  }
  const VIEWS = { team: viewTeam, market: viewMarket, rate: viewRate, rank: viewRank, rules: viewRules };

  function paintBar() {
    $('#fxBar').innerHTML = TABS.map(([k, l]) => `<button class="fxTab${tab === k ? ' on' : ''}" data-act="go" data-t="${k}" aria-label="${l}">${k === 'rate' && pendingRate() ? '<span class="dot"></span>' : ''}<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>${l}</button>`).join('');
  }
  function draw() {
    const root = $('#fxRoot'); if (!root) return;
    if (!D) { root.innerHTML = gate(); $('#fxBar').classList.remove('on'); return; }
    $('#fxBar').classList.add('on'); paintBar();
    root.innerHTML = top() + VIEWS[tab]();
  }

  // ---------- hojas inferiores ----------
  function sheet(html) {
    closeSheet(); const o = document.createElement('div'); o.className = 'fxOv'; o.innerHTML = `<div class="fxSheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    o.addEventListener('click', e => { if (e.target === o) closeSheet(); }); document.body.appendChild(o);
  }
  const closeSheet = () => $('.fxOv')?.remove();
  function sheetPlayer(id) {
    const p = P(id); if (!p) return;
    const t = D.me.t, off = D.cfg.mkt.ids.includes(id), isT = t.includes(id), isB = D.me.bn === id, own = isT || isB, hist = done().filter(j => j.pl.includes(id)).reverse(), dis = D.cfg.locked || (!own && (!off || (t.length >= D.cfg.max && !!D.me.bn) || D.me.b < p.pr));
    const lineup = !own ? '' : D.cfg.locked ? '<p class="sub" style="font-size:15px">🔒 Alineación bloqueada mientras se puntúa la jornada.</p>'
      : isT ? `<button class="fxBtn alt" data-act="swap" data-id="${id}" data-close="1">${D.me.bn ? '🔄 Cambiar por ' + E(pn(D.me.bn)) + ' (suplente)' : '🪑 Mandar al banquillo'}</button>`
      : t.length < D.cfg.max ? `<button class="fxBtn alt" data-act="swap" data-id="${id}" data-close="1">⬆️ Subir al campo</button>`
      : `<div class="fxH2" style="margin:4px 0 8px">⬆️ Subir al campo: ¿a quién sustituye?</div><div class="fxSwap">${t.map(x => `<button class="fxBtn alt sm" data-act="swap" data-id="${id}" data-out="${x}" data-close="1">${E(pn(x))}</button>`).join('')}</div>`;
    const eff = (D.me.ps || {})[id] || p.pos;
    const posBtns = !own || D.cfg.locked || p.pos === 'POR' ? '' : `<div class="fxH2" style="margin:14px 0 8px">📍 Colocar en el campo como<small>${eff !== p.pos ? 'fuera de su posición' : 'su posición natural'}</small></div><div class="fxSwap">${['DEF', 'MED', 'DEL'].map(k => `<button class="fxBtn alt sm${eff === k ? ' on' : ''}" data-act="pos" data-id="${id}" data-k="${k}" data-close="1"${eff === k ? ' disabled' : ''}>${POSL[k]}</button>`).join('')}</div>${eff !== p.pos ? `<button class="fxLink" data-act="pos" data-id="${id}" data-k="" data-close="1" style="margin-top:6px">Volver a ${POSL[p.pos].toLowerCase()}</button>` : ''}`;
    const g = hist.reduce((s, j) => s + (((j.s || {})[id] || [0])[0] || 0), 0);
    sheet(`${p.ph ? `<div class="fxPhBig fxP-${p.pos}"><img src="${photo(p)}" alt="${E(p.name)}"></div>` : ''}<h3 class="fxP-${p.pos}"><span style="color:var(--c)">${p.n}</span> ${E(p.name)}</h3><small style="opacity:.7">${POSL[p.pos]}</small>
    <div class="fxKv"><div><small>Precio</small><b>${M(p.pr)}</b></div><div><small>Tendencia</small><b>${trend(p)}</b></div><div><small>Nota media</small><b>${p.av != null ? fm(p.av) : '—'}</b></div></div>
    ${hist.length ? `<div class="fxH2" style="margin-top:6px">Sus jornadas<small>${g} gol${g === 1 ? '' : 'es'}</small></div>` + hist.map(j => { const ra = (j.ra || {})[id]; return `<div class="fxRk" style="cursor:default;grid-template-columns:44px 1fr auto"><span class="pos">J${j.j}</span><div><small>vs ${E(j.rival)}</small>${ra ? '⭐ ' + fm(ra[0]) + ' <small style="display:inline">(' + ra[1] + ')</small>' : 'sin notas'}</div><span class="fxPts">${fp((j.pt || {})[id] || 0)}<small>pts</small></span></div>`; }).join('') : '<p class="sub" style="font-size:16px">Todavía no ha puntuado en ninguna jornada.</p>'}
    ${isB ? '<p class="sub" style="font-size:15px;margin-top:10px">🪑 Es tu suplente: <b>solo puntúa si entra</b> por un titular de su posición que no juegue (o si lo subes al campo).</p>' : ''}
    ${lineup ? '<div style="margin-top:14px">' + lineup + '</div>' : ''}
    ${posBtns}
    <div style="margin-top:16px"><button class="fxBtn" data-act="${own ? 'sell' : 'buy'}" data-id="${id}" data-close="1"${dis ? ' disabled' : ''}>${own ? 'Vender por ' + M(p.pr) : !off ? 'No está en el mercado de hoy' : 'Fichar por ' + M(p.pr)}</button></div>`);
  }
  function sheetUser(id) {
    const u = D.us.find(x => x.id === id); if (!u) return;
    const j = rsel !== 'g' ? done().find(x => x.j === rsel) : null, last = done().slice(-1)[0], jj = j || last;
    const pl = u.t.map(P).filter(Boolean).sort((a, b) => ((jj && jj.pt || {})[b.id] || 0) - ((jj && jj.pt || {})[a.id] || 0));
    const ub = u.bn ? P(u.bn) : null;
    const usb = jj && jj.sb && jj.sb[u.id];
    sheet(`<h3>${E(u.name)}</h3><small style="opacity:.7">${fp(u.pts)} pts · patrimonio ${M(u.val)} · formación ${E(u.fm || '')}${jj ? ' · puntos de la J' + jj.j : ''}</small>${usb ? `<p class="sub" style="font-size:15px;margin:8px 0 0">🔄 En la J${jj.j} entró ${E(pn(usb[1]))} por ${E(pn(usb[0]))}</p>` : ''}
    ${pl.map(p => `<div class="fxRow fxP-${p.pos}" style="grid-template-columns:auto 1fr auto">${av(p)}<div class="fxNm"><b>${E(p.name)}</b><small><u>${POSL[p.pos]}</u> · ${M(p.pr)}</small></div><div class="fxPr"><b>${jj && jj.pt && jj.pt[p.id] != null ? fp(jj.pt[p.id]) : '—'}</b></div></div>`).join('') || '<p class="sub">Aún no tiene jugadores.</p>'}
    ${ub ? `<div class="fxH2" style="margin-top:10px">🪑 Suplente<small>entra si un titular no juega</small></div><div class="fxRow fxP-${ub.pos}" style="grid-template-columns:auto 1fr auto;opacity:.6">${av(ub)}<div class="fxNm"><b>${E(ub.name)}</b><small><u>${POSL[ub.pos]}</u> · ${M(ub.pr)}</small></div><div class="fxPr"><b>—</b></div></div>` : ''}`);
  }

  // ---------- acciones ----------
  async function act(b) {
    const a = b.dataset.act, id = +b.dataset.id;
    if (a === 'go') { tab = b.dataset.t; draw(); scrollTo(0, 0); return; }
    if (a === 'filt') { filt = b.dataset.k; draw(); return; }
    if (a === 'sort') { sort = b.dataset.k; draw(); return; }
    if (a === 'rsel') { rsel = b.dataset.k === 'g' ? 'g' : +b.dataset.k; draw(); return; }
    if (a === 'rview') { rview = b.dataset.k; draw(); return; }
    if (a === 'pfilt') { pfilt = b.dataset.k; draw(); return; }
    if (a === 'slot') { filt = b.dataset.pos; tab = 'market'; draw(); scrollTo(0, 0); return; }
    if (a === 'pl') return sheetPlayer(id);
    if (a === 'usr') return sheetUser(id);
    if (a === 'g') { // nota elegida: se marca sin repintar todo (la pantalla no salta)
      const p = +b.dataset.p, n = +b.dataset.n; if (pend[p] === n) delete pend[p]; else pend[p] = n;
      $$('.fxG', b.closest('.fxGs')).forEach(x => x.classList.toggle('on', pend[p] === +x.dataset.n));
      const c = Object.keys(pend).length, s = $('#fxSend'); s.disabled = !c; s.textContent = c ? 'Enviar ' + c + ' nota' + (c > 1 ? 's' : '') : 'Elige una nota'; return;
    }
    if (a === 'logout') { if (!confirm('¿Salir de Fantasy en este dispositivo? Para volver a entrar necesitarás un código de recuperación del admin.')) return; try { localStorage.removeItem('fk'); } catch { } tk = ''; D = null; sig = ''; draw(); return; }
    if (busy) return; busy = true; b.disabled = true;
    try {
      if (a === 'join') {
        const code = $('#fxCode').value, name = $('#fxName').value;
        const r = await fapi('/api/fantasy/join', 'POST', { code, name }); tk = r.tk; try { localStorage.setItem('fk', tk); } catch { }
        D = take(await fapi('/api/fantasy')); tab = 'team'; draw(); toast('¡Bienvenido a Fantasy! 🦁');
      } else if (a === 'buy' || a === 'sell') {
        const p = P(id), r = await fapi('/api/fantasy/' + a, 'POST', { pid: id }), note = r.note; delete r.note; D = take(r); sig = JSON.stringify(D);
        if (b.dataset.close) closeSheet(); draw(); toast(a === 'buy' ? '✅ Fichado ' + p.name + ' por ' + M(p.pr) + (note ? ' · ' + note : '') : '💶 Vendido ' + p.name + ' por ' + M(p.pr));
      } else if (a === 'swap') {
        const r = await fapi('/api/fantasy/swap', 'POST', { pid: id, out: +b.dataset.out || 0 }), note = r.note; delete r.note; D = take(r); sig = JSON.stringify(D);
        if (b.dataset.close) closeSheet(); draw(); toast('🔄 Alineación actualizada' + (note ? ' · ' + note : ''));
      } else if (a === 'pos') {
        const r = await fapi('/api/fantasy/pos', 'POST', { pid: id, pos: b.dataset.k || '' }); D = take(r); sig = JSON.stringify(D);
        if (b.dataset.close) closeSheet(); draw(); toast('📍 ' + pn(id) + (b.dataset.k ? ' ahora juega de ' + POSL[b.dataset.k].toLowerCase() : ' vuelve a su posición'));
      } else if (a === 'fm') {
        const r = await fapi('/api/fantasy/formation', 'POST', { fm: b.dataset.k }); D = take(r); sig = JSON.stringify(D); draw(); toast('📋 Formación ' + D.me.fm);
      } else if (a === 'send') {
        const j = openJ(), r = await fapi('/api/fantasy/rate', 'POST', { j: j.j, r: pend }); pend = {}; D = take(r); sig = JSON.stringify(D); draw(); toast('✅ ' + r.saved + ' nota' + (r.saved > 1 ? 's' : '') + ' enviada' + (r.saved > 1 ? 's' : ''));
      }
    } catch (e) {
      if ($('#fxMsg')) $('#fxMsg').textContent = e.message; else toast(e.message, true);
    } finally { busy = false; b.disabled = false; }
  }
  document.addEventListener('click', e => { const b = e.target.closest('#fantasy [data-act],.fxOv [data-act]'); if (b) { if (b.closest('.fxOv') && ['go', 'pl'].includes(b.dataset.act)) closeSheet(); act(b); } });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('#fantasy [role=button]')) { e.preventDefault(); act(e.target); } if (e.key === 'Escape') closeSheet(); if (e.key === 'Enter' && e.target.matches('#fxCode,#fxName')) $('[data-act=join]')?.click(); });

  async function load(force) {
    if (!tk) { if (force || D) { D = null; draw(); } else if (!$('#fxRoot').innerHTML) draw(); return; }
    try {
      const d = take(await fapi('/api/fantasy')), s = JSON.stringify(d);
      if (!d.me) { try { localStorage.removeItem('fk'); } catch { } tk = ''; D = null; draw(); return; }
      if (s === sig && D && !force) return; sig = s; D = d; if (!$('.fxOv')) draw();
    } catch (e) { if (!D) { $('#fxRoot').innerHTML = '<div class="fxNote lock">No se pudo cargar Fantasy: ' + E(e.message) + '</div>'; } }
  }
  const here = () => (location.hash || '').slice(1) === 'fantasy';
  // cuenta atrás del mercado: se actualiza cada segundo sin repintar; al llegar a 0 se pide la lista nueva
  setInterval(() => {
    if (!D || !D.cfg || !D.cfg.mkt || !here()) return;
    const e = $('#fxCd'); if (e) e.textContent = cd();
    if (left() <= 0 && !reloading) { reloading = true; load(true).finally(() => setTimeout(() => { reloading = false; }, 5000)); }
  }, 1000);
  addEventListener('hashchange', () => { if (here()) load(true); });
  setInterval(() => { if (here() && !document.hidden && !$('.fxOv') && !Object.keys(pend).length) load(); }, 40000);
  if (here()) load(true); else { const r = $('#fxRoot'); if (r && !r.innerHTML) draw(); }

  // =====================================================================
  //  ADMIN
  // =====================================================================
  let A = null, openK = new Set();
  const ad = (u, m, b) => adm('/api/fantasy-admin' + u, m, b);
  const msg = t => { const m = $('#amsg'); if (m) m.textContent = t; };
  async function aLoad() { try { A = await ad('/all'); aDraw(); } catch (e) { const r = $('#fxAdmin'); if (r) r.innerHTML = '<p class="msg">' + E(e.message) + '</p>'; } }
  let fresh = new Set();
  const shareText = c => '🦁 ¡Únete a mi liga Fantasy de Garra!\nEntra con este enlace: ' + invite(c) + '\nTu código de invitación: ' + c + '';
  const invite = c => location.origin + '/?fc=' + c + '#fantasy';
  const dt = n => n;
  function aDraw() {
    const root = $('#fxAdmin'); if (!root || !A) return;
    $$('details[data-k]', root).forEach(d => { if (d.open) openK.add(d.dataset.k); else openK.delete(d.dataset.k); });
    const O = k => openK.has(k) ? ' open' : '';
    const used = new Set(A.jor.map(j => j.j)), cal = (typeof S !== 'undefined' && S.calendar) || [];
    const playerName = id => (A.pl.find(p => p.id === id) || {}).name || '?';
    const userName = id => (A.users.find(u => u.id === id) || {}).name || '?';
    root.innerHTML = `<div class="fxA">
    <details class="ad" data-k="codes"${O('codes')}><summary>🎟️ Códigos de invitación (${A.codes.length})</summary><div class="adb">
      <p class="sub" style="font-size:15px">Un código sirve para <b>varias personas</b> (tú pones cuántas, o sin límite). Pulsa «📤 Compartir» para mandar «Únete a mi liga Fantasy de Garra» con el enlace de la web y el código. Si quieres cortar la entrada, bórralo con ✕.</p>
      <div class="row"><input id="fxaL" maxlength="20" placeholder="Nombre del grupo (opcional)" style="flex:1;min-width:130px"><input id="fxaM" type="number" min="0" max="500" placeholder="Personas" style="width:96px" aria-label="Cuántas personas pueden entrar con este código (vacío = sin límite)"><button data-fa="gen">Generar código</button></div>
      ${A.codes.slice().reverse().map(c => `<div class="fxCode${fresh.has(c.c) ? ' new' : ''}"><div><b>${c.c}</b>${fresh.has(c.c) ? ' <small>🆕</small>' : ''}<br><small>${c.u ? '🔑 Recuperación de ' + E(userName(c.u)) : (c.l ? E(c.l) + ' · ' : '') + 'Han entrado ' + (c.n || 0) + (c.max ? ' de ' + c.max : ' · sin límite')}</small></div><div class="row" style="margin:0"><button class="sm" data-fa="share" data-c="${c.c}">📤 Compartir</button><button class="sm ghost" data-fa="copy" data-c="${c.c}">Copiar</button><button class="sm ghost" data-fa="delcode" data-c="${c.c}">✕</button></div></div>`).join('') || '<p>No hay códigos pendientes.</p>'}
    </div></details>
    <details class="ad" data-k="users"${O('users')}><summary>👥 Participantes (${A.users.length})</summary><div class="adb">
      ${A.users.map(u => `<div class="pv" style="${u.off ? 'opacity:.55' : ''}"><div class="vh"><b>${E(u.name)}</b><span>${dt(u.pts)} pts · ${u.b} M · ${u.n} jug. · ${E(u.fm || '')}</span></div>
        <div class="row"><button class="sm ghost" data-fa="uname" data-id="${u.id}">✏️ Nombre</button><button class="sm ghost" data-fa="ubud" data-id="${u.id}" data-b="${u.b}">💶 Presupuesto</button><button class="sm ghost" data-fa="uoff" data-id="${u.id}" data-off="${u.off ? 0 : 1}">${u.off ? 'Activar' : 'Desactivar'}</button><button class="sm ghost" data-fa="urelink" data-id="${u.id}">🔑 Nuevo acceso</button><button class="sm ghost" data-fa="udel" data-id="${u.id}">🗑</button></div></div>`).join('') || '<p>Todavía no se ha unido nadie.</p>'}
    </div></details>
    <details class="ad" data-k="players"${O('players')}><summary>🧢 Jugadores y precios</summary><div class="adb">
      <p class="sub" style="font-size:15px">Los jugadores salen de la <b>Plantilla</b> (nombre, dorsal y posición). Los precios también se mueven solos al cerrar cada jornada; aquí puedes corregirlos a mano.</p>
      <div class="tw"><table><thead><tr><th>#</th><th>Jugador</th><th>Pos</th><th>Nota</th><th>Precio (M)</th></tr></thead><tbody>
      ${A.pl.map(p => `<tr><td>${p.n}</td><td><b>${E(p.name)}</b></td><td>${p.pos}</td><td>${p.av ?? '—'}</td><td><input type="number" step="0.1" min="3" max="60" value="${p.pr}" data-fa="price" data-id="${p.id}" aria-label="Precio de ${E(p.name)}"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row"><button class="ghost" data-fa="resetpr">Restablecer precios de salida</button></div>
    </div></details>
    <details class="ad" data-k="jors"${O('jors')}><summary>📅 Jornadas, notas y puntuaciones (${A.jor.length})</summary><div class="adb">
      <p class="sub" style="font-size:15px">1) Crea la jornada tras el partido (coge solos a los que marcaste como «juegan» en Votaciones y sus votos MVP). 2) La gente puntúa. 3) Rellena goles/asistencias. 4) <b>Cierra y puntúa</b>: se calculan puntos, se fija la nota media y se mueven los precios.</p>
      <div class="row"><select id="fxaJ">${cal.filter(m => !used.has(m.j)).map(m => `<option value="${m.j}">J${m.j} · vs ${E(m.rival)}</option>`).join('') || '<option value="">(sin jornadas libres)</option>'}</select><button data-fa="newj">Crear jornada</button></div>
      ${A.jor.map(j => jorAdmin(j, O, playerName, userName)).join('')}
    </div></details>
    <details class="ad" data-k="cfg"${O('cfg')}><summary>⚙️ Ajustes de Fantasy</summary><div class="adb">
      <div class="row">Titulares por equipo (+1 suplente): <input id="fxaMax" type="number" min="3" max="14" value="${A.cfg.max}" style="width:72px"></div>
      <div class="row">Jugadores a la venta cada 24 h: <input id="fxaMkn" type="number" min="0" max="60" value="${A.cfg.mkn || ''}" placeholder="auto" style="width:84px"> <small>(vacío = la mitad de la plantilla; se aplica en la próxima renovación)</small></div>
      <p class="sub" style="font-size:14px">Mercado: ${A.cfg.mkCount} jugadores a la venta · se renueva solo el ${new Date(A.cfg.mkEnd).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
      <div class="row"><button class="ghost" data-fa="renewmk">🔄 Renovar el mercado ahora</button></div>
      <div class="row">Mercado: <select id="fxaMk"><option value="0"${A.cfg.mk === 0 ? ' selected' : ''}>Automático (cerrado mientras haya jornada abierta)</option><option value="1"${A.cfg.mk === 1 ? ' selected' : ''}>Abierto siempre</option><option value="2"${A.cfg.mk === 2 ? ' selected' : ''}>Cerrado</option></select></div>
      <p class="sub" style="font-size:14px">Ahora mismo: ${A.cfg.locked ? '🔒 cerrado' : '🟢 abierto'}</p>
      <div class="row"><button data-fa="cfg">Guardar ajustes</button></div>
    </div></details></div>`;
  }
  function jorAdmin(j, O, pn, un) {
    const isDone = j.st === 'done', pls = j.pl.map(id => A.pl.find(p => p.id === id)).filter(Boolean);
    const val = (map, id, i) => { const v = map && map[id]; return i == null ? (v ?? '') : (v ? v[i] : 0); };
    const rows = pls.map(p => `<tr data-pid="${p.id}"><td>${E(p.name)}</td>${[0, 1, 2, 3].map(i => `<td><input type="number" min="0" data-f="s${i}" value="${val(j.s, p.id, i) || ''}"></td>`).join('')}<td><input type="number" min="0" data-f="mv" value="${(j.mv || {})[p.id] || ''}"></td><td><input type="number" step="0.5" data-f="ov" value="${(j.ov || {})[p.id] ?? ''}" placeholder="auto"></td>${isDone ? `<td><b>${j.pt && j.pt[p.id] != null ? j.pt[p.id] : ''}</b></td>` : ''}</tr>`).join('');
    const rates = !isDone ? pls.map(p => { const m = j.rt && j.rt[p.id] || {}, ra = j.ra && j.ra[p.id]; return `<div><b>${E(p.name)}</b> ${ra ? '· media <b>' + ra[0] + '</b> (' + ra[1] + ')' : '· sin notas'}<div class="rt">${Object.entries(m).map(([u, n]) => `<button class="ghost" data-fa="rate" data-j="${j.j}" data-p="${p.id}" data-u="${u}" title="Pulsa para cambiar o quitar">${E(un(+u))}: ${n}</button>`).join('')}</div></div>`; }).join('') : '';
    return `<details class="ad" data-k="j${j.j}"${O('j' + j.j)} data-j="${j.j}"><summary>J${j.j} · vs ${E(j.rival)} · ${isDone ? '✅ cerrada' : '🟡 abierta a notas'} · ${j.pl.length} jugaron</summary><div class="adb">
      <h4>Jugaron (toda la plantilla)</h4>
      <div class="row" data-box="pl">${A.pl.map(p => `<label class="pchk"><input type="checkbox" value="${p.id}"${j.pl.includes(p.id) ? ' checked' : ''}> ${E(p.name)}</label>`).join('')}</div>
      <div class="row"><button class="sm ghost" data-fa="usemvp" data-j="${j.j}">Traer quién jugó y los votos de la pestaña MVP</button></div>
      ${pls.length ? `<h4>Estadísticas y votos MVP</h4><div class="tw"><table class="wide"><thead><tr><th>Jugador</th><th>⚽</th><th>🅰️</th><th>🟨</th><th>🟥</th><th>MVP</th><th>Pts fijos</th>${isDone ? '<th>Pts</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row">Goles que ha encajado el Garra: <input type="number" min="0" data-f="gc" value="${j.gc ?? ''}" style="width:72px" placeholder="—"> <small>(0 = portería a cero)</small></div>` : '<p class="sub" style="font-size:15px">Marca quién jugó y guarda para rellenar estadísticas.</p>'}
      ${!isDone ? `<h4>Notas de los participantes</h4>${rates || '<p>Sin jugadores.</p>'}` : `<h4>Puntos por participante</h4><div>${Object.entries(j.up || {}).sort((a, b) => b[1] - a[1]).map(([u, p]) => `<div class="vh"><span>${E(un(+u))}${j.sb && j.sb[u] ? ' <small>🔄 entró ' + E(pn(j.sb[u][1])) + ' por ' + E(pn(j.sb[u][0])) + '</small>' : ''}</span><b>${p}</b></div>`).join('') || '—'}</div>`}
      <div class="row"><button data-fa="savej" data-j="${j.j}">Guardar</button>${isDone ? `<button class="ghost" data-fa="recalc" data-j="${j.j}">Guardar y recalcular puntos</button>` : `<button data-fa="closej" data-j="${j.j}">✅ Cerrar y puntuar</button>`}<button class="ghost" data-fa="delj" data-j="${j.j}">Borrar jornada</button></div>
    </div></details>`;
  }
  function collect(jd) {
    const o = { pl: $$('[data-box=pl] input:checked', jd).map(i => +i.value), s: {}, mv: {}, ov: {}, gc: $('[data-f=gc]', jd)?.value ?? '' };
    $$('tr[data-pid]', jd).forEach(tr => {
      const id = tr.dataset.pid, g = f => tr.querySelector('[data-f=' + f + ']').value;
      o.s[id] = [g('s0'), g('s1'), g('s2'), g('s3')].map(v => +v || 0); o.mv[id] = +g('mv') || 0; o.ov[id] = g('ov');
    });
    return o;
  }
  async function fa(b) {
    const a = b.dataset.fa, id = +b.dataset.id, j = +b.dataset.j, jd = b.closest('details[data-j]');
    try {
      if (a === 'gen') { const r = await ad('/codes', 'POST', { n: 1, max: +$('#fxaM').value || 0, label: $('#fxaL').value }); fresh = new Set(r.codes); msg('Código listo: pulsa «Compartir»'); }
      else if (a === 'share') { // hoja de compartir del móvil (WhatsApp, Telegram...); si no existe, abre WhatsApp con el mensaje
        const t = shareText(b.dataset.c);
        if (navigator.share) { try { await navigator.share({ title: 'Real Garra Fantasy', text: t }); } catch (e) { if (e && e.name === 'AbortError') return; } return; }
        window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener'); return; }
      else if (a === 'copy') { const t = shareText(b.dataset.c); try { await navigator.clipboard.writeText(t); msg('Invitación copiada'); } catch { prompt('Copia la invitación:', t); } return; }
      else if (a === 'delcode') await ad('/code/' + b.dataset.c, 'DELETE');
      else if (a === 'uname') { const n = prompt('Nuevo nombre fantasy:'); if (!n) return; await ad('/user/' + id, 'PUT', { name: n }); }
      else if (a === 'ubud') { const n = prompt('Presupuesto (millones):', b.dataset.b); if (n == null) return; await ad('/user/' + id, 'PUT', { b: n.replace(',', '.') }); }
      else if (a === 'uoff') await ad('/user/' + id, 'PUT', { off: !!+b.dataset.off });
      else if (a === 'urelink') { const r = await ad('/user/' + id + '/relink', 'POST'); msg('Código de acceso nuevo: ' + r.code + ' (cópialo desde Códigos)'); }
      else if (a === 'udel') { if (!confirm('¿Borrar a este participante y su equipo?')) return; await ad('/user/' + id, 'DELETE'); }
      else if (a === 'resetpr') { if (!confirm('¿Volver a los precios de salida? Se pierden las medias de temporada.')) return; await ad('/prices/reset', 'POST'); }
      else if (a === 'newj') { const v = +$('#fxaJ').value; if (!v) return; await ad('/jor', 'POST', { j: v }); openK.add('j' + v); }
      else if (a === 'cfg') await ad('/cfg', 'PUT', { max: +$('#fxaMax').value, mk: +$('#fxaMk').value, mkn: +$('#fxaMkn').value || 0 });
      else if (a === 'renewmk') { if (!confirm('¿Renovar el mercado ya? Sale una selección nueva y la cuenta de 24 h vuelve a empezar.')) return; await ad('/market/renew', 'POST'); msg('Mercado renovado'); }
      else if (a === 'usemvp') { const r = await ad('/jor/' + j + '/mvp', 'POST'); msg('Traídos de la pestaña MVP: ' + r.n + ' jugadores y sus votos'); }
      else if (a === 'savej') { await ad('/jor/' + j, 'PUT', collect(jd)); msg('Jornada guardada'); }
      else if (a === 'recalc') { await ad('/jor/' + j, 'PUT', collect(jd)); msg('Puntos recalculados'); }
      else if (a === 'closej') { if (!confirm('¿Cerrar la J' + j + '? Se puntúa a todos y se actualizan los precios. Ya no se podrán cambiar las notas.')) return; await ad('/jor/' + j, 'PUT', collect(jd)); await ad('/jor/' + j + '/close', 'POST'); msg('Jornada cerrada y puntuada'); }
      else if (a === 'delj') { if (!confirm('¿Borrar la jornada ' + j + '? (los precios no vuelven atrás)')) return; await ad('/jor/' + j, 'DELETE'); }
      else if (a === 'rate') { const n = prompt('Nueva nota (1-10). 0 = quitar la nota:', ''); if (n == null || n === '') return; await ad('/jor/' + j + '/rate', 'PUT', { pid: +b.dataset.p, uid: +b.dataset.u, n: +n }); }
      await aLoad();
    } catch (e) { msg(e.message); }
  }
  document.addEventListener('click', e => { const b = e.target.closest('#fxAdmin [data-fa]'); if (b && b.tagName === 'BUTTON') fa(b); });
  document.addEventListener('change', async e => { const i = e.target.closest('#fxAdmin input[data-fa=price]'); if (!i) return; try { await ad('/price/' + i.dataset.id, 'PUT', { pr: +i.value }); msg('Precio guardado'); i.style.outline = '2px solid #35d07f'; setTimeout(() => { i.style.outline = ''; }, 900); } catch (er) { msg(er.message); aLoad(); } });
  const pane = $('.apane[data-ap=fantasy]');
  if (pane) new MutationObserver(() => { if (!pane.hidden) aLoad(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
