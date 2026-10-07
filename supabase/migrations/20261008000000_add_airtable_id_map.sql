-- Migration: public.airtable_id_map — the persisted Airtable rec* → UUID map.
--
-- Story 7.9 (cutover) needs one table that the backfill, the auth migration and
-- the rollback all share. It records, per program, which Supabase UUID a given
-- Airtable record id became. That single fact buys three properties the cutover
-- depends on:
--
--   * ids are decided BEFORE the first insert, so a re-run reuses them instead of
--     duplicating a row;
--   * the map is the rollback ledger — `--rollback` deletes exactly the rows the
--     map recorded and nothing else;
--   * a re-run can report `inserted 0` rather than guessing at idempotency from
--     natural keys.
--
-- RLS is enabled with no policies, so only the service role (which bypasses RLS)
-- can read or write it. It holds no user data — just ids — but it is the key to
-- the whole backfill, so anon/authenticated access stays closed by default.
--
-- Applied through `scripts/apply-migrations.mjs` (Management API
-- `POST /v1/projects/{ref}/database/query`): direct Postgres does not connect
-- from this environment.

CREATE TABLE IF NOT EXISTS public.airtable_id_map (
  program_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  airtable_record_id TEXT NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, entity, airtable_record_id)
);

CREATE INDEX IF NOT EXISTS idx_airtable_id_map_target
  ON public.airtable_id_map (program_id, entity, target_id);

ALTER TABLE public.airtable_id_map ENABLE ROW LEVEL SECURITY;