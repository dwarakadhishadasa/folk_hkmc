-- Migration: Per-user saved views.
-- Date: 2026-11-05
--
-- A view is now somebody's arrangement rather than the programme's one list:
-- two people can each keep their own "Grid 2", and neither sees the other's.
--
-- `visibility` is the one shared switch, mirroring the source product's "Who can
-- edit" choice at creation: `personal` (the default) is visible to its owner
-- alone; `collaborative` is visible to every operational role in the programme
-- and editable by them.
--
-- `owner_user_id` is nullable *only* to carry rows that existed before this
-- migration and whose author is no longer known (`created_by` is `ON DELETE SET
-- NULL`). A null owner reads as "shared", which is what those rows were. Every
-- row created from now on is stamped with its author.
--
-- Names are unique per owner, not per programme: two people keeping a view
-- called "My grid" is the point of personal views.

ALTER TABLE public.contact_views
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'personal'
    CHECK (visibility IN ('personal', 'collaborative'));

-- Rows that still know their author become that author's personal views.
UPDATE public.contact_views
SET owner_user_id = created_by
WHERE owner_user_id IS NULL
  AND created_by IS NOT NULL;

DROP INDEX IF EXISTS idx_contact_views_program_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_views_owner_name
  ON public.contact_views(program_id, owner_user_id, lower(btrim(name)))
  WHERE owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_views_shared_name
  ON public.contact_views(program_id, lower(btrim(name)))
  WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_views_owner
  ON public.contact_views(program_id, owner_user_id, position);

DROP POLICY IF EXISTS "contact_views readable in programme" ON public.contact_views;

CREATE POLICY "contact_views readable to owner or collaborators"
  ON public.contact_views
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Admin', 'Preacher', 'Assistant')
    AND (
      visibility = 'collaborative'
      OR owner_user_id IS NULL
      OR owner_user_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.contact_views.owner_user_id IS
  'Author of the view. Null only on pre-ownership rows, which read as shared.';
COMMENT ON COLUMN public.contact_views.visibility IS
  'personal = owner only; collaborative = every operational role in the programme.';
