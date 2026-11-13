# Real Garra Balonpié

## Ver en local (Windows / PowerShell)
    npm.cmd install
    npm.cmd start
Abre http://localhost:3000 (o pon otro puerto con `$env:PORT=4173`).
Admin: pestaña Admin, contraseña definida en la variable ADMIN_PASSWORD (ponla siempre en el servidor).

## Datos
Todo se guarda en `data/data.json` (más `data.json.bak` y copias en `data/backups/`).
La carpeta `data/` NO se sube a git, así que subir cambios no toca los datos.

## Suga / Render sin perder datos (Upstash Redis)
Render free borra el disco en cada reinicio/redeploy, así que los datos se guardan fuera, en Upstash (gratis, sin tarjeta, no caduca):
1. Crea cuenta en https://upstash.com → Redis → Create Database (plan Free, región EU).
2. En la pestaña REST API copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. En Suga (o Render) → tu servicio → variables de entorno, añade esas dos variables (+ `ADMIN_PASSWORD`). No hace falta `DATA_DIR` ni disco. Hay un ejemplo en `.env.example`.
4. Redeploy. En el log verás "datos en Upstash Redis". La primera vez sube lo que haya en `data/data.json`.
Al arrancar lee de Upstash; en cada cambio (voto, jugador, cierre...) guarda allí. Si Upstash falla al arrancar, el servidor NO arranca vacío (para no pisar datos). Sin estas variables funciona como antes (solo disco local).
Consumo: solo escribe cuando alguien vota/edita, muy por debajo de los 500.000 comandos/mes gratis.

## Escudos de equipos
En Admin → Próximo partido → «Seleccionar escudo» eliges el equipo de la liga. Si aún no tiene escudo, te pide la foto y la guarda una sola vez (se reduce sola en el móvil) dentro de los datos (Upstash o `data/data.json`). Después sale solo en el Inicio y en el calendario. «Subir otro escudo» vale solo para ese partido.

## Votación MVP
- **Horario de la votación:** se abre **1 hora después del inicio del partido** y el MVP se da solo **al día siguiente a las 20:00** (hora de Madrid). El inicio sale de la fecha del «Próximo partido» (o se puede cambiar en Admin → Votación MVP). Antes de abrir y después de cerrar no se puede votar.
- **Quién juega:** en Admin → Votación MVP se marcan los jugadores del partido; solo esos salen para votar y sus nombres aparecen arriba en la pestaña MVP. Si no se marca a nadie, salen todos.
- Sin campo de nombre: se pulsa el botón del jugador y el voto entra en la lista. Cada dispositivo vota una sola vez y, al votar, desaparecen los botones.
- Para que un dispositivo pueda votar de nuevo, quita ese voto desde Admin.
- Los jugadores de la lista se gestionan desde Admin (añadir fichajes / borrar). También puedes borrar MVPs anteriores.
- La primera vez que arranca esta versión, la lista de jugadores se sustituye por la del equipo actual (con copia previa en `data/backups/`); el historial de MVPs no se toca.

## Que no se duerma (Render)
- El servidor se llama a sí mismo cada 4 min (`/healthz`) usando `RENDER_EXTERNAL_URL`, que Render define solo.
- En plan gratuito eso ayuda pero no es 100 % fiable. Añade además un pinger externo gratis (UptimeRobot o cron-job.org) que abra `https://TU-APP.onrender.com/healthz` cada 5 min.
- Con plan de pago (el que ya necesitas para el disco persistente) Render no duerme la web.

## GarraBet: pavos
- Cada persona empieza con 100 pavos. Para apostar hay que poner un importe (mínimo 1, máximo su saldo).
- Al ganar se cobra importe × cuota; al perder se pierde el importe. Si quita una apuesta pendiente, recupera los pavos.
- El saldo se calcula siempre a partir de las apuestas, así que no se descuadra. Las apuestas antiguas (sin importe) no afectan al saldo.
- Admin → «GarraBet · apuestas de la gente»: cada persona tiene su saldo y un campo para ingresarle pavos (con número negativo se le quitan), y arriba hay «Ingresar a todos».

