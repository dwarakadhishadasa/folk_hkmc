-- Migration: Create the dialer tables — campaigns, callers, assignments, contact
-- profiles, call logs, survey questions, survey options.
-- Date: 2026-10-25
-- Story: 1.1 — Dialer data model, generated status group, and RLS
-- Additive only: seven new tables, the generated status_group column, scoped
-- SELECT-only RLS, exact grants, and one new helper (caller_assignable_user_ids).
-- Sorts after 20261019000000_contacts_single_location.sql (latest migration).
-- Reuses, unchanged: public.caller_role(), public.caller_program_id(),
-- public.caller_assigned_preacher_id(), public.caller_effective_location_ids()
-- from 20261006010000_scoped_rls_policies.sql, and public.set_updated_at() from
-- 20260504101000_harden_staff_bridge_advisor_findings.sql.
--
-- The eighth table, dialer_survey_responses, is deliberately NOT created here:
-- story 2.3 adds it beside the disposition RPC that writes it.

-- ============================================================================
-- 1. dialer_contact_profiles — calling-relevant contact enrichment.
--    One row per contact, nullable throughout: a contact with no profile row is
--    fully callable. Four facet fields only (centre, level, gender, language).
--    ON DELETE CASCADE: a profile is enrichment, not history.
-- ============================================================================
CREATE TABLE public.dialer_contact_profiles (
  contact_id UUID PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  centre TEXT,
  level TEXT,
  gender TEXT,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialer_contact_profiles_program_id ON public.dialer_contact_profiles(program_id);

ALTER TABLE public.dialer_contact_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_contact_profiles_updated_at ON public.dialer_contact_profiles;
CREATE TRIGGER set_dialer_contact_profiles_updated_at
  BEFORE UPDATE ON public.dialer_contact_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. dialer_campaigns — the source app's "event", renamed.
--    status is CANCELLED, never DELETE: assignments reference the campaign with
--    ON DELETE RESTRICT and no role holds DELETE on the dialer tables.
-- ============================================================================
CREATE TABLE public.dialer_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  campaign_date DATE NOT NULL,
  campaign_time TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  gap_duration INTEGER NOT NULL DEFAULT 20 CHECK (gap_duration BETWEEN 5 AND 300),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialer_campaigns_program_id ON public.dialer_campaigns(program_id);
CREATE INDEX idx_dialer_campaigns_program_status_date ON public.dialer_campaigns(program_id, status, campaign_date);

ALTER TABLE public.dialer_campaigns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_campaigns_updated_at ON public.dialer_campaigns;
CREATE TRIGGER set_dialer_campaigns_updated_at
  BEFORE UPDATE ON public.dialer_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. dialer_callers — a staff user with a calling profile, not a new identity.
--    user_id is ON DELETE RESTRICT: a staff identity with dialer history cannot
--    be deleted. Unique per program.
-- ============================================================================
CREATE TABLE public.dialer_callers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  promoted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, user_id)
);

CREATE INDEX idx_dialer_callers_program_id ON public.dialer_callers(program_id);

ALTER TABLE public.dialer_callers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_callers_updated_at ON public.dialer_callers;
CREATE TRIGGER set_dialer_callers_updated_at
  BEFORE UPDATE ON public.dialer_callers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. dialer_assignments — a contact assigned to a caller for a campaign.
--    Unique (contact_id, campaign_id) makes reassignment a move, not a second
--    row. contact_id, caller_id and campaign_id are all ON DELETE RESTRICT so a
--    cascade can never destroy calls.
-- ============================================================================
CREATE TABLE public.dialer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  caller_id UUID NOT NULL REFERENCES public.dialer_callers(id) ON DELETE RESTRICT,
  campaign_id UUID NOT NULL REFERENCES public.dialer_campaigns(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, campaign_id)
);

CREATE INDEX idx_dialer_assignments_program_id ON public.dialer_assignments(program_id);
CREATE INDEX idx_dialer_assignments_campaign_caller_status ON public.dialer_assignments(campaign_id, caller_id, status);
CREATE INDEX idx_dialer_assignments_contact_id ON public.dialer_assignments(contact_id);

ALTER TABLE public.dialer_assignments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_assignments_updated_at ON public.dialer_assignments;
CREATE TRIGGER set_dialer_assignments_updated_at
  BEFORE UPDATE ON public.dialer_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. dialer_call_logs — one immutable outcome per attempt.
