const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'data', 'data.json');

function normalizarNombre(nombre) {
    return nombre ? nombre.trim().toLowerCase() : '';
}

function leerDatos() {
    if (!fs.existsSync(DATA_FILE)) {
        return { partidos: [], plantilla: [], patrocinadores: [], porras_partidos: [], porras_finales: [], porra_final_config: { abierta: true, resultados_definitivos: null } };
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function guardarDatos(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// -------------------------------------------------------------
// ENDPOINTS DE INFORMACIÓN BASE
// -------------------------------------------------------------
app.get('/api/partidos', (req, res) => {
    const data = leerDatos();
    res.json(data.partidos || []);
});

app.get('/api/plantilla', (req, res) => {
    const data = leerDatos();
    res.json(data.plantilla || []);
});

// -------------------------------------------------------------
// RUTAS API: PORRAS DE PARTIDOS
// -------------------------------------------------------------
app.get('/api/porras/partido/:partidoId/:nombre', (req, res) => {
    const data = leerDatos();
    const nombreNorm = normalizarNombre(req.params.nombre);
    const porra = (data.porras_partidos || []).find(
        p => p.partidoId == req.params.partidoId && normalizarNombre(p.usuario) === nombreNorm
    );
    res.json(porra || null);
});

app.post('/api/porras/partido', (req, res) => {
    const { usuario, partidoId, golesLocal, golesVisitante } = req.body;
    if (!usuario || partidoId === undefined || golesLocal === undefined || golesVisitante === undefined) {
        return res.status(400).json({ error: 'Datos incompletos.' });
    }

    const data = leerDatos();
    const partido = (data.partidos || []).find(p => p.id == partidoId);

    if (!partido) return res.status(404).json({ error: 'Partido no encontrado.' });

    const fechaPartido = new Date(`${partido.fecha}T${partido.hora}`);
    if (new Date() >= fechaPartido) {
        return res.status(400).json({ error: '🔒 La porra de este partido ya está cerrada.' });
    }

    const nombreNorm = normalizarNombre(usuario);
    data.porras_partidos = data.porras_partidos || [];

    let porra = data.porras_partidos.find(
        p => p.partidoId == partidoId && normalizarNombre(p.usuario) === nombreNorm
    );

    if (porra) {
        porra.golesLocal = parseInt(golesLocal);
        porra.golesVisitante = parseInt(golesVisitante);
        porra.fechaModificacion = new Date().toISOString();
    } else {
        data.porras_partidos.push({
            id: Date.now(),
            usuario: usuario.trim(),
            partidoId: parseInt(partidoId),
            golesLocal: parseInt(golesLocal),
            golesVisitante: parseInt(golesVisitante),
            fechaCreacion: new Date().toISOString(),
            puntos: null
        });
    }

    guardarDatos(data);
    res.json({ ok: true, mensaje: 'Predicción guardada correctamente.' });
});

// -------------------------------------------------------------
// RUTAS API: PORRA FINAL DE TEMPORADA
// -------------------------------------------------------------
app.get('/api/porras/final/:nombre', (req, res) => {
    const data = leerDatos();
    const nombreNorm = normalizarNombre(req.params.nombre);
    const porraFinal = (data.porras_finales || []).find(p => normalizarNombre(p.usuario) === nombreNorm);
    res.json({
        porra: porraFinal || null,
        abierta: data.porra_final_config ? data.porra_final_config.abierta : true
    });
});

app.post('/api/porras/final', (req, res) => {
    const { usuario, goleador, posicion, golesAntonio, asistente, amarillas, mvp } = req.body;
    const data = leerDatos();

    if (data.porra_final_config && !data.porra_final_config.abierta) {
        return res.status(400).json({ error: '🔒 La porra final de temporada está cerrada.' });
    }

    const nombreNorm = normalizarNombre(usuario);
    data.porras_finales = data.porras_finales || [];

    let porra = data.porras_finales.find(p => normalizarNombre(p.usuario) === nombreNorm);

    const datosPorra = {
        usuario: usuario.trim(),
        goleador,
        posicion: parseInt(posicion),
        golesAntonio: parseInt(golesAntonio),
        asistente,
        amarillas,
        mvp,
        fechaActualizacion: new Date().toISOString()
    };

    if (porra) {
        Object.assign(porra, datosPorra);
    } else {
        data.porras_finales.push(datosPorra);
    }

    guardarDatos(data);
    res.json({ ok: true, mensaje: 'Porra final guardada con éxito.' });
});

// -------------------------------------------------------------
// CÁLCULO DE PUNTOS Y CLASIFICACIÓN
// -------------------------------------------------------------
function calcularPuntosPartido(predLocal, predVis, realLocal, realVis) {
    if (realLocal === null || realVis === null || realLocal === undefined || realVis === undefined) return 0;
    if (predLocal === realLocal && predVis === realVis) return 5;

    const signoPred = Math.sign(predLocal - predVis);
    const signoReal = Math.sign(realLocal - realVis);

    if (signoPred === signoReal) return 3;
    return 0;
}

app.get('/api/porras/clasificacion', (req, res) => {
    const data = leerDatos();
    const tablaClasificacion = {};

    (data.porras_partidos || []).forEach(p => {
        const partido = (data.partidos || []).find(pt => pt.id == p.partidoId);
        const normKey = normalizarNombre(p.usuario);
        if (!tablaClasificacion[normKey]) {
            tablaClasificacion[normKey] = { nombre: p.usuario, puntos: 0, aciertosExactos: 0, totalPorras: 0 };
        }
        tablaClasificacion[normKey].totalPorras += 1;

        if (partido && partido.jugado && partido.golesLocal !== null && partido.golesVisitante !== null) {
            const pts = calcularPuntosPartido(p.golesLocal, p.golesVisitante, partido.golesLocal, partido.golesVisitante);
            tablaClasificacion[normKey].puntos += pts;
            if (pts === 5) tablaClasificacion[normKey].aciertosExactos += 1;
        }
    });

    const resFinal = data.porra_final_config ? data.porra_final_config.resultados_definitivos : null;
    if (resFinal) {
        (data.porras_finales || []).forEach(pf => {
            const normKey = normalizarNombre(pf.usuario);
            if (!tablaClasificacion[normKey]) {
                tablaClasificacion[normKey] = { nombre: pf.usuario, puntos: 0, aciertosExactos: 0, totalPorras: 0 };
            }
            if (pf.goleador === resFinal.goleador) tablaClasificacion[normKey].puntos += 10;
            if (pf.posicion === resFinal.posicion) tablaClasificacion[normKey].puntos += 15;
            if (pf.golesAntonio === resFinal.golesAntonio) tablaClasificacion[normKey].puntos += 15;
            if (pf.asistente === resFinal.asistente) tablaClasificacion[normKey].puntos += 10;
            if (pf.amarillas === resFinal.amarillas) tablaClasificacion[normKey].puntos += 10;
            if (pf.mvp === resFinal.mvp) tablaClasificacion[normKey].puntos += 10;
        });
    }

    const ranking = Object.values(tablaClasificacion).sort((a, b) => b.puntos - a.puntos);
    res.json(ranking);
});

// -------------------------------------------------------------
// PANEL DE ADMINISTRACIÓN - ENDPOINTS
// -------------------------------------------------------------
app.get('/api/admin/porras/partidos', (req, res) => {
    const data = leerDatos();
    const result = (data.porras_partidos || []).map(p => {
        const partido = (data.partidos || []).find(pt => pt.id == p.partidoId) || {};
        return {
            ...p,
            partidoTexto: `${partido.local || ''} vs ${partido.visitante || ''}`,
            jornada: partido.jornada || '-',
            resultadoReal: partido.jugado ? `${partido.golesLocal}-${partido.golesVisitante}` : 'Pendiente',
            puntos: partido.jugado ? calcularPuntosPartido(p.golesLocal, p.golesVisitante, partido.golesLocal, partido.golesVisitante) : 'Pendiente'
        };
    });
    res.json(result);
});

app.get('/api/admin/porras/finales', (req, res) => {
    const data = leerDatos();
    res.json(data.porras_finales || []);
});

app.post('/api/admin/porras/final/toggle', (req, res) => {
    const data = leerDatos();
    data.porra_final_config = data.porra_final_config || { abierta: true };
    data.porra_final_config.abierta = req.body.abierta;
    guardarDatos(data);
    res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Servidor Real Garra corriendo en puerto ${PORT}`));
