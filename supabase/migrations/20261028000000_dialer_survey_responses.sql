-- Migration: dialer survey responses and the one-transaction disposition write.
-- Date: 2026-10-28
-- Story: 2.3 — the disposition screen and the one-transaction save.
--
-- Two additive pieces, and nothing else:
--   1. dialer_survey_responses, the eighth dialer table. Its unique key on
--      (call_log_id, question_id) is what makes a replay idempotent, and its
--      question FK is ON DELETE RESTRICT because a question with answers is
--      history and is retired, never deleted.
--   2. record_call_disposition, SECURITY INVOKER, service-role-only. It reads
--      the assignment, caller, campaign, contact phone and survey inside one
--      transaction, then writes the call log, its responses and the assignment
--      status together. A retry can never leave a half-saved disposition.
--
-- Grants: anon holds nothing; authenticated holds SELECT only; service_role
-- holds SELECT/INSERT/UPDATE and no DELETE. The function's EXECUTE is revoked
-- from PUBLIC, anon and authenticated and granted to service_role only.

-- ============================================================================
-- 1. dialer_survey_responses
-- ============================================================================
CREATE TABLE public.dialer_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  call_log_id UUID NOT NULL REFERENCES public.dialer_call_logs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.dialer_survey_questions(id) ON DELETE RESTRICT,
  answer TEXT,
  answer_values TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_log_id, question_id)
);

CREATE INDEX idx_dialer_survey_responses_program_id ON public.dialer_survey_responses(program_id);
CREATE INDEX idx_dialer_survey_responses_question_id ON public.dialer_survey_responses(question_id);

ALTER TABLE public.dialer_survey_responses ENABLE ROW LEVEL SECURITY;

-- A response is read through the call log it belongs to: the three admin roles
-- see the contact-linked set, and a caller sees only their own attempts.
CREATE POLICY "dialer_survey_responses are readable by scoped campaign admins" ON public.dialer_survey_responses
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND (
      public.caller_role() = 'Admin'
      OR (public.caller_role() = 'Preacher' AND EXISTS (
        SELECT 1
        FROM public.dialer_call_logs l
        JOIN public.dialer_assignments a ON a.id = l.assignment_id
        JOIN public.contacts ct ON ct.id = a.contact_id
        WHERE l.id = dialer_survey_responses.call_log_id
          AND ct.assigned_preacher_id = auth.uid()
      ))
      OR (public.caller_role() = 'Assistant' AND EXISTS (
        SELECT 1
        FROM public.dialer_call_logs l
        JOIN public.dialer_assignments a ON a.id = l.assignment_id
        JOIN public.contacts ct ON ct.id = a.contact_id
        WHERE l.id = dialer_survey_responses.call_log_id
          AND ct.assigned_preacher_id = public.caller_assigned_preacher_id()
      ))
    )
  );

