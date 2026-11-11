#!/usr/bin/env bash
#
# Prepara el servidor de Astragal para alojar la API de Angry Ball. Se corre
# UNA vez (es idempotente: se puede repetir) desde el usuario opc:
#
#   scp server/deploy/{provision.sh,deploy.sh,docker-compose.yml} \
#       server/deploy/nginx/angryball-*.conf opc@SERVIDOR:/tmp/
#   ssh opc@SERVIDOR 'bash /tmp/provision.sh'
#
# No toca nada de Astragal salvo recargar nginx, y sólo si `nginx -t` pasa.
set -euo pipefail

SRC=/tmp
DEST="$HOME/angryball"

echo "==> Carpeta $DEST"
mkdir -p "$DEST"
install -m 644 "$SRC/docker-compose.yml" "$DEST/docker-compose.yml"
install -m 755 "$SRC/deploy.sh" "$DEST/deploy.sh"
# Por si el checkout de Windows los dejó en CRLF
sed -i 's/\r$//' "$DEST/deploy.sh" "$DEST/docker-compose.yml"

echo "==> nginx: zona de límite y rutas"
sudo install -d -m 755 /etc/nginx/angryball
TMPCONF=$(mktemp -d)
for f in angryball-zone.conf angryball-locations.conf; do sed 's/\r$//' "$SRC/$f" > "$TMPCONF/$f"; done
# Respaldo de lo anterior, para volver atrás si nginx -t falla
sudo cp -a /etc/nginx/conf.d/angryball-zone.conf "$TMPCONF/zone.bak" 2>/dev/null || true
sudo cp -a /etc/nginx/angryball/locations.conf "$TMPCONF/locations.bak" 2>/dev/null || true
sudo install -m 644 "$TMPCONF/angryball-zone.conf" /etc/nginx/conf.d/angryball-zone.conf
sudo install -m 644 "$TMPCONF/angryball-locations.conf" /etc/nginx/angryball/locations.conf
command -v restorecon >/dev/null && sudo restorecon -R /etc/nginx/angryball /etc/nginx/conf.d/angryball-zone.conf || true

if ! grep -q 'include /etc/nginx/angryball/\*.conf' /etc/nginx/conf.d/*.conf ~/nginx/*.conf 2>/dev/null; then
  echo "!!! everweave.conf todavía no incluye /etc/nginx/angryball/*.conf." >&2
  echo "    Hace falta la línea en el server HTTPS de D-Dover/deploy/nginx/everweave.conf" >&2
  echo "    (ver server/deploy/README.md). Las rutas quedan instaladas pero sin uso." >&2
fi

if sudo /usr/sbin/nginx -t; then
  sudo /usr/bin/systemctl reload nginx
  echo "==> nginx recargado"
else
  echo "!!! nginx -t falló: vuelvo a la config anterior sin recargar" >&2
  if [ -f "$TMPCONF/zone.bak" ]; then sudo cp -a "$TMPCONF/zone.bak" /etc/nginx/conf.d/angryball-zone.conf; else sudo rm -f /etc/nginx/conf.d/angryball-zone.conf; fi
  if [ -f "$TMPCONF/locations.bak" ]; then sudo cp -a "$TMPCONF/locations.bak" /etc/nginx/angryball/locations.conf; else sudo rm -f /etc/nginx/angryball/locations.conf; fi
  exit 1
fi
rm -rf "$TMPCONF"

cat <<EOF

==> Listo. Falta, una sola vez:
  1. La clave de deploy (en tu PC):  ssh-keygen -t ed25519 -f angryball-deploy -N ""
  2. En el servidor, agregar a ~/.ssh/authorized_keys esta línea (con la .pub):
     command="$DEST/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... angryball-deploy
  3. En GitHub (Nickater100/devourer_hole → Settings → Secrets → Actions):
     ANGRYBALL_DEPLOY_SSH_KEY (la privada), DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS
  4. Primer arranque a mano: cd $DEST && ./deploy.sh
EOF
