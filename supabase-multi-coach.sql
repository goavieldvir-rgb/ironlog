-- More than one coach: each coach sees and manages only their own trainees.
--
-- Before this, the only coach was the account with profiles.is_admin, and
-- every coach permission read "admin sees everyone". Now:
--   * is_admin  = the owner (Aviel). Still sees and manages everyone, and is
--                 the only one who runs the shared things: the exercise
--                 library, verifying shared foods, error logs, roles.
--   * is_coach  = another coach. Sees and manages only people whose
--                 coach_id is them.
--   * coach_id  = a trainee's coach. Every existing trainee gets the owner,
--                 so nothing changes for anyone already here.
-- New sign-ups get the coach who invited them (signup_invites.invited_by).
--
-- Safe to run more than once. Run it in the SQL Editor, then deploy the
-- send-workout-reminders function from the same commit.

-- ---------- columns ----------
alter table public.profiles add column if not exists is_coach boolean not null default false;
alter table public.profiles add column if not exists coach_id uuid references public.profiles (id) on delete set null;
create index if not exists profiles_coach_id_idx on public.profiles (coach_id);

-- Hand-written tasks with no trainee belong to whoever wrote them.
alter table public.coach_tasks add column if not exists coach_id uuid references public.profiles (id) on delete cascade;
create index if not exists coach_tasks_coach_idx on public.coach_tasks (coach_id);

-- ---------- backfill: every current trainee is the owner's ----------
update public.profiles p
   set coach_id = (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)
 where not p.is_admin and p.coach_id is null;

update public.coach_tasks t
   set coach_id = (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)
 where t.trainee_id is null and t.coach_id is null;

-- ---------- checks used by the policies ----------
-- Any coach (owner included), signed in with two-step.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin or is_coach from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- May the signed-in person act as coach for this person? The owner may for
-- anyone; another coach only for their own trainees. Two-step required,
-- as with is_admin(). Your own rows are covered by each policy's own
-- "auth.uid() = user_id" part, not by this.
create or replace function public.can_coach(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and (me.is_admin
        or (me.is_coach and target is not null and target <> me.id and exists (
              select 1 from public.profiles t where t.id = target and t.coach_id = me.id and not t.is_admin)))
  );
$$;

-- The same for a progress-photos path, whose first folder is the owner's id.
create or replace function public.can_coach_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when folder ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.can_coach(folder::uuid)
    else public.is_admin()
  end;
$$;

-- Email and ntfy alerts go to the owner's inbox and phone, so they are only
-- for the owner's own trainees (and anyone without a coach).
create or replace function public.owner_gets_alerts(trainee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles t join public.profiles c on c.id = t.coach_id
    where t.id = trainee and c.is_coach and not c.is_admin
  );
$$;

-- The signed-in person's coach, for the privacy notice and terms.
create or replace function public.my_coach()
returns table (name text, contact text, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(c.full_name, ''), c.email), c.email, c.is_admin
  from public.profiles me join public.profiles c on c.id = me.coach_id
  where me.id = auth.uid();
$$;

revoke execute on function public.is_coach() from public, anon;
revoke execute on function public.can_coach(uuid) from public, anon;
revoke execute on function public.can_coach_folder(text) from public, anon;
revoke execute on function public.owner_gets_alerts(uuid) from public, anon, authenticated;
revoke execute on function public.my_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.can_coach(uuid) to authenticated;
grant execute on function public.can_coach_folder(text) to authenticated;
grant execute on function public.owner_gets_alerts(uuid) to service_role;
grant execute on function public.my_coach() to authenticated;

-- ---------- policies: "or is_admin()" becomes "or can_coach(person)" ----------
-- Names are kept so this lines up with the earlier scripts.

drop policy if exists "read own or admin reads all profiles" on public.profiles;
create policy "read own or admin reads all profiles" on public.profiles
  for select using (auth.uid() = id or public.can_coach(id));
drop policy if exists "admins can update any profile including admin flag" on public.profiles;
create policy "admins can update any profile including admin flag" on public.profiles
  for update using (public.can_coach(id)) with check (public.can_coach(id));

