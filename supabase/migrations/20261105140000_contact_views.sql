-- Migration: Saved views for the contacts grid.
-- Date: 2026-11-05
--
-- The grid has always been one configuration: a sort, a filter tree, a set of
-- hidden fields and widths all encoded in the URL. This adds named, saved
-- copies of that configuration, which is what turns "the contacts table" into
-- "the contacts table as I arranged it".
--
-- `config` is JSONB rather than columns because every one of those settings is
-- already a single value the client serializes with one codec
-- (`components/grid/grid-view-state.ts`). Giving each its own column would
-- split a shape that is edited as a whole.
--
-- `view_type` is constrained to `grid` on purpose. It is a real column rather
-- than a constant so a second view type is a migration, not a redesign, but the
-- check is what stops a client from storing a type this app cannot render.
--
-- `position` is DOUBLE PRECISION so the view list can be reordered later by
-- writing a midpoint, the same technique `contacts.sort_order` uses.
--
-- Writes are service-role only: the app calls `/api/manage/views` after
-- `getStaffContext()` and `requireRole()`, so there is no INSERT/UPDATE/DELETE
-- policy for `authenticated`.

CREATE TABLE IF NOT EXISTS public.contact_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  view_type TEXT NOT NULL DEFAULT 'grid' CHECK (view_type = 'grid'),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position DOUBLE PRECISION NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two views with one name cannot be told apart in a switcher or a shared link,
-- so the name is unique per programme. Case-insensitively, because "Grid 2" and
-- "grid 2" read as the same view.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_views_program_name
  ON public.contact_views(program_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_contact_views_program_position
  ON public.contact_views(program_id, position);

DROP TRIGGER IF EXISTS contact_views_set_updated_at ON public.contact_views;
CREATE TRIGGER contact_views_set_updated_at
  BEFORE UPDATE ON public.contact_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_views ENABLE ROW LEVEL SECURITY;

-- A view is readable by every operational role in its own programme. Views are
-- shared working surfaces, not personal ones: the view a Preacher saves is the
-- view their Assistant opens.
CREATE POLICY "contact_views readable in programme"
  ON public.contact_views
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Admin', 'Preacher', 'Assistant')
  );

REVOKE ALL ON public.contact_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_views TO service_role;

COMMENT ON TABLE public.contact_views IS
  'Named saved configurations of the contacts grid. Read in-programme; written through /api/manage/views with the service role.';
COMMENT ON COLUMN public.contact_views.config IS
  'Grid settings: sorting, filter tree, global filter, column order/visibility/sizing and row density.';
COMMENT ON COLUMN public.contact_views.view_type IS
  'Only grid today. A second view type is a migration, not a client-supplied string.';