--    disposition_status is the only status a caller writes; status_group is
--    generated from it and can never be written directly. No updated_at: a
--    landed attempt is immutable, and called_at is set on insert.
-- ============================================================================
CREATE TABLE public.dialer_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  assignment_id UUID NOT NULL REFERENCES public.dialer_assignments(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.dialer_callers(id) ON DELETE RESTRICT,
  dial_phone TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  disposition_status TEXT NOT NULL CHECK (disposition_status IN (
    'CONFIRMED',
    'MAY_COME',
    'WILL_COME_NEXT_CLASS',
    'WILL_COME_NEXT_WEEK',
    'VISITING_HOME_TOWN',
    'CALL_ME_BACK',
    'HEALTH_IS_NOT_GOOD',
    'OUT_OF_STATION',
    'BUSY_CANNOT_COME',
    'CALL_DID_NOT_CONNECT',
    'SWITCHED_OFF',
    'WRONG_NUMBER',
    'NOT_INTERESTED'
  )),
  status_group TEXT GENERATED ALWAYS AS (
    CASE disposition_status
      WHEN 'CONFIRMED' THEN 'CONFIRMED'
      WHEN 'MAY_COME' THEN 'MAY_COME'
      WHEN 'WILL_COME_NEXT_CLASS' THEN 'DEFERRED'
      WHEN 'WILL_COME_NEXT_WEEK' THEN 'DEFERRED'
      WHEN 'VISITING_HOME_TOWN' THEN 'DEFERRED'
      WHEN 'CALL_ME_BACK' THEN 'DEFERRED'
      WHEN 'HEALTH_IS_NOT_GOOD' THEN 'DEFERRED'
      WHEN 'OUT_OF_STATION' THEN 'DEFERRED'
      WHEN 'BUSY_CANNOT_COME' THEN 'DEFERRED'
      WHEN 'CALL_DID_NOT_CONNECT' THEN 'NOT_REACHABLE'
      WHEN 'SWITCHED_OFF' THEN 'NOT_REACHABLE'
      WHEN 'WRONG_NUMBER' THEN 'WRONG_NUMBER'
      WHEN 'NOT_INTERESTED' THEN 'NOT_INTERESTED'
    END
  ) STORED NOT NULL,
  follow_up_notes TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, attempt)
);

CREATE INDEX idx_dialer_call_logs_program_id ON public.dialer_call_logs(program_id);
CREATE INDEX idx_dialer_call_logs_caller_called_at ON public.dialer_call_logs(caller_id, called_at DESC);
CREATE INDEX idx_dialer_call_logs_assignment_id ON public.dialer_call_logs(assignment_id);

ALTER TABLE public.dialer_call_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. dialer_survey_questions — campaign survey questions.
--    retired_at replaces deletion once a question has answers.
-- ============================================================================
CREATE TABLE public.dialer_survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.dialer_campaigns(id) ON DELETE RESTRICT,
  question_title TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('TEXT', 'DROPDOWN', 'RADIO', 'MULTI_SELECT', 'DATE')),
  sort_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialer_survey_questions_program_id ON public.dialer_survey_questions(program_id);
CREATE INDEX idx_dialer_survey_questions_campaign_sort ON public.dialer_survey_questions(campaign_id, sort_order);

ALTER TABLE public.dialer_survey_questions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_survey_questions_updated_at ON public.dialer_survey_questions;
CREATE TRIGGER set_dialer_survey_questions_updated_at
  BEFORE UPDATE ON public.dialer_survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 7. dialer_survey_options — options for choice questions.
--    A child table, not a comma-separated column: an option may contain a comma.
-- ============================================================================
CREATE TABLE public.dialer_survey_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  question_id UUID NOT NULL REFERENCES public.dialer_survey_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialer_survey_options_program_id ON public.dialer_survey_options(program_id);
CREATE INDEX idx_dialer_survey_options_question_sort ON public.dialer_survey_options(question_id, sort_order);

ALTER TABLE public.dialer_survey_options ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_dialer_survey_options_updated_at ON public.dialer_survey_options;
CREATE TRIGGER set_dialer_survey_options_updated_at
  BEFORE UPDATE ON public.dialer_survey_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 8. Helper: the AD-3 assignable caller set, as user ids.
