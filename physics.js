// ---- GARRA STARS: motor de físicas compartido (mismo código en el navegador y en el servidor) ----
// El campo es un rectángulo de FW x FH (unidades propias, no píxeles). Portería arriba (equipo B) y abajo (equipo A),
// con la boca de la portería entre GOAL_L y GOAL_R. Solo el balón puede entrar en la portería; las fichas rebotan siempre.
// simulate() es determinista (nada de Math.random): el cliente la corre para animar en vivo y el servidor la vuelve a
// correr él solo para decidir el resultado real, así nadie puede inventarse un gol manipulando la web.
(function (root) {
  const FW = 100, FH = 140;          // tamaño del campo
  const R_DISC = 6.2, R_BALL = 4;    // radios de fichas y balón
  const GOAL_L = 35, GOAL_R = 65;    // boca de la portería (ambas, arriba y abajo)
  const FRICTION = 0.984;            // el balón/fichas van frenando
  const STOP_SPEED = 0.035;          // por debajo de esto se considera parado
  const MAX_SPEED = 5.4;             // tope de velocidad de un chut (tope de potencia)
  const REST = 0.88;                 // "rebote" en choques y paredes
  const MAX_STEPS = 1100;            // red de seguridad para que la simulación siempre acabe
  const GOAL_DEPTH = FH * 0.075;     // fondo de la portería tal y como se DIBUJA (.gsGoal height:7.5%): 10,5 unidades desde la línea de fondo

  function clampPower(vx, vy) {
    const sp = Math.hypot(vx, vy);
    if (sp <= MAX_SPEED || sp === 0) return [vx, vy];
    const k = MAX_SPEED / sp;
    return [vx * k, vy * k];
  }

  // bodies: [{id,isBall,x,y,vx,vy}, ...] -- se modifica in-place y también se devuelve
  // snapshot: si es true, guarda una foto cada pocos pasos para poder animar el tiro completo
  function simulate(bodies, snapshot) {
    let scored = null;
    const path = snapshot ? [bodies.map(b => ({ id: b.id, x: b.x, y: b.y }))] : null;
    for (let step = 0; step < MAX_STEPS; step++) {
      let moving = false;
      for (const b of bodies) {
        b.vx *= FRICTION; b.vy *= FRICTION;
        if (Math.hypot(b.vx, b.vy) < STOP_SPEED) { b.vx = 0; b.vy = 0; } else moving = true;
        b.x += b.vx; b.y += b.vy;
      }
      for (const b of bodies) {
        const r = b.isBall ? R_BALL : R_DISC;
        if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * REST; }
        if (b.x > FW - r) { b.x = FW - r; b.vx = -Math.abs(b.vx) * REST; }
        const inGap = b.x > GOAL_L && b.x < GOAL_R; // el centro del balón está entre los dos postes
        if (b.isBall && inGap) {
          // GOL en cuanto el CENTRO del balón cruza la línea blanca de la portería dibujada (entre los postes). Antes había que
          // salirse del campo (y < -6,4): si el balón se quedaba parado en la red o se desviaba hacia un poste, se veía dentro pero no contaba
          if (b.y < GOAL_DEPTH) { scored = 'A'; break; }          // entra por arriba: gol del equipo A (ataca hacia arriba)
          if (b.y > FH - GOAL_DEPTH) { scored = 'B'; break; }     // entra por abajo: gol del equipo B
        } else {
          if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * REST; }
          if (b.y > FH - r) { b.y = FH - r; b.vy = -Math.abs(b.vy) * REST; }
        }
      }
      if (scored) break;
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j];
        const dx = c.x - a.x, dy = c.y - a.y, dist = Math.hypot(dx, dy) || 0.0001;
        const minD = (a.isBall ? R_BALL : R_DISC) + (c.isBall ? R_BALL : R_DISC);
        if (dist < minD) {
          const nx = dx / dist, ny = dy / dist, overlap = (minD - dist) / 2 + 0.01;
          a.x -= nx * overlap; a.y -= ny * overlap; c.x += nx * overlap; c.y += ny * overlap;
          const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = -(1 + REST) * rel / 2;
            a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
          }
        }
      }
      if (snapshot && step % 4 === 0 && path.length < 150) path.push(bodies.map(b => ({ id: b.id, x: b.x, y: b.y })));
      if (!moving) break;
    }
    if (!scored) { // por si un choque con una ficha ha empujado el balón dentro justo en el último paso
      const ball = bodies.find(b => b.isBall);
      if (ball && ball.x > GOAL_L && ball.x < GOAL_R) {
        if (ball.y < GOAL_DEPTH) scored = 'A'; else if (ball.y > FH - GOAL_DEPTH) scored = 'B';
      }
    }
    if (snapshot) path.push(bodies.map(b => ({ id: b.id, x: b.x, y: b.y })));
    return { bodies, scored, path };
  }

  // Formación inicial de un equipo (3 fichas) mirando hacia la portería rival
  function kickoff() {
    return {
      a: [{ x: 50, y: 118 }, { x: 32, y: 104 }, { x: 68, y: 104 }],
      b: [{ x: 50, y: 22 }, { x: 32, y: 36 }, { x: 68, y: 36 }],
      ball: { x: 50, y: 70 }
    };
  }

  const API = { FW, FH, R_DISC, R_BALL, GOAL_L, GOAL_R, MAX_SPEED, clampPower, simulate, kickoff };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GarraPhysics = API;
})(typeof window !== 'undefined' ? window : globalThis);
