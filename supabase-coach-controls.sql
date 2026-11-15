-- Ironlog: coach trainee limits, and removing people from the app.
--
-- Run after supabase-multi-coach.sql. Safe to run more than once.
--
-- Trainee limit: the owner sets how many trainees each coach may have
-- (empty means no limit). A coach at his limit can't invite anyone new,
-- sign-ups from his invites are refused, and nobody can be moved to him.
-- Lowering a limit below what a coach has keeps his trainees.
--
-- Removing someone: the owner can remove their own trainees and any coach;
-- a coach can remove his own trainees. A removed person can still sign in,
-- read and download their data and delete their account, but can't add or
-- change anything. A removed coach loses access to his trainees (as with
-- Freeze). Whoever removed them can restore them.

-- ---------- columns ----------
alter table public.profiles add column if not exists coach_trainee_limit integer;
alter table public.profiles drop constraint if exists profiles_coach_trainee_limit_check;
alter table public.profiles add constraint profiles_coach_trainee_limit_check
  check (coach_trainee_limit is null or coach_trainee_limit >= 0);
alter table public.profiles add column if not exists removed_at timestamptz;
alter table public.profiles add column if not exists removed_by uuid references public.profiles (id) on delete set null;

-- ---------- checks ----------
-- Is the signed-in person removed from the app?
create or replace function public.am_removed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select removed_at is not null from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.am_removed() from public, anon;
grant execute on function public.am_removed() to authenticated;

-- Trainees who count towards a coach's limit (removed ones don't).
create or replace function public.coach_trainee_count(p_coach uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.profiles t
  where t.coach_id = p_coach and t.id <> p_coach and t.removed_at is null;
$$;
revoke execute on function public.coach_trainee_count(uuid) from public, anon, authenticated;

-- May this coach take one more trainee? The owner has no limit.
create or replace function public.coach_has_room(p_coach uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.is_admin or c.coach_trainee_limit is null
           or public.coach_trainee_count(c.id) < c.coach_trainee_limit
    from public.profiles c where c.id = p_coach), true);
$$;
revoke execute on function public.coach_has_room(uuid) from public, anon, authenticated;

