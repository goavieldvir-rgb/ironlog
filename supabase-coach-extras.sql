-- Ironlog: per-trainee feature switches, saved feedback snippets and the
-- coach's own invite message.
--
-- Run after supabase-coach-preferences.sql. Safe to run more than once.
-- Until it runs, the app works as before.
--
-- - trainee_settings: what a coach turned off for one trainee. Messages off
--   hides the Messages screen and thread on both sides and stops new
--   messages; weigh prompt off hides the daily weigh-in card on Home.
-- - coach_settings.snippets: short feedback lines the coach reuses on
--   workouts.
-- - coach_settings.invite_text: the coach's invite message; {name} and
--   {link} are filled in. Empty uses the built-in message.

create table if not exists public.trainee_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  messages_off boolean not null default false,
  weigh_prompt_off boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.trainee_settings enable row level security;

drop policy if exists "read own or coached trainee settings" on public.trainee_settings;
create policy "read own or coached trainee settings" on public.trainee_settings
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "coach sets trainee settings" on public.trainee_settings;
create policy "coach sets trainee settings" on public.trainee_settings
  for all using (public.can_coach(user_id))
  with check (public.can_coach(user_id));

grant select, insert, update, delete on public.trainee_settings to authenticated;

drop policy if exists "removed people cannot add" on public.trainee_settings;
create policy "removed people cannot add" on public.trainee_settings as restrictive for insert to authenticated
  with check (not public.am_removed());
drop policy if exists "removed people cannot change" on public.trainee_settings;
create policy "removed people cannot change" on public.trainee_settings as restrictive for update to authenticated
  using (not public.am_removed()) with check (not public.am_removed());

-- No new messages in a thread the coach switched off (either side).
create or replace function public.messages_allowed(p_trainee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select messages_off from public.trainee_settings where user_id = p_trainee), false);
$$;
revoke execute on function public.messages_allowed(uuid) from public, anon;
grant execute on function public.messages_allowed(uuid) to authenticated;

drop policy if exists "messages switched off" on public.coach_messages;
create policy "messages switched off" on public.coach_messages as restrictive for insert to authenticated
  with check (public.messages_allowed(trainee_id));

-- ---------- coach settings ----------
alter table public.coach_settings add column if not exists snippets text[] not null default '{}';
alter table public.coach_settings add column if not exists invite_text text;

create or replace function public.valid_snippets(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p, 1), 0) <= 30
     and not exists (select 1 from unnest(p) s where char_length(s) not between 1 and 500);
$$;
alter table public.coach_settings drop constraint if exists coach_settings_extras_check;
alter table public.coach_settings add constraint coach_settings_extras_check check (
  public.valid_snippets(snippets)
  and (invite_text is null or char_length(invite_text) <= 1000)
);

notify pgrst, 'reload schema';
