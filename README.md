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
- Admin → apuestas de la gente: «Dar por ganada» (se paga importe × cuota), «Anular» (se devuelve el importe) y «Quitar marca».
