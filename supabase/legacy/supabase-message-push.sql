-- New coach messages reach the other side as a push notification: the
-- trainee's phone when the coach writes, the coach's phones when a trainee
-- writes (ntfy when no coach phone takes it, with the name only, never the
-- text). Needs supabase-coach-messages.sql, pg_net and push_config
-- (supabase/schema.sql section 6), and the send-workout-reminders Edge
-- Function deployed with message support. Run once in the Supabase SQL
-- editor. Safe to re-run. Also folded into supabase/schema.sql.

create or replace function public.on_coach_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  -- A burst of messages buzzes once: while an earlier message from the same
  -- sender in this thread is still unread and under a minute old, the phone
  -- already has a notification for it.
  if exists (
    select 1 from public.coach_messages m
     where m.trainee_id = new.trainee_id and m.sender_id = new.sender_id
       and m.id <> new.id and m.read_at is null
       and m.created_at > now() - interval '60 seconds'
  ) then
    return null;
  end if;

  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return null; end if;
  -- A failed request must never stop the message itself from saving.
  begin
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('message_id', new.id)
    );
  exception when others then
    raise warning 'message push failed: %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke execute on function public.on_coach_message() from public, anon, authenticated;

drop trigger if exists trg_coach_message_push on public.coach_messages;
create trigger trg_coach_message_push after insert on public.coach_messages
  for each row execute function public.on_coach_message();
