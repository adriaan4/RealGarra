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
- Resultado exacto: debajo de la parrilla 0-5 hay «Otro resultado», donde se eligen los goles de cada equipo (0-9) con su cuota (más alta fuera de la parrilla, máximo 500).

## GarraBet: amarillas, «ha marcado o no», doble oportunidad y otro resultado
- Tarjetas amarillas: mercado «Tarjeta amarilla» con una cuota por jugador (inventadas por defecto, editables por jornada en Admin → GarraBet · cuotas). Tras el partido, «¿Quién vio amarilla?» → marca y «Guardar amarillas». Hasta que se guarden quedan pendientes. Se pueden combinar jugadores entre sí.
- En las apuestas (y en la imagen del boleto), las selecciones de goleador y amarilla ponen «ha marcado / no ha marcado» y «ha visto amarilla / no ha visto amarilla» cuando el partido ya está resuelto.
- Doble oportunidad + 1X2 del mismo partido: no multiplican. Cuenta solo la cuota del 1X2 (por ejemplo «Gana Garra» + «Garra o empate» = cuota de «Gana Garra»). Si se contradicen (por ejemplo «Gana Garra» + «Empate o rival») no se deja hacer el boleto.
- Resultado exacto: debajo de la parrilla 0-5 hay «Otro resultado», donde se eligen los goles de cada equipo (0-9) con su cuota (más alta fuera de la parrilla, máximo 500).

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