--    Admin    -> every active staff user in the program.
--    Preacher -> their own assignees, plus themselves.
--    Assistant -> their preacher's assignees, plus themselves.
--    A staff user whose dialer profile is deactivated is excluded from every
--    set: assignment never reactivates a deactivated caller.
--    Owned by postgres so RLS on public.users does not recurse; STABLE, with a
--    pinned search_path. Only authenticated and service_role may EXECUTE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.caller_assignable_user_ids()
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller public.users%ROWTYPE;
  v_base UUID[];
BEGIN
  SELECT u.* INTO v_caller
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.status = 'Active';

  IF NOT FOUND THEN
    RETURN '{}'::uuid[];
  END IF;

  v_base := CASE v_caller.role
    WHEN 'Admin' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
    )
    WHEN 'Preacher' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
        AND s.assigned_preacher_id = v_caller.id
    ) || v_caller.id
    WHEN 'Assistant' THEN (
      SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
      FROM public.users s
      WHERE s.program_id = v_caller.program_id
        AND s.status = 'Active'
        AND s.assigned_preacher_id = public.caller_assigned_preacher_id()
    ) || v_caller.id
    ELSE '{}'::uuid[]
  END;

  RETURN (
    SELECT COALESCE(array_agg(candidate.id), '{}'::uuid[])
    FROM unnest(v_base) AS candidate(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dialer_callers dc
      WHERE dc.user_id = candidate.id
        AND dc.is_active = false
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caller_assignable_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_assignable_user_ids() TO authenticated, service_role;

-- ============================================================================
-- 9. RLS POLICIES — programme-scoped SELECT only, no write policies.
--    Campaign, question and option rows are program-level because they carry no
--    contact. Assignments, call logs, contact profiles and the caller roster
--    are scoped. An own caller additionally reads their own linked rows.
-- ============================================================================

-- dialer_campaigns — Admin/Preacher/Assistant read the program; a caller reads
-- the campaigns they hold assignments in.
CREATE POLICY "dialer_campaigns are readable by campaign admins in program" ON public.dialer_campaigns
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Admin', 'Preacher', 'Assistant')
  );

CREATE POLICY "dialer_campaigns are readable by an own caller" ON public.dialer_campaigns
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.dialer_assignments a
      JOIN public.dialer_callers c ON c.id = a.caller_id
      WHERE a.campaign_id = dialer_campaigns.id
        AND c.program_id = dialer_campaigns.program_id
        AND c.user_id = auth.uid()
    )
  );

-- dialer_callers — Admin reads the program roster; Preacher/Assistant read the
-- AD-3 assignable set; a caller reads their own profile row.
CREATE POLICY "dialer_callers are readable by an admin in program" ON public.dialer_callers
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() = 'Admin'
  );

CREATE POLICY "dialer_callers are readable by their assignable set" ON public.dialer_callers
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Preacher', 'Assistant')
    AND user_id = ANY (public.caller_assignable_user_ids())
  );

CREATE POLICY "dialer_callers are readable by an own caller" ON public.dialer_callers
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND user_id = auth.uid()
  );

-- dialer_assignments — Admin reads the program; Preacher and Assistant read the
-- assignments of their own contacts; a caller reads only their own queue.
CREATE POLICY "dialer_assignments are readable by scoped campaign admins" ON public.dialer_assignments
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() = 'Preacher' AND EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.id = dialer_assignments.contact_id
          AND ct.assigned_preacher_id = auth.uid()
      ))
      OR (public.caller_role() = 'Assistant' AND EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.id = dialer_assignments.contact_id
          AND ct.assigned_preacher_id = public.caller_assigned_preacher_id()
      ))
    )
  );

CREATE POLICY "dialer_assignments are readable by an own caller" ON public.dialer_assignments
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1 FROM public.dialer_callers c
      WHERE c.id = dialer_assignments.caller_id
        AND c.program_id = dialer_assignments.program_id
        AND c.user_id = auth.uid()
    )
  );

