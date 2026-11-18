-- Ironlog: coach options on a trainee's nutrition targets.
--
-- Run after supabase-food-fiber-own-targets.sql. Safe to run more than once.
-- Until it runs, the app works as before (four fixed meals, no fibre
-- target, on target within 10%).
--
-- - fiber: a daily fibre target in grams.
-- - kcal_band: how close to the calorie target counts as on target, in %.
-- - meals: which meal slots the diary shows and what they're called, as
--   [{ "key": "breakfast", "en": "...", "he": "..." }, ...] in order. Empty
--   names use the built-in ones. Null means the usual four meals.
--   Two extra slots, snack2 and snack3, let a coach plan five or six meals.

alter table public.nutrition_targets add column if not exists fiber numeric;
alter table public.nutrition_targets add column if not exists kcal_band integer not null default 10;
alter table public.nutrition_targets add column if not exists meals jsonb;

alter table public.nutrition_targets drop constraint if exists nutrition_targets_fiber_check;
alter table public.nutrition_targets add constraint nutrition_targets_fiber_check check (fiber is null or (fiber > 0 and fiber < 200));
alter table public.nutrition_targets drop constraint if exists nutrition_targets_kcal_band_check;
alter table public.nutrition_targets add constraint nutrition_targets_kcal_band_check check (kcal_band between 5 and 25);

create or replace function public.valid_meal_layout(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 6
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e ->> 'key', '') not in ('breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3')
         or char_length(coalesce(e ->> 'en', '')) > 30
         or char_length(coalesce(e ->> 'he', '')) > 30)
    and (select count(distinct e ->> 'key') from jsonb_array_elements(p) e) = jsonb_array_length(p));
$$;
alter table public.nutrition_targets drop constraint if exists nutrition_targets_meals_check;
alter table public.nutrition_targets add constraint nutrition_targets_meals_check check (public.valid_meal_layout(meals));

-- The two extra meal slots.
alter table public.food_logs drop constraint if exists food_logs_meal_check;
alter table public.food_logs add constraint food_logs_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3'));

-- Meal slots are the coach's choice: a trainee who edits their own targets
-- keeps whatever slots the coach set.
create or replace function public.keep_coach_meals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.can_coach(new.user_id)
     or (new.user_id = auth.uid() and public.is_coach()) then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.meals := old.meals;
  else
    new.meals := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_coach_meals() from public, anon, authenticated;
drop trigger if exists keep_coach_meals on public.nutrition_targets;
create trigger keep_coach_meals before insert or update on public.nutrition_targets
  for each row execute function public.keep_coach_meals();

notify pgrst, 'reload schema';
