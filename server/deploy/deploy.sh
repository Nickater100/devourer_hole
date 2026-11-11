#!/usr/bin/env bash
#
# Único comando que puede ejecutar la clave de deploy de Angry Ball. Se instala
# como ~/angryball/deploy.sh y se fija en ~/.ssh/authorized_keys con
# command="..." (ver deploy/README.md): aunque el secret de GitHub se filtre,
# quien lo tenga no obtiene una shell, sólo puede redesplegar ESTE servicio.
set -euo pipefail

DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
if [ "$(basename "$DIR")" != "angryball" ]; then
  echo "!!! deploy.sh tiene que vivir en ~/angryball, no en $DIR" >&2
  exit 1
fi
cd "$DIR"
CONTENEDOR=angryball-api

# Respaldo antes de cambiar nada (si ya hay un contenedor andando).
if docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
  echo "==> Respaldando la base"
  docker compose exec -T app node src/backup.js || echo "!!! El respaldo falló; sigo igual" >&2
fi

echo "==> Bajando la imagen nueva"
docker compose pull app

echo "==> Levantando"
docker compose up -d

echo "==> Esperando a que el healthcheck pase"
for i in $(seq 1 24); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$CONTENEDOR" 2>/dev/null || echo ausente)
  echo "    intento $i/24: $estado"
  if [ "$estado" = "healthy" ]; then
    echo "==> OK, desplegado y sano"
    docker compose images
    docker image prune -f >/dev/null || true
    exit 0
  fi
  if [ "$estado" = "ausente" ] && [ "$i" -gt 4 ]; then break; fi
  sleep 5
done

echo "!!! El contenedor no llegó a healthy. Últimos logs:" >&2
docker compose logs --tail 60 >&2
exit 1
