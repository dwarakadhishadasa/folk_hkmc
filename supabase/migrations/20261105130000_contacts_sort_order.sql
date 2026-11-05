-- Migration: Manual row order for the contacts grid.
-- Date: 2026-11-05
--
-- The grid is about to gain row dragging, and a drag has to survive a reload
-- or it is a gesture, not an edit. The source product persisted this as a
-- per-view `moveVisibleRows(rowIds, targetVisibleIndex)`; this app has one
-- Contacts grid rather than user-defined views, so the order belongs on the
-- contact.
--
-- `DOUBLE PRECISION` rather than `INTEGER` on purpose: a drop between two rows
-- writes the midpoint of their values, which is one row's update instead of
-- renumbering everything below it. Repeated midpoint inserts exhaust the
-- mantissa after roughly fifty drops into the same gap, which is far beyond
-- what a manual reorder does before someone reloads.
--
-- Backfill is by `id` so the initial order matches what the grid already
-- showed. New contacts are appended by `createManageContact`, which reads the
-- current maximum.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY program_id ORDER BY id)::DOUBLE PRECISION AS position
  FROM public.contacts
)
UPDATE public.contacts c
SET sort_order = ordered.position
FROM ordered
WHERE c.id = ordered.id
  AND c.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_program_sort
  ON public.contacts(program_id, sort_order);

COMMENT ON COLUMN public.contacts.sort_order IS
  'Manual position in the contacts grid. Written by row drag; read as the grid''s default order.';
