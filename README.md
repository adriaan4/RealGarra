# Real Garra Balonpié

## Ver en local (Windows / PowerShell)
    npm.cmd install
    npm.cmd start
Abre http://localhost:3000 (o pon otro puerto con `$env:PORT=4173`).
Admin: pestaña Admin, contraseña `Garra26?` (o la variable ADMIN_PASSWORD).

## Datos
Todo se guarda en `data/data.json` (más `data.json.bak` y copias en `data/backups/`).
La carpeta `data/` NO se sube a git, así que subir cambios no toca los datos.

## Render (para que los datos no se pierdan)
1. Necesitas un **Persistent Disk** (plan de pago) montado en `/var/data`.
2. Variables de entorno: `DATA_DIR=/var/data` y `ADMIN_PASSWORD=Garra26?`
3. Build: `npm install` · Start: `npm start`
Sin disco, Render borra los archivos al redesplegar o reiniciar. Descarga copias desde Admin.

## Votación MVP
- Sin campo de nombre: se pulsa el botón del jugador y el voto entra en la lista. Cada dispositivo vota una sola vez y, al votar, desaparecen los botones.
- Para que un dispositivo pueda votar de nuevo, quita ese voto desde Admin.
- Los jugadores de la lista se gestionan desde Admin (añadir fichajes / borrar). También puedes borrar MVPs anteriores.
- La primera vez que arranca esta versión, la lista de jugadores se sustituye por la del equipo actual (con copia previa en `data/backups/`); el historial de MVPs no se toca.

## Que no se duerma (Render)
- El servidor se llama a sí mismo cada 4 min (`/healthz`) usando `RENDER_EXTERNAL_URL`, que Render define solo.
- En plan gratuito eso ayuda pero no es 100 % fiable. Añade además un pinger externo gratis (UptimeRobot o cron-job.org) que abra `https://TU-APP.onrender.com/healthz` cada 5 min.
- Con plan de pago (el que ya necesitas para el disco persistente) Render no duerme la web.