-- A removed person is no longer a coach for anyone.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin or (is_coach and not coach_frozen and removed_at is null)
                   from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.can_coach(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (
    select 1 from public.profiles me
    join public.profiles t on t.id = target
    where me.id = auth.uid() and me.removed_at is null
      and (me.is_admin or (me.is_coach and not me.coach_frozen))
      and (
        (me.is_admin and t.id = me.id)
        or (t.id <> me.id and not t.is_admin and not t.is_coach
            and (t.coach_id = me.id or (me.is_admin and t.coach_id is null)))
      )
  );
$$;

-- ---------- a removed person can read and delete, but not add or change ----------
-- Restrictive policies are ANDed with the existing ones, so nothing else
-- changes for anyone who isn't removed. Any table added later needs these
-- two policies as well: re-running this script adds them.
-- Error reports are exempt, so problems on the removed screen still reach
-- the owner.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "removed people cannot add" on public.%I', r.relname);
    continue when r.relname = 'error_logs';
    execute format('create policy "removed people cannot add" on public.%I as restrictive for insert to authenticated with check (not public.am_removed())', r.relname);
    execute format('drop policy if exists "removed people cannot change" on public.%I', r.relname);
    execute format('create policy "removed people cannot change" on public.%I as restrictive for update to authenticated using (not public.am_removed()) with check (not public.am_removed())', r.relname);
  end loop;
end $$;
drop policy if exists "removed people cannot add" on storage.objects;
create policy "removed people cannot add" on storage.objects as restrictive for insert to authenticated
  with check (not public.am_removed());
drop policy if exists "removed people cannot change" on storage.objects;
create policy "removed people cannot change" on storage.objects as restrictive for update to authenticated
  using (not public.am_removed()) with check (not public.am_removed());

-- No new To do items about a removed trainee.
create or replace function public.coach_task_skip_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trainee_id is not null
     and exists (select 1 from public.profiles p where p.id = new.trainee_id and p.removed_at is not null) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.coach_task_skip_removed() from public, anon, authenticated;
drop trigger if exists trg_coach_task_skip_removed on public.coach_tasks;
create trigger trg_coach_task_skip_removed before insert on public.coach_tasks
  for each row execute function public.coach_task_skip_removed();

-- ---------- owner: trainee limits ----------
create or replace function public.set_coach_limit(p_coach uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_coach and is_coach and not is_admin) then
    raise exception 'not a coach' using errcode = '42501';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'BAD_LIMIT' using errcode = '22023';
  end if;
  perform set_config('ironlog.set_coach_limit', 'on', true);
  update public.profiles set coach_trainee_limit = p_limit where id = p_coach;
  perform set_config('ironlog.set_coach_limit', '', true);
end;
$$;
revoke execute on function public.set_coach_limit(uuid, integer) from public, anon;
grant execute on function public.set_coach_limit(uuid, integer) to authenticated;

-- The owner's list of coaches, with trainee count and limit.
drop function if exists public.list_coaches();
create or replace function public.list_coaches()
returns table (id uuid, name text, email text, frozen boolean, trainees integer, trainee_limit integer, removed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email), p.email, p.coach_frozen,
         public.coach_trainee_count(p.id), p.coach_trainee_limit, p.removed_at is not null
  from public.profiles p
  where p.is_coach and not p.is_admin and public.is_admin()
  order by 2;
$$;
revoke execute on function public.list_coaches() from public, anon;
grant execute on function public.list_coaches() to authenticated;

-- A coach's own count and limit, for their People page.
create or replace function public.my_coach_limit()
returns table (trainees integer, trainee_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_trainee_count(p.id), p.coach_trainee_limit
  from public.profiles p
  where p.id = auth.uid() and p.is_coach and not p.is_admin and public.is_coach();
$$;
revoke execute on function public.my_coach_limit() from public, anon;
grant execute on function public.my_coach_limit() to authenticated;

-- ---------- removing and restoring ----------
-- The owner: their own trainees and any coach. A coach: his own trainees.
-- Nobody removes the owner or themselves.
create or replace function public.set_removed(p_person uuid, p_removed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.profiles%rowtype;
begin
  select * into t from public.profiles where id = p_person;
  if not found or t.is_admin or p_person = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not (
    (public.is_admin() and t.is_coach)
    or (public.is_coach() and not t.is_coach and public.can_coach(p_person))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Restoring a trainee counts towards their coach's limit again.
  if not p_removed and t.removed_at is not null and t.coach_id is not null and not t.is_coach
     and not public.coach_has_room(t.coach_id) then
    raise exception 'COACH_LIMIT_REACHED' using errcode = '42501';
  end if;
  perform set_config('ironlog.set_removed', 'on', true);
  update public.profiles
     set removed_at = case when p_removed then coalesce(removed_at, now()) end,
         removed_by = case when p_removed then coalesce(removed_by, auth.uid()) end
   where id = p_person;
  perform set_config('ironlog.set_removed', '', true);
  if p_removed then
    -- No more pushes to them, and nothing left on anyone's To do about them.
    delete from public.push_subscriptions where user_id = p_person;
    update public.coach_tasks set done_at = now(), auto_done = true
     where trainee_id = p_person and done_at is null;
  end if;
end;
$$;
revoke execute on function public.set_removed(uuid, boolean) from public, anon;
grant execute on function public.set_removed(uuid, boolean) to authenticated;

-- ---------- invites ----------
create or replace function public.record_invite(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(p_email));
  cur public.signup_invites%rowtype;
  holder uuid;
begin
  if not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'BAD_EMAIL' using errcode = '22023';
  end if;
  if not public.coach_has_room(auth.uid()) then
    raise exception 'COACH_LIMIT_REACHED' using errcode = '42501';
  end if;
  select * into cur from public.signup_invites where email = e;
  if found then
    -- Old invites with no inviter are the owner's.
    holder := coalesce(cur.invited_by, (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1));
    if holder is distinct from auth.uid() and cur.expires_at > now()
       and exists (select 1 from public.profiles c where c.id = holder and (c.is_admin or c.is_coach)) then
      raise exception 'INVITED_BY_OTHER_COACH' using errcode = '42501';
    end if;
  end if;
  insert into public.signup_invites (email, invited_by, created_at, expires_at)
  values (e, auth.uid(), now(), now() + interval '30 days')
  on conflict (email) do update
    set invited_by = excluded.invited_by, created_at = excluded.created_at, expires_at = excluded.expires_at;
end;
$$;
revoke execute on function public.record_invite(text) from public, anon;
grant execute on function public.record_invite(text) to authenticated;

-- The invite-only sign-up hook also refuses an invite from a coach who
-- can't take new trainees (at his limit, frozen or removed).
create or replace function public.hook_signup_invite_only(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inviter uuid;
begin
  select i.invited_by into inviter from public.signup_invites i
   where i.email = lower(btrim(event -> 'user' ->> 'email')) and i.expires_at > now();
  if not found then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Sign-up is by invitation only. Ask your coach for an invite link.',
      'http_code', 403));
  end if;
  if exists (select 1 from public.profiles c
             where c.id = inviter and c.is_coach and not c.is_admin
               and (c.coach_frozen or c.removed_at is not null or not public.coach_has_room(c.id))) then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Your coach can''t take new trainees right now. Please ask them about it.',
      'http_code', 403));
  end if;
  return '{}'::jsonb;
end;
$$;
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
    new.coach_frozen := false;
    new.coach_trainee_limit := null;
    new.removed_at := null;
    new.removed_by := null;
  elsif public.is_admin() then
    -- Nobody becomes owner (or stops being one) through the app; that stays
    -- a SQL Editor change, so the owner can't create a second owner by mistake.
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    -- A coach is nobody's trainee.
    if new.is_coach then
      new.coach_id := null;
    end if;
    -- Limits go through set_coach_limit(), removal through set_removed().
    if new.coach_trainee_limit is distinct from old.coach_trainee_limit
       and coalesce(current_setting('ironlog.set_coach_limit', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    if (new.removed_at is distinct from old.removed_at or new.removed_by is distinct from old.removed_by)
       and coalesce(current_setting('ironlog.set_removed', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- Freezing goes through set_coach_frozen(), never a plain update.
    if new.coach_frozen is distinct from old.coach_frozen
       and coalesce(current_setting('ironlog.set_coach_frozen', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- A trainee's coach must be the owner or an active (not frozen) coach.
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null and not exists (
      select 1 from public.profiles c where c.id = new.coach_id and (c.is_admin or (c.is_coach and not c.coach_frozen))) then
      raise exception 'NOT_A_COACH';
    end if;
    -- A coach who is removed can't take trainees, nor one at his limit.
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null then
      if exists (select 1 from public.profiles c where c.id = new.coach_id and c.removed_at is not null) then
        raise exception 'NOT_A_COACH';
      end if;
      if not public.coach_has_room(new.coach_id) then
        raise exception 'COACH_LIMIT_REACHED';
      end if;
    end if;
  else
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    -- The one coach-field change a coach may make: return_to_owner() hands
    -- their own trainee back to the owner.
    if coalesce(current_setting('ironlog.return_to_owner', true), '') = 'on'
       and new.is_coach is not distinct from old.is_coach
       and old.coach_id = auth.uid()
       and new.coach_id = (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)
       and new.coach_frozen is not distinct from old.coach_frozen then
      null;
    elsif new.is_coach is distinct from old.is_coach or new.coach_id is distinct from old.coach_id
       or new.coach_frozen is distinct from old.coach_frozen then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- A coach may remove or restore his own trainee, only through set_removed().
    if new.coach_trainee_limit is distinct from old.coach_trainee_limit
       or ((new.removed_at is distinct from old.removed_at or new.removed_by is distinct from old.removed_by)
           and coalesce(current_setting('ironlog.set_removed', true), '') <> 'on') then
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


-- ---------- quiet-trainee emails skip removed people (generated from supabase-multi-coach.sql) ----------

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
      and p.removed_at is null
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
