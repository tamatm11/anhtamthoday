-- Fix submit_exam_session to calculate scores before finalising.
--
-- Previous version only set status = 'submitted' — no scoring.
-- This version scores MCQ, True/False (partial via score-steps),
-- and Short-Answer questions. Essays are left for manual grading.
-- It also back-fills session_tf_item_answers for TF review UX.

CREATE OR REPLACE FUNCTION public.submit_exam_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student_id  uuid;
  v_status      text;
  v_total_score numeric := 0;
  v_rec         record;
  v_question_type text;
  v_answer_json jsonb;
  v_selected_option uuid;
  v_is_correct  boolean;
  v_earned      numeric;
  v_correct_count integer;
  v_item_correct boolean;
  v_item_key    record;
  v_sa_text     text;
  v_sa_key      record;
  v_sa_matched  boolean;
  v_numeric_val numeric;
begin
  ---------------------------------------------------------------
  -- 1. Validate: session must belong to caller & be in_progress
  ---------------------------------------------------------------
  select es.student_id, es.status
    into v_student_id, v_status
    from public.exam_sessions es
   where es.id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  if v_student_id <> (select auth.uid()) then
    raise exception 'Permission denied';
  end if;

  -- Idempotent: if already submitted, do nothing
  if v_status <> 'in_progress' then
    return;
  end if;

  ---------------------------------------------------------------
  -- 2. Score each answered question
  ---------------------------------------------------------------
  for v_rec in
    select
      sa.id            as answer_id,
      sa.answer_json   as answer_json,
      sa.session_question_id,
      esq.question_id,
      esq.max_points,
      q.type           as question_type
    from public.session_answers sa
    join public.exam_session_questions esq
      on esq.id = sa.session_question_id
    join public.questions q
      on q.id = esq.question_id
    where esq.session_id = p_session_id
      and sa.student_id = v_student_id
  loop
    v_answer_json   := v_rec.answer_json;
    v_question_type := v_rec.question_type::text;
    v_is_correct    := false;
    v_earned        := 0;

    -------------------------------------------------------
    -- 2a. Multiple-choice scoring
    -------------------------------------------------------
    if v_question_type = 'multiple_choice' then
      -- Extract the selected option_id from answer_json
      v_selected_option := (v_answer_json ->> 'option_id')::uuid;

      if v_selected_option is not null then
        -- Check if this option is in the correct-options table
        select exists(
          select 1
            from public.question_correct_options qco
           where qco.question_id = v_rec.question_id
             and qco.option_id   = v_selected_option
        ) into v_is_correct;

        if v_is_correct then
          v_earned := v_rec.max_points;
        end if;
      end if;

      update public.session_answers
         set is_correct  = v_is_correct,
             earned_points = v_earned,
             grader = '{"type":"auto","method":"mcq_exact"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- 2b. True/False scoring (partial via score-steps)
    -------------------------------------------------------
    elsif v_question_type = 'true_false' then
      v_correct_count := 0;

      -- Iterate answer keys; compare with student answer from answer_json.items
      for v_item_key in
        select tfk.item_id, tfk.correct_value
          from public.question_true_false_answer_keys tfk
         where tfk.question_id = v_rec.question_id
      loop
        -- Student's selected value for this item
        -- answer_json.items.<item_id> is 'true' or 'false' (string)
        v_item_correct := false;

        if v_answer_json -> 'items' ->> v_item_key.item_id::text is not null then
          if (
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true'  and v_item_key.correct_value = true)
            or
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' and v_item_key.correct_value = false)
          ) then
            v_item_correct := true;
            v_correct_count := v_correct_count + 1;
          end if;
        end if;

        -- Also populate session_tf_item_answers for detailed review
        insert into public.session_tf_item_answers
          (session_question_id, item_id, selected_value, is_correct)
        values (
          v_rec.session_question_id,
          v_item_key.item_id,
          case
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true'  then true
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' then false
            else null
          end,
          v_item_correct
        )
        on conflict (session_question_id, item_id)
        do update set
          selected_value = excluded.selected_value,
          is_correct     = excluded.is_correct,
          updated_at     = now();
      end loop;

      -- Look up partial score from question_tf_score_steps
      select coalesce(tfs.points, 0)
        into v_earned
        from public.question_tf_score_steps tfs
       where tfs.question_id = v_rec.question_id
         and tfs.correct_item_count = v_correct_count;

      -- If no score-step row for this count, default 0
      if v_earned is null then
        v_earned := 0;
      end if;

      -- All items correct → full marks
      v_is_correct := (v_earned = v_rec.max_points);

      update public.session_answers
         set is_correct        = v_is_correct,
             correct_item_count = v_correct_count,
             earned_points     = v_earned,
             grader = '{"type":"auto","method":"tf_partial"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- 2c. Short-answer scoring
    -------------------------------------------------------
    elsif v_question_type = 'short_answer' then
      v_sa_text := trim(v_answer_json ->> 'value');
      v_sa_matched := false;

      if v_sa_text is not null and v_sa_text <> '' then
        -- Try each answer key until one matches
        for v_sa_key in
          select sak.*
            from public.question_short_answer_keys sak
           where sak.question_id = v_rec.question_id
        loop
          if v_sa_key.answer_type = 'numeric' then
            -- Numeric comparison with tolerance
            begin
              v_numeric_val := v_sa_text::numeric;
              if v_sa_key.numeric_value is not null
                 and abs(v_numeric_val - v_sa_key.numeric_value) <= coalesce(v_sa_key.tolerance, 0)
              then
                v_sa_matched := true;
              end if;
            exception when others then
              -- Student typed non-numeric text for a numeric answer → not matched
              null;
            end;

          elsif v_sa_key.answer_type = 'text' then
            -- Text comparison
            if v_sa_key.match_mode = 'exact' then
              if v_sa_key.case_sensitive then
                v_sa_matched := (v_sa_text = v_sa_key.normalized_text);
              else
                v_sa_matched := (lower(v_sa_text) = lower(v_sa_key.normalized_text));
              end if;

            elsif v_sa_key.match_mode = 'contains' then
              if v_sa_key.case_sensitive then
                v_sa_matched := (v_sa_text like '%' || v_sa_key.normalized_text || '%');
              else
                v_sa_matched := (lower(v_sa_text) like '%' || lower(v_sa_key.normalized_text) || '%');
              end if;

            elsif v_sa_key.match_mode = 'regex' then
              if v_sa_key.regex_pattern is not null then
                begin
                  v_sa_matched := (v_sa_text ~ v_sa_key.regex_pattern);
                exception when others then
                  v_sa_matched := false;
                end;
              end if;
            end if;
          end if;

          exit when v_sa_matched;  -- stop on first match
        end loop;
      end if;

      v_is_correct := v_sa_matched;
      if v_sa_matched then
        v_earned := v_rec.max_points;
      end if;

      update public.session_answers
         set is_correct    = v_is_correct,
             earned_points = v_earned,
             grader = '{"type":"auto","method":"short_answer"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- 2d. Essay → skip auto-grading (needs manual review)
    -------------------------------------------------------
    elsif v_question_type = 'essay' then
      update public.session_answers
         set grader = '{"type":"pending","method":"manual"}'::jsonb
       where id = v_rec.answer_id;
      -- v_earned stays 0 — will be updated by teacher later
    end if;

    v_total_score := v_total_score + v_earned;
  end loop;

  ---------------------------------------------------------------
  -- 3. Finalise: set score, status, submitted_at
  ---------------------------------------------------------------
  update public.exam_sessions
     set score        = v_total_score,
         status       = 'submitted',
         submitted_at = now(),
         updated_at   = now()
   where id = p_session_id
     and student_id = v_student_id;
end;
$function$;
