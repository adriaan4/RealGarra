let usuarioPorra = localStorage.getItem('usuario_porra') || '';
let listaPlantilla = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarPlantilla();
    if (usuarioPorra) {
        iniciarSesionPorra(usuarioPorra);
    }
});

function mostrarSeccion(id) {
    document.querySelectorAll('.seccion-contenido').forEach(sec => sec.style.display = 'none');
    document.getElementById(`sec-${id}`).style.display = 'block';
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function verSubPorra(sub) {
    document.querySelectorAll('.subporra-box').forEach(box => box.style.display = 'none');
    document.getElementById(`subporra-${sub}`).style.display = 'block';
    
    document.querySelectorAll('.btn-subnav').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function guardarNombreUsuario() {
    const input = document.getElementById('porra-input-nombre').value.trim();
    if (!input) return alert('Por favor, escribe tu nombre.');
    usuarioPorra = input;
    localStorage.setItem('usuario_porra', usuarioPorra);
    iniciarSesionPorra(usuarioPorra);
}

function cambiarUsuario() {
    localStorage.removeItem('usuario_porra');
    usuarioPorra = '';
    document.getElementById('porra-login-card').style.display = 'block';
    document.getElementById('porra-main-dashboard').style.display = 'none';
}

function iniciarSesionPorra(nombre) {
    document.getElementById('porra-login-card').style.display = 'none';
    document.getElementById('porra-main-dashboard').style.display = 'block';
    document.getElementById('txt-bienvenida').innerText = `Identificado como: ${nombre}`;
    document.getElementById('resumen-nombre').innerText = nombre;

    cargarPartidosPorra();
    cargarResumenYClasificacion();
    cargarPorraFinal();
}

function cargarPlantilla() {
    fetch('/api/plantilla')
        .then(res => res.json())
        .then(data => {
            listaPlantilla = data;
            const selects = document.querySelectorAll('.select-plantilla');
            selects.forEach(sel => {
                sel.innerHTML = '<option value="">-- Seleccionar Jugador --</option>';
                data.forEach(j => {
                    sel.innerHTML += `<option value="${j.nombre}">${j.nombre} (${j.posicion})</option>`;
                });
            });
        });
}

function cargarPartidosPorra() {
    fetch('/api/partidos')
        .then(res => res.json())
        .then(partidos => {
            const cont = document.getElementById('lista-partidos-porra');
            cont.innerHTML = '';

            partidos.forEach(p => {
                const fechaPartido = new Date(`${p.fecha}T${p.hora}`);
                const cerrada = new Date() >= fechaPartido;

                const card = document.createElement('div');
                card.className = 'card partido-porra-card';
                card.innerHTML = `
                    <h4>⚽ ${p.local} vs ${p.visitante} (Jornada ${p.jornada})</h4>
                    <p>📅 ${p.fecha} — ${p.hora}</p>
                    ${cerrada ? '<p class="tag-cerrado">🔒 PORRA CERRADA</p>' : ''}
                    <div class="inputs-marcador">
                        <label>${p.local}: <input type="number" id="goles-local-${p.id}" min="0" ${cerrada ? 'disabled' : ''}></label>
                        <label>${p.visitante}: <input type="number" id="goles-vis-${p.id}" min="0" ${cerrada ? 'disabled' : ''}></label>
                    </div>
                    ${!cerrada ? `<button class="btn-primary" onclick="guardarPorraPartido(${p.id})">GUARDAR PREDICCIÓN</button>` : ''}
                `;
                cont.appendChild(card);

                fetch(`/api/porras/partido/${p.id}/${encodeURIComponent(usuarioPorra)}`)
                    .then(r => r.json())
                    .then(pred => {
                        if (pred) {
                            document.getElementById(`goles-local-${p.id}`).value = pred.golesLocal;
                            document.getElementById(`goles-vis-${p.id}`).value = pred.golesVisitante;
                        }
                    });
            });
        });
}

function guardarPorraPartido(partidoId) {
    const gl = document.getElementById(`goles-local-${partidoId}`).value;
    const gv = document.getElementById(`goles-vis-${partidoId}`).value;

    if (gl === '' || gv === '') return alert('Por favor introduce el marcador completo.');

    fetch('/api/porras/partido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            usuario: usuarioPorra,
            partidoId,
            golesLocal: gl,
            golesVisitante: gv
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) alert(data.error);
        else {
            alert('¡Predicción guardada!');
            cargarResumenYClasificacion();
        }
    });
}

function guardarPorraFinal() {
    const payload = {
        usuario: usuarioPorra,
        goleador: document.getElementById('pf-goleador').value,
        posicion: document.getElementById('pf-posicion').value,
        golesAntonio: document.getElementById('pf-goles-antonio').value,
        asistente: document.getElementById('pf-asistente').value,
        amarillas: document.getElementById('pf-amarillas').value,
        mvp: document.getElementById('pf-mvp').value
    };

    fetch('/api/porras/final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) alert(data.error);
        else alert('¡Porra final guardada!');
    });
}

function cargarPorraFinal() {
    fetch(`/api/porras/final/${encodeURIComponent(usuarioPorra)}`)
        .then(res => res.json())
        .then(data => {
            if (data.porra) {
                const p = data.porra;
                document.getElementById('pf-goleador').value = p.goleador || '';
                document.getElementById('pf-posicion').value = p.posicion || '';
                document.getElementById('pf-goles-antonio').value = p.golesAntonio || '';
                document.getElementById('pf-asistente').value = p.asistente || '';
                document.getElementById('pf-amarillas').value = p.amarillas || '';
                document.getElementById('pf-mvp').value = p.mvp || '';
            }
        });
}

function cargarResumenYClasificacion() {
    fetch('/api/porras/clasificacion')
        .then(res => res.json())
        .then(ranking => {
            const list = document.getElementById('tabla-ranking-porra');
            list.innerHTML = '';
            let miPos = '-';
            let misPts = 0;
            let misExactos = 0;
            let misTotal = 0;

            ranking.forEach((u, idx) => {
                list.innerHTML += `<li><strong>${u.nombre}</strong> — ${u.puntos} puntos</li>`;
                if (u.nombre.toLowerCase() === usuarioPorra.toLowerCase()) {
                    miPos = `#${idx + 1}`;
                    misPts = u.puntos;
                    misExactos = u.aciertosExactos;
                    misTotal = u.totalPorras;
                }
            });

            document.getElementById('resumen-puntos').innerText = misPts;
            document.getElementById('resumen-posicion').innerText = miPos;
            document.getElementById('resumen-exactos').innerText = misExactos;
            document.getElementById('resumen-total').innerText = misTotal;
        });
}
