-- Migration: at most one location per contact.
--
-- spec-linked-record-picker. `public.contacts.location_ids` is a TEXT[] with no
-- cardinality bound, so nothing at the schema level stops a contact from being
-- filed under several locations — and every write path that could produce two
-- (the favourites view's multi-toggle, the API's ≤50 cap) has now been narrowed
-- to one. This file is the guarantee the UI cannot give. The API rejects a
-- second id as a 4xx before the row is touched, so a client sees a clean message
-- rather than a constraint violation surfaced as a 500.
--
-- `public.users.location_ids` is deliberately NOT touched. It is UUID[] and it
-- is plural on purpose: `caller_effective_location_ids()` reads it as the RLS
-- scoping mechanism for staff, which is a different field with a different job.
--
-- This migration REFUSES rather than truncates. If any row already holds more
-- than one id the pre-flight raises and the whole transaction aborts with the
-- offending ids, because choosing which location to keep is a data decision only
-- a human may make. Truncating here would silently destroy a fact.
--
-- Re-runnable: the pre-flight is a count, and the constraint is dropped and
-- re-added so a second run is a no-op that re-validates nothing new.
--
-- -- DOWN:
-- --   ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_location_ids_at_most_one;

DO $$
DECLARE
  v_count integer;
  v_ids text;
BEGIN
  SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY id::text), '(none)')
    INTO v_count, v_ids
    FROM public.contacts
    WHERE coalesce(cardinality(location_ids), 0) > 1;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'contacts.location_ids holds % row(s) with more than one location: %. Resolve them before applying this migration; it will not truncate.',
      v_count, v_ids;
  END IF;
END $$;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_location_ids_at_most_one;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_location_ids_at_most_one
  CHECK (cardinality(location_ids) <= 1);
