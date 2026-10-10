# Local stack for the signed-in E2E flows (never prod)

The signed-in specs (signup, onboarding, desks, saved cars/searches, alerts, settings, /status) need a
Supabase project. Docker is not required: this folder stands up a **local-only** stand-in.

| Piece | What it is |
| --- | --- |
| Postgres 15+ | any local cluster, e.g. `initdb` + `pg_ctl -o "-p 55491"` |
| `bootstrap.sql` | Supabase shell: `anon` / `authenticated` / `service_role` / `authenticator` roles, `auth.users`, `auth.uid()`/`auth.jwt()`, `storage`, `cron` stubs, pgvector/postgis stand-ins (`float8[]` + `<=>`, `geography` domain) |
| `apply-migrations.sh` | applies every file in `supabase/migrations` with the stand-in rewrites; only the HNSW / GiST geo indexes fail (logged) |
| PostgREST 12.2 | static binary from GitHub releases, `db-anon-role=anon`, `jwt-secret` from `keys.cjs` |
| `gateway.cjs` | port 54321: `/rest/v1` -> PostgREST, `/auth/v1` -> a tiny mock GoTrue (signup, password token, refresh, user, logout) backed by `auth.users` |
| `keys.cjs` | prints local anon / service-role JWTs (HS256, local secret) |
| `seed.py` | 5,000 deals (5 perturbed copies of a real 1,000-row `/api/deals` sample), ~3.5k price-history points, ~2k sold comps (real Norfolk impound sales + synthetic retail comps) |

```bash
createdb -p 55491 -h 127.0.0.1 -U postgres mikehunt
psql postgresql://postgres@127.0.0.1:55491/mikehunt -f e2e/local-stack/bootstrap.sql
e2e/local-stack/apply-migrations.sh
python3 e2e/local-stack/seed.py deals.json norfolk_sold.json && psql postgresql://postgres@127.0.0.1:55491/mikehunt -f seed.sql
node e2e/local-stack/keys.cjs > /tmp/keys.env && . /tmp/keys.env
./postgrest pgrst.conf &   # db-uri=postgres://authenticator:authpw@127.0.0.1:55491/mikehunt, server-port=54330
node e2e/local-stack/gateway.cjs &
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE \
  ADMIN_EMAIL=e2e-admin@local.test npm run build && PORT=3100 npm start &
E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e
```

Prod runs (`npm run e2e:prod`) only execute the guest specs; every write / sign-in spec skips itself
when `E2E_BASE_URL` is not localhost (`e2e/support/target.ts`), and the account helpers throw.

## Scale probes (local only)

`scale.sql` adds realistic 768-d embeddings to every row (`-v phase_b=1`) and grows the table to 25k rows
by cloning seeded rows (`-v phase_c=1`, `source_deal_id LIKE 'scale-%'`). Remove with
`DELETE FROM deals WHERE source_deal_id LIKE 'scale-%'`. Never point this at a hosted database.
