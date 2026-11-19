-- Coach meal options.
--
-- A coach saves meals into a trainee's saved meals as "coach options" for
-- one meal slot (breakfast, lunch...). The trainee sees them in that slot of
-- the diary and logs one with a tap; each item can carry swaps
-- (items[].alts), picked before logging. Logs made from a saved meal point
-- back at it, so the coach can see how often the planned meals were eaten.
--
-- Only the trainee's coach (can_coach) can create, change or delete a coach
-- option. The trainee can still use them, and keeps full control of their
-- own saved meals.

alter table public.saved_meals add column if not exists by_coach boolean not null default false;
alter table public.saved_meals add column if not exists meal text;

alter table public.saved_meals drop constraint if exists saved_meals_meal_check;
alter table public.saved_meals add constraint saved_meals_meal_check
  check (meal is null or meal = any (array['breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3']));

create index if not exists saved_meals_user_id on public.saved_meals (user_id);

alter table public.food_logs add column if not exists saved_meal_id uuid;
alter table public.food_logs drop constraint if exists food_logs_saved_meal_id_fkey;
alter table public.food_logs add constraint food_logs_saved_meal_id_fkey
  foreign key (saved_meal_id) references public.saved_meals (id) on delete set null;

-- Coach options are the coach's: a trainee can't make one, edit one or
-- delete one from the app. Runs as the caller (security invoker) on purpose:
-- writes made inside the database's own functions, such as deleting an
-- account, run as the function owner rather than as an app user, and pass.
create or replace function public.guard_coach_meals() returns trigger
  language plpgsql security invoker
  set search_path to ''
as $$
begin
  if auth.uid() is null or current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.by_coach and not public.can_coach(old.user_id) then
      raise exception 'Only the coach can remove a coach meal' using errcode = '42501';
    end if;
    return old;
  end if;
  if (new.by_coach or (tg_op = 'UPDATE' and old.by_coach)) and not public.can_coach(new.user_id) then
    raise exception 'Only the coach can set or change a coach meal' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.guard_coach_meals() owner to postgres;
revoke all on function public.guard_coach_meals() from public;
grant all on function public.guard_coach_meals() to authenticated;
grant all on function public.guard_coach_meals() to service_role;

drop trigger if exists guard_coach_meals on public.saved_meals;
create trigger guard_coach_meals
  before insert or update or delete on public.saved_meals
  for each row execute function public.guard_coach_meals();
