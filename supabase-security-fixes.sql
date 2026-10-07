-- Security fix: stop people from making themselves an admin.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- Why: the policy on "profiles" lets each person update their own row, and
-- the row holds the is_admin flag. Anyone signed in could have switched it
-- on from the browser and then read and edit every person's workouts.
-- This guard refuses any change to is_admin that comes from the app, unless
-- the person making it is already an admin.
-- NOTE: the live database already got this fix applied on 2026-10-07 (and
-- already had a stricter policy on profiles). The file is kept for the record.
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
  elsif new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'ADMIN_FLAG_PROTECTED';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_flag_trg on profiles;
create trigger protect_admin_flag_trg
  before insert or update on profiles
  for each row execute function protect_admin_flag();

-- ---------- STEP 2 (run separately, after step 1 says Success) ----------
-- The hole may already have been used, so check who is marked admin. Paste
-- ONLY the line below into a new query (not together with step 1, so a
-- problem here can never undo the fix above). Only you, and any coach you
-- chose, should be listed.
--   select id, email, full_name, is_admin, created_at from profiles where is_admin;
--
-- If someone is listed who should not be, remove them (put their email in):
--   update public.profiles set is_admin = false where email = 'their@email';
