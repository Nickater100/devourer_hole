# API de Angry Ball — despliegue

Reemplaza a Firebase (Auth + Firestore). Ranking mundial, cuentas con Google y
borrado de cuenta. Corre en el **servidor de Astragal**, pero como servicio
aparte: su propio contenedor, su propia base y su propio deploy. Un deploy de
Angry Ball no toca a Astragal ni al revés.

```
Internet → nginx del host (astragal.duckdns.org, HTTPS)
             ├── /api/ …              → Astragal (127.0.0.1:3001)
             ├── /angryball/api/ …    → angryball-api (127.0.0.1:3010)   ← esto
             └── /angryball/borrar-cuenta → página para Google Play
                                           └── volumen angryball-data (SQLite + backups/)
```

- **Base:** SQLite (`node:sqlite`, sin dependencias nativas) en el volumen
  `angryball-data`. Como el `data-root` de Docker del servidor es `/data` (el
  volumen de bloque), queda fuera del disco de arranque igual que la de Astragal.
- **Respaldos:** `deploy.sh` hace una copia (`VACUUM INTO`) antes de cada deploy
  y guarda las últimas 20 en `/data/backups/` dentro del volumen.
- **Login:** el plugin nativo de Google de la APK da un ID token; la API verifica
  firma, emisor, vencimiento y que la audiencia sea el client id de Angry Ball.
  No se guarda el mail.
- **Anti-trampa básico:** cada puntaje llega con cubos, segundos y combo, y se
  rechaza lo imposible (`src/validate.js`).

## Endpoints (detrás de `/angryball/api`)

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| GET | `/health` | — | Para el healthcheck |
| POST | `/auth/google` | — | `{ idToken }` → `{ token, user, best, rank }` |
| POST | `/auth/logout` | sí | Cierra la sesión |
| GET | `/me` | sí | Usuario, mejor puntaje y puesto |
| DELETE | `/me` | sí | Borra la cuenta y todo lo suyo |
| POST | `/scores` | sí | `{ score, kills, seconds, bestCombo }`; guarda sólo si mejora |
| GET | `/leaderboard?limit=50` | opcional | Top y, con sesión, tu puesto |

## Puesta en marcha (una sola vez)

1. **Astragal: una línea en nginx.** En `D-Dover/deploy/nginx/everweave.conf`,
   dentro del `server` que escucha en 443, antes de la `location /`:

   ```nginx
   # Angry Ball (otro proyecto, otro contenedor): ver devourer_hole/server/deploy
   include /etc/nginx/angryball/*.conf;
   ```

   Con un comodín, nginx no falla si la carpeta está vacía: la línea es inocua
   aunque Angry Ball no esté instalado. Va en el repo de D-Dover porque
   `provision.sh` de Astragal reinstala esa config desde ahí; si se agrega sólo
   en el servidor, el próximo aprovisionamiento la borra.

2. **Aprovisionar** (desde la raíz de este repo):

   ```bash
   scp server/deploy/provision.sh server/deploy/deploy.sh server/deploy/docker-compose.yml server/deploy/nginx/angryball-*.conf opc@SERVIDOR:/tmp/
   ssh opc@SERVIDOR 'bash /tmp/provision.sh'
   ```

   Crea `~/angryball`, instala la zona de límite (`/etc/nginx/conf.d/`) y las
   rutas (`/etc/nginx/angryball/`), prueba `nginx -t` y sólo entonces recarga;
   si falla, vuelve atrás.

3. **Clave de deploy** (como la de Astragal, atada a un único comando):

   ```bash
   ssh-keygen -t ed25519 -f angryball-deploy -N "" -C angryball-deploy
   ```

   En el servidor, en `~/.ssh/authorized_keys`:

   ```
   command="/home/opc/angryball/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… angryball-deploy
   ```

4. **Secretos de GitHub** en `Nickater100/devourer_hole` (Settings → Secrets → Actions):
   `ANGRYBALL_DEPLOY_SSH_KEY` (la privada), `DEPLOY_HOST`, `DEPLOY_USER` (`opc`) y
   `DEPLOY_KNOWN_HOSTS` (los mismos valores que en D-Dover).

5. **Imagen:** el primer push a `main` que toque `server/` publica
   `ghcr.io/nickater100/angryball-api` y despliega. El servidor ya tiene sesión
   en GHCR (la usa para la imagen de Astragal), así que puede bajarla aunque el
   paquete sea privado.

6. **Importar el ranking de Firebase** (ver el encabezado de
   `scripts/import-firestore.js`). Hace falta una clave de cuenta de servicio
   del proyecto `under-hole` (Consola de Firebase → Configuración → Cuentas de
   servicio → Generar nueva clave privada): las reglas de Firestore no dejan
   leer el ranking sin sesión, y con la clave además se vincula cada puntaje
   viejo con la cuenta de Google de su dueño.

   ```bash
   cd ~/angryball
   docker compose cp ~/clave.json app:/data/clave.json
   docker compose exec -T app node scripts/import-firestore.js --service-account /data/clave.json --dry-run
   docker compose exec -T app node scripts/import-firestore.js --service-account /data/clave.json
   docker compose exec -T app rm /data/clave.json && rm ~/clave.json
   ```

   Después de importar, la clave se puede revocar desde la consola.

7. **Google Play:** en Seguridad de los datos, cambiar Firebase por "servidor
   propio" y declarar como URL de borrado
   `https://astragal.duckdns.org/angryball/borrar-cuenta`.

## Día a día

- Deploy: automático con cada push a `main` que toque `server/`. Ese push **no**
  publica la app en Play (`release.yml` ignora `server/**`).
- Logs: `cd ~/angryball && docker compose logs -f`
- Respaldo a mano: `docker compose exec -T app node src/backup.js`
- Local: `cd server && npm install && DEV_FAKE_LOGIN=1 npm run dev`, y el juego
  con `?debug&api=http://localhost:3010&devlogin=TuNombre`. `DEV_FAKE_LOGIN`
  deja entrar como cualquiera con un token `dev:nombre`; el servidor se niega a
  arrancar si además está `NODE_ENV=production`, que es lo que fija la imagen.
