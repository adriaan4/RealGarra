# Real Garra Balonpié

## Ver en local (Windows / PowerShell)
    npm.cmd install
    npm.cmd start
Web: http://localhost:3000 · Panel admin (no enlazado en la web): http://localhost:3000/admin

## Datos
Todo se guarda en `data/data.json` (más `data.json.bak` y copias en `data/backups/`).
`data/` NO se sube a git, así que subir cambios no toca los datos.

## Votos
Un voto por dispositivo (cookie). Opcional: límite por IP con la variable `MAX_VOTES_PER_IP` (ver la IP detectada en /admin antes de activarlo).

## Render
1. Persistent Disk (plan de pago) montado en `/var/data`.
2. Variables: `DATA_DIR=/var/data`, `ADMIN_PASSWORD=<tu contraseña>`
3. Build: `npm install` · Start: `npm start`
