-- Migration: Admins read contact comments, inside their own patch.
-- Date: 2026-11-05
--
-- The first cut of `contact_comments` admitted Preacher and Assistant only.
-- Admins are now admitted too, so the policy changes from a role list to the
-- **patch** predicate every manage surface already uses.
--
-- Why this is not simply `caller_role() = 'Admin'`: the contacts SELECT policy
-- gives an Admin the whole programme, and a comment is not a contact. An Admin
-- reads and writes comments on the records in their own patch — the contacts
-- assigned to them, which is also where their assistants' contacts land, since
-- `contactWriteAttribution` stamps `assigned_preacher_id` with the patch owner.
-- `contact_comments` therefore needs the narrower predicate, or an Admin could
-- read every patch's notes via a direct table read.
--
-- `lib/supabase/contact-comments.ts` enforces the same boundary in code with
-- `contactInPatch`, because the route reads the contact through a service-role
-- client after `assertManageContactInScope`, whose Admin scope is the
-- programme. RLS alone would not refuse a crafted request.

DROP POLICY IF EXISTS "contact_comments readable by preachers and assistants"
  ON public.contact_comments;

CREATE POLICY "contact_comments readable by the patch's staff"
  ON public.contact_comments
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.id = contact_comments.contact_id
        AND c.program_id = contact_comments.program_id
        AND (
          (
            public.caller_role() IN ('Admin', 'Preacher')
            AND c.assigned_preacher_id = auth.uid()
          )
          OR (
            public.caller_role() = 'Assistant'
            AND c.assigned_preacher_id = public.caller_assigned_preacher_id()
          )
        )
    )
  );

COMMENT ON TABLE public.contact_comments IS
  'Record comments on contacts. Readable by Admin, Preacher and Assistant within their own patch; written through the app with the service role.';