drop policy if exists "own or admin sessions" on public.sessions;
create policy "own or admin sessions" on public.sessions
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin routines" on public.routines;
create policy "own or admin routines" on public.routines
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin exercises" on public.exercises;
create policy "own or admin exercises" on public.exercises
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin body weight" on public.body_weight_logs;
create policy "own or admin body weight" on public.body_weight_logs
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin waist" on public.waist_logs;
create policy "own or admin waist" on public.waist_logs
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin gyms" on public.gyms;
create policy "own or admin gyms" on public.gyms
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "own or admin can read schedule" on public.weekly_schedule;
create policy "own or admin can read schedule" on public.weekly_schedule
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "own or admin can insert schedule" on public.weekly_schedule;
create policy "own or admin can insert schedule" on public.weekly_schedule
  for insert with check (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "own or admin can update schedule" on public.weekly_schedule;
create policy "own or admin can update schedule" on public.weekly_schedule
  for update using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "own or admin can delete schedule" on public.weekly_schedule;
create policy "own or admin can delete schedule" on public.weekly_schedule
  for delete using (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "read own or admin" on public.consents;
create policy "read own or admin" on public.consents
  for select using (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "read own or admin photos" on public.progress_photos;
create policy "read own or admin photos" on public.progress_photos
  for select to authenticated using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "delete own or admin photos" on public.progress_photos;
create policy "delete own or admin photos" on public.progress_photos
  for delete to authenticated using (auth.uid() = user_id or public.can_coach(user_id));

drop policy if exists "progress photos: read own or admin" on storage.objects;
create policy "progress photos: read own or admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.can_coach_folder((storage.foldername(name))[1])));
drop policy if exists "progress photos: delete own or admin" on storage.objects;
create policy "progress photos: delete own or admin" on storage.objects
  for delete to authenticated using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.can_coach_folder((storage.foldername(name))[1])));

drop policy if exists "own food logs or admin" on public.food_logs;
create policy "own food logs or admin" on public.food_logs
  for all to authenticated
  using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id))
  with check ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));
drop policy if exists "own favorites or admin" on public.food_favorites;
create policy "own favorites or admin" on public.food_favorites
  for all to authenticated
  using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id))
  with check ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));
drop policy if exists "own saved meals or admin" on public.saved_meals;
create policy "own saved meals or admin" on public.saved_meals
  for all to authenticated
  using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id))
  with check ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));
drop policy if exists "own water logs or admin" on public.water_logs;
create policy "own water logs or admin" on public.water_logs
  for all to authenticated
  using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id))
  with check ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));
drop policy if exists "own water goal or admin" on public.water_goals;
create policy "own water goal or admin" on public.water_goals
  for all to authenticated
  using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id))
  with check ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));

drop policy if exists "admin writes targets" on public.nutrition_targets;
create policy "admin writes targets" on public.nutrition_targets
  for all to authenticated using (public.can_coach(user_id)) with check (public.can_coach(user_id));
drop policy if exists "read own targets or admin" on public.nutrition_targets;
create policy "read own targets or admin" on public.nutrition_targets
  for select to authenticated using ((auth.uid() = user_id and public.nutrition_allowed()) or public.can_coach(user_id));

-- A coach opening a trainee's food log also needs the foods that trainee
-- added themselves.
drop policy if exists "foods readable" on public.foods;
create policy "foods readable" on public.foods
  for select to authenticated using (
    public.nutrition_allowed()
    and (verified or source = any (array['moh', 'usda', 'off']) or created_by = auth.uid()
         or public.is_admin() or public.can_coach(created_by)));

drop policy if exists "read own thread or coach" on public.coach_messages;
create policy "read own thread or coach" on public.coach_messages
  for select to authenticated using (trainee_id = auth.uid() or public.can_coach(trainee_id));
drop policy if exists "write own thread or coach" on public.coach_messages;
create policy "write own thread or coach" on public.coach_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and (trainee_id = auth.uid() or public.can_coach(trainee_id)));

drop policy if exists "admins manage coach notes" on public.coach_notes;
create policy "admins manage coach notes" on public.coach_notes
  for all to authenticated using (public.can_coach(trainee_id)) with check (public.can_coach(trainee_id));

