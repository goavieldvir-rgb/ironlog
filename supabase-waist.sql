-- Waist circumference: one row per measurement, taken at belly-button height.
-- Safe to re-run. Also folded into supabase/schema.sql.
--
-- Who can do what:
--  - A trainee can add, change and delete their own measurements.
--  - The coach (is_admin) can do the same for any trainee, like body weight.
--  - Nobody else can read anything.

-- Deleting the account removes the rows (cascade).
create table if not exists public.waist_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  waist numeric not null check (waist > 0 and waist < 400),
  unit text not null default 'cm' check (unit in ('cm', 'in')),
  created_at timestamptz not null default now()
);
create index if not exists waist_logs_user_date on public.waist_logs (user_id, date desc);

alter table public.waist_logs enable row level security;

drop policy if exists "own or admin waist" on public.waist_logs;
create policy "own or admin waist" on public.waist_logs
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

grant select, insert, update, delete on public.waist_logs to authenticated;
