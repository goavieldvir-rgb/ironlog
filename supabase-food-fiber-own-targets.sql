-- Nutrition: fibre on diary entries, and trainees setting their own targets
-- until the coach sets them. Run once in the Supabase SQL Editor after
-- supabase-nutrition.sql. Safe to re-run. supabase/schema.sql carries the
-- same columns and policies.
--
-- The app works before this runs: it leaves fibre out of a diary entry when
-- the column is missing, and a trainee's own targets are refused by RLS until
-- the policies below exist.

-- Fibre, scaled from the food at log time like the other macros. Null for
-- quick adds and foods with no fibre value.
alter table public.food_logs add column if not exists fiber numeric check (fiber >= 0);

-- Who set the targets. 'coach' targets lock the trainee out; 'self' targets
-- are the trainee's own and the coach can overwrite them.
alter table public.nutrition_targets add column if not exists set_by text not null default 'coach'
  check (set_by in ('coach', 'self'));

-- A trainee may add targets when there are none, and change them while they
-- are their own. An upsert over coach targets fails the update check.
drop policy if exists "own targets while self set" on public.nutrition_targets;
create policy "own targets while self set" on public.nutrition_targets for insert to authenticated
  with check (auth.uid() = user_id and nutrition_allowed() and set_by = 'self');

drop policy if exists "update own self set targets" on public.nutrition_targets;
create policy "update own self set targets" on public.nutrition_targets for update to authenticated
  using (auth.uid() = user_id and nutrition_allowed() and set_by = 'self')
  with check (auth.uid() = user_id and nutrition_allowed() and set_by = 'self');
