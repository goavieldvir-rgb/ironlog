-- Two-step recovery codes. Supabase Auth's authenticator-app (TOTP) check has
-- no backup codes, so someone who loses their phone was locked out. This adds
-- 10 one-time codes per person, shown once when two-step is set up (or when
-- they make new ones in Account). At the sign-in code step, "Lost your phone?"
-- takes one code, removes the person's authenticator app so they can sign in
-- with the password, and they set two-step up again (the coach account is
-- asked to straight away).
-- Run once in the Supabase SQL Editor. Safe to re-run. Also folded into
-- supabase/schema.sql. Needs the pgcrypto extension in the `extensions`
-- schema (the Supabase default).
-- Until it is run, the app hides all recovery screens and nothing else changes.
--
-- The codes are stored only as bcrypt hashes and are only touched through the
-- three functions below. Making codes needs a session that passed the code
-- step (aal2). Using one needs only the password session (aal1), is limited to
-- 5 wrong tries per person per hour, and is the only way past a lost phone
-- besides the coach resetting it.

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);

-- Wrong tries, for the rate limit.
create table if not exists public.mfa_recovery_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_attempts_user_idx on public.mfa_recovery_attempts (user_id, created_at);

-- RLS on and no policies: nobody reads or writes these tables directly.
alter table public.mfa_recovery_codes enable row level security;
alter table public.mfa_recovery_attempts enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;
revoke all on public.mfa_recovery_attempts from anon, authenticated;

-- Makes 10 new codes (replacing the old ones) and returns them in plain text,
-- this once. Needs a session that passed the authenticator code.
create or replace function public.generate_recovery_codes()
 returns text[]
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  -- 32 letters and digits with no 0/O/1/I lookalikes; 32 divides 256, so
  -- taking a byte mod 32 is unbiased.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codes text[] := '{}';
  raw text;
  bytes bytea;
  i int;
  j int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'two-step code required' using errcode = '42501';
  end if;

  delete from public.mfa_recovery_codes where user_id = uid;

  for i in 1..10 loop
    bytes := extensions.gen_random_bytes(10);
    raw := '';
    for j in 0..9 loop
      raw := raw || substr(alphabet, (get_byte(bytes, j) % 32) + 1, 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (uid, extensions.crypt(raw, extensions.gen_salt('bf')));
  end loop;

  return codes;
end;
$function$;

-- How many unused codes the caller has.
create or replace function public.recovery_codes_left()
 returns integer
 language sql
 stable
 security definer
 set search_path = ''
as $function$
  select count(*)::int from public.mfa_recovery_codes
  where user_id = auth.uid() and used_at is null;
$function$;

-- Spends one code: removes the caller's authenticator app(s) and returns true.
-- False when no unused code matches. Raises 'too_many_attempts' after 5 wrong
-- tries in an hour.
create or replace function public.use_recovery_code(code text)
 returns boolean
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  norm text;
  hit uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- One try at a time per person, so parallel guesses can't dodge the limit.
  perform pg_advisory_xact_lock(hashtextextended('mfa_recovery:' || uid::text, 0));

  delete from public.mfa_recovery_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.mfa_recovery_attempts
      where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  norm := upper(regexp_replace(coalesce(code, ''), '[\s-]', '', 'g'));

  select c.id into hit
  from public.mfa_recovery_codes c
  where c.user_id = uid and c.used_at is null
    and c.code_hash = extensions.crypt(norm, c.code_hash)
  limit 1;

  if hit is null then
    insert into public.mfa_recovery_attempts (user_id) values (uid);
    return false;
  end if;

  update public.mfa_recovery_codes set used_at = now() where id = hit;
  delete from public.mfa_recovery_attempts where user_id = uid;
  delete from auth.mfa_factors where user_id = uid;
  return true;
end;
$function$;

revoke execute on function public.generate_recovery_codes() from public, anon;
revoke execute on function public.recovery_codes_left() from public, anon;
revoke execute on function public.use_recovery_code(text) from public, anon;
grant execute on function public.generate_recovery_codes() to authenticated;
grant execute on function public.recovery_codes_left() to authenticated;
grant execute on function public.use_recovery_code(text) to authenticated;
