#!/usr/bin/env bash
# api/deploy.sh — guided deploy of signal-engine-api to Railway.
#
# Usage: bash api/deploy.sh
#
# Idempotent: re-running checks state and skips already-done steps.
# Interactive bits (login, link) are kept interactive.
#
# Prerequisites you must have done in the Railway dashboard:
#   1. Created an empty service in the same project as n8n + hypothesis-db.
#      (Suggested name: signal-engine-api.)
#   2. Set env vars on that service:
#        API_KEY      = the openssl-generated 64-char hex string
#        DATABASE_URL = ${{hypothesis-db.DATABASE_URL}}  (Railway reference)
#   3. Generated a public domain (Settings → Networking → Generate Domain).

set -euo pipefail

cd "$(dirname "$0")"   # cd to api/ no matter where it's run from

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# ---------- 1. Railway CLI ----------
step "Checking Railway CLI"
if ! command -v railway >/dev/null 2>&1; then
  warn "railway not on PATH"
  echo "  Install it: npm install -g @railway/cli"
  echo "  Then re-run this script."
  exit 1
fi
ok "railway $(railway --version 2>&1 | head -1)"

# ---------- 2. Login ----------
step "Checking Railway auth"
if ! railway whoami >/dev/null 2>&1; then
  warn "not logged in"
  echo "  Running: railway login"
  railway login
fi
ok "logged in as $(railway whoami 2>&1 | tr -d '\r' | head -1)"

# ---------- 3. Link ----------
step "Checking Railway project link"
if [ ! -f ".railway/config.json" ] && [ ! -f "../.railway/config.json" ]; then
  warn "directory not linked to a Railway service"
  echo "  Running: railway link"
  echo "  Select the project containing n8n + hypothesis-db, then the signal-engine-api service."
  railway link
else
  ok "linked"
fi

# ---------- 4. Verify env vars on remote ----------
step "Verifying remote env vars"
remote_vars="$(railway variables 2>&1 || true)"
for v in API_KEY DATABASE_URL; do
  if echo "$remote_vars" | grep -q "^${v} \|^${v}=\|│ ${v} "; then
    ok "$v set on remote"
  else
    warn "$v not visible in 'railway variables' output"
    echo "    If you set it via dashboard reference (\${{hypothesis-db.DATABASE_URL}})"
    echo "    it may not appear in 'railway variables'. Continuing — deploy will fail fast"
    echo "    at startup if the var is genuinely missing."
  fi
done

# ---------- 5. Deploy ----------
step "Deploying"
echo "  Running: railway up"
echo ""
railway up

# ---------- 6. Surface URL ----------
step "Deployment complete"
echo ""
echo "  To find the public URL:"
echo "    railway domain"
echo ""
echo "  To stream logs:"
echo "    railway logs"
echo ""
echo "  To smoke-test:"
echo "    bash api/smoke-test.sh <public-url> <api-key>"
echo ""
