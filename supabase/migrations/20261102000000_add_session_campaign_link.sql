-- Migration: link a session to the campaign that invited people to it.
-- Date: 2026-11-02
-- Spec: _bmad-output/specs/spec-program-dashboard/ (CAP-7)
--
-- `sessions.campaign_id` is nullable and set from the Campaign dropdown in the
-- `+ New session` popover. One session holds one campaign; a campaign may have
-- invited people to more than one session, so there is deliberately no unique
-- index on the column. The dashboard aggregates attendance across every linked
-- session in the reader's session scope.
--
-- `ON DELETE SET NULL` keeps the session when its campaign is removed. Campaigns
-- are never deleted by a staff role (no DELETE grant), so this is a safety
-- valve rather than a workflow.
--
-- No RLS change: the column rides the existing `sessions` policies, and the
-- create route is a service-role write that already validates the campaign.
--
-- -- DOWN:
-- --   DROP INDEX IF EXISTS public.idx_sessions_campaign_date;
-- --   DROP INDEX IF EXISTS public.idx_sessions_campaign_id;
-- --   ALTER TABLE public.sessions DROP COLUMN IF EXISTS campaign_id;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.dialer_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id
  ON public.sessions(campaign_id);

CREATE INDEX IF NOT EXISTS idx_sessions_campaign_date
  ON public.sessions(campaign_id, session_date DESC);

NOTIFY pgrst, 'reload schema';
