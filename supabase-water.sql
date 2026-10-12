-- Nutrition beta: water tracker.
-- Run once in the Supabase SQL Editor after supabase-nutrition.sql. Safe to
-- re-run. supabase/schema.sql carries the same tables and policies.
--
-- Same visibility as the food diary: only admins, and trainees whose
-- profiles.nutrition_enabled is on, can use it. RLS enforces that, not only
-- the UI. Both tables cascade from auth.users, so delete_my_account() (which
-- deletes the auth user) removes them too.

-- One row per drink. Amounts in ml.
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ml integer not null check (ml > 0 and ml <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date on public.water_logs (user_id, date);

alter table public.water_logs enable row level security;

drop policy if exists "own water logs or admin" on public.water_logs;
create policy "own water logs or admin" on public.water_logs for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

-- Daily goal in ml. The trainee or the coach can set it.
create table if not exists public.water_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ml integer not null check (ml >= 500 and ml <= 10000),
  updated_at timestamptz not null default now()
);

alter table public.water_goals enable row level security;

drop policy if exists "own water goal or admin" on public.water_goals;
create policy "own water goal or admin" on public.water_goals for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());
