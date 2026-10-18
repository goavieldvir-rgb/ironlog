-- Security round 3: two-step verification, invite-only sign-up, and a few
-- holes closed. Run once in the Supabase SQL editor; safe to run again.
-- Also folded into supabase/schema.sql (section 6e).
--
--  1. Signed-out visitors (the anon role) lose all access to the app's
--     tables and functions. Nothing in the app reads or writes data before
--     sign-in, so RLS was the only thing stopping them; now the door is shut
--     before RLS is even asked.
--  2. Two-step verification (TOTP authenticator app, Supabase Auth MFA):
--     - is_admin() is only true in a session that passed the second step
--       (aal2). A stolen coach password alone opens no trainee data.
--     - Anyone who turned two-step on must pass it before any of their own
--       rows or photos can be read or changed (restrictive policies on every
--       table and on the photo bucket).
--  3. Coach-only fields can't be faked by a trainee: the coach's feedback,
--     the "reviewed" mark on a workout (also on insert, not just on update),
--     and the coach's inactivity alert setting and profile email.
--  4. error_logs: signed-in only, one's own user id, size limits and at most
--     30 reports an hour per person, so nobody can flood it.
--  5. Invite-only sign-up: signup_invites (filled by the coach's "Invite
--     someone" screen) plus hook_signup_invite_only(), a Before User Created
--     auth hook. The hook does nothing until it is switched on in the
--     dashboard: Authentication -> Hooks -> Before User Created -> Postgres
--     function public.hook_signup_invite_only.
--
-- Run the verification queries at the bottom afterwards.

-- ---------- 1. Signed-out visitors get nothing ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- The app's own functions (not the ones extensions such as pg_trgm put in
-- public): nobody gets them by default. Trigger functions fire without
-- EXECUTE, so nobody needs to call those directly.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- The functions the app and its RLS rules do call, signed in.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.nutrition_allowed() to authenticated;
grant execute on function public.photos_allowed() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.coach_roster(date) to authenticated;

-- ---------- 2. Two-step verification ----------
-- True when this session is good enough for this person: they passed the
-- second step, or they never turned it on.
create or replace function public.mfa_satisfied()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$function$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- Coach powers need the second step. A coach session without it acts as a
-- plain signed-in user; the app sends the coach to set up two-step first.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$function$;

-- One restrictive rule per table: on top of the existing rules, never
-- instead of them. "(select ...)" makes Postgres check it once per query.
do $$
declare
  tb text;
begin
  foreach tb in array array[
    'admin_notifications', 'body_weight_logs', 'coach_goals', 'coach_notes', 'consents',
    'error_logs', 'exercises', 'food_favorites', 'food_logs', 'foods', 'global_exercises',
    'nutrition_targets', 'profiles', 'progress_photos', 'push_subscriptions', 'routines',
    'saved_meals', 'sessions', 'water_goals', 'water_logs', 'weekly_schedule'
  ] loop
    if to_regclass('public.' || tb) is null then continue; end if;
    execute format('drop policy if exists "two-step verification when enabled" on public.%I', tb);
    execute format(
      'create policy "two-step verification when enabled" on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', tb);
  end loop;
end $$;

drop policy if exists "progress photos: two-step verification when enabled" on storage.objects;
create policy "progress photos: two-step verification when enabled" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'progress-photos' or (select public.mfa_satisfied()))
  with check (bucket_id <> 'progress-photos' or (select public.mfa_satisfied()));

-- ---------- 3. Coach-only fields ----------
-- The old own-profile update rule read profiles from inside a profiles rule,
-- which Postgres calls infinite recursion once a second rule (the two-step
-- one) is on the table. protect_admin_flag() below already refuses any
-- change to the admin flag, so the rule only needs "your own row".
drop policy if exists "users update their own profile but not their admin flag" on public.profiles;
create policy "users update their own profile but not their admin flag" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Profiles: besides the admin and nutrition flags, a trainee can't change
-- the coach's inactivity alert setting for them or the email the coach sees.
create or replace function public.protect_admin_flag()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
revoke execute on function public.protect_admin_flag() from public, anon, authenticated;

-- Sessions: a trainee's new workout can't arrive with coach feedback or a
-- "reviewed" mark already on it, and a trainee can't mark their own workout
-- reviewed. (Feedback edits are already guarded by on_trainer_comment.)
create or replace function public.guard_session_coach_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
revoke execute on function public.guard_session_coach_fields() from public, anon, authenticated;

drop trigger if exists trg_guard_session_coach_fields on public.sessions;
create trigger trg_guard_session_coach_fields before insert or update on public.sessions
  for each row execute function public.guard_session_coach_fields();

-- ---------- 4. error_logs can't be flooded ----------
drop policy if exists "anyone signed in can log their own error" on public.error_logs;
create policy "anyone signed in can log their own error" on public.error_logs
  for insert to authenticated with check (auth.uid() = user_id);

alter table public.error_logs drop constraint if exists error_logs_size_check;
alter table public.error_logs add constraint error_logs_size_check check (
  length(coalesce(message, '')) <= 2000 and length(coalesce(stack, '')) <= 4000
  and length(coalesce(component_stack, '')) <= 4000 and length(coalesce(url, '')) <= 500
) not valid;

create or replace function public.limit_error_logs()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select count(*) from public.error_logs
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_MANY_ERROR_REPORTS' using errcode = '54000';
  end if;
  return new;
end;
$function$;
revoke execute on function public.limit_error_logs() from public, anon, authenticated;

drop trigger if exists trg_limit_error_logs on public.error_logs;
create trigger trg_limit_error_logs before insert on public.error_logs
  for each row execute function public.limit_error_logs();

-- ---------- 5. Invite-only sign-up ----------
create table if not exists public.signup_invites (
  email text not null,
  invited_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint signup_invites_pkey primary key (email),
  constraint signup_invites_email_lower check (email = lower(btrim(email)))
);
alter table public.signup_invites enable row level security;
revoke all on public.signup_invites from anon;

drop policy if exists "admins manage invites" on public.signup_invites;
create policy "admins manage invites" on public.signup_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "two-step verification when enabled" on public.signup_invites;
create policy "two-step verification when enabled" on public.signup_invites
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Called by Supabase Auth before it creates any account (once the hook is
-- switched on). Lets in an email the coach invited in the last 30 days and
-- turns everyone else away.
create or replace function public.hook_signup_invite_only(event jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if exists (
    select 1 from public.signup_invites
    where email = lower(btrim(event -> 'user' ->> 'email')) and expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Sign-up is by invitation only. Ask your coach for an invite link.',
    'http_code', 403));
end;
$function$;
revoke execute on function public.hook_signup_invite_only(jsonb) from public, anon, authenticated;
grant execute on function public.hook_signup_invite_only(jsonb) to supabase_auth_admin;

-- ---------- Verification (read-only) ----------
-- Expect no rows: anon can no longer touch any table.
-- select table_name, privilege_type from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public';
-- Expect one "two-step verification when enabled" policy per table:
-- select tablename from pg_policies where policyname = 'two-step verification when enabled' order by 1;
