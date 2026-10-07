-- Security fix: stop people from making themselves an admin.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- Why: the policy on "profiles" lets each person update their own row, and
-- the row holds the is_admin flag. Anyone signed in could have switched it
-- on from the browser and then read and edit every person's workouts.
-- This guard refuses any change to is_admin that comes from the app.
-- Changes made in the SQL Editor still work, so you can
-- still promote a coach with:
--   update public.profiles set is_admin = true where email = '...';

create or replace function protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only requests that come through the app's public API (signed in or not)
  -- are checked. The SQL Editor and server-side jobs have no such role.
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
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

-- ---------- check whether anyone already used the hole ----------
-- Run this too. It lists everyone currently marked admin. Only you (and any
-- coach you chose) should be on it.
select id, email, full_name, is_admin, created_at from profiles where is_admin;

-- If someone is on that list who should not be, remove them (put their
-- email in; run only this line):
--   update public.profiles set is_admin = false where email = 'their@email';
