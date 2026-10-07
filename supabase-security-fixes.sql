-- Security fix: stop people from making themselves an admin.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- Why: the policy on "profiles" lets each person update their own row, and
-- the row holds the is_admin flag. Anyone signed in could have switched it
-- on from the browser and then read and edit every person's workouts.
-- This guard refuses any change to is_admin that comes from the app.
-- Changes made in the SQL Editor (no signed-in user) still work, so you can
-- still promote a coach with:
--   update public.profiles set is_admin = true where email = '...';

create or replace function protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;               -- SQL Editor / server-side: allowed
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
  elsif new.is_admin is distinct from old.is_admin then
    raise exception 'ADMIN_FLAG_PROTECTED';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_flag_trg on profiles;
create trigger protect_admin_flag_trg
  before insert or update on profiles
  for each row execute function protect_admin_flag();