## GarraBet: doble oportunidad, goleadores y resolver a mano
- Doble oportunidad (1X, 12, X2): se liquida sola con el resultado del calendario. Si no pones cuota, sale sola a partir de las cuotas 1/X/2.
- Goleadores (marca en cualquier momento): cuotas por defecto de menor a mayor (Mario, Jiménez, Carlos, Pablo, Dodu, ...), editables por jornada. Tras el partido, en Admin → GarraBet · cuotas → «¿Quién marcó?» marca a los goleadores y guarda. Se pueden combinar goleadores entre sí.
- Admin → apuestas de la gente: «Dar por ganada» (se paga importe × cuota), «Dar por perdida» (pierde el importe), «Anular» (se devuelve el importe) y «Quitar marca».

## GarraBet: amarillas, «ha marcado o no», doble oportunidad y otro resultado
- Tarjetas amarillas: mercado «Tarjeta amarilla» con una cuota por jugador (inventadas por defecto, editables por jornada en Admin → GarraBet · cuotas). Tras el partido, «¿Quién vio amarilla?» → marca y «Guardar amarillas». Hasta que se guarden quedan pendientes. Se pueden combinar jugadores entre sí.
- En las apuestas (y en la imagen del boleto), las selecciones de goleador y amarilla ponen «ha marcado / no ha marcado» y «ha visto amarilla / no ha visto amarilla» cuando el partido ya está resuelto.
- Doble oportunidad + 1X2 del mismo partido: no multiplican. Cuenta solo la cuota del 1X2 (por ejemplo «Gana Garra» + «Garra o empate» = cuota de «Gana Garra»). Si se contradicen (por ejemplo «Gana Garra» + «Empate o rival») no se deja hacer el boleto.
- Resultado exacto: debajo de la parrilla 0-5 hay «Otro resultado», donde se eligen los goles de cada equipo (0-9) con su cuota (más alta fuera de la parrilla, sin tope máximo).

## GarraBet: amarillas, «ha marcado o no», doble oportunidad y otro resultado
- Tarjetas amarillas: mercado «Tarjeta amarilla» con una cuota por jugador (inventadas por defecto, editables por jornada en Admin → GarraBet · cuotas). Tras el partido, «¿Quién vio amarilla?» → marca y «Guardar amarillas». Hasta que se guarden quedan pendientes. Se pueden combinar jugadores entre sí.
- En las apuestas (y en la imagen del boleto), las selecciones de goleador y amarilla ponen «ha marcado / no ha marcado» y «ha visto amarilla / no ha visto amarilla» cuando el partido ya está resuelto.
- Doble oportunidad + 1X2 del mismo partido: no multiplican. Cuenta solo la cuota del 1X2 (por ejemplo «Gana Garra» + «Garra o empate» = cuota de «Gana Garra»). Si se contradicen (por ejemplo «Gana Garra» + «Empate o rival») no se deja hacer el boleto.
- Resultado exacto: debajo de la parrilla 0-5 hay «Otro resultado», donde se eligen los goles de cada equipo (0-9) con su cuota (más alta fuera de la parrilla, sin tope máximo).

## GarraBet: importar cuotas desde un JSON
Admin → GarraBet → «📥 Importar cuotas desde JSON». Pega (o sube) un JSON con una entrada por jornada; solo se cambia lo que pongas y el resto de cuotas de esa jornada se conserva. Si algo está mal no se cambia nada y el mensaje dice dónde.
```json
{
  "2": {
    "anotados":  { "0.5": { "o": 1.08, "u": 8.68 }, "1.5": [1.49, 2.71] },
    "encajados": { "0.5": { "o": 1.11, "u": 7.10 } },
    "totales":   { "2.5": { "o": 1.22, "u": 4.57 } }
  },
  "4": { "totales": { "2.5": [1.30, 3.80] } }
}
```
- `o` = más de, `u` = menos de (también vale `mas` / `menos`, o escribir la línea como `[más, menos]`). En inglés también: `scored`, `conceded`, `total`.
- Líneas: 0.5–7.5 en anotados y encajados, 1.5–11.5 en totales. Cuota mínima 1,01; `null` quita esa cuota.
- Opcionales: `res` (`"1"`, `"X"`, `"2"`), `dc` (`"1X"`, `"12"`, `"X2"`) y `btts` (`"y"`, `"n"`).
- «Cargar las actuales» rellena la caja con las cuotas de goles que ya hay, para editarlas y volver a importar. Antes de importar se guarda una copia de seguridad.

