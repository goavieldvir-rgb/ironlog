-- Live definition as of 2026-10-10, before supabase-security-round2.sql.
-- Kept for the record; round 2 replaces it.

CREATE OR REPLACE FUNCTION public.check_inactive_trainees()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  last_date date;
  days_since integer;
  already_alerted boolean;
begin
  for r in
    select distinct p.id, coalesce(p.full_name, p.email) as name, p.inactivity_alert_days
    from profiles p
    where p.is_admin = false
      and exists (select 1 from routines rt where rt.user_id = p.id)
  loop
    begin
      select max(date) into last_date from sessions where user_id = r.id;

      if last_date is null then
        continue;
      end if;

      days_since := current_date - last_date;

      if days_since < r.inactivity_alert_days then
        continue;
      end if;

      select exists (
        select 1 from admin_notifications
        where type = 'inactivity' and trainee_id = r.id and sent_at::date > last_date
      ) into already_alerted;

      if already_alerted then
        continue;
      end if;

      perform send_admin_email(
        r.name || ' has gone quiet',
        '<p><strong>' || r.name || '</strong> hasn''t logged a session in ' || days_since ||
        ' days (last one: ' || last_date || ').</p>'
      );
      perform send_admin_push(
        '💤 ' || r.name || ' has gone quiet',
        days_since || ' days since their last session (' || last_date || ')'
      );

      insert into admin_notifications (type, trainee_id, detail)
      values ('inactivity', r.id, days_since || ' days since last session');
    exception when others then
      raise warning 'check_inactive_trainees failed for %: %', r.name, sqlerrm;
    end;
  end loop;
end;
$function$;
