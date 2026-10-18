-- Progress photos: a private storage bucket, a table of photos, and the rules
-- that keep them between the trainee and the coach. Safe to re-run. Also
-- folded into supabase/schema.sql.
--
-- Who can do what:
--  - A trainee can add photos only after turning them on (their latest
--    'progress-photos' consent is 'granted'), and never if they signed up as
--    under 18. They can see and delete their own photos.
--  - The coach (is_admin) can see and delete any trainee's photos, but can
--    never add one, even while managing a trainee's account.
--  - Nobody else can read anything: the bucket is private and every image is
--    shown through a link that expires after a few minutes.
--
-- Image files are only ever removed through the Storage API (the app, or the
-- purge-progress-photos Edge Function), never by deleting rows in
-- storage.objects, which Supabase does not allow.

-- One row per photo. Deleting the account removes the rows (cascade); the
-- app removes the files first and the nightly purge catches anything left.
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_on date not null,
  angle text not null check (angle in ('front', 'side', 'back')),
  path text not null unique,
  created_at timestamptz not null default now(),
  -- The file always lives in the owner's own folder.
  constraint progress_photos_path_owner check (path like (user_id::text || '/%'))
);
create index if not exists progress_photos_user_idx on public.progress_photos (user_id, taken_on desc);

-- True when the signed-in person may add photos right now.
create or replace function public.photos_allowed()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select variant = 'granted' from consents
    where user_id = auth.uid() and doc_key = 'progress-photos'
    order by accepted_at desc limit 1
  ), false)
  and coalesce((
    select variant <> 'minor' from consents
    where user_id = auth.uid() and doc_key = 'training-terms'
    order by version desc, accepted_at desc limit 1
  ), false);
$function$;
revoke execute on function public.photos_allowed() from public, anon;
grant execute on function public.photos_allowed() to authenticated;

alter table public.progress_photos enable row level security;

drop policy if exists "read own or admin photos" on public.progress_photos;
create policy "read own or admin photos" on public.progress_photos for select to authenticated
  using ((auth.uid() = user_id) or is_admin());

drop policy if exists "add own photos when allowed" on public.progress_photos;
create policy "add own photos when allowed" on public.progress_photos for insert to authenticated
  with check (auth.uid() = user_id and photos_allowed());

drop policy if exists "delete own or admin photos" on public.progress_photos;
create policy "delete own or admin photos" on public.progress_photos for delete to authenticated
  using ((auth.uid() = user_id) or is_admin());

-- No update policy: a photo is replaced by deleting it and adding another.

-- Private bucket: JPEG only (the app re-encodes every photo, which also drops
-- location and camera details), at most 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "progress photos: read own or admin" on storage.objects;
create policy "progress photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "progress photos: add own when allowed" on storage.objects;
create policy "progress photos: add own when allowed" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.photos_allowed());

drop policy if exists "progress photos: delete own or admin" on storage.objects;
create policy "progress photos: delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Retention: once a night, the purge-progress-photos Edge Function removes
-- photos of anyone who hasn't logged a workout for 12 months, and any files
-- left behind by a deleted account. Uses the same cron secret as reminders.
create or replace function public.run_photo_purge()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/purge-progress-photos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$function$;
revoke execute on function public.run_photo_purge() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-progress-photos') then
    perform cron.unschedule('purge-progress-photos');
  end if;
end $$;
select cron.schedule('purge-progress-photos', '30 2 * * *', 'select public.run_photo_purge()');
