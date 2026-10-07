-- Migration: Scope public.sessions by preacher, not by creator alone.
-- Date: 2026-10-07
-- Additive only: drops and recreates the single SELECT policy
-- "Sessions are scoped by creator and program". No other policy, no write
-- policy, and no helper function is touched.
--
-- Why: the creator-only scope made a preacher's own sessions invisible
-- whenever another staff account created them. In production every one of
-- Dharmistha Yudhisthira Dasa's 107 sessions was created by Sudama Vipra
-- Dasa, so his `/manage` portal rendered zero sessions while his 478
-- contacts and 898 attendance records rendered normally. `attendance` was
-- already scoped by the parent session's `preacher_id` through
-- caller_can_read_attendance_session(), so the same session was readable
-- from the attendance side and unreadable from the sessions side.
--
-- Read-scope contract: _bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md
--
--   sessions   : program + (Admin |
--                (Preacher/Assistant) created_by = caller |
--                (Preacher/Assistant) preacher_id = caller |
--                Assistant created_by = caller's active assigned preacher |
--                Assistant preacher_id = caller's active assigned preacher)
--
-- `preacher_id` terms resolve through caller_assigned_preacher_id(), which
-- returns NULL when the caller or the assigned preacher is not Active — so
-- the Inactive-preacher collapse still holds and an Assistant keeps only
-- their own-created sessions in that state. Role gates are unchanged, so a
-- Volunteer still falls through to zero sessions.

DROP POLICY IF EXISTS "Sessions are scoped by creator and program" ON public.sessions;

CREATE POLICY "Sessions are scoped by creator, preacher and program" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (
        public.caller_role() IN ('Preacher', 'Assistant')
        AND (
          created_by = auth.uid()
          OR preacher_id = auth.uid()
          OR created_by = public.caller_assigned_preacher_id()
          OR preacher_id = public.caller_assigned_preacher_id()
        )
      )
    )
  );
