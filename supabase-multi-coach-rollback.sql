-- Undo supabase-multi-coach.sql: every policy and function goes back to its
-- definition from before the change (copied from the live database on
-- 2026-11-12), the new functions, triggers and columns are dropped.
-- Coach assignments are lost; nobody else's data is touched.
-- Run in the SQL Editor, then redeploy send-workout-reminders and the app
-- from the commit before the multi-coach change (bc6bdd7).

begin;

drop trigger if exists trg_coach_task_owner on public.coach_tasks;
drop trigger if exists trg_coach_removed on public.profiles;
drop trigger if exists trg_coach_deleted on public.profiles;

drop policy if exists "read own or admin reads all profiles" on public.profiles;
create policy "read own or admin reads all profiles" on public.profiles as permissive for select to public using (((auth.uid() = id) OR is_admin()));
drop policy if exists "admins can update any profile including admin flag" on public.profiles;
create policy "admins can update any profile including admin flag" on public.profiles as permissive for update to public using (is_admin()) with check (is_admin());
drop policy if exists "own or admin sessions" on public.sessions;
create policy "own or admin sessions" on public.sessions as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin routines" on public.routines;
create policy "own or admin routines" on public.routines as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin exercises" on public.exercises;
create policy "own or admin exercises" on public.exercises as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin body weight" on public.body_weight_logs;
create policy "own or admin body weight" on public.body_weight_logs as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin waist" on public.waist_logs;
create policy "own or admin waist" on public.waist_logs as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin gyms" on public.gyms;
create policy "own or admin gyms" on public.gyms as permissive for all to public using (((auth.uid() = user_id) OR is_admin())) with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin can read schedule" on public.weekly_schedule;
create policy "own or admin can read schedule" on public.weekly_schedule as permissive for select to public using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin can insert schedule" on public.weekly_schedule;
create policy "own or admin can insert schedule" on public.weekly_schedule as permissive for insert to public with check (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin can update schedule" on public.weekly_schedule;
create policy "own or admin can update schedule" on public.weekly_schedule as permissive for update to public using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "own or admin can delete schedule" on public.weekly_schedule;
create policy "own or admin can delete schedule" on public.weekly_schedule as permissive for delete to public using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "read own or admin" on public.consents;
create policy "read own or admin" on public.consents as permissive for select to public using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "read own or admin photos" on public.progress_photos;
create policy "read own or admin photos" on public.progress_photos as permissive for select to authenticated using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "delete own or admin photos" on public.progress_photos;
create policy "delete own or admin photos" on public.progress_photos as permissive for delete to authenticated using (((auth.uid() = user_id) OR is_admin()));
drop policy if exists "progress photos: read own or admin" on storage.objects;
create policy "progress photos: read own or admin" on storage.objects as permissive for select to authenticated using (((bucket_id = 'progress-photos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin())));
drop policy if exists "progress photos: delete own or admin" on storage.objects;
create policy "progress photos: delete own or admin" on storage.objects as permissive for delete to authenticated using (((bucket_id = 'progress-photos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin())));
drop policy if exists "own food logs or admin" on public.food_logs;
create policy "own food logs or admin" on public.food_logs as permissive for all to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin())) with check ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "own favorites or admin" on public.food_favorites;
create policy "own favorites or admin" on public.food_favorites as permissive for all to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin())) with check ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "own saved meals or admin" on public.saved_meals;
create policy "own saved meals or admin" on public.saved_meals as permissive for all to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin())) with check ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "own water logs or admin" on public.water_logs;
create policy "own water logs or admin" on public.water_logs as permissive for all to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin())) with check ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "own water goal or admin" on public.water_goals;
create policy "own water goal or admin" on public.water_goals as permissive for all to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin())) with check ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "admin writes targets" on public.nutrition_targets;
create policy "admin writes targets" on public.nutrition_targets as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "read own targets or admin" on public.nutrition_targets;
create policy "read own targets or admin" on public.nutrition_targets as permissive for select to authenticated using ((((auth.uid() = user_id) AND nutrition_allowed()) OR is_admin()));
drop policy if exists "foods readable" on public.foods;
create policy "foods readable" on public.foods as permissive for select to authenticated using ((nutrition_allowed() AND (verified OR (source = ANY (ARRAY['moh'::text, 'usda'::text, 'off'::text])) OR (created_by = auth.uid()) OR is_admin())));
drop policy if exists "read own thread or coach" on public.coach_messages;
create policy "read own thread or coach" on public.coach_messages as permissive for select to authenticated using (((trainee_id = auth.uid()) OR is_admin()));
drop policy if exists "write own thread or coach" on public.coach_messages;
create policy "write own thread or coach" on public.coach_messages as permissive for insert to authenticated with check (((sender_id = auth.uid()) AND ((trainee_id = auth.uid()) OR is_admin())));
drop policy if exists "admins manage coach notes" on public.coach_notes;
create policy "admins manage coach notes" on public.coach_notes as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admins manage coach goals" on public.coach_goals;
create policy "admins manage coach goals" on public.coach_goals as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admins manage coach tasks" on public.coach_tasks;
create policy "admins manage coach tasks" on public.coach_tasks as permissive for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admins can read notification log" on public.admin_notifications;
create policy "admins can read notification log" on public.admin_notifications as permissive for select to public using (is_admin());
drop policy if exists "coaches manage own invites" on public.signup_invites;

