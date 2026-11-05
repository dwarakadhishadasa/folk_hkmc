-- Migration: Comment threads, edits and reactions.
-- Date: 2026-11-05
--
-- Three additive changes to the record-comment feature:
--
--   1. `root_comment_id` makes a reply. A thread is one level deep — the source
--      product posted replies with `rootRowCommentId` pointing at the thread's
--      first comment, and rendered them as "N replies" under it rather than as
--      nested siblings. A self-FK with ON DELETE CASCADE is what makes deleting
--      a thread delete what was said in it.
--   2. `edited_at` is what lets the pane say "(edited)" without diffing text.
--   3. `contact_comment_reactions` holds one row per person, comment and emoji.
--      The unique key is the toggle: adding twice is a no-op, removing is a
--      delete. `emoji` stores the character itself rather than the source
--      product's hex codepoint (`1f44d`) because nothing here round-trips it
--      through a third party.
--
-- Access mirrors `contact_comments` exactly: readable inside the caller's
-- patch, written through the app with the service role.

ALTER TABLE public.contact_comments
  ADD COLUMN IF NOT EXISTS root_comment_id UUID
    REFERENCES public.contact_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contact_comments_root
  ON public.contact_comments(root_comment_id);

-- A reply's thread root must be a root, not another reply: the thread is one
-- level deep, and a chain would make "N replies" count the wrong thing.
CREATE OR REPLACE FUNCTION public.contact_comment_root_is_root()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.root_comment_id IS NOT NULL THEN
    IF NEW.root_comment_id = NEW.id THEN
      RAISE EXCEPTION 'a comment cannot be its own thread root';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.contact_comments parent
      WHERE parent.id = NEW.root_comment_id
        AND parent.root_comment_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'replies are one level deep';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_comment_root_is_root ON public.contact_comments;

CREATE TRIGGER contact_comment_root_is_root
  BEFORE INSERT OR UPDATE OF root_comment_id ON public.contact_comments
  FOR EACH ROW EXECUTE FUNCTION public.contact_comment_root_is_root();

REVOKE ALL ON FUNCTION public.contact_comment_root_is_root() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.contact_comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  comment_id UUID NOT NULL REFERENCES public.contact_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_contact_comment_reactions_comment
  ON public.contact_comment_reactions(comment_id);

ALTER TABLE public.contact_comment_reactions ENABLE ROW LEVEL SECURITY;

-- The same patch predicate as the comment it decorates, reached through the
-- comment's contact.
CREATE POLICY "contact_comment_reactions readable by the patch's staff"
  ON public.contact_comment_reactions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.contact_comments cc
      JOIN public.contacts c ON c.id = cc.contact_id
      WHERE cc.id = contact_comment_reactions.comment_id
        AND cc.program_id = contact_comment_reactions.program_id
        AND c.program_id = cc.program_id
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

REVOKE ALL ON public.contact_comment_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_comment_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_comment_reactions TO service_role;

COMMENT ON TABLE public.contact_comment_reactions IS
  'One emoji reaction per person, comment and emoji. Read inside the patch; written through the app with the service role.';

-- ============================================================================
-- Comment counts for the grid's gutter badge.
--
-- A view rather than a per-row subquery: the grid asks for a whole page of
-- contacts at once, and this is the same shape the existing
-- `contact_attendance_counts` rollup view already gives the grid. A contact
-- with no comments is simply absent, which the reader treats as zero.
-- ============================================================================
CREATE OR REPLACE VIEW public.contact_comment_counts AS
  SELECT contact_id, count(*)::INT AS comment_count
  FROM public.contact_comments
  GROUP BY contact_id;

REVOKE ALL ON public.contact_comment_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_comment_counts TO service_role;

COMMENT ON VIEW public.contact_comment_counts IS
  'Comment count per contact, for the grid gutter badge. Service role only.';

