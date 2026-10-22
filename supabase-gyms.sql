-- Gym profiles: someone who trains at more than one gym picks which gym a
-- workout is at, and the "previous" numbers and personal records follow that
-- gym (machines feel different from gym to gym). Routines don't change.
-- Safe to re-run. Also folded into supabase/schema.sql. Run in the Supabase
-- SQL editor.
--
-- Nothing changes for someone with one gym: every existing workout has no
-- gym (null), which the app shows as the person's main gym. Adding a gym is
-- what turns the gym picker on.

-- The extra gyms a person trains at. The main gym is not a row: it is the
-- "no gym" (null) on a workout, and its name lives on the profile.
create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists gyms_user_idx on public.gyms (user_id);

alter table public.gyms enable row level security;
drop policy if exists "own or admin gyms" on public.gyms;
create policy "own or admin gyms" on public.gyms
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

-- Which gym a workout was at (null = main gym). Removing a gym moves its
-- workouts back to the main gym rather than deleting them.
alter table public.sessions add column if not exists gym_id uuid references public.gyms(id) on delete set null;

-- The main gym's name; null shows as "Main gym".
alter table public.profiles add column if not exists main_gym_name text check (main_gym_name is null or char_length(main_gym_name) <= 60);

-- A workout can only point at one of its owner's own gyms.
create or replace function public.check_session_gym()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.gym_id is not null
    and not exists (select 1 from gyms where id = NEW.gym_id and user_id = NEW.user_id) then
    raise exception 'gym does not belong to this person';
  end if;
  return NEW;
end;
$function$;
drop trigger if exists trg_check_session_gym on public.sessions;
create trigger trg_check_session_gym before insert or update of gym_id on public.sessions
  for each row execute function public.check_session_gym();

-- The coach's PR alert now compares against earlier workouts at the same gym
-- only. Same signature, so owner, grants and the trigger are kept.
create or replace function public.check_for_new_prs()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  entry jsonb;
  set_row jsonb;
  ex_category text;
  ex_bodyweight boolean;
  ex_name text;
  ex_id text;
  ex_unit text;
  this_top numeric;
  this_top_set jsonb;
  prev_best numeric;
  reps_set jsonb;
  reps_top numeric;
  prev_reps numeric;
  prev_cnt int;
  trainee_name text;
  detail_text text;
  numeric_pattern text := '^-?[0-9]+\.?[0-9]*$';