drop function if exists public.coach_roster(date);
CREATE OR REPLACE FUNCTION public.coach_roster(p_today date)
 RETURNS TABLE(id uuid, email text, full_name text, is_admin boolean, nutrition_enabled boolean, inactivity_alert_days integer, created_at timestamp with time zone, last_session date, week_counts integer[], planned_per_week integer, to_review integer, last_weight numeric, weight_unit text, last_weight_date date, weight_change numeric, prs_7d integer, prs_30d integer, last_pr text, food_days_7 integer, kcal_avg_7 numeric, protein_avg_7 numeric, kcal_target integer, protein_target numeric, terms_version integer, terms_variant text, terms_accepted_at timestamp with time zone, guardian_name text, goal text, target_weight numeric, next_checkin date, pinned_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  week0 date := p_today - extract(dow from p_today)::int;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.email, p.full_name, p.is_admin, p.nutrition_enabled, p.inactivity_alert_days, p.created_at,
    (select max(s.date) from sessions s where s.user_id = p.id),
    (select array_agg(
        (select count(*)::int from sessions s
          where s.user_id = p.id and s.date >= week0 - 7 * (7 - i) and s.date < week0 - 7 * (6 - i))
        order by i)
      from generate_series(0, 7) i),
    coalesce(
      (select nullif(count(*), 0)::int from weekly_schedule w where w.user_id = p.id and w.routine_id is not null),
      g.sessions_per_week::int),
    (select count(*)::int from sessions s
      where s.user_id = p.id and s.date >= p_today - 14 and s.reviewed_at is null
        and coalesce(s.trainer_comment, '') = ''),
    bw.weight, bw.unit, bw.date,
    (select bw.weight - b2.weight from body_weight_logs b2
      where b2.user_id = p.id and b2.unit = bw.unit and b2.date <= bw.date - 21
      order by b2.date desc limit 1),
    (select count(*)::int from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' and n.sent_at >= p_today - 6),
    (select count(*)::int from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' and n.sent_at >= p_today - 29),
    (select n.detail from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' order by n.sent_at desc limit 1),
    f.days, f.kcal, f.protein,
    nt.kcal, nt.protein,
    c.version, c.variant, c.accepted_at, c.guardian_name,
    g.goal, g.target_weight, g.next_checkin,
    (select cn.body from coach_notes cn where cn.trainee_id = p.id and cn.pinned
      order by cn.created_at desc limit 1)
  from profiles p
  left join coach_goals g on g.trainee_id = p.id
  left join nutrition_targets nt on nt.user_id = p.id
  left join lateral (
    select b.weight, b.unit, b.date from body_weight_logs b
    where b.user_id = p.id order by b.date desc, b.created_at desc limit 1
  ) bw on true
  left join lateral (
    select count(*)::int as days, round(avg(d.kcal)) as kcal, round(avg(d.protein), 1) as protein
    from (
      select fl.date, sum(fl.kcal) as kcal, sum(fl.protein) as protein
      from food_logs fl
      where fl.user_id = p.id and fl.date >= p_today - 7 and fl.date < p_today
      group by fl.date
    ) d
  ) f on true
  left join lateral (
    select cs.version, cs.variant, cs.accepted_at, cs.guardian_name from consents cs
    where cs.user_id = p.id and cs.doc_key = 'training-terms'
    order by cs.version desc, cs.accepted_at desc limit 1
  ) c on true
  order by coalesce(p.full_name, p.email);
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_coach_tasks(p_today date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  added integer := 0;
  c integer;
begin
  -- Signed-in callers must be the coach; the cron job runs with no user.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  -- Close tasks whose reason went away.
  update coach_tasks t set done_at = now(), auto_done = true
  where t.done_at is null and t.trainee_id is not null and (
    (t.kind = 'quiet' and exists (select 1 from sessions s where s.user_id = t.trainee_id and s.date > t.since))
    or (t.kind = 'food' and exists (select 1 from food_logs f where f.user_id = t.trainee_id and f.date > coalesce(t.since, '-infinity'::date)))
    or (t.kind = 'weigh' and exists (select 1 from body_weight_logs b where b.user_id = t.trainee_id and b.date > t.since))
    or (t.kind = 'checkin' and not exists (select 1 from coach_goals g where g.trainee_id = t.trainee_id and g.next_checkin = t.since))
  );

  -- Gone quiet: no session for their alert days (default 5).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'quiet', 'quiet:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(s.date) as last from sessions s where s.user_id = p.id) l on true
  where not p.is_admin and l.last is not null
    and p_today - l.last >= coalesce(p.inactivity_alert_days, 5)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Not logging food: nutrition on with a calorie target, account older than
  -- three days, and nothing logged in the last three finished days.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'food', 'food:' || p.id || ':' || coalesce(l.last::text, 'none'), l.last,
         case when l.last is null then null else p_today - l.last end, p_today
  from profiles p
  join nutrition_targets nt on nt.user_id = p.id and nt.kcal is not null
  join lateral (select max(f.date) as last from food_logs f where f.user_id = p.id and f.date < p_today) l on true
  where not p.is_admin and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - 3)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select g.trainee_id, 'birthday', 'birthday:' || g.trainee_id || ':' || extract(year from p_today),
         extract(year from age(p_today, g.birthday))::int, p_today
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.birthday is not null
    and (to_char(g.birthday, 'MM-DD') = to_char(p_today, 'MM-DD')
      or (to_char(g.birthday, 'MM-DD') = '02-29' and to_char(p_today, 'MM-DD') = '02-28'
          and extract(day from (date_trunc('year', p_today) + interval '1 month 28 days')) <> 29))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Check-in date reached (set on the trainee's coach page).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, due)
  select g.trainee_id, 'checkin', 'checkin:' || g.trainee_id || ':' || g.next_checkin, g.next_checkin, g.next_checkin
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.next_checkin is not null and g.next_checkin <= p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for 14 days, for people who do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  where not p.is_admin and l.last is not null and l.last <= p_today - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  where not p.is_admin
    and p.created_at::date between p_today - 10 and p_today - 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return added;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_coach_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  secret text;
  pending integer;
begin
  perform refresh_coach_tasks(today);

  select count(*) into pending from coach_tasks where done_at is null and notified_at is null;
  if pending = 0 then return; end if;

  select value into secret from push_config where key = 'cron_secret';
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin
  ) then
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('coach_tasks', true)
    );
  else
    perform send_admin_push(
      'Ironlog: ' || pending || ' משימות למאמן',
      'יש ' || pending || ' דברים חדשים שדורשים תשומת לב. פתחו את מסך המתאמנים.'
    );
    update coach_tasks set notified_at = now() where done_at is null and notified_at is null;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_for_new_prs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

      -- First time at this gym but done before at another: no record to
      -- beat yet, the same as the workout screen shows.
      if (prev_best is null and not exists (
            select 1 from sessions sess
            where sess.user_id = NEW.user_id and sess.id != NEW.id
              and sess.entries @> jsonb_build_array(jsonb_build_object('exerciseId', ex_id))))
        or this_top > prev_best then
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

CREATE OR REPLACE FUNCTION public.check_inactive_trainees()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  last_date date;
  days_since integer;
  already_alerted boolean;
begin
  for r in
    select distinct p.id, coalesce(p.full_name, p.email) as name, p.inactivity_alert_days
    from profiles p
    where p.is_admin = false
      and exists (select 1 from routines rt where rt.user_id = p.id)
  loop
    begin
      select max(date) into last_date from sessions where user_id = r.id;
      if last_date is null then continue; end if;
      days_since := current_date - last_date;
      if days_since < coalesce(r.inactivity_alert_days, 5) then continue; end if;
      select exists (
        select 1 from admin_notifications
        where type = 'inactivity' and trainee_id = r.id and sent_at::date > last_date
      ) into already_alerted;
      if already_alerted then continue; end if;
      perform send_admin_email(
        r.name || ' has gone quiet',
        '<p><strong>' || public.html_escape(r.name) || '</strong> hasn''t logged a session in ' || days_since || ' days (last one: ' || last_date || ').</p>'
      );
      perform send_admin_push('💤 ' || r.name || ' has gone quiet', days_since || ' days since their last session (' || last_date || ')');
      insert into admin_notifications (type, trainee_id, detail) values ('inactivity', r.id, days_since || ' days since last session');
    exception when others then
      raise warning 'check_inactive_trainees failed for %: %', r.name, sqlerrm;
    end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.nutrition_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin or nutrition_enabled from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.protect_admin_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Only requests that come through the app's public API (signed in or not)
  -- are checked. The SQL Editor and server-side jobs have no such role.
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.nutrition_enabled := false;
  elsif not public.is_admin() then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    if new.nutrition_enabled is distinct from old.nutrition_enabled then
      raise exception 'NUTRITION_FLAG_PROTECTED';
    end if;
    new.inactivity_alert_days := old.inactivity_alert_days;
    new.email := old.email;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), false)
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_trainee uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n integer;
begin
  if auth.uid() is null or not public.mfa_satisfied() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_trainee = auth.uid() then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id <> auth.uid() and read_at is null;
  elsif public.is_admin() then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id = p_trainee and read_at is null;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_session_coach_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.trainer_comment := null;
    new.trainer_comment_at := null;
    new.trainer_comment_seen_at := null;
    new.reviewed_at := null;
  else
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.on_trainer_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  secret text;
begin
  if new.trainer_comment is not distinct from old.trainer_comment
     and new.trainer_comment_at is not distinct from old.trainer_comment_at then
    return new;
  end if;
  if not public.is_admin() then
    new.trainer_comment := old.trainer_comment;
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if new.trainer_comment is not distinct from old.trainer_comment then
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if coalesce(btrim(new.trainer_comment), '') = '' then
    new.trainer_comment_at := null;
    return new;
  end if;

  new.trainer_comment_at := now();
  -- The coach's own workouts need no notification.
  if new.user_id is distinct from auth.uid() then
    select value into secret from public.push_config where key = 'cron_secret';
    if secret is not null then
      perform net.http_post(
        url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
        body := jsonb_build_object('feedback_session_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if exists (select 1 from profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_SELF_DELETE';
  end if;

  delete from food_logs where user_id = uid;
  delete from saved_meals where user_id = uid;
  delete from nutrition_targets where user_id = uid;
  delete from foods where created_by = uid and source = 'user' and not verified;
  delete from weekly_schedule where user_id = uid;
  delete from sessions where user_id = uid;
  delete from routines where user_id = uid;
  delete from exercises where user_id = uid;
  delete from body_weight_logs where user_id = uid;
  delete from admin_notifications where trainee_id = uid;
  update error_logs set user_id = null where user_id = uid;
  delete from profiles where id = uid;
  delete from auth.users where id = uid;
end;
$function$;

revoke all on function public.coach_roster(date) from public, anon, authenticated;
grant execute on function public.coach_roster(date) to service_role, authenticated;

drop function if exists public.coach_task_owner();
drop function if exists public.coach_removed();
drop function if exists public.my_coach();
drop function if exists public.owner_gets_alerts(uuid);
drop function if exists public.can_coach_folder(text);
drop function if exists public.can_coach(uuid);
drop function if exists public.is_coach();

drop index if exists public.coach_tasks_coach_idx;
alter table public.coach_tasks drop column if exists coach_id;
drop index if exists public.profiles_coach_id_idx;
alter table public.profiles drop column if exists coach_id;
alter table public.profiles drop column if exists is_coach;

commit;
