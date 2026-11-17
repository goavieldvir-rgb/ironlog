-- Trainer feedback reaches the trainee: a push notification when the coach
-- saves feedback on a workout, and an unread mark until the trainee opens it.
-- Needs pg_net and push_config (supabase/schema.sql section 6). Safe to re-run.
-- Also folded into supabase/schema.sql.

-- When the feedback was last written, and when the trainee last opened it.
-- Feedback written before this change has no time and counts as read.
alter table public.sessions add column if not exists trainer_comment_at timestamptz;
alter table public.sessions add column if not exists trainer_comment_seen_at timestamptz;

-- Only an admin can write feedback, so a trainee can't fake a note from the
-- coach. A real change of the text stamps its time and asks the push function
-- to tell the trainee; clearing it sends nothing.
create or replace function public.on_trainer_comment()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  if new.trainer_comment is not distinct from old.trainer_comment
     and new.trainer_comment_at is not distinct from old.trainer_comment_at then
    return new;
  end if;
  if not public.is_admin() then
    new.trainer_comment := old.trainer_comment;
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if new.trainer_comment is not distinct from old.trainer_comment then
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if coalesce(btrim(new.trainer_comment), '') = '' then
    new.trainer_comment_at := null;
    return new;
  end if;

  new.trainer_comment_at := now();
  -- The coach's own workouts need no notification.
  if new.user_id is distinct from auth.uid() then
    select value into secret from public.push_config where key = 'cron_secret';
    if secret is not null then
      perform net.http_post(
        url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
        body := jsonb_build_object('feedback_session_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.on_trainer_comment() from public, anon, authenticated;

drop trigger if exists trg_trainer_comment on public.sessions;
create trigger trg_trainer_comment before update of trainer_comment, trainer_comment_at on public.sessions
  for each row execute function public.on_trainer_comment();
