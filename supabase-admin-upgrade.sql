-- Run this once in the Supabase SQL Editor to add admin support on top of
-- the tables/policies from supabase.sql. Safe to run even if some parts
-- already exist (uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS throughout).

-- ---------- profiles: one row per signed-up user ----------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Security-definer helper so policies can check "is the current user an
-- admin?" without recursing into RLS on the profiles table itself.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

drop policy if exists "read own or admin reads all profiles" on profiles;
create policy "read own or admin reads all profiles" on profiles
  for select using (auth.uid() = id or is_admin());

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "update own or admin updates any profile" on profiles;
create policy "update own or admin updates any profile" on profiles
  for update using (auth.uid() = id or is_admin()) with check (auth.uid() = id or is_admin());

-- ---------- auto-create a profile row whenever someone signs up ----------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill profiles for anyone who signed up before this script ran.
insert into public.profiles (id, email, full_name, is_admin)
select id, email, coalesce(raw_user_meta_data->>'full_name', ''), false
from auth.users
on conflict (id) do nothing;

-- ---------- let an admin manage/view everyone's data ----------
-- Everyone else stays locked to their own rows, exactly as before.
drop policy if exists "own exercises" on exercises;
create policy "own or admin exercises" on exercises
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "own routines" on routines;
create policy "own or admin routines" on routines
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "own sessions" on sessions;
create policy "own or admin sessions" on sessions
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

-- ---------- last step: make yourself an admin ----------
-- Replace the email below with your own account's email, then run just
-- this one line (select it and click "Run selection" or run the whole
-- script again — it's safe to re-run).
update public.profiles set is_admin = true where email = 'go.avieldvir@gmail.com';
