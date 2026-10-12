-- Nutrition beta: favorite foods, saved to the account (they used to live in
-- the phone's browser only). Run once in the Supabase SQL Editor after
-- supabase-nutrition.sql. Safe to re-run. supabase/schema.sql carries the
-- same table and policy.
--
-- Same visibility as the food diary: the owner (when nutrition is switched on
-- for them) and admins. Rows go when the user or the food is deleted.

create table if not exists public.food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

alter table public.food_favorites enable row level security;

drop policy if exists "own favorites or admin" on public.food_favorites;
create policy "own favorites or admin" on public.food_favorites for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());