-- dialer_call_logs — same contact-linked scope as assignments, plus the
-- caller's own attempts. The log carries the historical attribution.
CREATE POLICY "dialer_call_logs are readable by scoped campaign admins" ON public.dialer_call_logs
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() = 'Preacher' AND EXISTS (
        SELECT 1
        FROM public.dialer_assignments a
        JOIN public.contacts ct ON ct.id = a.contact_id
        WHERE a.id = dialer_call_logs.assignment_id
          AND ct.assigned_preacher_id = auth.uid()
      ))
      OR (public.caller_role() = 'Assistant' AND EXISTS (
        SELECT 1
        FROM public.dialer_assignments a
        JOIN public.contacts ct ON ct.id = a.contact_id
        WHERE a.id = dialer_call_logs.assignment_id
          AND ct.assigned_preacher_id = public.caller_assigned_preacher_id()
      ))
    )
  );

CREATE POLICY "dialer_call_logs are readable by an own caller" ON public.dialer_call_logs
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1 FROM public.dialer_callers c
      WHERE c.id = dialer_call_logs.caller_id
        AND c.program_id = dialer_call_logs.program_id
        AND c.user_id = auth.uid()
    )
  );

-- dialer_survey_questions — program-level for the three admin roles; a caller
-- reads the questions of the campaigns they are assigned in.
CREATE POLICY "dialer_survey_questions are readable by admins in program" ON public.dialer_survey_questions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Admin', 'Preacher', 'Assistant')
  );

CREATE POLICY "dialer_survey_questions are readable by an own caller" ON public.dialer_survey_questions
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.dialer_assignments a
      JOIN public.dialer_callers c ON c.id = a.caller_id
      WHERE a.campaign_id = dialer_survey_questions.campaign_id
        AND c.program_id = dialer_survey_questions.program_id
        AND c.user_id = auth.uid()
    )
  );

-- dialer_survey_options — same scope as the question they belong to.
CREATE POLICY "dialer_survey_options are readable by admins in program" ON public.dialer_survey_options
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND public.caller_role() IN ('Admin', 'Preacher', 'Assistant')
  );

CREATE POLICY "dialer_survey_options are readable by an own caller" ON public.dialer_survey_options
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.dialer_survey_questions q
      JOIN public.dialer_assignments a ON a.campaign_id = q.campaign_id
      JOIN public.dialer_callers c ON c.id = a.caller_id
      WHERE q.id = dialer_survey_options.question_id
        AND c.program_id = dialer_survey_options.program_id
        AND c.user_id = auth.uid()
    )
  );

-- dialer_contact_profiles — contact-linked scope, plus a caller's own contacts.
CREATE POLICY "dialer_contact_profiles are readable by scoped campaign admins" ON public.dialer_contact_profiles
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() = 'Preacher' AND EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.id = dialer_contact_profiles.contact_id
          AND ct.assigned_preacher_id = auth.uid()
      ))
      OR (public.caller_role() = 'Assistant' AND EXISTS (
        SELECT 1 FROM public.contacts ct
        WHERE ct.id = dialer_contact_profiles.contact_id
          AND ct.assigned_preacher_id = public.caller_assigned_preacher_id()
      ))
    )
  );

CREATE POLICY "dialer_contact_profiles are readable by an own caller" ON public.dialer_contact_profiles
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.dialer_assignments a
      JOIN public.dialer_callers c ON c.id = a.caller_id
      WHERE a.contact_id = dialer_contact_profiles.contact_id
        AND c.program_id = dialer_contact_profiles.program_id
        AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. GRANTS — Revoke everything from PUBLIC, anon, authenticated and
--     service_role, then grant back exactly what each role may do. anon and
--     authenticated hold SELECT only; service_role holds SELECT/INSERT/UPDATE.
--     No role holds DELETE on any dialer table.
-- ============================================================================

REVOKE ALL ON TABLE public.dialer_contact_profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_campaigns FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_callers FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_assignments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_call_logs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_survey_questions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dialer_survey_options FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.dialer_contact_profiles TO authenticated;
GRANT SELECT ON TABLE public.dialer_campaigns TO authenticated;
GRANT SELECT ON TABLE public.dialer_callers TO authenticated;
GRANT SELECT ON TABLE public.dialer_assignments TO authenticated;
GRANT SELECT ON TABLE public.dialer_call_logs TO authenticated;
GRANT SELECT ON TABLE public.dialer_survey_questions TO authenticated;
GRANT SELECT ON TABLE public.dialer_survey_options TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_contact_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_callers TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_call_logs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_survey_questions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_survey_options TO service_role;
