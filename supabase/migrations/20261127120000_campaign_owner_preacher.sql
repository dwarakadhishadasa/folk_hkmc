-- Campaigns are scoped exactly like sessions.
--
-- Sessions carry two ownership dimensions: `preacher_id` (the patch a session
-- belongs to) and `created_by` (the actor who created it). Campaigns only had
-- `created_by`, so the Campaign list had no way to tell an Admin's campaign
-- from a Preacher's, and every Preacher/Assistant read the whole programme.
--
-- `owner_preacher_id` is the campaign's `preacher_id`: set to the patch owner
-- when the campaign is created (the Assistant's assigned preacher, otherwise
-- the creating Admin/Preacher). Existing rows inherit their creator, which is
-- the only owner signal the old data had.
--
-- The SELECT policy mirrors the Sessions policy. The caller-facing policy is
-- untouched: a caller still reads the campaigns they hold assignments in.

ALTER TABLE public.dialer_campaigns
  ADD COLUMN IF NOT EXISTS owner_preacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.dialer_campaigns
SET owner_preacher_id = created_by
WHERE owner_preacher_id IS NULL
  AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS dialer_campaigns_owner_preacher_idx
  ON public.dialer_campaigns (program_id, owner_preacher_id);

DROP POLICY IF EXISTS "dialer_campaigns are readable by campaign admins in program"
  ON public.dialer_campaigns;

CREATE POLICY "dialer_campaigns are scoped like sessions" ON public.dialer_campaigns
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      (public.caller_role() = 'Admin' AND created_by = auth.uid())
      OR (
        public.caller_role() = 'Preacher'
        AND (
          owner_preacher_id = auth.uid()
          OR created_by = auth.uid()
          OR created_by IN (
            SELECT u.id
            FROM public.users u
            WHERE u.assigned_preacher_id = auth.uid()
              AND u.status = 'Active'
          )
        )
      )
      OR (
        public.caller_role() = 'Assistant'
        AND public.caller_assigned_preacher_id() IS NOT NULL
        AND (
          owner_preacher_id = public.caller_assigned_preacher_id()
          OR created_by = public.caller_assigned_preacher_id()
          OR created_by = auth.uid()
        )
      )
    )
  );
