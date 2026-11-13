-- Migration: convert the four calendar-date columns from TEXT to DATE.
--
-- Story 3 (spec-contacts-date-types): `public.contacts.date_of_birth`,
-- `public.contacts.initial_contact`, `public.contacts.last_contacted_on` and
-- `public.sessions.session_date` were declared TEXT, so every date guarantee
-- was a convention held by code paths that disagreed. After this file they
-- are DATE, and the write paths agree with the type:
-- `lib/manage/api-handlers.ts` `optionalIsoDate` accepts only blank or
-- exactly `YYYY-MM-DD` naming a real calendar day, and both apps'
-- `app/api/sessions/route.ts` slice `startsAt.toISOString()` to ten
-- characters before `createSession`.
--
-- One rule, written three times: blank (contacts) / ten-character date,
-- `^\d{4}-\d{2}-\d{2}$` AND a real calendar date. Here it is
-- `pg_input_is_valid(left(col,10),'date')` — the same expression the cast
-- feeds, so `true` means `left(col,10)::date` returns and `false` means it
-- would raise. `to_date(...) IS NULL` is NOT used: it raises instead of
-- returning NULL, and it silently coerces values like `"35000"`.
--
-- Per Dwaraka's 2026-11-13 decision, `last_contacted_on` keeps the Airtable
-- dates: uncastable values are reported and nulled like every other column,
-- and every castable value survives the TEXT -> DATE conversion.
--
-- Per Dwaraka's 2026-10-11 scope addition, `sessions.session_date` rides this
-- same file under the same rule. The sessions POST writes a full ISO
-- timestamp on every create, so `prefix_with_trailing` is the expected shape
-- of its population — truncate, don't reject, in the cast.
--
-- No timestamp or timezone conversion anywhere in this file. Postgres `date`
-- is timezone-naive and the write paths already produce program-local
-- (`Asia/Kolkata`) calendar dates, so the cast is `left(col,10)::date` with
-- no clock anywhere in the expression: no timezone operator, no
-- clock-reading function, no current-day default.
--
-- Re-runnable: every block first reads `information_schema.columns` and
-- skips the column when it is already `date` (a `~` predicate against a
-- `date` column errors with `operator does not exist: date ~ unknown`).
--
-- -- DOWN:
-- --   ALTER TABLE public.contacts ALTER COLUMN date_of_birth TYPE text USING date_of_birth::text;
-- --   ALTER TABLE public.contacts ALTER COLUMN initial_contact TYPE text USING initial_contact::text;
-- --   ALTER TABLE public.contacts ALTER COLUMN last_contacted_on TYPE text USING last_contacted_on::text;
-- --   ALTER TABLE public.sessions ALTER COLUMN session_date TYPE text USING session_date::text;
-- -- One-way loss: rows nulled by the reporting steps below cannot be restored
-- -- by `date -> text`. The notices in the apply log are the only record of
-- -- what was nulled.

DO $$
DECLARE
  v_dtype text;
  v_count integer;
  v_ids text;
BEGIN
  SELECT data_type INTO v_dtype
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'date_of_birth';
  IF v_dtype IS DISTINCT FROM 'date' THEN
    SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY id::text), '(none)')
      INTO v_count, v_ids
      FROM public.contacts
      WHERE date_of_birth IS NOT NULL
        AND NOT (date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(date_of_birth, 10), 'date'));
    RAISE NOTICE 'contacts.date_of_birth: % uncastable row(s) to be nulled: %', v_count, v_ids;
    UPDATE public.contacts SET date_of_birth = NULL
      WHERE date_of_birth IS NOT NULL
        AND NOT (date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(date_of_birth, 10), 'date'));
    ALTER TABLE public.contacts ALTER COLUMN date_of_birth TYPE date USING left(date_of_birth, 10)::date;
  ELSE
    RAISE NOTICE 'contacts.date_of_birth already date, skipping';
  END IF;
END $$;

DO $$
DECLARE
  v_dtype text;
  v_count integer;
  v_ids text;
BEGIN
  SELECT data_type INTO v_dtype
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'initial_contact';
  IF v_dtype IS DISTINCT FROM 'date' THEN
    SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY id::text), '(none)')
      INTO v_count, v_ids
      FROM public.contacts
      WHERE initial_contact IS NOT NULL
        AND NOT (initial_contact ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(initial_contact, 10), 'date'));
    RAISE NOTICE 'contacts.initial_contact: % uncastable row(s) to be nulled: %', v_count, v_ids;
    UPDATE public.contacts SET initial_contact = NULL
      WHERE initial_contact IS NOT NULL
        AND NOT (initial_contact ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(initial_contact, 10), 'date'));
    ALTER TABLE public.contacts ALTER COLUMN initial_contact TYPE date USING left(initial_contact, 10)::date;
  ELSE
    RAISE NOTICE 'contacts.initial_contact already date, skipping';
  END IF;
END $$;

DO $$
DECLARE
  v_dtype text;
  v_count integer;
  v_ids text;
BEGIN
  SELECT data_type INTO v_dtype
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'last_contacted_on';
  IF v_dtype IS DISTINCT FROM 'date' THEN
    SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY id::text), '(none)')
      INTO v_count, v_ids
      FROM public.contacts
      WHERE last_contacted_on IS NOT NULL
        AND NOT (last_contacted_on ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(last_contacted_on, 10), 'date'));
    RAISE NOTICE 'contacts.last_contacted_on: % uncastable row(s) to be nulled: %', v_count, v_ids;
    UPDATE public.contacts SET last_contacted_on = NULL
      WHERE last_contacted_on IS NOT NULL
        AND NOT (last_contacted_on ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(last_contacted_on, 10), 'date'));
    ALTER TABLE public.contacts ALTER COLUMN last_contacted_on TYPE date USING left(last_contacted_on, 10)::date;
  ELSE
    RAISE NOTICE 'contacts.last_contacted_on already date, skipping';
  END IF;
END $$;

DO $$
DECLARE
  v_dtype text;
  v_count integer;
  v_ids text;
BEGIN
  SELECT data_type INTO v_dtype
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'session_date';
  IF v_dtype IS DISTINCT FROM 'date' THEN
    SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY id::text), '(none)')
      INTO v_count, v_ids
      FROM public.sessions
      WHERE session_date IS NOT NULL
        AND NOT (session_date ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(session_date, 10), 'date'));
    RAISE NOTICE 'sessions.session_date: % uncastable row(s) to be nulled: %', v_count, v_ids;
    UPDATE public.sessions SET session_date = NULL
      WHERE session_date IS NOT NULL
        AND NOT (session_date ~ '^\d{4}-\d{2}-\d{2}'
                 AND pg_input_is_valid(left(session_date, 10), 'date'));
    ALTER TABLE public.sessions ALTER COLUMN session_date TYPE date USING left(session_date, 10)::date;
  ELSE
    RAISE NOTICE 'sessions.session_date already date, skipping';
  END IF;
END $$;