## GarraBet: cuotas automáticas (tipo casa de apuestas)
Admin → GarraBet → «🤖 Cuotas automáticas».
- Estadísticas de cada equipo (PJ, G, E, P, GF, GC, puntos y forma de los últimos 5) calculadas desde los resultados. Los del Garra salen solos del Calendario; los del resto de la liga se añaden ahí mismo («Resultados de otros equipos»).
- Rating = goles (ataque/defensa) + rendimiento (puntos) + forma. Con él se calculan los goles esperados de cada equipo y, con Poisson, las probabilidades de 1X2, doble oportunidad, ambos marcan, goles totales y goles por equipo.
- Cuota = 1 / (probabilidad × (1 + margen)). El margen de la casa es configurable (8 % por defecto).
- Al guardar un resultado en Calendario (o añadir/quitar un resultado de otro equipo) se recalculan las cuotas del próximo partido. Botón «🔄 Recalcular cuotas» para hacerlo a mano.
- Las cuotas se guardan en la base de datos de GarraBet (`garrabet.odds`). Las que escribas a mano o importes por JSON en una jornada no se pisan solas (solo el botón de recalcular, con confirmación). Goleadores y amarillas no se tocan.
- Los boletos ya hechos conservan la cuota con la que se apostaron.
- Ajustes del modelo (peso de la media, nº de partidos de forma…) al principio del bloque «Cuotas automáticas» de `server.js`.

## Actualización automática cada 30 minutos (grupo 4708)
El servidor lee la clasificación de MLA **cada 30 minutos** (en punto y y media, todos los días) y una vez al arrancar. Si falla, reintenta 2 veces más (cada 5 min); si sigue fallando se conservan los últimos datos. Si no hay cambios, no escribe nada. La web consulta su estado cada 30 s, así que los cambios salen solos. El Real Garra Balompie sale resaltado en la tabla.
- Se prueba primero `MLA_URLS` y, si falla, `MLA_FALLBACK_URLS` (por defecto `https://www.mlasport.com/grupo/4708`). `MLA_EVERY_MIN` cambia el intervalo.
- Admin → Más → **📊 Clasificación MLA**: estado de la última lectura, «Actualizar ahora» y un recuadro para **pegar la clasificación a mano** si MLA bloquea la lectura automática.
- Solo usa Node (ya instalado en el servidor): no hace falta instalar nada más ni usar PHP.

## Sincronización con MLA Sport (grupo 4708)
Cada **domingo de 15:00 a 22:00 (hora de Madrid)** el servidor consulta MLA una vez por hora (15:00, 16:00 … 22:00) y sincroniza solo:
- **Resultados**: los del Garra se guardan en el Calendario (siempre «Garra primero») y los de otros equipos en los resultados de la liga. Se casan por jornada (o por fecha) y nunca se añade un partido que ya existe: si MLA cambia un marcador, se corrige el mismo.
- **Clasificación**: la oficial de MLA se guarda en `db.mla.standings`; la tabla que ya ve la web sigue calculándose desde los resultados, así que no cambia el diseño.
- **Estadísticas y cuotas de GarraBet**: solo si algún resultado cambió, se recalculan las estadísticas y las cuotas automáticas del próximo partido (las cuotas puestas a mano no se pisan).
- **Si MLA falla** (caída, bloqueo, formato irreconocible) no se toca nada: se conservan los últimos datos. Hay 2 reintentos más, cada 10 min, dentro de esa misma hora. Si no hay cambios, tampoco se escribe en la base de datos.
- Un equipo que no figure en la web ni en la clasificación de MLA no se añade (evita basura si la página cambia).

Variables de entorno:
- `MLA_URLS` (por defecto `https://www.mlasport.com/clasificacion-grupo/4708`): direcciones de MLA del grupo 4708 separadas por comas (clasificación y/o resultados; cada página se lee entera). Ej.: `MLA_URLS=https://www.mlasport.com/…/clasificacion,https://www.mlasport.com/…/resultados`
- `MLA_GROUP` (opcional, por defecto `4708`) y `MLA_UA` (opcional, User-Agent).

