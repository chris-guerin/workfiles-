#!/usr/bin/env bash
# api/smoke-test.sh — verify the deployed API behaves correctly.
#
# Usage:
#   bash api/smoke-test.sh <base-url> <api-key>
#
# Example:
#   bash api/smoke-test.sh https://signal-engine-api.up.railway.app 528f7fd5...
#
# Tests the full lifecycle: health → insert → duplicate → list → mini_signal
# (with heat_map increment) → delete. Test rows are tagged with signal_id
# prefix '_smoke_test_' for easy cleanup.
#
# Cleanup (run in psql against hypothesis-db when satisfied):
#   DELETE FROM mini_signals       WHERE signal_id LIKE '_smoke_test_%';
#   DELETE FROM heat_map_aggregates WHERE company = '_smoke_test_co';
#   DELETE FROM news               WHERE signal_id LIKE '_smoke_test_%';

set -euo pipefail

BASE="${1:-}"
KEY="${2:-}"

if [ -z "$BASE" ] || [ -z "$KEY" ]; then
  echo "Usage: bash $0 <base-url> <api-key>" >&2
  exit 1
fi

BASE="${BASE%/}"   # strip trailing slash
TS="$(date +%s)"
SIG="_smoke_test_${TS}"
HDR_AUTH="Authorization: Bearer ${KEY}"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

curl_q() {
  # silent curl that exits non-zero on HTTP >= 400 but lets us capture body
  curl -sS -w '\n__HTTP__%{http_code}' "$@"
}

# Tiny JSON field extractor for fields like "id":123 or "status":"inserted".
# Avoids requiring jq.
jq_field() {
  local field="$1" body="$2"
  echo "$body" | grep -oE "\"${field}\":[^,}]+" | head -1 | sed -E 's/.*:\s*"?([^",}]+).*/\1/'
}

# ---------- 1. Health ----------
step "GET /health"
resp="$(curl_q "${BASE}/health")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http: $body"
echo "$body" | grep -q '"ok":true' || fail "expected {ok:true}, got: $body"
ok "$body"

# ---------- 2. POST /news (first insert) ----------
step "POST /news (first insert, expect 'inserted')"
PAYLOAD=$(cat <<EOF
{
  "signal_id": "${SIG}",
  "source": "smoke-test-source",
  "signal_type": "Patent",
  "title": "Smoke test news item ${TS}",
  "sector_tags": "_smoke_test_sector",
  "tech_tags": "_smoke_test_tech",
  "geography": "Test",
  "companies_mentioned": "_smoke_test_co",
  "relevance_score": "0.5",
  "url": "https://example.invalid/${SIG}",
  "pub_date": "2026-05-01T00:00:00Z"
}
EOF
)
resp="$(curl_q -X POST "${BASE}/news" -H "$HDR_AUTH" -H 'Content-Type: application/json' -d "$PAYLOAD")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http: $body"
status="$(jq_field status "$body")"
[ "$status" = "inserted" ] || fail "expected status=inserted, got: $body"
NEWS_ID="$(jq_field id "$body")"
HASH="$(jq_field content_hash "$body")"
[ -n "$NEWS_ID" ] || fail "no id returned: $body"
[ -n "$HASH" ] || fail "no content_hash returned: $body"
ok "inserted id=${NEWS_ID} content_hash=${HASH:0:12}…"

# ---------- 3. POST /news (duplicate) ----------
step "POST /news (same payload, expect 'duplicate')"
resp="$(curl_q -X POST "${BASE}/news" -H "$HDR_AUTH" -H 'Content-Type: application/json' -d "$PAYLOAD")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http: $body"
status="$(jq_field status "$body")"
[ "$status" = "duplicate" ] || fail "expected status=duplicate, got: $body"
ok "duplicate detected: $body"

# ---------- 4. GET /news ----------
step "GET /news (expect our row to be present)"
resp="$(curl_q "${BASE}/news" -H "$HDR_AUTH")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http"
echo "$body" | grep -q "\"signal_id\":\"${SIG}\"" || fail "row not found in GET /news"
ok "row visible in /news"

# ---------- 5. POST /mini_signals (with heat map increment) ----------
step "POST /mini_signals (expect 'inserted' + 1 heat_map increment applied)"
MS_PAYLOAD=$(cat <<EOF
{
  "signal_id": "${SIG}",
  "headline": "Smoke test mini signal ${TS}",
  "url": "https://example.invalid/${SIG}",
  "source": "smoke-test-source",
  "companies": "_smoke_test_co",
  "technologies": "_smoke_test_tech",
  "geography": "Test",
  "event_type": "Patent",
  "short_summary": "Smoke test mini signal",
  "extraction_model": "claude-haiku-4-5-smoke",
  "source_news_id": ${NEWS_ID},
  "content_hash": "${HASH}",
  "heat_map_increments": [
    { "sector_tag": "_smoke_test_sector", "company": "_smoke_test_co", "signal_type": "Patent" }
  ]
}
EOF
)
resp="$(curl_q -X POST "${BASE}/mini_signals" -H "$HDR_AUTH" -H 'Content-Type: application/json' -d "$MS_PAYLOAD")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http: $body"
status="$(jq_field status "$body")"
[ "$status" = "inserted" ] || fail "expected status=inserted, got: $body"
applied="$(jq_field heat_map_increments_applied "$body")"
[ "$applied" = "1" ] || fail "expected 1 heat_map increment applied, got: $body"
ok "mini_signal inserted; 1 heat_map increment applied"

# ---------- 6. DELETE /news/:id ----------
step "DELETE /news/${NEWS_ID}"
resp="$(curl_q -X DELETE "${BASE}/news/${NEWS_ID}" -H "$HDR_AUTH")"
http="$(echo "$resp" | tail -1 | sed 's/__HTTP__//')"
body="$(echo "$resp" | sed '$d')"
[ "$http" = "200" ] || fail "expected 200, got $http: $body"
status="$(jq_field status "$body")"
[ "$status" = "deleted" ] || fail "expected status=deleted, got: $body"
ok "deleted"

# ---------- 7. GET /news (verify row is gone) ----------
step "GET /news (expect our row is gone)"
resp="$(curl_q "${BASE}/news" -H "$HDR_AUTH")"
body="$(echo "$resp" | sed '$d')"
echo "$body" | grep -q "\"signal_id\":\"${SIG}\"" \
  && fail "row still present after delete: ${SIG}"
ok "row gone"

# ---------- 8. Auth check ----------
step "Sanity: missing/wrong key returns 401"
http="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/news")"
[ "$http" = "401" ] || fail "expected 401 without key, got $http"
http="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/news" -H 'Authorization: Bearer nope')"
[ "$http" = "401" ] || fail "expected 401 with wrong key, got $http"
ok "401 enforced"

printf '\n\033[1;32mAll smoke tests passed.\033[0m\n\n'
echo "Test residue (run in psql against hypothesis-db when satisfied):"
echo "  DELETE FROM mini_signals       WHERE signal_id LIKE '_smoke_test_%';"
echo "  DELETE FROM heat_map_aggregates WHERE company = '_smoke_test_co';"
echo "  DELETE FROM news               WHERE signal_id LIKE '_smoke_test_%';"
echo ""
