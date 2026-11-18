-- Ironlog: weekly check-in questions written by the coach.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
--
-- - coach_settings.checkin_questions: the coach's questions, in order, as
--   [{ "id": "q1", "en": "...", "he": "...", "type": "scale" | "number" | "text" }].
--   Empty means no weekly check-in for their trainees.
-- - checkin_answers: one row per trainee per week (the week starts on
--   Sunday, as everywhere in the app). Answers are { "<question id>": value }
--   with the question text copied in, so editing questions later never
--   changes what an old answer meant.
-- - my_checkin_questions(): the signed-in person's coach's questions.

alter table public.coach_settings add column if not exists checkin_questions jsonb not null default '[]';

create or replace function public.valid_checkin_questions(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 12 and not exists (
    select 1 from jsonb_array_elements(p) q
    where jsonb_typeof(q) <> 'object'
       or coalesce(q ->> 'id', '') !~ '^[a-z0-9_-]{1,40}$'
       or coalesce(q ->> 'type', '') not in ('scale', 'number', 'text')
       or (coalesce(btrim(q ->> 'en'), '') = '' and coalesce(btrim(q ->> 'he'), '') = '')
       or char_length(coalesce(q ->> 'en', '')) > 200
       or char_length(coalesce(q ->> 'he', '')) > 200);
$$;
alter table public.coach_settings drop constraint if exists coach_settings_checkin_check;
alter table public.coach_settings add constraint coach_settings_checkin_check check (public.valid_checkin_questions(checkin_questions));

create table if not exists public.checkin_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 20000),
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists checkin_answers_user_week on public.checkin_answers (user_id, week_start desc);

alter table public.checkin_answers enable row level security;

-- The trainee writes their own; their coach reads them.
drop policy if exists "read own or coached checkins" on public.checkin_answers;
create policy "read own or coached checkins" on public.checkin_answers
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "write own checkins" on public.checkin_answers;
create policy "write own checkins" on public.checkin_answers
  for insert with check (auth.uid() = user_id);
drop policy if exists "change own checkins" on public.checkin_answers;
create policy "change own checkins" on public.checkin_answers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own checkins" on public.checkin_answers;
create policy "delete own checkins" on public.checkin_answers
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.checkin_answers to authenticated;

drop policy if exists "removed people cannot add" on public.checkin_answers;
create policy "removed people cannot add" on public.checkin_answers as restrictive for insert to authenticated
  with check (not public.am_removed());
drop policy if exists "removed people cannot change" on public.checkin_answers;
create policy "removed people cannot change" on public.checkin_answers as restrictive for update to authenticated
  using (not public.am_removed()) with check (not public.am_removed());

create or replace function public.my_checkin_questions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select cs.checkin_questions from public.coach_settings cs
                   where cs.coach_id = public.coach_for(auth.uid())), '[]'::jsonb);
$$;
revoke execute on function public.my_checkin_questions() from public, anon;
grant execute on function public.my_checkin_questions() to authenticated;

notify pgrst, 'reload schema';
