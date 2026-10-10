-- Embedding freshness for deals.
--
-- Before this migration a deal was embedded once (when deals.embedding was NULL) and never again,
-- so a deal whose year/make/model/trim/mileage/title changed kept a stale vector forever, and
-- nothing recorded when a vector was written.
--
-- embedded_at            when the current vector was written by the backfill writer.
-- embedding_source_hash  sha256 of "<model>:<dims>:<exact text that was embedded>"
--                        (lib/ai/embedding-freshness.ts). The writer recomputes it from the live
--                        row and re-embeds when it differs, so content edits (and any change to
--                        the embedded-text recipe or model) trigger a refresh.
--
-- Additive and idempotent. Safe to apply before or after the code deploy: the writer detects
-- missing columns and falls back to the old "embed rows with no vector" behaviour.

alter table public.deals
  add column if not exists embedded_at timestamptz,
  add column if not exists embedding_source_hash text;

comment on column public.deals.embedded_at is
  'When the current embedding was written. For vectors that existed before 20261009200000 this '
  'is the migration apply time (a "pre-existing" marker), NOT the true embed time, which was '
  'never recorded. Those rows keep embedding_source_hash NULL so the writer re-embeds them.';
comment on column public.deals.embedding_source_hash is
  'sha256 of model:dims:embedded text. NULL = never embedded by the freshness-aware writer.';

-- Backfill: we do not know when existing vectors were written, so we do not pretend to. They
-- get embedded_at = now() (apply time) and keep embedding_source_hash = NULL. NULL hash means
-- "provenance unknown": the writer re-embeds these in its lowest-priority tier, after deals
-- with no vector and deals whose content changed. The daily-budget counter only counts rows
-- with a non-NULL hash, so this backfill does not consume the day's embedding budget.
update public.deals
   set embedded_at = now()
 where embedding is not null
   and embedded_at is null;

-- "Needs a first embedding": active deals with no vector, newest first.
create index if not exists deals_needs_embedding_idx
  on public.deals (created_at desc)
  where active = true and embedding is null;

-- Freshness scan + daily-budget count: active deals that have a vector, by write time.
create index if not exists deals_embedded_at_idx
  on public.deals (embedded_at desc)
  where active = true and embedding is not null;
