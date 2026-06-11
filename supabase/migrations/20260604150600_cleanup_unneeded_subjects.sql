with cleanup_subjects(code) as (
  values
    ('TECH_INDUSTRIAL'),
    ('TECH_AGRICULTURAL'),
    ('GEOGRAPHY'),
    ('ECONOMIC_LAW'),
    ('INFORMATICS'),
    ('RUSSIAN'),
    ('FRENCH'),
    ('CHINESE'),
    ('GERMAN'),
    ('JAPANESE'),
    ('KOREAN')
),
blocked_subjects as (
  select cs.code
  from cleanup_subjects cs
  where exists (
      select 1
      from public.questions q
      where q.subject_code = cs.code
    )
    or exists (
      select 1
      from public.exam_rooms er
      join public.exam_keys ek on ek.exam_room_id = er.id
      where er.subject_code = cs.code
    )
    or exists (
      select 1
      from public.exam_rooms er
      join public.exam_sessions es on es.exam_room_id = er.id
      where er.subject_code = cs.code
    )
),
deletable_subjects as (
  select cs.code
  from cleanup_subjects cs
  where not exists (
    select 1
    from blocked_subjects bs
    where bs.code = cs.code
  )
),
room_ids as (
  select er.id
  from public.exam_rooms er
  join deletable_subjects ds on ds.code = er.subject_code
),
blueprint_ids as (
  select eb.id
  from public.exam_blueprints eb
  join deletable_subjects ds on ds.code = eb.subject_code
),
deleted_room_papers as (
  delete from public.exam_room_papers p
  where p.exam_room_id in (select id from room_ids)
    or p.blueprint_id in (select id from blueprint_ids)
  returning 1
),
deleted_room_questions as (
  delete from public.exam_room_questions q
  where q.exam_room_id in (select id from room_ids)
  returning 1
),
deleted_generation_rules as (
  delete from public.exam_room_generation_rules g
  where g.exam_room_id in (select id from room_ids)
  returning 1
),
deleted_rooms as (
  delete from public.exam_rooms er
  where er.id in (select id from room_ids)
  returning 1
),
deleted_blueprints as (
  delete from public.exam_blueprints eb
  where eb.id in (select id from blueprint_ids)
  returning 1
)
delete from public.subjects s
using deletable_subjects ds
where s.code = ds.code;