drop policy if exists "admins manage coach goals" on public.coach_goals;
create policy "admins manage coach goals" on public.coach_goals
  for all to authenticated using (public.can_coach(trainee_id)) with check (public.can_coach(trainee_id));

-- A task about a trainee belongs to that trainee's coach; a hand-written
-- one with no trainee to whoever wrote it. The owner sees all of them.
drop policy if exists "admins manage coach tasks" on public.coach_tasks;
create policy "admins manage coach tasks" on public.coach_tasks
  for all to authenticated
  using (case when trainee_id is null then public.is_coach() and (coach_id = auth.uid() or public.is_admin())
              else public.can_coach(trainee_id) end)
  with check (case when trainee_id is null then public.is_coach() and (coach_id = auth.uid() or public.is_admin())
                   else public.can_coach(trainee_id) end);

create or replace function public.coach_task_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trainee_id is null and new.coach_id is null then
    new.coach_id := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.coach_task_owner() from public, anon, authenticated;
drop trigger if exists trg_coach_task_owner on public.coach_tasks;
create trigger trg_coach_task_owner before insert on public.coach_tasks
  for each row execute function public.coach_task_owner();

drop policy if exists "admins can read notification log" on public.admin_notifications;
create policy "admins can read notification log" on public.admin_notifications
  for select using (public.can_coach(trainee_id));

-- The owner manages every invite; a coach only the ones they made, so each
-- new sign-up lands with the coach who invited them.
drop policy if exists "coaches manage own invites" on public.signup_invites;
create policy "coaches manage own invites" on public.signup_invites
  for all to authenticated
  using (public.is_coach() and invited_by = auth.uid())
  with check (public.is_coach() and invited_by = auth.uid());

-- ---------- functions that change a line or two ----------

create or replace function public.nutrition_allowed()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((select is_admin or is_coach or nutrition_enabled from profiles where id = auth.uid()), false);
$$;

-- Only the owner may change who is a coach and whose trainee someone is.
-- A coach may switch nutrition and the quiet-alert days for their own
-- trainees, as the owner always could.
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- Only requests that come through the app's public API (signed in or not)
  -- are checked. The SQL Editor and server-side jobs have no such role.
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.nutrition_enabled := false;
    new.is_coach := false;
    new.coach_id := null;
  elsif public.is_admin() then
    -- A trainee's coach must be the owner or a coach.
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null and not exists (
      select 1 from public.profiles c where c.id = new.coach_id and (c.is_admin or c.is_coach)) then
      raise exception 'NOT_A_COACH';
    end if;
  else
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    if new.is_coach is distinct from old.is_coach or new.coach_id is distinct from old.coach_id then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    if not public.can_coach(old.id) then
      if new.nutrition_enabled is distinct from old.nutrition_enabled then
        raise exception 'NUTRITION_FLAG_PROTECTED';
      end if;
      new.inactivity_alert_days := old.inactivity_alert_days;
    end if;
    new.email := old.email;
  end if;
  return new;
end;
$$;

-- When someone stops being a coach, or a coach's account is deleted, their
-- trainees go back to the owner, so nobody is left with a coach who can no
-- longer see them.
create or replace function public.coach_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  update public.profiles
     set coach_id = (select o.id from public.profiles o where o.is_admin and o.id <> gone order by o.created_at limit 1)
   where coach_id = gone and id <> gone;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.coach_removed() from public, anon, authenticated;
drop trigger if exists trg_coach_removed on public.profiles;
create trigger trg_coach_removed after update of is_coach on public.profiles
  for each row when (old.is_coach and not new.is_coach) execute function public.coach_removed();
drop trigger if exists trg_coach_deleted on public.profiles;
create trigger trg_coach_deleted before delete on public.profiles
  for each row when (old.is_coach) execute function public.coach_removed();

