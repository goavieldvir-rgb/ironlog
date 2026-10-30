-- Coach messages: a simple two-way message thread between each trainee and
-- the coach (one thread per trainee). Both sides can write and read; nobody
-- can edit or delete a message. Read marks go through mark_messages_read(),
-- which only ever touches messages sent by the OTHER side of the thread.
-- No push notification yet: new messages show as an unread dot in the app.
-- Run once in the Supabase SQL editor. Safe to re-run. Also folded into
-- supabase/schema.sql. Before it is run, the app hides every entry point
-- to messages quietly.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  -- The thread: one per trainee.
  trainee_id uuid not null references auth.users(id) on delete cascade,
  -- Who wrote it: the trainee, or a coach.
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  -- When the other side opened the thread; null while unread.
  read_at timestamptz
);
create index if not exists coach_messages_thread_idx on public.coach_messages (trainee_id, created_at);
-- The coach's unread badges only look at unread rows.
create index if not exists coach_messages_unread_idx on public.coach_messages (trainee_id) where read_at is null;

alter table public.coach_messages enable row level security;
revoke all on public.coach_messages from anon;
revoke truncate, references, trigger on public.coach_messages from authenticated;
revoke update, delete on public.coach_messages from authenticated;
grant select, insert on public.coach_messages to authenticated;

drop policy if exists "read own thread or coach" on public.coach_messages;
create policy "read own thread or coach" on public.coach_messages for select to authenticated
  using (trainee_id = auth.uid() or public.is_admin());

drop policy if exists "write own thread or coach" on public.coach_messages;
create policy "write own thread or coach" on public.coach_messages for insert to authenticated
  with check (sender_id = auth.uid() and (trainee_id = auth.uid() or public.is_admin()));

-- Same extra rule the other tables have: with two-step verification on,
-- an account that skipped the second step reads and writes nothing.
drop policy if exists "two-step verification when enabled" on public.coach_messages;
create policy "two-step verification when enabled" on public.coach_messages
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Marks the other side's messages in one thread as read. A trainee marks the
-- coach's messages in their own thread; a coach marks the trainee's. Returns
-- how many messages it marked.
create or replace function public.mark_messages_read(p_trainee uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  n integer;
begin
  if auth.uid() is null or not public.mfa_satisfied() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_trainee = auth.uid() then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id <> auth.uid() and read_at is null;
  elsif public.is_admin() then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id = p_trainee and read_at is null;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke execute on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;
