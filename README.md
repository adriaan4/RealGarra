# Real Garra Balonpié

## Ver en local (Windows / PowerShell)
    npm.cmd install
    npm.cmd start
Abre http://localhost:3000 (o pon otro puerto con `$env:PORT=4173`).
Admin: pestaña Admin, contraseña `Garra26?` (o la variable ADMIN_PASSWORD).

## Datos
Todo se guarda en `data/data.json` (más `data.json.bak` y copias en `data/backups/`).
La carpeta `data/` NO se sube a git, así que subir cambios no toca los datos.

## Render GRATIS sin perder datos (Upstash Redis)
Render free borra el disco en cada reinicio/redeploy, así que los datos se guardan fuera, en Upstash (gratis, sin tarjeta, no caduca):
1. Crea cuenta en https://upstash.com → Redis → Create Database (plan Free, región EU).
2. En la pestaña REST API copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. En Render → tu servicio → Environment, añade esas dos variables (+ `ADMIN_PASSWORD`). No hace falta `DATA_DIR` ni disco.
4. Redeploy. En el log verás "datos en Upstash Redis". La primera vez sube lo que haya en `data/data.json`.
Al arrancar lee de Upstash; en cada cambio (voto, jugador, cierre...) guarda allí. Si Upstash falla al arrancar, el servidor NO arranca vacío (para no pisar datos). Sin estas variables funciona como antes (solo disco local).
Consumo: solo escribe cuando alguien vota/edita, muy por debajo de los 500.000 comandos/mes gratis.

## Votación MVP
- Sin campo de nombre: se pulsa el botón del jugador y el voto entra en la lista. Cada dispositivo vota una sola vez y, al votar, desaparecen los botones.
- Para que un dispositivo pueda votar de nuevo, quita ese voto desde Admin.
- Los jugadores de la lista se gestionan desde Admin (añadir fichajes / borrar). También puedes borrar MVPs anteriores.
- La primera vez que arranca esta versión, la lista de jugadores se sustituye por la del equipo actual (con copia previa en `data/backups/`); el historial de MVPs no se toca.

## Que no se duerma (Render)
- El servidor se llama a sí mismo cada 4 min (`/healthz`) usando `RENDER_EXTERNAL_URL`, que Render define solo.
- En plan gratuito eso ayuda pero no es 100 % fiable. Añade además un pinger externo gratis (UptimeRobot o cron-job.org) que abra `https://TU-APP.onrender.com/healthz` cada 5 min.
- Con plan de pago (el que ya necesitas para el disco persistente) Render no duerme la web.
