-- Migration: Saved views for every grid surface.
-- Date: 2026-11-06
--
-- `contact_views` began as the contacts grid's list. A campaign's assign grid is
-- the same primitive on a different table, so a row gains a `surface` rather
-- than the product growing a second table, a second API and a second sidebar.
-- Existing rows are contacts.
--
-- The name stays `contact_views`: renaming a live table buys vocabulary and
-- costs every reader a migration. The column and comments carry the meaning.

ALTER TABLE public.contact_views
  ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'contacts'
    CHECK (surface IN ('contacts', 'campaigns'));

-- Names are unique per owner and surface: a campaign view called "Grid 2" is
-- not in the way of a contacts view with the same name, because they are two
-- different tables' arrangements.
DROP INDEX IF EXISTS idx_contact_views_owner_name;
DROP INDEX IF EXISTS idx_contact_views_shared_name;
DROP INDEX IF EXISTS idx_contact_views_owner;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_views_surface_owner_name
  ON public.contact_views(program_id, surface, owner_user_id, lower(btrim(name)))
  WHERE owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_views_surface_shared_name
  ON public.contact_views(program_id, surface, lower(btrim(name)))
  WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_views_surface_owner
  ON public.contact_views(program_id, surface, owner_user_id, position);

-- "The view I was last in" is per surface: the contacts grid and a campaign's
-- assign grid are different arrangements, so one id cannot answer for both.
ALTER TABLE public.staff_view_preferences
  ADD COLUMN IF NOT EXISTS last_campaign_view_id UUID
    REFERENCES public.contact_views(id) ON DELETE SET NULL;

COMMENT ON TABLE public.contact_views IS
  'Named saved configurations of every Grid surface. Read in-programme; written through the surface view routes with the service role.';
COMMENT ON COLUMN public.contact_views.surface IS
  'Which grid this saved view belongs to. The table stores every Grid surface.';
COMMENT ON COLUMN public.staff_view_preferences.last_campaign_view_id IS
  'The campaign assign view this person last opened, if any.';
