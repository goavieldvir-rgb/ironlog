-- ONE-TIME REPAIR for routines copied to a trainee with "Copy to…".
--
-- The old copy function copied the routine's exercise IDs as-is — IDs that
-- belong to the account the routine was copied FROM. The trainee can't
-- read or update another account's exercises, so for those routines their
-- "previously logged" hint never worked and the exercises never showed up
-- in their own Exercise library. (The app is fixed going forward; this
-- repairs anything already copied.)
--
-- STEP 1 — run just this query first. It lists every affected routine.
-- If it returns no rows, nothing is affected and you can stop here.
--
--   select r.name as routine, p.full_name as owner, count(*) as foreign_exercises
--   from routines r
--   join profiles p on p.id = r.user_id,
--        jsonb_array_elements(r.exercises) item
--   join exercises e on e.id::text = item->>'exerciseId'
--   where e.user_id <> r.user_id
--   group by r.name, p.full_name;
--
-- STEP 2 — if it did return rows, run everything below. For each affected
-- item it reuses the trainee's own exercise with the same name + category,
-- or creates one, then points the routine AND that trainee's past
-- sessions at it — so their history stays in one place instead of being
-- split across two copies of the same exercise. Only exercise IDs change;
-- no weights, reps, dates or notes are touched. Safe to run twice.

do $$
declare
  r record;
  s record;
  item jsonb;
  new_items jsonb;
  src exercises%rowtype;
  tgt uuid;
  changed boolean;
begin
  -- Build an (owner, foreign exercise) -> owner's own exercise mapping.
  create temp table if not exists _exmap (owner uuid, old_id uuid, new_id uuid, primary key (owner, old_id)) on commit drop;

  for r in
    select distinct rt.user_id as owner, e.*
    from routines rt, jsonb_array_elements(rt.exercises) it
    join exercises e on e.id::text = it->>'exerciseId'
    where e.user_id <> rt.user_id
  loop
    select id into tgt from exercises
    where user_id = r.owner
      and category = r.category
      and lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(r.name), '\s+', ' ', 'g'))
    limit 1;

    if tgt is null then
      insert into exercises (user_id, name, name_he, category, unit, bodyweight, intensity_type, video_url, notes)
      values (r.owner, r.name, r.name_he, r.category, r.unit, r.bodyweight, r.intensity_type, r.video_url, r.notes)
      returning id into tgt;
    end if;

    insert into _exmap values (r.owner, r.id, tgt) on conflict do nothing;
  end loop;

  -- Rewrite routines.
  for r in select * from routines loop
    new_items := '[]'::jsonb;
    changed := false;
    for item in select * from jsonb_array_elements(r.exercises) loop
      select new_id into tgt from _exmap where owner = r.user_id and old_id::text = item->>'exerciseId';
      if tgt is not null then
        item := jsonb_set(item, '{exerciseId}', to_jsonb(tgt::text));
        changed := true;
      end if;
      new_items := new_items || jsonb_build_array(item);
    end loop;
    if changed then
      update routines set exercises = new_items where id = r.id;
    end if;
  end loop;

  -- Rewrite that person's past sessions the same way.
  for s in select * from sessions where user_id in (select owner from _exmap) loop
    new_items := '[]'::jsonb;
    changed := false;
    for item in select * from jsonb_array_elements(s.entries) loop
      select new_id into tgt from _exmap where owner = s.user_id and old_id::text = item->>'exerciseId';
      if tgt is not null then
        item := jsonb_set(item, '{exerciseId}', to_jsonb(tgt::text));
        changed := true;
      end if;
      new_items := new_items || jsonb_build_array(item);
    end loop;
    if changed then
      update sessions set entries = new_items where id = s.id;
    end if;
  end loop;
end $$;

-- After running: each affected trainee's "previously logged" hint fills in
-- again from their next logged session of each exercise.
