# db — Postgres source-of-truth for the hypothesis register and Signal Tracker

## What this directory holds

```
db/
├── README.md                                    ← this file
├── schema/
│   └── hypothesis_register_v4.sql               ← CREATE TABLE for the register, schema v4
├── migrations/
│   └── 001_hypothesis_initial_load.js           ← initial load from Apps Script doGet
├── backups/                                     ← pg_dump snapshots, one per migration (gitignored)
└── .env                                         ← DATABASE_URL, APPS_SCRIPT_URL (gitignored)
```

## Why Postgres

Per ARCHITECTURE.md Section 7.1, the hypothesis register and Signal Tracker move from Google Sheets to Postgres on Railway. Sheets becomes a derived view, refreshed by sync. Datasette stays for read-only public access. The 28 April 2026 OAuth incident is the proximate driver: every Sheets-touching workflow failed simultaneously because they share one OAuth grant. Postgres removes that single point of failure for source-of-truth reads.

## Data flow direction

After Build E phase one completes the cutover (NOT today), the read direction is:

```
Postgres (canonical)
   │
   ▼ sync job (PG → Sheet)
Sheet (derived view, read-only for humans)
   │
   ▼ Apps Script doGet
n8n WF-15 and other consumers
```

Write direction (also post-cutover):

```
hypothesis_builder.html ──doPost──► Apps Script ──pg INSERT/UPDATE──► Postgres
```

The Sheet is never the write target after cutover. Any human edit to the Sheet is overwritten by the next sync. Edits go through `hypothesis_builder.html`.

## Today's state (2026-04-28)

Phase one artefacts produced:
- `schema/hypothesis_register_v4.sql` — CREATE TABLE mirroring the live 45 columns
- `migrations/001_hypothesis_initial_load.js` — dry-run-by-default load script
- This README

Phase one explicitly does NOT include:
- Provisioning the Railway Postgres service
- Running the migration
- Switching n8n's read path
- Editing Apps Script
- Touching the Sheet

The Sheet remains the source of truth until a dedicated cutover session.

## Running the initial load (dry-run)

```bash
cd db
npm init -y
npm install pg
cp ../n8n/.env .env       # then edit to add DATABASE_URL and APPS_SCRIPT_URL
node migrations/001_hypothesis_initial_load.js
```

Default behaviour: opens a transaction, upserts 118 rows by `hyp_id`, asserts post-insert count, reports R15 violations, **rolls back**. Source Sheet is never touched. The Postgres database is left in its pre-run state.

## Running the initial load (commit)

```bash
node migrations/001_hypothesis_initial_load.js --commit --confirm-yes
```

Both flags required. The `--commit` alone aborts as a safety check.

Before any commit, take a backup:

```bash
pg_dump "$DATABASE_URL" > backups/$(date -u +%Y-%m-%dT%H-%M-%SZ).sql
```

## Adding new migrations

File-naming convention: `NNN_short_description.js` where NNN is zero-padded sequential. Each migration:
1. Loads `.env`
2. Validates expected source state
3. Wraps changes in a transaction
4. Defaults to ROLLBACK; commits only on `--commit --confirm-yes`
5. Is idempotent (safe to re-run after commit)
6. Logs the final mode and row counts

Migration 001 is the template.

## Rollback procedure

If a committed migration produces unexpected state:

```bash
psql "$DATABASE_URL" < backups/<pre-migration-timestamp>.sql
```

Restoring from `pg_dump` is the rollback. There is no down-migration script in this scheme; the backup is the rollback. This is a deliberate trade for simplicity at small scale.

If the Sheet sync has already overwritten with bad data, restore the Sheet from Google Sheets version history (File → Version history) before the next sync runs.

## Schema versioning and R14

ARCHITECTURE.md R14 freezes the hypothesis register schema at v4.0. Schema changes require a versioned bump (v5.0, v5.1, etc.), an explicit note in the ARCHITECTURE.md version comment, and an update to all dependent tools (`hypothesis_builder.html`, `hypothesis_repository_v4_final.html`, etc.).

The current `schema/hypothesis_register_v4.sql` mirrors the **45 columns** observed in the live Apps Script payload on 2026-04-28. ARCHITECTURE.md states v4 is "frozen at 49 columns". This 4-column gap is unresolved and is logged as an open question for reconciliation. **Do not commit a Postgres data load until this is resolved.** The dry-run is safe regardless.

## Credentials

`db/.env` is gitignored and holds:

```
DATABASE_URL=postgres://<user>:<pass>@<host>:<port>/railway
APPS_SCRIPT_URL=https://script.google.com/macros/s/<id>/exec
```

`DATABASE_URL` comes from the Railway Postgres service Connect panel. Use the **internal** URL when running from inside the same Railway project (n8n service → PG service); use the **public** URL only for local migration runs.

`APPS_SCRIPT_URL` is the doGet endpoint for the master register, also documented in ARCHITECTURE.md Section 10.

`pg_dump` requires the same `DATABASE_URL` exposed as an env var:

```bash
export DATABASE_URL=$(grep DATABASE_URL db/.env | cut -d= -f2-)
```

## What this is NOT

This directory does not hold:
- The local SQLite copy of the contacts database (lives at repo root: `signal_engine_pe.db`)
- Datasette config (lives in `metadata.json` and `datasette.yaml` at repo root)
- The Signal Tracker schema (Build E phase two; future session)
- Apps Script source (`HypothesisRepository.gs` lives in the Apps Script project online; should be mirrored locally in a future cleanup pass)

## Related ARCHITECTURE.md sections

- Section 7.1 — Layer one ingestion and storage, target architecture
- Section 8 — The hypothesis register
- Section 16, Build E — Postgres migration spec
- Section 19, R14 — Schema frozen at v4
- Section 19, R16 — Metric bucket and field invariants
- Section 19, R22 — No push to n8n without diff
- Section 19, R25 — Document drift forbidden