Probar a mano, a cualquier hora (con la contraseña de admin):
    curl -X POST https://TU-APP/api/mla/sync -H "x-admin: TU_CONTRASEÑA"
    curl https://TU-APP/api/mla/status -H "x-admin: TU_CONTRASEÑA"
El código está en `mla.js` (lectura) y en el bloque «MLA Sport» de `server.js`.

## Calendario (desde la J2)
- El calendario oficial está en `CAL_SEED` (server.js): J1 vs Huerta FC (25/10/2026) y de la J2 (08/11/2026) a la J22 (30/05/2027). La hora, el campo y el resultado se rellenan desde Admin.
- Al arrancar por primera vez con este cambio se ejecuta una migración única (`migrateCalV3`) con copia previa en `data/backups/` (y en Upstash): la J1 no se toca; en las jornadas cuyo rival cambia se recalculan las cuotas, se anulan los boletos pendientes (se devuelven los pavos, el boleto sigue mostrando el rival original), se quitan las predicciones de la porra de partidos y «Próximo partido» pasa al rival nuevo (misma fecha y hora). Las jornadas que no cambian (mismo rival y fecha) conservan todo.

## REAL GARRA FANTASY (pestaña «🦁 Fantasy»)
Modo privado y ligero: todo vive en `db.fantasy` (la misma base de datos: Upstash o `data.json`) y reutiliza la plantilla (`db.squad`): los jugadores NO se duplican, su id es el de la Plantilla (el mismo que en la votación MVP).
- **Acceso:** solo con código de invitación. Admin → 🏆 Fantasy → Códigos: generas un código que vale para **varias personas** (tú eliges cuántas, o sin límite) y «📤 Compartir» manda «Únete a mi liga Fantasy de Garra» con el enlace de la web (`/?fc=CODIGO#fantasy`) y el código. Los códigos de recuperación sí son de un solo uso. Cada persona elige su **nombre fantasy** (independiente de GarraBet). «🔑 Nuevo acceso» da un código de recuperación para entrar desde otro móvil.
- **Formaciones (libres):** cada participante elige la que quiera: `D-M-F` (defensas-medios-delanteros) con 1 portero, para N titulares (por defecto 7: 2-3-1, 3-2-1, 2-2-2, 3-1-2, 1-3-2, 1-2-3, 2-1-3, 1-4-1, 4-1-1; se generan solas según N). Cada jugador va a su línea y, si en una línea sobran, ocupan huecos libres de otra (fuera de posición, con borde discontinuo; puntúan igual). Se guarda en `u.fm`. Solo se cambia con el mercado abierto.
- **Banquillo / suplente (8.º jugador):** N titulares + 1 suplente (por defecto 7 + 1 = 8); el participante elige quién es el suplente entre sus 8 jugadores (sin restricciones de posición). No puntúa en el banco, pero al **cerrar la jornada**, si un titular no jugó y el suplente sí, **entra automáticamente por él** (mejor por uno de su posición; si no, por cualquiera que no jugara; queda en `j.sb`). Los fichajes llenan primero el campo y el siguiente va al suplente.
- **Equipos:** al entrar cada participante recibe un **equipo aleatorio** (1 portero + el resto repartido) y **40 M de presupuesto** inicial para fichar. Arriba se ve valor de plantilla, presupuesto, patrimonio, puntos y puesto. Hasta 7 jugadores (ajustable). Precios de salida por posición (POR 11, DEF 12, MED 14, DEL 16 + goles de la plantilla).
- **Notas:** tras el partido cada participante puntúa de 1 a 10 a los que jugaron. **Una nota por persona y jugador** (no se puede cambiar). Las notas pesan más que cualquier otra cosa: cada punto de media sobre 5 suma 2 puntos. Además: jugar +1, gol (POR 8 / DEF 6 / MED 5 / DEL 4), asistencia +3, amarilla −1, roja −3, portería a cero (POR +4, DEF +3, MED +1) y MVP de la web (+4 el más votado, +1 quien reciba algún voto).
- **Mercado cada 24 h:** cada 24 h sale a la venta una selección de jugadores (la misma para todos; guardada en `db.fantasy.mkt`; se renueva sola al primer acceso tras cumplirse el día, sin cron). Solo se ficha a los que están en la lista; un jugador vendido vuelve a la lista de hoy. Se vende al precio del momento. Admin → Fantasy → Ajustes: cuántos salen (vacío = la mitad de la plantilla) y «Renovar el mercado ahora». El precio se mueve solo al cerrar cada jornada según la nota media (6 = neutro; media de 8 ≈ +12 %, de 4 ≈ −12 %, tope ±15 %). El mercado y la alineación se cierran mientras una jornada está abierta a notas.
- **Clasificación:** general y por jornada, con podio. Pestaña Ranking → **Jugadores**: ranking de jugadores por puntos de Fantasy (temporada o jornada), con filtro por posición.
- **Admin → 🏆 Fantasy:** códigos, participantes (nombre, presupuesto, activar/desactivar, borrar), jugadores y precios, jornadas (crear, goles/asistencias/tarjetas, notas de cada participante, cerrar y puntuar, recalcular) y ajustes (nº de jugadores, mercado abierto/cerrado).
- **Ligero:** al cerrar una jornada se borran las notas individuales y solo queda la media; los códigos se borran al usarse.

