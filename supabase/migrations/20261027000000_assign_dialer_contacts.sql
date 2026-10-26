-- Migration: one transactional assignment write for the campaign batch screen.
-- Date: 2026-10-27
-- Story: 1.8 — conflict-aware weighted assignment write.
--
-- AD-11 requires the confirmed set to land in one transaction: a failure part-way
-- through must roll the whole batch back and report the offending rows, never a
-- partial success. PostgREST cannot span statements in one transaction, so the
-- write is a single function the service layer calls once.
--
-- The app owns the decisions this function cannot make: the scoped pre-check,
-- the weighted split, and caller auto-promotion all happen before the call. The
-- function re-validates what a concurrent request could have changed underneath
-- it — campaign status, caller membership and activity, and each conflict — and
-- raises a named exception for the first violation, which rolls back every row
-- written so far in the same call.

CREATE OR REPLACE FUNCTION public.assign_dialer_contacts(
  p_program_id TEXT,
  p_campaign_id UUID,
  p_assigned_by UUID,
  p_rows JSONB,
  p_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_row JSONB;
  v_contact_id UUID;
  v_caller_id UUID;
  v_sort_order INTEGER;
  v_existing_id UUID;
  v_caller_active BOOLEAN;
  v_caller_program TEXT;
  v_written INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_rows' USING ERRCODE = '22023';
  END IF;

  IF p_mode NOT IN ('skip', 'move') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status
  FROM public.dialer_campaigns
  WHERE id = p_campaign_id AND program_id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status NOT IN ('DRAFT', 'ACTIVE') THEN
    RAISE EXCEPTION 'campaign_not_assignable' USING ERRCODE = 'P0001';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_contact_id := (v_row ->> 'contactId')::UUID;
    v_caller_id := (v_row ->> 'callerId')::UUID;
    v_sort_order := COALESCE((v_row ->> 'sortOrder')::INTEGER, 0);

    IF v_contact_id IS NULL OR v_caller_id IS NULL THEN
      RAISE EXCEPTION 'invalid_rows' USING ERRCODE = '22023';
    END IF;

    -- A caller chosen by an assignment is an active profile in this programme.
    -- Deactivation between the picker read and this write is the case the check
    -- exists for; the caller is named so the batch message can name them.
    SELECT c.is_active, c.program_id
      INTO v_caller_active, v_caller_program
    FROM public.dialer_callers c
    WHERE c.id = v_caller_id;

    IF NOT FOUND OR v_caller_program <> p_program_id THEN
      RAISE EXCEPTION 'caller_not_assignable:%', v_caller_id USING ERRCODE = 'P0001';
    END IF;

    IF NOT v_caller_active THEN
      RAISE EXCEPTION 'caller_inactive:%', v_caller_id USING ERRCODE = 'P0001';
    END IF;

    SELECT a.id INTO v_existing_id
    FROM public.dialer_assignments a
    WHERE a.contact_id = v_contact_id
      AND a.campaign_id = p_campaign_id;

    IF FOUND THEN
      IF p_mode = 'skip' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE public.dialer_assignments
      SET caller_id = v_caller_id,
          sort_order = v_sort_order
      WHERE id = v_existing_id;

      v_written := v_written + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.dialer_assignments (
      program_id,
      contact_id,
      caller_id,
      campaign_id,
      assigned_by,
      status,
      sort_order,
      assigned_at
    )
    VALUES (
      p_program_id,
      v_contact_id,
      v_caller_id,
      p_campaign_id,
      p_assigned_by,
      'PENDING',
      v_sort_order,
      now()
    );

    v_written := v_written + 1;
  END LOOP;

  RETURN jsonb_build_object('written', v_written, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_dialer_contacts(TEXT, UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_dialer_contacts(TEXT, UUID, UUID, JSONB, TEXT) TO service_role;
