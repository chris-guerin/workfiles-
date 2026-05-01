# signal-engine-api

Thin HTTP layer over `hypothesis-db` for n8n workflows. Deployed to Railway alongside `n8n` and `hypothesis-db`.

## Endpoints

All authenticated endpoints require `Authorization: Bearer <API_KEY>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Public healthcheck. Returns `{ok: true}` if PG reachable. |
| POST | `/news` | Insert raw news row. Computes `content_hash = sha256(title|url|pub_date)`. Returns `duplicate` if hash exists in `news` or `mini_signals`. |
| GET | `/news` | Returns all rows in `news`, ordered by `pub_date DESC`. |
| DELETE | `/news/:id` | Hard-deletes the row. |
| POST | `/mini_signals` | Insert mini_signals row. Optional `heat_map_increments: [{sector_tag, company, signal_type}]` array; each increment upserts `heat_map_aggregates` for today's date. |

## Environment

| Var | Source |
|---|---|
| `API_KEY` | Set on Railway service. Generated via `openssl rand -hex 32`. Single key for all endpoints. |
| `DATABASE_URL` | Reference Railway's `hypothesis-db.DATABASE_URL` via `${{hypothesis-db.DATABASE_URL}}`. |
| `PORT` | Railway sets this automatically. |

## Deploy

```sh
# From this directory:
railway link        # link to the Railway project
railway up          # deploy current directory
```

## Local dev

```sh
cp .env.example .env  # then set API_KEY and DATABASE_URL
npm install
npm run dev
```

## Spec reference

Built per `/MIGRATION_004_AND_WORKFLOWS_SPEC.md` Section 3. Schema lives in migration 004 (`/db/migrations/004_substrate.sql`).
