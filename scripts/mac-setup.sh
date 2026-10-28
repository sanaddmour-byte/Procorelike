#!/usr/bin/env bash
# One-time local setup for SiteOps on macOS. Safe to re-run.
# Needs: Homebrew, Docker Desktop (running). Installs Node 22 and pnpm if missing.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop, then run this again."; exit 1; }

say "Node 22 and pnpm"
command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || brew install node@22
command -v pnpm >/dev/null || { corepack enable && corepack prepare pnpm@10.33.0 --activate; }

say "Environment file"
[ -f .env ] || cp .env.example .env

say "Dependencies"
pnpm install --frozen-lockfile

say "Postgres, MinIO (file storage) and MailHog (test email)"
docker compose up -d
until docker compose exec -T postgres pg_isready -U siteops -d siteops >/dev/null 2>&1; do sleep 1; done
docker compose exec -T minio sh -c 'mc alias set local http://localhost:9000 siteops siteops123 >/dev/null && mc mb --ignore-existing local/siteops-attachments' || echo "(could not create the storage bucket; drawings/photos uploads will not work)"

say "Database: migrate, seed, demo content"
pnpm db:migrate
pnpm db:seed
pnpm --filter @siteops/db exec tsx --env-file=../../.env src/seed-demo-content.ts

say "Done"
cat <<'MSG'
Start the app:      pnpm dev
Open:               http://localhost:3000
Sign in:            sara.haddad@siteops.test  /  ChangeMe123!
Test email inbox:   http://localhost:8025
File storage UI:    http://localhost:9001  (siteops / siteops123)
Stop services:      pnpm docker:down
MSG