### MVP y Fantasy comparten jugadores
- La lista de la votación MVP (`db.players`) es ahora un espejo de la **Plantilla**: sale toda la plantilla (con dorsal), incluidos Pajares y Juan. Para añadir o quitar a alguien se hace en Admin → Partido → Plantilla. Los votos en curso se pasan solos (por nombre: ROBERT→ROBER, ADRIAN→ADRI). Hay copia previa en `data/backups/`.
- Admin → Votaciones → «Quién juega» tiene los botones «Marcar toda la plantilla» / «Quitar todos». Los marcados son los que se puntúan en Fantasy.
- Al crear una jornada de Fantasy se cogen solos los jugadores marcados y los votos de MVP de ese rival (también «Traer quién jugó y los votos de la pestaña MVP»).

## 📮 Buzón de sugerencias y quejas
- Pestaña pública «📮 Buzón»: se conecta con el nombre de GarraBet del dispositivo (si no tiene, pide uno). Tipos: sugerencia, queja, duda u otro (máx. 600 letras y 6 mensajes al día). Cada persona solo ve sus mensajes y las respuestas del admin.
- Cada mensaje nuevo manda un **aviso al admin** (el mismo que las apuestas: activa «Activar mis avisos» en Admin → Más en tu móvil). Al responder desde Admin → 📮 Buzón, a la persona le llega un aviso si tiene las notificaciones activadas.
- Se guarda en `db.buzon` (`buzon.js` + `public/buzon.js`). Al pasar de 400 mensajes se borra el más viejo ya resuelto.

## Garra Stars: lobby, partidos de 3 minutos y saque
- Ya no sale la lista de toda la gente de GarraBet. En **⭐ Garra Stars → 🎮 Jugar** hay tres opciones: **crear partida** (puntuable o amistosa), **unirse** a una partida abierta de otra persona (lista «🚪 Partidas abiertas») o **🤖 entrenamiento vs IA**.
- Una partida abierta que nadie coge se borra sola a los 15 min (o se cancela desde el lobby). La cuenta atrás empieza cuando alguien se une.
- Cada partido dura **3 minutos con cuenta atrás**; al llegar a 0 gana quien tenga más goles (si hay empate, empate). El reloj lo lleva el servidor, así que aunque nadie esté mirando el partido se cierra solo y se aplican los puntos.
- **Tras un gol**: se ve la celebración (~1 s) y todo vuelve a la formación inicial (3 fichas por equipo y balón al centro). Esa celebración y el vuelo del balón hasta la red **no se descuentan de la cuenta atrás**. **Saca quien ha encajado el gol.**
- El entrenamiento vs IA también dura 3 minutos y sigue las mismas reglas; no puntúa ni toca el servidor.
- Ficheros: servidor en `garrastars.js` (raíz), cliente en `public/garrastars.js`, físicas compartidas en `public/physics.js` (sin cambios).

