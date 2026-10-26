-- Migration: grant DELETE on the two survey tables to service_role.
-- Date: 2026-10-26
-- Story: 1.5 — the per-campaign survey builder.
--
-- AD-12 says a survey question that has responses is retired, never deleted.
-- Story 1.5's builder offers Delete only while a question still has zero
-- responses, and it replaces an option set by removing the options no longer
-- submitted. Both need a DELETE the service role did not hold:
-- 20261025000000_create_dialer_tables.sql granted service_role exactly
-- SELECT/INSERT/UPDATE, so the delete path answered 500 instead of removing a
-- row, and a failed question insert could not roll back its own options.
--
-- The rule stays where it is enforced: lib/dialer/surveys.ts refuses a delete
-- with 409 question_has_responses before issuing it. No browser role gains
-- anything here — anon still holds no privilege and authenticated still holds
-- SELECT only on every dialer table.

GRANT DELETE ON TABLE public.dialer_survey_questions TO service_role;
GRANT DELETE ON TABLE public.dialer_survey_options TO service_role;