CREATE POLICY "dialer_survey_responses are readable by an own caller" ON public.dialer_survey_responses
  FOR SELECT TO authenticated
  USING (
    program_id = public.caller_program_id()
    AND EXISTS (
      SELECT 1
      FROM public.dialer_call_logs l
      JOIN public.dialer_callers c ON c.id = l.caller_id
      WHERE l.id = dialer_survey_responses.call_log_id
        AND c.program_id = dialer_survey_responses.program_id
        AND c.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.dialer_survey_responses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.dialer_survey_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dialer_survey_responses TO service_role;

-- ============================================================================
-- 2. record_call_disposition
--
-- Arguments:
--   p_assignment_id, p_program_id, p_caller_id  identity, resolved server-side
--   p_attempt                                   supplied by the queue, never invented
--   p_disposition_status                        one of the thirteen chips
--   p_follow_up_notes                           notes, always optional
--   p_responses                                 [{questionId, answer, answerValues}]
--
-- Returns the stored row as JSON. The generated status_group is returned but
-- never written; the CASE below only mirrors it for the reached/not-reached
-- decision and the survey gate.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_call_disposition(
  p_assignment_id UUID,
  p_program_id TEXT,
  p_caller_id UUID,
  p_attempt INTEGER,
  p_disposition_status TEXT,
  p_follow_up_notes TEXT,
  p_responses JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.dialer_assignments%ROWTYPE;
  v_campaign public.dialer_campaigns%ROWTYPE;
  v_caller public.dialer_callers%ROWTYPE;
  v_existing public.dialer_call_logs%ROWTYPE;
  v_log public.dialer_call_logs%ROWTYPE;
  v_question public.dialer_survey_questions%ROWTYPE;
  v_response JSONB;
  v_question_id TEXT;
  v_answer TEXT;
  v_answer_values TEXT[];
  v_validated JSONB := '[]'::jsonb;
  v_payload JSONB;
  v_existing_responses JSONB;
  v_seen_questions TEXT[] := '{}';
  v_status_group TEXT;
  v_contact_phone TEXT;
  v_max_attempt INTEGER;
  v_required_count INTEGER;
  v_answered_count INTEGER;
  v_option_count INTEGER;
  v_valid_count INTEGER;
  v_distinct_count INTEGER;
BEGIN
  IF p_assignment_id IS NULL OR p_program_id IS NULL OR p_caller_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  IF p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'invalid_attempt' USING ERRCODE = '22023';
  END IF;

  IF p_disposition_status IS NULL OR p_disposition_status NOT IN (
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
  ) THEN
    RAISE EXCEPTION 'invalid_disposition_status' USING ERRCODE = '22023';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'array' THEN
    RAISE EXCEPTION 'invalid_responses' USING ERRCODE = '22023';
  END IF;

  v_status_group := CASE p_disposition_status
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
  END;

  SELECT * INTO v_caller
  FROM public.dialer_callers
  WHERE id = p_caller_id
    AND program_id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caller_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_caller.is_active THEN
    RAISE EXCEPTION 'caller_inactive' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_assignment
  FROM public.dialer_assignments
  WHERE id = p_assignment_id
    AND program_id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.caller_id <> p_caller_id THEN
    RAISE EXCEPTION 'assignment_reassigned' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_campaign
  FROM public.dialer_campaigns
  WHERE id = v_assignment.campaign_id
    AND program_id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'campaign_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- Canonical form for the replay comparison: one entry per question, sorted,
  -- with a missing answerValues key normalized to null. A replay that omits
  -- the key is the same payload, not a conflict.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'questionId', entry->>'questionId',
        'answer', entry->>'answer',
        'answerValues', CASE
          WHEN entry ? 'answerValues' AND jsonb_typeof(entry->'answerValues') = 'array'
            THEN entry->'answerValues'
          ELSE NULL
        END
      )
      ORDER BY entry->>'questionId'
    ),
    '[]'::jsonb
  )
  INTO v_payload
  FROM jsonb_array_elements(p_responses) AS entry;

  -- A landed attempt is immutable. A replay of the same payload returns the
  -- stored row; a different payload for that attempt is a conflict, and never
  -- a 500 from the unique constraint.
  SELECT * INTO v_existing
  FROM public.dialer_call_logs
  WHERE assignment_id = p_assignment_id
    AND attempt = p_attempt;

  IF FOUND THEN
    IF v_existing.caller_id <> p_caller_id THEN
      RAISE EXCEPTION 'attempt_conflict' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'questionId', r.question_id::text,
          'answer', r.answer,
          'answerValues', r.answer_values
        )
        ORDER BY r.question_id::text
      ),
      '[]'::jsonb
    )
    INTO v_existing_responses
    FROM public.dialer_survey_responses r
    WHERE r.call_log_id = v_existing.id;

    IF v_existing.disposition_status <> p_disposition_status
      OR COALESCE(v_existing.follow_up_notes, '') <> COALESCE(p_follow_up_notes, '')
      OR v_existing_responses <> v_payload
    THEN
      RAISE EXCEPTION 'disposition_conflict' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'callLogId', v_existing.id,
      'assignmentId', v_existing.assignment_id,
      'attempt', v_existing.attempt,
      'calledAt', v_existing.called_at,
      'dispositionStatus', v_existing.disposition_status,
      'statusGroup', v_existing.status_group,
      'followUpNotes', v_existing.follow_up_notes,
      'replay', true
    );
  END IF;

  IF v_assignment.status <> 'PENDING' THEN
    RAISE EXCEPTION 'assignment_not_pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(attempt), 0) INTO v_max_attempt
  FROM public.dialer_call_logs
  WHERE assignment_id = p_assignment_id;

  IF p_attempt <> v_max_attempt + 1 THEN
    RAISE EXCEPTION 'attempt_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT phone INTO v_contact_phone
  FROM public.contacts
  WHERE id = v_assignment.contact_id
    AND program_id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_contact_phone IS NULL OR btrim(v_contact_phone) = '' THEN
    RAISE EXCEPTION 'phone_missing' USING ERRCODE = 'P0001';
  END IF;

  IF v_status_group IN ('NOT_REACHABLE', 'WRONG_NUMBER') THEN
    IF jsonb_array_length(p_responses) > 0 THEN
      RAISE EXCEPTION 'survey_not_applicable' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- A choice question with no options is a control the caller cannot
    -- answer; the builder prevents it, and this is the transactional backstop.
    IF EXISTS (
      SELECT 1
      FROM public.dialer_survey_questions q
      WHERE q.campaign_id = v_assignment.campaign_id
        AND q.program_id = p_program_id
        AND q.retired_at IS NULL
        AND q.question_type IN ('DROPDOWN', 'RADIO', 'MULTI_SELECT')
        AND NOT EXISTS (
          SELECT 1
          FROM public.dialer_survey_options o
          WHERE o.question_id = q.id
            AND o.program_id = p_program_id
        )
    ) THEN
      RAISE EXCEPTION 'survey_option_required' USING ERRCODE = '22023';
    END IF;

    FOR v_response IN SELECT * FROM jsonb_array_elements(p_responses)
    LOOP
      v_question_id := v_response->>'questionId';

      IF v_question_id IS NULL
        OR v_question_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'invalid_question_id' USING ERRCODE = '22023';
      END IF;

      IF v_question_id = ANY (v_seen_questions) THEN
        RAISE EXCEPTION 'duplicate_question' USING ERRCODE = '22023';
      END IF;

      v_seen_questions := array_append(v_seen_questions, v_question_id);

      SELECT * INTO v_question
      FROM public.dialer_survey_questions
      WHERE id = v_question_id::uuid
        AND campaign_id = v_assignment.campaign_id
        AND program_id = p_program_id
        AND retired_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'survey_question_invalid' USING ERRCODE = '22023';
      END IF;

      v_answer := v_response->>'answer';
      v_answer_values := NULL;

      IF v_response ? 'answerValues'
        AND jsonb_typeof(v_response->'answerValues') = 'array'
      THEN
        SELECT COALESCE(array_agg(value), '{}'::text[])
        INTO v_answer_values
        FROM jsonb_array_elements_text(v_response->'answerValues') AS value;
      END IF;

      IF v_question.question_type IN ('TEXT', 'DATE') THEN
        IF v_answer IS NULL OR btrim(v_answer) = '' THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;

        IF v_answer_values IS NOT NULL THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;
      ELSIF v_question.question_type IN ('DROPDOWN', 'RADIO') THEN
        IF v_answer IS NULL OR btrim(v_answer) = '' THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;

        IF v_answer_values IS NOT NULL THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM public.dialer_survey_options o
        WHERE o.question_id = v_question.id
          AND o.program_id = p_program_id
          AND o.value = v_answer;

        IF v_option_count = 0 THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;
      ELSIF v_question.question_type = 'MULTI_SELECT' THEN
        IF v_answer IS NOT NULL AND btrim(v_answer) <> '' THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;

        IF COALESCE(cardinality(v_answer_values), 0) = 0 THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_valid_count
        FROM public.dialer_survey_options o
        WHERE o.question_id = v_question.id
          AND o.program_id = p_program_id
          AND o.value = ANY (v_answer_values);

        SELECT count(DISTINCT value) INTO v_distinct_count
        FROM unnest(v_answer_values) AS value;

        IF v_valid_count <> v_distinct_count THEN
          RAISE EXCEPTION 'survey_answer_invalid' USING ERRCODE = '22023';
        END IF;
      END IF;

      v_validated := v_validated || jsonb_build_array(
        jsonb_build_object(
          'questionId', v_question.id::text,
          'answer', CASE
            WHEN v_question.question_type = 'MULTI_SELECT' THEN NULL
            ELSE v_answer
          END,
          'answerValues', CASE
            WHEN v_question.question_type = 'MULTI_SELECT' THEN to_jsonb(v_answer_values)
            ELSE NULL
          END
        )
      );
    END LOOP;

    SELECT COALESCE(
      jsonb_agg(entry ORDER BY entry->>'questionId'),
      '[]'::jsonb
    )
    INTO v_payload
    FROM jsonb_array_elements(v_validated) AS entry;

    -- Every live required question must carry an answer. The UI renders the
    -- same marker, but the transaction is the authority.
    SELECT count(*) INTO v_required_count
    FROM public.dialer_survey_questions q
    WHERE q.campaign_id = v_assignment.campaign_id
      AND q.program_id = p_program_id
      AND q.retired_at IS NULL
      AND q.is_required;

    SELECT count(*) INTO v_answered_count
    FROM public.dialer_survey_questions q
    WHERE q.campaign_id = v_assignment.campaign_id
      AND q.program_id = p_program_id
      AND q.retired_at IS NULL
      AND q.is_required
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_payload) AS entry
        WHERE entry->>'questionId' = q.id::text
          AND (
            (q.question_type IN ('TEXT', 'DATE', 'DROPDOWN', 'RADIO')
              AND COALESCE(btrim(entry->>'answer'), '') <> '')
            OR (q.question_type = 'MULTI_SELECT'
              AND jsonb_array_length(COALESCE(entry->'answerValues', '[]'::jsonb)) > 0)
          )
      );

    IF v_answered_count <> v_required_count THEN
      RAISE EXCEPTION 'survey_answer_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.dialer_call_logs (
    program_id,
    assignment_id,
    caller_id,
    dial_phone,
    attempt,
    disposition_status,
    follow_up_notes
  )
  VALUES (
    p_program_id,
    p_assignment_id,
    p_caller_id,
    v_contact_phone,
    p_attempt,
    p_disposition_status,
    p_follow_up_notes
  )
  RETURNING * INTO v_log;

  IF v_status_group NOT IN ('NOT_REACHABLE', 'WRONG_NUMBER') THEN
    INSERT INTO public.dialer_survey_responses (
      program_id,
      call_log_id,
      question_id,
      answer,
      answer_values
    )
    SELECT
      p_program_id,
      v_log.id,
      (entry->>'questionId')::uuid,
      entry->>'answer',
      CASE
        WHEN entry ? 'answerValues' AND jsonb_typeof(entry->'answerValues') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(entry->'answerValues'))
        ELSE NULL
      END
    FROM jsonb_array_elements(v_payload) AS entry;
  END IF;

  UPDATE public.dialer_assignments
  SET status = 'COMPLETED'
  WHERE id = p_assignment_id
    AND program_id = p_program_id
    AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_pending' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'callLogId', v_log.id,
    'assignmentId', v_log.assignment_id,
    'attempt', v_log.attempt,
    'calledAt', v_log.called_at,
    'dispositionStatus', v_log.disposition_status,
    'statusGroup', v_log.status_group,
    'followUpNotes', v_log.follow_up_notes,
    'replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_call_disposition(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_call_disposition(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, JSONB)
  TO service_role;