-- New accounts get the coach who invited them, or the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_admin, coach_id)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), false,
    coalesce(
      (select i.invited_by from public.signup_invites i
         join public.profiles c on c.id = i.invited_by and (c.is_admin or c.is_coach)
        where i.email = lower(btrim(new.email)) and i.expires_at > now()),
      (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.mark_messages_read(p_trainee uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  elsif public.can_coach(p_trainee) then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id = p_trainee and read_at is null;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.guard_session_coach_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') or public.can_coach(new.user_id) then
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
$$;

create or replace function public.on_trainer_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  if new.trainer_comment is not distinct from old.trainer_comment
     and new.trainer_comment_at is not distinct from old.trainer_comment_at then
    return new;
  end if;
  if not public.can_coach(new.user_id) then
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
$$;

-- ---------- functions that change body (generated from the live definitions) ----------

drop function if exists public.coach_roster(date);
CREATE OR REPLACE FUNCTION public.coach_roster(p_today date)
 RETURNS TABLE(id uuid, email text, full_name text, is_admin boolean, nutrition_enabled boolean, inactivity_alert_days integer, created_at timestamp with time zone, last_session date, week_counts integer[], planned_per_week integer, to_review integer, last_weight numeric, weight_unit text, last_weight_date date, weight_change numeric, prs_7d integer, prs_30d integer, last_pr text, food_days_7 integer, kcal_avg_7 numeric, protein_avg_7 numeric, kcal_target integer, protein_target numeric, terms_version integer, terms_variant text, terms_accepted_at timestamp with time zone, guardian_name text, goal text, target_weight numeric, next_checkin date, pinned_note text, is_coach boolean, coach_id uuid, coach_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  week0 date := p_today - extract(dow from p_today)::int;
begin
  if not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
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
      order by cn.created_at desc limit 1),
    p.is_coach, p.coach_id, coalesce(nullif(co.full_name, ''), co.email)
  from profiles p
  left join profiles co on co.id = p.coach_id
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
  -- A coach sees themselves and their own trainees; the owner sees everyone.
  where p.id = auth.uid() or public.can_coach(p.id)
  order by coalesce(p.full_name, p.email);
end;
$function$;

revoke execute on function public.coach_roster(date) from public, anon;
grant execute on function public.coach_roster(date) to authenticated;

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
  if auth.uid() is not null and not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
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
  where not p.is_admin and not p.is_coach and l.last is not null
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
  where not p.is_admin and not p.is_coach and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - 3)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select g.trainee_id, 'birthday', 'birthday:' || g.trainee_id || ':' || extract(year from p_today),
         extract(year from age(p_today, g.birthday))::int, p_today
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin and not p.is_coach
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
  join profiles p on p.id = g.trainee_id and not p.is_admin and not p.is_coach
  where g.next_checkin is not null and g.next_checkin <= p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for 14 days, for people who do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  where not p.is_admin and not p.is_coach and l.last is not null and l.last <= p_today - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  where not p.is_admin and not p.is_coach
    and p.created_at::date between p_today - 10 and p_today - 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return case when auth.uid() is null or public.is_admin() then added else 0 end;
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
  -- The function sends each coach their own trainees' tasks, and falls back
  -- to ntfy (the owner's phone) for the owner's tasks.
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin or p.is_coach
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

        if public.owner_gets_alerts(NEW.user_id) then
        perform send_admin_email(
          trainee_name || ' just hit a new PR 🏆',
          '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
          public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
        );
        perform send_admin_push(
          '🏆 New PR: ' || trainee_name,
          ex_name || ' — ' || detail_text
        );
        end if;

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

          if public.owner_gets_alerts(NEW.user_id) then
          perform send_admin_email(
            trainee_name || ' just hit a new PR 🏆',
            '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
            public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
          );
          perform send_admin_push(
            '🏆 New PR: ' || trainee_name,
            ex_name || ' — ' || detail_text
          );
          end if;

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
    where p.is_admin = false and not p.is_coach
      -- Other coaches' trainees are their coach's business (coach tasks).
      and public.owner_gets_alerts(p.id)
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

-- Coaches keep their account while they have trainees, like the owner.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if exists (select 1 from profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_SELF_DELETE';
  end if;
  if exists (select 1 from profiles where id = uid and is_coach) then
    raise exception 'COACH_CANNOT_SELF_DELETE';
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
$$;