begin
  begin
    for entry in select * from jsonb_array_elements(NEW.entries)
    loop
      ex_name := entry->>'name';
      ex_id := entry->>'exerciseId';
      ex_category := coalesce(entry->>'category', 'strength');
      ex_bodyweight := coalesce((entry->>'bodyweight')::boolean, false);
      ex_unit := coalesce(entry->>'unit', 'kg');
      this_top := null;
      this_top_set := null;

      for set_row in select * from jsonb_array_elements(entry->'sets')
      loop
        if ex_category = 'cardio' then
          if nullif(set_row->>'duration', '') is not null
            and (set_row->>'duration') ~ numeric_pattern
            and (this_top is null or (set_row->>'duration')::numeric > this_top) then
            this_top := (set_row->>'duration')::numeric;
            this_top_set := set_row;
          end if;
        elsif ex_bodyweight then
          if nullif(set_row->>'reps', '') is not null
            and (set_row->>'reps') ~ numeric_pattern
            and (this_top is null or (set_row->>'reps')::numeric > this_top) then
            this_top := (set_row->>'reps')::numeric;
            this_top_set := set_row;
          end if;
        else
          if nullif(set_row->>'weight', '') is not null
            and (set_row->>'weight') ~ numeric_pattern
            and (this_top is null or (set_row->>'weight')::numeric > this_top) then
            this_top := (set_row->>'weight')::numeric;
            this_top_set := set_row;
          end if;
        end if;
      end loop;

      if this_top is null or this_top = 0 then
        continue;
      end if;

      select max(
        case
          when ex_category = 'cardio' then (s.set_elem->>'duration')::numeric
          when ex_bodyweight then (s.set_elem->>'reps')::numeric
          else (s.set_elem->>'weight')::numeric
        end
      ) into prev_best
      from sessions sess,
        jsonb_array_elements(sess.entries) as e(entry_elem),
        jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
      where sess.user_id = NEW.user_id
        and sess.id != NEW.id
        -- Records count per gym: a machine at one gym isn't the same weight
        -- as at another. No gym (null) is the person's main gym.
        and sess.gym_id is not distinct from NEW.gym_id
        and e.entry_elem ->> 'exerciseId' = ex_id
        and (
          case
            when ex_category = 'cardio' then s.set_elem->>'duration'
            when ex_bodyweight then s.set_elem->>'reps'
            else s.set_elem->>'weight'
          end
        ) ~ numeric_pattern;

      if prev_best is null or this_top > prev_best then
        select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;

        -- Build a full description of the actual set, not just the one
        -- headline number.
        if ex_category = 'cardio' then
          detail_text := this_top || ' min';
          if nullif(this_top_set->>'intensity', '') is not null then
            detail_text := detail_text || ' · intensity ' || (this_top_set->>'intensity');
          end if;
          if nullif(this_top_set->>'distance', '') is not null then
            detail_text := detail_text || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
          end if;
        elsif ex_bodyweight then
          detail_text := this_top || ' reps';
          if nullif(this_top_set->>'weight', '') is not null
            and (this_top_set->>'weight') ~ numeric_pattern
            and (this_top_set->>'weight')::numeric > 0 then
            detail_text := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_text;
          end if;
        else
          detail_text := this_top || ex_unit;
          if nullif(this_top_set->>'reps', '') is not null then
            detail_text := detail_text || ' × ' || (this_top_set->>'reps');
          end if;
        end if;

        perform send_admin_email(
          trainee_name || ' just hit a new PR 🏆',
          '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
          public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
        );
        perform send_admin_push(
          '🏆 New PR: ' || trainee_name,
          ex_name || ' — ' || detail_text
        );

        insert into admin_notifications (type, trainee_id, detail)
        values ('pr', NEW.user_id, ex_name || ': ' || detail_text);

      elsif coalesce(ex_category, '') <> 'cardio' and not coalesce(ex_bodyweight, false) then
        -- Not a heavier lift, but maybe more reps than ever at this weight
        -- or heavier (a Reps PR). Needs an earlier set to beat. Mirrors the
        -- app: working sets only, judged against other sessions.
        reps_set := null;
        reps_top := null;
        for set_row in select * from jsonb_array_elements(entry->'sets')
        loop
          -- CASE keeps the numeric casts from running on blank or non-numeric
          -- text (SQL does not promise AND/OR short-circuiting).
          if coalesce(set_row->>'warmup', '') = 'true'
            or coalesce(case when (set_row->>'weight') ~ numeric_pattern then (set_row->>'weight')::numeric end, 0) <= 0
            or coalesce(case when (set_row->>'reps') ~ numeric_pattern then (set_row->>'reps')::numeric end, 0) <= 0 then
            continue;
          end if;

          select max((s.set_elem->>'reps')::numeric), count(*)
            into prev_reps, prev_cnt
          from sessions sess,
            jsonb_array_elements(sess.entries) as e(entry_elem),
            jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
          where sess.user_id = NEW.user_id
            and sess.id != NEW.id
            and sess.gym_id is not distinct from NEW.gym_id
            and e.entry_elem ->> 'exerciseId' = ex_id
            and coalesce(s.set_elem->>'warmup', '') <> 'true'
            and coalesce(case when (s.set_elem->>'weight') ~ numeric_pattern
                               and (s.set_elem->>'reps') ~ numeric_pattern
                              then (s.set_elem->>'weight')::numeric end, -1) >= (set_row->>'weight')::numeric;

          if prev_cnt > 0 and (set_row->>'reps')::numeric > prev_reps
            and (reps_top is null or (set_row->>'reps')::numeric > reps_top) then
            reps_top := (set_row->>'reps')::numeric;
            reps_set := set_row;
          end if;
        end loop;

        if reps_set is not null then
          select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;
          detail_text := 'Reps PR ' || (reps_set->>'weight') || ex_unit || ' × ' || (reps_set->>'reps') || ' reps';

          perform send_admin_email(
            trainee_name || ' just hit a new PR 🏆',
            '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
            public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
          );
          perform send_admin_push(
            '🏆 New PR: ' || trainee_name,
            ex_name || ' — ' || detail_text
          );

          insert into admin_notifications (type, trainee_id, detail)
          values ('pr', NEW.user_id, ex_name || ': ' || detail_text);
        end if;
      end if;
    end loop;
  exception when others then
    raise warning 'check_for_new_prs failed (session still saved normally): %', sqlerrm;
  end;

  return NEW;
end;
$function$;