## Garra Stars: lobby, partidos de 3 minutos y saque
- Ya no sale la lista de toda la gente de GarraBet. En **⭐ Garra Stars → 🎮 Jugar** hay tres opciones: **crear partida** (puntuable o amistosa), **unirse** a una partida abierta de otra persona (lista «🚪 Partidas abiertas») o **🤖 entrenamiento vs IA**.
- Una partida abierta que nadie coge se borra sola a los 15 min (o se cancela desde el lobby). La cuenta atrás empieza cuando alguien se une.
- Cada partido dura **3 minutos con cuenta atrás**; al llegar a 0 gana quien tenga más goles (si hay empate, empate). El reloj lo lleva el servidor, así que aunque nadie esté mirando el partido se cierra solo y se aplican los puntos.
- **Tras un gol**: se ve la celebración (~1 s) y todo vuelve a la formación inicial (3 fichas por equipo y balón al centro). Esa celebración y el vuelo del balón hasta la red **no se descuentan de la cuenta atrás**. **Saca quien ha encajado el gol.**
- El entrenamiento vs IA también dura 3 minutos y sigue las mismas reglas; no puntúa ni toca el servidor.
- Ficheros: servidor en `garrastars.js` (raíz), cliente en `public/garrastars.js`, físicas compartidas en `public/physics.js` (sin cambios).
- **🔴 Directo**: en el lobby aparece la lista de partidos en juego (marcador y tiempo); con «👀 Ver» se mira el partido en vivo (solo mirar, sin poder tocar nada). Los tiros del rival se ven casi al momento (se consulta cada segundo).
- El tiro propio es instantáneo: al soltar, el navegador ya anima el chute con la misma simulación que el servidor y el servidor solo lo confirma.

## Garra Stars: tiempo real y «tú siempre abajo»
- **Sin retraso:** el servidor empuja cada tiro por SSE (`GET /api/stars/stream`, `?match=ID` para una partida o sin `match` para el lobby) al rival y a quien mira, en cuanto se chuta. Antes se enteraban preguntando cada 1 s y el servidor esperaba a guardar en Redis antes de contestar; ahora el guardado va en segundo plano (`saveSoon`, salvo al acabar la partida, que sí se espera porque cambia el ranking). Si el navegador/proxy no admite SSE, se vuelve a consultar cada 0,7 s. Los tiros que llegan mientras se anima otro se ponen en cola y se enseñan en orden.
- **Cada uno se ve abajo:** quien juega ve siempre sus 3 fichas abajo y ataca hacia arriba; si eres el equipo B el campo se gira 180° solo en tu pantalla (la física y el servidor no cambian). Etiquetas «⬇ TÚ · nombre» y «⬆ Rival · nombre», y el marcador pone tu nombre a la izquierda con «(tú)». Quien mira en directo ve el campo con el equipo A abajo.
- Ficheros tocados: `garrastars.js` (servidor) y `public/garrastars.js` (cliente).
- **Espectadores en horizontal:** quien solo mira ve el campo apaisado (equipo A a la izquierda atacando a la derecha, B a la derecha). Los jugadores siguen viendo sus fichas abajo.
- **Anti-cuelgues:** un fallo de red suelto ya no echa a nadie del partido; si algo falla al pintar o una animación se queda colgada, la web vuelve sola al lobby; los avisos del lobby se limitan a 1 refresco cada 1,5 s; los canales SSE tienen tope y control de errores en el servidor.
- **Orientación automática:** si el móvil está en horizontal (pantalla baja y apaisada) el campo se pone horizontal solo, y vertical si está en vertical; al girar el móvil se recoloca. El botón 🔄 junto a Rendirse la cambia a mano hasta el siguiente giro. En horizontal tú estás a la izquierda atacando hacia la derecha.

## Garra Stars: 👁 espectadores y 🎉 confeti del público
- Dentro de un partido en juego sale un **👁 N** con la gente que lo está mirando en directo (se ve jugando y mirando). En el lobby, la lista «🔴 Directo» también muestra el 👁 de cada partido.
- Quien **mira** un partido (👀 Ver) tiene dos botones 🎉, uno en el lado de cada jugador. Al pulsarlos sale confeti en ese lado para los dos jugadores y para todo el público; se puede lanzar un confeti cada 2 segundos (los botones se apagan ese rato).
- Los jugadores **no pueden** lanzar confeti (solo el público), hace falta tener nombre de GarraBet, y el servidor también limita a 1 confeti cada 2 s por persona.
- Ficheros: `garrastars.js` (servidor: conteo por SSE `?watch=1`, evento `viewers`, `POST /api/stars/match/:id/cheer`, evento `cheer`) y `public/garrastars.js` (cliente). Versión visible: «Garra Stars v13».
