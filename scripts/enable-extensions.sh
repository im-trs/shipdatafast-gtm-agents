#!/bin/bash

set -e

: "${POSTGRES_HOST:=localhost}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=shipdatafast_gtm}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_PASSWORD:=postgres}"
: "${CONTAINER_NAME:=postgres-db}"

export PGPASSWORD="$POSTGRES_PASSWORD"

# Try local psql first, fall back to docker exec
if command -v psql &> /dev/null; then
  psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
else
  docker exec -it "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
fi

echo "pgcrypto enabled."
