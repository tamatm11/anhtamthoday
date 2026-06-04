create or replace function public.join_exam(p_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_key_record record;
  v_session_id uuid;
  v_student_id uuid;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Lock the key record to prevent race conditions
  select id, exam_room_id, assigned_to, total_attempts, used_attempts, status, expires_at
  into v_key_record
  from public.exam_keys
  where code = upper(p_code)
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  -- 2. Validations
  if v_key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if v_key_record.expires_at is not null and v_key_record.expires_at < now() then
    raise exception 'KEY_EXPIRED';
  end if;

  if v_key_record.assigned_to is not null and v_key_record.assigned_to <> v_student_id then
    raise exception 'KEY_ASSIGNED_TO_OTHER';
  end if;

  if v_key_record.used_attempts >= v_key_record.total_attempts then
    raise exception 'KEY_NO_ATTEMPTS_LEFT';
  end if;

  -- 3. Update key record
  update public.exam_keys
  set assigned_to = v_student_id,
      used_attempts = used_attempts + 1,
      status = 'active',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_key_record.id;

  -- 4. Create new exam session
  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    attempt_number,
    status
  ) values (
    v_key_record.id,
    v_student_id,
    v_key_record.exam_room_id,
    v_key_record.used_attempts + 1,
    'in_progress'
  ) returning id into v_session_id;

  -- 5. Copy questions from room to session
  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    max_points
  )
  select 
    v_session_id,
    erq.blueprint_section_id,
    erq.question_id,
    erq.seq,
    coalesce(erq.points_override, ebs.max_points_per_question)
  from public.exam_room_questions erq
  join public.exam_blueprint_sections ebs on ebs.id = erq.blueprint_section_id
  where erq.exam_room_id = v_key_record.exam_room_id;

  -- Update student's current key if not set
  update public.students
  set current_key_id = v_key_record.id
  where id = v_student_id and current_key_id is null;

  return v_session_id;
end;
$$;
