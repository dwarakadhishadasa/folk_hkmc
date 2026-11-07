-- `contacts.rounds` was migrated from Airtable's number field as TEXT, and the
-- manage interface now edits it as a number. A text column lets anything into a
-- field that only ever held whole numbers, so narrow it to `smallint`.
--
-- Only values that are exactly an integer in range are kept. A value that is
-- not ("3 rounds", "three", out of range) becomes NULL rather than blocking the
-- migration on data the field's own contract already disowned.
ALTER TABLE public.contacts
  ALTER COLUMN rounds TYPE smallint
  USING (
    CASE
      WHEN btrim(rounds) ~ '^-?\d{1,5}$'
        AND btrim(rounds)::integer BETWEEN -32768 AND 32767
        THEN btrim(rounds)::smallint
      ELSE NULL
    END
  );
