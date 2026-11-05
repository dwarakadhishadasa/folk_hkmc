-- Migration: Record comments on contacts.
-- Date: 2026-11-05
--
-- One additive table and its read policy. A record comment is a note against a
-- contact, authored by one staff member, optionally pinned to a single field
-- (`cell_field_id`) — the same record-level / cell-level split the source
-- product drew when it stored `cellLevel: null` for a record comment.
--
-- `rich_text` holds the composer's delta. It starts life as the plain
-- `[{"insert":"…"}]` form, which is why it is JSONB rather than a second
-- markdown column: the composer is the only writer and the only reader, and a
-- text column would have to be re-parsed on every render.
--
-- Access is deliberately narrower than the rest of the manage surfaces:
-- Preacher and Assistant only. Admin is excluded on purpose, so the read
-- policy names those two roles rather than reusing `caller_role() <> 'Volunteer'`.
--
-- Writes are service-role only. The app calls the route after
-- `getStaffContext()` and `requireRole()`, so there is no INSERT/UPDATE/DELETE
-- policy for `authenticated`: a browser holding a session cannot write a
-- comment around the route's authorship stamp.

CREATE TABLE IF NOT EXISTS public.contact_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  rich_text JSONB NOT NULL DEFAULT '[]'::jsonb,
  cell_field_id TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_comments_contact
  ON public.contact_comments(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contact_comments_program
  ON public.contact_comments(program_id);

ALTER TABLE public.contact_comments ENABLE ROW LEVEL SECURITY;

-- A comment is readable when its contact is: the same patch predicate the
-- contacts SELECT policy applies, narrowed to the two commenting roles.
CREATE POLICY "contact_comments readable by preachers and assistants"
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
          (public.caller_role() = 'Preacher' AND c.assigned_preacher_id = auth.uid())
          OR (public.caller_role() = 'Assistant' AND c.assigned_preacher_id = public.caller_assigned_preacher_id())
        )
    )
  );

REVOKE ALL ON public.contact_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_comments TO service_role;

COMMENT ON TABLE public.contact_comments IS
  'Record comments on contacts. Read by Preacher and Assistant only; written through the app with the service role.';
COMMENT ON COLUMN public.contact_comments.cell_field_id IS
  'When set, the comment is pinned to one contact field rather than the whole record.';
