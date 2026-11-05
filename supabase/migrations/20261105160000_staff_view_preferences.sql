-- Migration: Per-user view preferences.
-- Date: 2026-11-05
--
-- "The view I was last in" is a fact about the person, not the browser. Storing
-- it server-side is what makes signing in from another machine land on the same
-- view. The source product persists the same thing with its own
-- `view/{id}/setAsLastUsed` call.
--
-- Its own table rather than a column on `public.users`: that table is the staff
-- identity bridge, and a UI preference in it would be a preference in every
-- query that reads a person. `ON DELETE SET NULL` on the view means a deleted
-- view simply stops being remembered; the person row is untouched.
--
-- Writes are service-role only, like the views themselves: the app calls
-- `/api/manage/views/{id}/use` after `getStaffContext`.

CREATE TABLE IF NOT EXISTS public.staff_view_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  last_contact_view_id UUID REFERENCES public.contact_views(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS staff_view_preferences_set_updated_at ON public.staff_view_preferences;
CREATE TRIGGER staff_view_preferences_set_updated_at
  BEFORE UPDATE ON public.staff_view_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff_view_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_preferences readable by their owner"
  ON public.staff_view_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND program_id = public.caller_program_id());

REVOKE ALL ON public.staff_view_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_view_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_view_preferences TO service_role;

COMMENT ON TABLE public.staff_view_preferences IS
  'Per-person UI preferences for the contacts grid. Today: the last view opened.';
