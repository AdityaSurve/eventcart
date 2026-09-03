#!/bin/sh
set -e

echo "Applying database schema..."
attempt=0
max_attempts=30

until npx prisma db push; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database schema sync failed after ${max_attempts} attempts."
    exit 1
  fi
  echo "Database not ready yet, retrying (${attempt}/${max_attempts})..."
  sleep 2
done

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding database..."
  node scripts/seed-docker.cjs || echo "Seed skipped or already applied."
fi

echo "Starting API..."
exec "$@"
