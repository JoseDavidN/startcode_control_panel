#!/usr/bin/env bash
# Regenera docker/postgres/initdb/01-schema.sql: el esquema completo de la
# base a partir de las entidades de TypeORM, para una instalación nueva en
# producción (allí synchronize está apagado y las migraciones de
# src/migrations solo son incrementales).
#
# Ejecutar tras cambiar cualquier entidad, junto con su migración add_*.sql:
#   ./docker/generate-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="postgres:16"
NAME="startcode-schema-gen-$$"
PORT="${SCHEMA_GEN_PORT:-55499}"
OUT="docker/postgres/initdb/01-schema.sql"

pnpm run build

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=schema -p "127.0.0.1:${PORT}:5432" "$IMAGE" >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT

node docker/sync-schema.cjs "postgres://postgres:schema@127.0.0.1:${PORT}/postgres"

{
  echo "-- Esquema inicial de StartCode Panel (backend $(node -p "require('./package.json').version"))."
  echo "-- Generado por docker/generate-schema.sh desde las entidades de TypeORM: no editar a mano."
  echo "-- Postgres lo ejecuta solo al crear el volumen de datos (docker-entrypoint-initdb.d)."
  echo
  # \restrict/\unrestrict (pg_dump ≥ 16.10) son metacomandos de psql que una
  # imagen de Postgres anterior no entiende; el volcado es nuestro, no hacen falta.
  docker exec "$NAME" pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges \
    | grep -vE '^\\(un)?restrict '
} > "$OUT"

echo "Escrito $OUT"
